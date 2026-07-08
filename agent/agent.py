"""
FireSync LocalBridge Agent
==========================
Ponte local entre o Firebird do cliente e o FireSync Hub (SaaS).
Sem IP fixo, sem porta aberta: apenas HTTPS de saída (pull-based).

Modos de execução (CLI):
    agent.exe --run                Executa em foreground (útil p/ debug)
    agent.exe --install-service    Registra como serviço Windows (auto-start)
    agent.exe --uninstall-service  Remove o serviço
    agent.exe --service            (Uso interno pelo SCM — não chamar manualmente)
    agent.exe --version            Imprime versão e sai

Quando empacotado com PyInstaller, todas as dependências (fdb, requests,
python-dotenv) ficam embutidas — o cliente NÃO precisa ter Python instalado.

Layout em produção (instalado por Inno Setup):
    C:\\Program Files\\FireSync\\firesync-agent.exe
    C:\\Program Files\\FireSync\\firesync-agent.env
    C:\\ProgramData\\FireSync\\logs\\firesync-agent.log
"""
from __future__ import annotations

import argparse
import ctypes
import json
import logging
import logging.handlers
import os
import socket
import subprocess
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
AGENT_VERSION = "1.2.0"
SERVICE_NAME = "FireSyncAgent"
SERVICE_DISPLAY = "FireSync LocalBridge Agent"
SERVICE_DESC = (
    "Agente FireSync que sincroniza o banco Firebird local com o FireSync Hub. "
    "Somente conexões HTTPS de saída."
)

# ---------------------------------------------------------------------------
# Descoberta de caminhos (executável PyInstaller vs script)
# ---------------------------------------------------------------------------
def _exe_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _program_data_dir() -> Path:
    base = os.environ.get("PROGRAMDATA") or str(Path.home())
    p = Path(base) / "FireSync"
    (p / "logs").mkdir(parents=True, exist_ok=True)
    return p


EXE_DIR = _exe_dir()
DATA_DIR = _program_data_dir()
LOG_DIR = DATA_DIR / "logs"
ENV_FILE = EXE_DIR / "firesync-agent.env"
LOG_FILE = LOG_DIR / "firesync-agent.log"


# ---------------------------------------------------------------------------
# Configuração (.env)
# ---------------------------------------------------------------------------
def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_env_file(ENV_FILE)

CFG = {
    "remote":              os.getenv("REMOTE_ENDPOINT"),
    "heartbeat":           os.getenv("HEARTBEAT_ENDPOINT"),
    "command_result":      os.getenv("COMMAND_RESULT_ENDPOINT"),
    "register":            os.getenv("REGISTER_ENDPOINT"),
    "logs_url":            os.getenv("LOGS_ENDPOINT"),
    "report_url":          os.getenv("REPORT_ENDPOINT"),   # /api/public/agent-report (v1.2+)
    "version_url":         os.getenv("VERSION_ENDPOINT"),  # /api/public/agent-version (v1.2+)
    "token":               os.getenv("API_TOKEN"),
    "agent_uid":           os.getenv("AGENT_UID"),
    "alias":               os.getenv("AGENT_ALIAS"),
    "version":             os.getenv("AGENT_VERSION", AGENT_VERSION),
    "db_host":             os.getenv("DB_HOST", "localhost"),
    "db_port":             int(os.getenv("DB_PORT", "3050")),
    "db_path":             os.getenv("DB_PATH"),
    "db_user":             os.getenv("DB_USER", "SYSDBA"),
    "db_pass":             os.getenv("DB_PASS", "masterkey"),
    "db_charset":          os.getenv("DB_CHARSET", "WIN1252"),
    "sync_interval":       int(os.getenv("SYNC_INTERVAL", "900")),
    "heartbeat_interval":  int(os.getenv("HEARTBEAT_INTERVAL", "30")),
    "sync_tables":         os.getenv("SYNC_TABLES", "ALL"),
    "log_level":           os.getenv("LOG_LEVEL", "INFO"),
    "auto_update":         os.getenv("AUTO_UPDATE", "1") == "1",
    "update_check_every":  int(os.getenv("UPDATE_CHECK_EVERY", "3600")),  # segundos
    "max_queue_rows":      int(os.getenv("MAX_QUEUE_ROWS", "50000")),      # teto da fila offline
}

