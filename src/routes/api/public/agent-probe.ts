import { createFileRoute } from "@tanstack/react-router";
import { zipSync, strToU8 } from "fflate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function err(status: number, msg: string) {
  return new Response(msg, { status, headers: { ...CORS, "Content-Type": "text/plain" } });
}

function slug(s: string) {
  return (s || "probe")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "probe";
}

export const Route = createFileRoute("/api/public/agent-probe")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("database_id");
        const token = url.searchParams.get("token");
        if (!id || !token) return err(400, "database_id e token são obrigatórios");

        const { data: db, error } = await supabaseAdmin
          .from("databases")
          .select("*, companies(name, cnpj)")
          .eq("id", id)
          .maybeSingle();
        if (error || !db) return err(404, "Banco não encontrado");
        if (!db.agent_token || db.agent_token !== token) return err(401, "Token inválido");

        const origin = `${url.protocol}//${url.host}`;
        const folder = `firesync-probe-${slug(db.agent_uid ?? db.name)}`;

        const envFile = `# FireSync Probe — somente diagnóstico (não envia dados)
# Empresa: ${db.companies?.name ?? "-"}
# Banco:   ${db.name}
# Gerado:  ${new Date().toISOString()}

HUB_ORIGIN=${origin}
HEARTBEAT_ENDPOINT=${origin}/api/public/heartbeat
PROBE_REPORT_ENDPOINT=${origin}/api/public/logs
API_TOKEN=${db.agent_token}

AGENT_UID=${db.agent_uid ?? ""}
AGENT_ALIAS=${db.name}

DB_HOST=${db.host ?? "localhost"}
DB_PORT=${db.port ?? 3050}
DB_PATH=${db.filepath ?? ""}
DB_USER=${db.username ?? "SYSDBA"}
DB_PASS=${db.password_encrypted ?? "masterkey"}
DB_CHARSET=${db.charset ?? "WIN1252"}
DB_FIREBIRD_VERSION=${db.firebird_version ?? "2.5"}
`;

        const probePy = `"""
FireSync Probe — Levantamento de requisitos para sincronização
---------------------------------------------------------------
Agente local *somente leitura* que NÃO envia dados do banco.
Faz uma checagem completa de pré-requisitos e devolve um relatório
ao Hub (e grava probe-report.json/.txt na pasta atual).

Etapas:
  1. Python e arquitetura (32/64 bits)
  2. Dependências (requests, python-dotenv, fdb/firebird-driver)
  3. fbclient.dll presente e mesma arquitetura
  4. Arquivo .env presente e completo
  5. Arquivo .FDB existe e legível (modo local)
  6. DNS do Hub
  7. HTTPS para o Hub (heartbeat OPTIONS)
  8. TCP porta Firebird (apenas se remoto)
  9. Autenticação SYSDBA
 10. Query de teste (SELECT 1 FROM RDB$DATABASE)
 11. Permissões de leitura em RDB$RELATIONS (lista de tabelas)
"""
import os, sys, json, time, socket, platform, struct, ctypes, traceback
from datetime import datetime, timezone
from urllib.parse import urlparse

REPORT = {"started_at": datetime.now(timezone.utc).isoformat(), "steps": []}

def step(name, ok, detail="", evidence=None, latency_ms=0, severity="info"):
    REPORT["steps"].append({
        "name": name, "ok": bool(ok), "detail": str(detail)[:500],
        "evidence": evidence, "latency_ms": int(latency_ms),
        "severity": severity if not ok else "info",
    })
    flag = "OK " if ok else "FAIL"
    print(f"[{flag}] {name} — {detail}")

# 1) Python
t0 = time.time()
bits = struct.calcsize("P") * 8
step("Python runtime", sys.version_info >= (3, 9),
     f"{platform.python_version()} ({bits} bits) em {sys.platform}",
     evidence={"executable": sys.executable, "bits": bits},
     latency_ms=(time.time()-t0)*1000,
     severity="error")

# 2) Dependências
def has_mod(name):
    try: __import__(name); return True
    except Exception: return False

deps = {
    "requests": has_mod("requests"),
    "dotenv":   has_mod("dotenv"),
    "fdb":      has_mod("fdb"),
    "firebird.driver": has_mod("firebird.driver"),
}
missing = [k for k, v in deps.items() if not v and k != "firebird.driver"]
fb_ok = deps["fdb"] or deps["firebird.driver"]
step("Dependências Python", not missing and fb_ok,
     ("Faltando: " + ", ".join(missing)) if missing else
     ("Driver Firebird ausente (instale fdb ou firebird-driver)" if not fb_ok else "ok"),
     evidence=deps, severity="error")

# Carrega .env (best-effort)
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

CFG = {
    "hub": os.getenv("HUB_ORIGIN", ""),
    "heartbeat": os.getenv("HEARTBEAT_ENDPOINT", ""),
    "report": os.getenv("PROBE_REPORT_ENDPOINT", ""),
    "token": os.getenv("API_TOKEN", ""),
    "agent_uid": os.getenv("AGENT_UID", ""),
    "alias": os.getenv("AGENT_ALIAS", ""),
    "db_host": os.getenv("DB_HOST", "localhost"),
    "db_port": int(os.getenv("DB_PORT", "3050") or 3050),
    "db_path": os.getenv("DB_PATH", ""),
    "db_user": os.getenv("DB_USER", "SYSDBA"),
    "db_pass": os.getenv("DB_PASS", "masterkey"),
    "db_charset": os.getenv("DB_CHARSET", "WIN1252"),
}

# 3) fbclient.dll
def find_fbclient():
    if sys.platform != "win32": return None, None
    candidates = []
    for env in ("FIREBIRD", "FIREBIRD_HOME"):
        p = os.getenv(env)
        if p: candidates.append(os.path.join(p, "fbclient.dll"))
    candidates += [
        r"C:\\Program Files\\Firebird\\Firebird_2_5\\bin\\fbclient.dll",
        r"C:\\Program Files\\Firebird\\Firebird_3_0\\fbclient.dll",
        r"C:\\Program Files\\Firebird\\Firebird_4_0\\fbclient.dll",
        r"C:\\Program Files (x86)\\Firebird\\Firebird_2_5\\bin\\fbclient.dll",
        r"C:\\Windows\\System32\\fbclient.dll",
        r"C:\\Windows\\SysWOW64\\fbclient.dll",
    ]
    for c in candidates:
        if os.path.isfile(c):
            try:
                ctypes.CDLL(c)
                return c, "ok"
            except OSError as e:
                return c, f"arquitetura incompatível: {e}"
    return None, "não encontrado"

t0 = time.time()
path, msg = find_fbclient()
ok_fb = path is not None and msg == "ok"
step("fbclient.dll", ok_fb,
     f"{path or 'não encontrado'} — {msg or ''}",
     evidence={"path": path, "msg": msg, "python_bits": bits},
     latency_ms=(time.time()-t0)*1000,
     severity="error" if sys.platform == "win32" else "warn")

# 4) .env
need = ["hub", "token", "agent_uid", "db_path"]
missing_env = [k for k in need if not CFG[k]]
step("Arquivo .env completo", not missing_env,
     "ok" if not missing_env else f"Faltando: {missing_env}",
     evidence={"agent_uid": CFG["agent_uid"], "alias": CFG["alias"], "db_host": CFG["db_host"]},
     severity="error")

# 5) .FDB local
is_local = CFG["db_host"] in ("localhost", "127.0.0.1", socket.gethostname())
if is_local and CFG["db_path"]:
    exists = os.path.isfile(CFG["db_path"])
    try:
        size = os.path.getsize(CFG["db_path"]) if exists else 0
    except Exception:
        size = 0
    step("Arquivo .FDB acessível", exists,
         f"{CFG['db_path']} ({size/1024/1024:.1f} MB)" if exists else f"não encontrado: {CFG['db_path']}",
         evidence={"path": CFG["db_path"], "size_bytes": size},
         severity="error")
else:
    step("Arquivo .FDB acessível", True, f"remoto ({CFG['db_host']}) — verificado pelo servidor Firebird")

# 6) DNS
host = urlparse(CFG["heartbeat"] or CFG["hub"]).hostname or ""
t0 = time.time()
try:
    ip = socket.gethostbyname(host) if host else None
    step("DNS do Hub", bool(ip), f"{host} -> {ip}", evidence={"host": host, "ip": ip},
         latency_ms=(time.time()-t0)*1000, severity="error")
except Exception as e:
    step("DNS do Hub", False, str(e), latency_ms=(time.time()-t0)*1000, severity="error")

# 7) HTTPS Hub
t0 = time.time()
try:
    import requests
    r = requests.options(CFG["heartbeat"], timeout=10)
    ok = r.status_code in (200, 204, 401, 404, 405)
    step("HTTPS heartbeat", ok, f"HTTP {r.status_code}",
         evidence={"status": r.status_code, "url": CFG["heartbeat"]},
         latency_ms=(time.time()-t0)*1000, severity="error")
except Exception as e:
    step("HTTPS heartbeat", False, str(e), latency_ms=(time.time()-t0)*1000, severity="error")

# 8) Porta Firebird remota
if not is_local:
    t0 = time.time()
    try:
        s = socket.create_connection((CFG["db_host"], CFG["db_port"]), timeout=5); s.close()
        step(f"TCP Firebird {CFG['db_host']}:{CFG['db_port']}", True, "porta aberta",
             latency_ms=(time.time()-t0)*1000)
    except Exception as e:
        step(f"TCP Firebird {CFG['db_host']}:{CFG['db_port']}", False, str(e),
             latency_ms=(time.time()-t0)*1000, severity="error")
else:
    step("TCP Firebird (local)", True, "host local — verificação ignorada")

# 9-11) Conexão + queries
def fb_connect():
    try:
        import fdb
        dsn = f"{CFG['db_host']}/{CFG['db_port']}:{CFG['db_path']}"
        return fdb.connect(dsn=dsn, user=CFG["db_user"], password=CFG["db_pass"], charset=CFG["db_charset"])
    except ImportError:
        from firebird.driver import connect
        return connect(f"{CFG['db_host']}/{CFG['db_port']}:{CFG['db_path']}",
                       user=CFG["db_user"], password=CFG["db_pass"], charset=CFG["db_charset"])

con = None
t0 = time.time()
try:
    con = fb_connect()
    step("Autenticação SYSDBA", True, f"login ok como {CFG['db_user']}",
         latency_ms=(time.time()-t0)*1000)
except Exception as e:
    msg = str(e)
    auth_err = any(k in msg.lower() for k in ("login", "password", "user name", "incorrect"))
    step("Autenticação SYSDBA", False, msg,
         evidence={"hint": "Verifique DB_USER/DB_PASS" if auth_err
                   else "Verifique fbclient.dll, caminho do .fdb e versão do Firebird"},
         latency_ms=(time.time()-t0)*1000, severity="error")

if con:
    t0 = time.time()
    try:
        cur = con.cursor()
        cur.execute("SELECT 1 FROM RDB$DATABASE")
        cur.fetchone()
        step("Query de teste", True, "SELECT 1 FROM RDB$DATABASE",
             latency_ms=(time.time()-t0)*1000)
    except Exception as e:
        step("Query de teste", False, str(e), latency_ms=(time.time()-t0)*1000, severity="error")

    t0 = time.time()
    try:
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0")
        n = cur.fetchone()[0]
        step("Leitura do catálogo", True, f"{n} tabelas de usuário visíveis",
             evidence={"user_tables": int(n)}, latency_ms=(time.time()-t0)*1000)
    except Exception as e:
        step("Leitura do catálogo", False, str(e), latency_ms=(time.time()-t0)*1000, severity="warn")

    try: con.close()
    except Exception: pass

# Resumo
errors = [s for s in REPORT["steps"] if not s["ok"] and s["severity"] == "error"]
warns  = [s for s in REPORT["steps"] if not s["ok"] and s["severity"] == "warn"]
REPORT["finished_at"] = datetime.now(timezone.utc).isoformat()
REPORT["summary"] = {
    "total": len(REPORT["steps"]),
    "ok": sum(1 for s in REPORT["steps"] if s["ok"]),
    "errors": len(errors),
    "warnings": len(warns),
    "ready_to_sync": len(errors) == 0,
}
REPORT["agent_uid"] = CFG["agent_uid"]
REPORT["alias"] = CFG["alias"]

# Salva relatório local
with open("probe-report.json", "w", encoding="utf-8") as f:
    json.dump(REPORT, f, ensure_ascii=False, indent=2)

with open("probe-report.txt", "w", encoding="utf-8") as f:
    f.write(f"FireSync Probe — {REPORT['alias']} ({REPORT['agent_uid']})\\n")
    f.write(f"Início: {REPORT['started_at']}\\n")
    f.write(f"Fim:    {REPORT['finished_at']}\\n\\n")
    for s in REPORT["steps"]:
        mark = "[OK] " if s["ok"] else "[FAIL]"
        f.write(f"{mark} {s['name']} — {s['detail']}\\n")
    f.write(f"\\nResumo: {REPORT['summary']}\\n")

# Envia ao Hub (best-effort)
try:
    import requests
    requests.post(CFG["report"], headers={
        "Authorization": f"Bearer {CFG['token']}",
        "Content-Type": "application/json",
    }, json={
        "agent_uid": CFG["agent_uid"],
        "level": "info",
        "message": "probe_report",
        "context": REPORT,
    }, timeout=15)
    print("\\nRelatório enviado ao Hub.")
except Exception as e:
    print(f"\\nNão foi possível enviar ao Hub: {e}")

print("\\n=== RESUMO ===")
print(json.dumps(REPORT["summary"], indent=2))
print("\\nRelatórios salvos em: probe-report.json e probe-report.txt")
sys.exit(0 if REPORT["summary"]["ready_to_sync"] else 1)
`;

        const requirements = `requests>=2.31.0
python-dotenv>=1.0.0
fdb>=2.0.2
`;

        const runBat = `@echo off
setlocal
cd /d "%~dp0"
echo === FireSync Probe — Levantamento de requisitos ===
if not exist .venv (
  echo Criando ambiente virtual Python...
  python -m venv .venv || (echo Falha ao criar venv. Instale Python 3.9+ ^& pause ^& exit /b 1)
)
call .venv\\Scripts\\activate.bat
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
python probe.py
echo.
echo Relatorio salvo em probe-report.txt e probe-report.json
pause
`;

        const runSh = `#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "=== FireSync Probe — Levantamento de requisitos ==="
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
python probe.py || true
echo
echo "Relatorio salvo em probe-report.txt e probe-report.json"
`;

        const readme = `# FireSync Probe — Diagnóstico local

Agente **somente leitura** para validar todos os pré-requisitos antes de instalar o
agente de sincronização real. **Não envia dados do banco** — apenas verifica:

1. Python 3.9+ e arquitetura (32/64 bits)
2. Dependências Python (\`requests\`, \`python-dotenv\`, \`fdb\` ou \`firebird-driver\`)
3. \`fbclient.dll\` presente e compatível com o Python instalado
4. Arquivo \`.env\` completo
5. Arquivo \`.FDB\` existe e é acessível
6. Resolução DNS do Hub FireSync
7. HTTPS de saída para o Hub (heartbeat)
8. Porta TCP do Firebird (quando remoto)
9. Autenticação SYSDBA
10. Query de teste (\`SELECT 1 FROM RDB$DATABASE\`)
11. Leitura do catálogo (\`RDB$RELATIONS\`)

## Como executar

**Windows:** duplo clique em \`run.bat\`
**Linux/macOS:** \`chmod +x run.sh && ./run.sh\`

Ao final são gerados:
- \`probe-report.txt\` — relatório legível
- \`probe-report.json\` — relatório estruturado
- Envio automático ao Hub (visível em **Conectividade → Logs**)

Empresa: **${db.companies?.name ?? "-"}**
Banco: **${db.name}**
Hub: \`${origin}\`
`;

        const files = {
          [`${folder}/probe.py`]: strToU8(probePy),
          [`${folder}/.env`]: strToU8(envFile),
          [`${folder}/requirements.txt`]: strToU8(requirements),
          [`${folder}/run.bat`]: strToU8(runBat),
          [`${folder}/run.sh`]: strToU8(runSh),
          [`${folder}/README.md`]: strToU8(readme),
        };

        const zipped = zipSync(files, { level: 6 });
        const ab = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;

        return new Response(ab, {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${folder}.zip"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