# Deriva endpoints v1.2 a partir do heartbeat, quando não configurados
if CFG["heartbeat"]:
    _base = CFG["heartbeat"].rsplit("/", 1)[0]
    CFG["report_url"]  = CFG["report_url"]  or f"{_base}/agent-report"
    CFG["version_url"] = CFG["version_url"] or f"{_base}/agent-version"


# ---------------------------------------------------------------------------
# Logging (arquivo rotativo em %ProgramData%\FireSync\logs + stderr)
# ---------------------------------------------------------------------------
def _setup_logging() -> logging.Logger:
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    root = logging.getLogger("firesync")
    root.setLevel(getattr(logging, CFG["log_level"], logging.INFO))
    root.handlers.clear()

    fh = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    fh.setFormatter(fmt)
    root.addHandler(fh)

    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    root.addHandler(sh)
    return root


log = _setup_logging()


# ---------------------------------------------------------------------------
# Imports de terceiros (após logging)
# ---------------------------------------------------------------------------
try:
    import requests
except ImportError:  # pragma: no cover
    log.error("Dependência 'requests' ausente — reinstale o agente.")
    sys.exit(2)

try:
    import fdb  # type: ignore
except ImportError:
    fdb = None  # type: ignore


# ---------------------------------------------------------------------------
# HMAC de corpo (X-FireSync-Signature) — chave = agent_token
# ---------------------------------------------------------------------------
import hashlib
import hmac as _hmac


def _sign(body: str) -> str:
    tok = (CFG["token"] or "").encode("utf-8")
    mac = _hmac.new(tok, body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"sha256={mac}"


def _headers(body: Optional[str] = None) -> Dict[str, str]:
    h = {
        "Authorization": f"Bearer {CFG['token']}",
        "Content-Type":  "application/json",
        "User-Agent":    f"firesync-agent/{CFG['version']}",
    }
    if body is not None and CFG["token"]:
        h["X-FireSync-Signature"] = _sign(body)
    return h


def _post_json(url: str, payload: Dict[str, Any], timeout: int = 15):
    """POST assinado com HMAC do corpo cru."""
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return requests.post(url, data=body.encode("utf-8"), headers=_headers(body), timeout=timeout)


def _db_connect():
    if fdb is None:
        raise RuntimeError("Driver Firebird (fdb) não disponível neste build.")
    dsn = f"{CFG['db_host']}/{CFG['db_port']}:{CFG['db_path']}"
    return fdb.connect(
        dsn=dsn,
        user=CFG["db_user"],
        password=CFG["db_pass"],
        charset=CFG["db_charset"],
    )


# ---------------------------------------------------------------------------
# Fila offline (SQLite) — persiste logs/resultados quando o hub está fora
# ---------------------------------------------------------------------------
import sqlite3

_QUEUE_DB = DATA_DIR / "queue.sqlite"


def _queue_conn():
    con = sqlite3.connect(str(_QUEUE_DB))
    con.execute(
        "CREATE TABLE IF NOT EXISTS outbox ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "kind TEXT NOT NULL,"      # 'log' | 'result'
        "payload TEXT NOT NULL,"   # JSON serializado
        "created_at TEXT NOT NULL,"
        "attempts INTEGER NOT NULL DEFAULT 0"
        ")"
    )
    return con


def queue_depth() -> int:
    try:
        con = _queue_conn()
        (n,) = con.execute("SELECT COUNT(*) FROM outbox").fetchone()
        con.close()
        return int(n or 0)
    except Exception:
        return 0


def queue_put(kind: str, payload: Dict[str, Any]) -> None:
    try:
        con = _queue_conn()
        # Aplica teto: se excedeu MAX_QUEUE_ROWS, descarta os mais antigos
        cap = max(1000, int(CFG.get("max_queue_rows") or 50000))
        (n,) = con.execute("SELECT COUNT(*) FROM outbox").fetchone()
        if n and n >= cap:
            excess = int(n) - cap + 1
            con.execute(
                "DELETE FROM outbox WHERE id IN (SELECT id FROM outbox ORDER BY id LIMIT ?)",
                (excess,),
            )
            log.warning("queue_put: fila cheia (%s >= %s); %s descartados", n, cap, excess)
        con.execute(
            "INSERT INTO outbox (kind,payload,created_at) VALUES (?,?,?)",
            (kind, json.dumps(payload), datetime.now(timezone.utc).isoformat()),
        )
        con.commit(); con.close()
    except Exception as e:
        log.error("queue_put falhou: %s", e)


def queue_flush(max_batch: int = 100) -> int:
    """Tenta reenviar itens pendentes via /agent-report. Retorna nº enviados."""
    if not CFG["report_url"]:
        return 0
    try:
        con = _queue_conn()
        rows = con.execute(
            "SELECT id,kind,payload FROM outbox ORDER BY id LIMIT ?", (max_batch,)
        ).fetchall()
    except Exception as e:
        log.error("queue_flush leitura: %s", e)
        return 0
    if not rows:
        try: con.close()
        except Exception: pass
        return 0

    logs_batch: List[Dict[str, Any]] = []
    results_batch: List[Dict[str, Any]] = []
    ids: List[int] = []
    for rid, kind, raw_payload in rows:
        try:
            obj = json.loads(raw_payload)
        except Exception:
            ids.append(rid); continue
        (logs_batch if kind == "log" else results_batch).append(obj)
        ids.append(rid)

    try:
        r = _post_json(CFG["report_url"], {
            "agent_uid": CFG["agent_uid"],
            **({"logs": logs_batch} if logs_batch else {}),
            **({"results": results_batch} if results_batch else {}),
        }, timeout=30)
        if not r.ok:
            log.warning("queue_flush hub respondeu %s: %s", r.status_code, r.text[:200])
            con.close()
            return 0
    except Exception as e:
        log.warning("queue_flush envio: %s", e)
        con.close()
        return 0

    try:
        con.executemany("DELETE FROM outbox WHERE id=?", [(i,) for i in ids])
        con.commit()
    finally:
        con.close()
    log.info("queue_flush: %s itens enviados (%s logs, %s results)",
             len(ids), len(logs_batch), len(results_batch))
    return len(ids)


# ---------------------------------------------------------------------------
# Auto-update (checa /agent-version e dispara o instalador Inno silencioso)
# ---------------------------------------------------------------------------
_LAST_UPDATE_CHECK = 0.0


def _version_tuple(v: str) -> tuple:
    try:
        return tuple(int(x) for x in v.split(".")[:3])
    except Exception:
        return (0, 0, 0)


def check_auto_update() -> None:
    global _LAST_UPDATE_CHECK
    if not CFG["auto_update"] or not CFG["version_url"]:
        return
    if time.time() - _LAST_UPDATE_CHECK < CFG["update_check_every"]:
        return
    _LAST_UPDATE_CHECK = time.time()
    try:
        r = requests.get(CFG["version_url"], timeout=10)
        if not r.ok:
            return
        info = r.json() or {}
        latest = info.get("version") or ""
        url    = info.get("installer_url") or ""
        if not latest or not url:
            return
        if _version_tuple(latest) <= _version_tuple(CFG["version"]):
            return
        log.info("Nova versão disponível: %s (atual %s) — baixando de %s",
                 latest, CFG["version"], url)
        target = DATA_DIR / f"firesync-agent-setup-{latest}.exe"
        with requests.get(url, stream=True, timeout=300) as dl:
            dl.raise_for_status()
            with open(target, "wb") as f:
                for chunk in dl.iter_content(chunk_size=1024 * 64):
                    if chunk: f.write(chunk)
        log.info("Executando instalador silencioso: %s", target)
        # /VERYSILENT: Inno Setup. Ao concluir, o serviço se reinicia sozinho.
        subprocess.Popen(
            [str(target), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"],
            close_fds=True,
        )
    except Exception as e:
        log.warning("check_auto_update: %s", e)


# ---------------------------------------------------------------------------
# Chamadas ao hub (com fila offline)
# ---------------------------------------------------------------------------
def register() -> None:
    try:
        r = _post_json(CFG["register"], {
            "agent_uid":     CFG["agent_uid"],
            "agent_version": CFG["version"],
            "alias":         CFG["alias"],
            "hostname":      socket.gethostname(),
        })
        log.info("register: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        log.error("register falhou: %s", e)


def heartbeat() -> List[Dict[str, Any]]:
    try:
        r = _post_json(CFG["heartbeat"], {
            "agent_uid":     CFG["agent_uid"],
            "agent_version": CFG["version"],
            "timestamp":     datetime.now(timezone.utc).isoformat(),
        })
        if r.ok:
            # oportunidade de drenar fila e checar update
            queue_flush()
            check_auto_update()
            return (r.json() or {}).get("pending_commands", []) or []
    except Exception as e:
        log.warning("heartbeat falhou: %s", e)
    return []


def post_result(command_id: str, command_type: str, status: str,
                result: Any = None, error: Optional[str] = None,
                duration_ms: int = 0) -> None:
    payload = {
        "command_id":    command_id,
        "command_type":  command_type,
        "status":        status,
        "result":        result,
        "error_message": error,
        "duration_ms":   duration_ms,
        "completed_at":  datetime.now(timezone.utc).isoformat(),
    }
    # Preferimos o endpoint consolidado (v1.2+); fallback para o legado.
    try:
        if CFG["report_url"]:
            r = _post_json(CFG["report_url"], {
                "agent_uid": CFG["agent_uid"],
                "results": [payload],
            }, timeout=30)
        else:
            r = _post_json(CFG["command_result"],
                           {"agent_uid": CFG["agent_uid"], **payload}, timeout=30)
        if not r.ok:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log.error("post_result falhou (enfileirando): %s", e)
        queue_put("result", payload)


# ---------------------------------------------------------------------------
# Comandos executáveis (mesmos handlers da versão anterior)
# ---------------------------------------------------------------------------
def cmd_ping_test() -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "ping_ok": True,
        "file_exists": None, "file_error": None,
        "auth_ok": None, "auth_error": None,
        "db_reachable": None, "db_error": None,
        "test_query_ok": None, "query_error": None,
        "latency_ms": 0,
    }
    t0 = time.time()
    try:
        is_local = CFG["db_host"] in ("localhost", "127.0.0.1", socket.gethostname())
        if is_local and CFG["db_path"]:
            out["file_exists"] = os.path.isfile(CFG["db_path"])
            if not out["file_exists"]:
                out["file_error"] = f"Arquivo não encontrado: {CFG['db_path']}"
        else:
            out["file_exists"] = True
    except Exception as e:
        out["file_exists"] = False
        out["file_error"] = str(e)

    con = None
    try:
        con = _db_connect()
        out["auth_ok"] = True
        out["db_reachable"] = True
    except Exception as e:
        msg = str(e)
        out["db_reachable"] = False
        if any(k in msg.lower() for k in ("login", "password", "user name")):
            out["auth_ok"] = False
            out["auth_error"] = msg
        else:
            out["db_error"] = msg
        out["latency_ms"] = int((time.time() - t0) * 1000)
        out["ok"] = False
        out["error"] = msg
        return out

    try:
        cur = con.cursor()
        cur.execute("SELECT 1 FROM RDB$DATABASE")
        cur.fetchone()
        out["test_query_ok"] = True
    except Exception as e:
        out["test_query_ok"] = False
        out["query_error"] = str(e)
        out["ok"] = False
        out["error"] = str(e)
        try: con.close()
        except Exception: pass
        out["latency_ms"] = int((time.time() - t0) * 1000)
        return out
    finally:
        try: con.close()
        except Exception: pass

    out["latency_ms"] = int((time.time() - t0) * 1000)
    out["ok"] = True
    return out


def cmd_network_test(_: Dict[str, Any]) -> Dict[str, Any]:
    from urllib.parse import urlparse
    steps: List[Dict[str, Any]] = []
    hb = CFG.get("heartbeat") or ""
    host = urlparse(hb).hostname or ""

    t0 = time.time()
    try:
        ip = socket.gethostbyname(host) if host else None
        steps.append({"name": "DNS heartbeat", "ok": bool(ip),
                      "detail": f"{host} -> {ip}",
                      "latency_ms": int((time.time() - t0) * 1000)})
    except Exception as e:
        steps.append({"name": "DNS heartbeat", "ok": False, "detail": str(e),
                      "latency_ms": int((time.time() - t0) * 1000)})

    t0 = time.time()
    try:
        r = requests.options(hb, timeout=10)
        ok = r.status_code in (200, 204, 401, 404, 405)
        steps.append({"name": "HTTPS heartbeat", "ok": ok,
                      "detail": f"HTTP {r.status_code}",
                      "latency_ms": int((time.time() - t0) * 1000)})
    except Exception as e:
        steps.append({"name": "HTTPS heartbeat", "ok": False, "detail": str(e),
                      "latency_ms": int((time.time() - t0) * 1000)})

    dbh, dbp = CFG["db_host"], CFG["db_port"]
    if dbh not in ("localhost", "127.0.0.1"):
        t0 = time.time()
        try:
            s = socket.create_connection((dbh, dbp), timeout=5); s.close()
            steps.append({"name": f"TCP Firebird {dbh}:{dbp}", "ok": True,
                          "detail": "porta aberta",
                          "latency_ms": int((time.time() - t0) * 1000)})
        except Exception as e:
            steps.append({"name": f"TCP Firebird {dbh}:{dbp}", "ok": False,
                          "detail": str(e),
                          "latency_ms": int((time.time() - t0) * 1000)})
    else:
        steps.append({"name": "TCP Firebird (embedded/local)", "ok": True,
                      "detail": "host local — skip", "latency_ms": 0})

    return {"steps": steps, "ok": all(s["ok"] for s in steps)}


def cmd_list_tables() -> Dict[str, Any]:
    con = _db_connect(); cur = con.cursor()
    cur.execute("SELECT TRIM(RDB$RELATION_NAME) FROM RDB$RELATIONS "
                "WHERE RDB$SYSTEM_FLAG = 0 ORDER BY 1")
    tables = [r[0] for r in cur.fetchall()]
    out = []
    for t in tables:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        out.append({"name": t, "row_count": int(cur.fetchone()[0])})
    con.close()
    return {"tables": out}


def cmd_run_query(payload: Dict[str, Any]) -> Dict[str, Any]:
    sql = (payload or {}).get("sql", "")
    if not sql.strip():
        raise ValueError("SQL vazio")
    con = _db_connect(); cur = con.cursor()
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    cols: list = []; rows: list = []; affected = 0
    for stmt in statements:
        cur.execute(stmt)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = [list(r) for r in cur.fetchall()]
        else:
            try:
                affected += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
            except Exception:
                pass
    con.commit(); con.close()
    return {"columns": cols, "rows": rows, "row_count": len(rows), "affected": affected}


def handle_command(cmd: Dict[str, Any]) -> None:
    cid = cmd.get("command_id") or str(uuid.uuid4())
    ctype = cmd.get("command_type") or cmd.get("type")
    payload = cmd.get("payload") or {}
    log.info("comando recebido: %s (%s)", ctype, cid)
    t0 = time.time()
    try:
        if   ctype == "ping_test":    res = cmd_ping_test()
        elif ctype == "list_tables":  res = cmd_list_tables()
        elif ctype == "run_query":    res = cmd_run_query(payload)
        elif ctype == "network_test": res = cmd_network_test(payload)
        else: raise ValueError(f"command_type desconhecido: {ctype}")
        post_result(cid, ctype, "success", result=res,
                    duration_ms=int((time.time() - t0) * 1000))
    except Exception as e:
        log.error("comando %s falhou: %s\n%s", ctype, e, traceback.format_exc())
        post_result(cid, ctype, "error", error=str(e),
                    duration_ms=int((time.time() - t0) * 1000))


def do_sync() -> None:
    try:
        if CFG["sync_tables"].upper() == "ALL":
            tables_info = cmd_list_tables()["tables"]
        else:
            con = _db_connect(); cur = con.cursor()
            tables_info = []
            for t in [x.strip() for x in CFG["sync_tables"].split(",") if x.strip()]:
                cur.execute(f'SELECT COUNT(*) FROM "{t}"')
                tables_info.append({"name": t, "row_count": int(cur.fetchone()[0])})
            con.close()

        payload = {
            "agent_uid":     CFG["agent_uid"],
            "agent_version": CFG["version"],
            "timestamp":     datetime.now(timezone.utc).isoformat(),
            "database_name": CFG["alias"],
            "sync_type":     "incremental",
            "tables": [{"table_name": t["name"], "record_count": t["row_count"]}
                       for t in tables_info],
        }
        r = _post_json(CFG["remote"], payload, timeout=120)
        log.info("sync: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        log.error("sync falhou: %s", e)


# ---------------------------------------------------------------------------
# Loop principal (foreground) — usado por --run e --service
# ---------------------------------------------------------------------------
_STOP = False


def _validate_cfg() -> None:
    missing = [k for k in ("remote", "heartbeat", "token", "agent_uid", "db_path")
               if not CFG[k]]
    if missing:
        raise SystemExit(f"Variáveis ausentes em {ENV_FILE.name}: {missing}")


def run_loop(stop_check=lambda: _STOP) -> None:
    _validate_cfg()
    log.info("FireSync Agent %s iniciado — UID=%s alias=%s",
             CFG["version"], CFG["agent_uid"], CFG["alias"])
    register()
    last_sync = 0.0
    fails = 0
    while not stop_check():
        had_cmds = False
        try:
            cmds = heartbeat()
            had_cmds = bool(cmds)
            for c in cmds:
                handle_command(c)
            if had_cmds:
                try: heartbeat()
                except Exception: pass
            if time.time() - last_sync >= CFG["sync_interval"]:
                do_sync(); last_sync = time.time()
            fails = 0
        except Exception as e:
            fails += 1
            log.error("loop principal (%s consecutivas): %s", fails, e)
        # Backoff exponencial se falhas repetidas
        sleep_s = 5 if had_cmds else min(CFG["heartbeat_interval"] * (1 + fails // 5),
                                         300)
        for _ in range(sleep_s):
            if stop_check():
                break
            time.sleep(1)
    log.info("FireSync Agent encerrado (stop solicitado).")


# ---------------------------------------------------------------------------
# Integração com o Windows Service Control Manager
# ---------------------------------------------------------------------------
def _is_admin() -> bool:
    if os.name != "nt":
        return os.geteuid() == 0  # type: ignore[attr-defined]
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _sc(*args: str) -> int:
    log.info("sc %s", " ".join(args))
    return subprocess.call(["sc"] + list(args))


def install_service() -> int:
    if os.name != "nt":
        print("Serviço só é suportado no Windows.")
        return 1
    if not _is_admin():
        print("ERRO: execute como Administrador para instalar o serviço.")
        return 2
    exe = f'"{sys.executable}" --service' if getattr(sys, "frozen", False) \
        else f'"{sys.executable}" "{Path(__file__).resolve()}" --service'
    _sc("stop",   SERVICE_NAME)
    _sc("delete", SERVICE_NAME)
    rc = _sc("create", SERVICE_NAME,
             f"binPath= {exe}",
             "start= auto",
             f"DisplayName= {SERVICE_DISPLAY}")
    if rc != 0:
        return rc
    _sc("description", SERVICE_NAME, SERVICE_DESC)
    _sc("failure", SERVICE_NAME,
        "reset= 86400",
        "actions= restart/60000/restart/60000/restart/60000")
    _sc("start", SERVICE_NAME)
    print(f"Serviço '{SERVICE_NAME}' instalado e iniciado.")
    return 0


def uninstall_service() -> int:
    if os.name != "nt":
        return 1
    if not _is_admin():
        print("ERRO: execute como Administrador para remover o serviço.")
        return 2
    _sc("stop",   SERVICE_NAME)
    _sc("delete", SERVICE_NAME)
    print(f"Serviço '{SERVICE_NAME}' removido.")
    return 0


def run_as_service() -> int:
    """Entry point chamado pelo Windows SCM (via `sc start FireSyncAgent`)."""
    try:
        import win32service                # type: ignore
        import win32serviceutil            # type: ignore
        import servicemanager              # type: ignore
        import win32event                  # type: ignore
    except ImportError:
        # Fallback: sem pywin32, roda como loop foreground (SCM ainda controla o processo).
        log.warning("pywin32 indisponível — rodando em modo fallback.")
        run_loop()
        return 0

    stop_evt = win32event.CreateEvent(None, 0, 0, None)

    class _Svc(win32serviceutil.ServiceFramework):
        _svc_name_ = SERVICE_NAME
        _svc_display_name_ = SERVICE_DISPLAY
        _svc_description_ = SERVICE_DESC

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            global _STOP
            _STOP = True
            win32event.SetEvent(stop_evt)

        def SvcDoRun(self):
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )
            run_loop(lambda: _STOP)

    win32serviceutil.HandleCommandLine(_Svc, argv=[sys.argv[0]])
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> int:
    p = argparse.ArgumentParser(prog="firesync-agent")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--run", action="store_true",
                   help="Executa em foreground (debug).")
    g.add_argument("--install-service", action="store_true",
                   help="Registra e inicia como serviço Windows.")
    g.add_argument("--uninstall-service", action="store_true",
                   help="Remove o serviço Windows.")
    g.add_argument("--service", action="store_true",
                   help="(uso interno pelo SCM).")
    g.add_argument("--version", action="store_true")
    args = p.parse_args()

    if args.version:
        print(f"firesync-agent {AGENT_VERSION}")
        return 0
    if args.install_service:
        return install_service()
    if args.uninstall_service:
        return uninstall_service()
    if args.service:
        return run_as_service()
    # default: foreground
    run_loop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
