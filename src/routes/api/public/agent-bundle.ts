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
  return (s || "agent")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "agent";
}

function genToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "fsh_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/agent-bundle")({
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

        // Garante agent_uid
        let agent_uid = db.agent_uid;
        if (!agent_uid) {
          agent_uid = `${slug(db.companies?.name ?? "company")}-${slug(db.name)}-${db.id.slice(0, 6)}`;
          await supabaseAdmin.from("databases").update({ agent_uid }).eq("id", db.id);
        }
        // Garante token (no-op se já existe)
        let agent_token = db.agent_token;
        if (!agent_token) {
          agent_token = genToken();
          await supabaseAdmin.from("databases").update({ agent_token }).eq("id", db.id);
        }

        const origin = `${url.protocol}//${url.host}`;
        const folder = `firesync-agent-${slug(agent_uid)}`;

        const envFile = `# ============================================================
# FireSync LocalBridge Agent — configuração gerada automaticamente
# Empresa: ${db.companies?.name ?? "-"}
# Banco:   ${db.name}
# Gerado:  ${new Date().toISOString()}
# ============================================================

# Endpoint do FireSync Hub
REMOTE_ENDPOINT=${origin}/api/public/sync
HEARTBEAT_ENDPOINT=${origin}/api/public/heartbeat
COMMAND_RESULT_ENDPOINT=${origin}/api/public/command_result
REGISTER_ENDPOINT=${origin}/api/public/register
LOGS_ENDPOINT=${origin}/api/public/logs

# Autenticação
API_TOKEN=${agent_token}

# Identificação do agente
AGENT_UID=${agent_uid}
AGENT_ALIAS=${db.name}
AGENT_VERSION=1.0.0

# Banco Firebird local
DB_TYPE=firebird
DB_HOST=${db.host ?? "localhost"}
DB_PORT=${db.port ?? 3050}
DB_PATH=${db.filepath ?? ""}
DB_USER=${db.username ?? "SYSDBA"}
DB_PASS=${db.password_encrypted ?? "masterkey"}
DB_CHARSET=${db.charset ?? "WIN1252"}
DB_FIREBIRD_VERSION=${db.firebird_version ?? "2.5"}

# Intervalos (segundos)
SYNC_INTERVAL=${db.sync_interval ?? 900}
HEARTBEAT_INTERVAL=30
COMMAND_POLL_INTERVAL=5

# Tabelas (separadas por vírgula ou ALL)
SYNC_TABLES=${db.sync_tables ?? "ALL"}

# Logs
LOG_LEVEL=INFO
LOG_FILE=firesync-agent.log
`;

        const agentPy = `"""
FireSync LocalBridge Agent
--------------------------
Agente Python que conecta o Firebird local ao FireSync Hub via push + command queue.
Não requer IP fixo nem porta aberta: o agente faz polling de heartbeat.
"""
import os, sys, time, json, uuid, hashlib, logging, traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
except ImportError:
    print("Instale dependências: pip install -r requirements.txt"); sys.exit(1)

import requests
try:
    import fdb
except ImportError:
    fdb = None

load_dotenv()

CFG = {
    "remote": os.getenv("REMOTE_ENDPOINT"),
    "heartbeat": os.getenv("HEARTBEAT_ENDPOINT"),
    "command_result": os.getenv("COMMAND_RESULT_ENDPOINT"),
    "register": os.getenv("REGISTER_ENDPOINT"),
    "logs_url": os.getenv("LOGS_ENDPOINT"),
    "token": os.getenv("API_TOKEN"),
    "agent_uid": os.getenv("AGENT_UID"),
    "alias": os.getenv("AGENT_ALIAS"),
    "version": os.getenv("AGENT_VERSION", "1.0.0"),
    "db_host": os.getenv("DB_HOST", "localhost"),
    "db_port": int(os.getenv("DB_PORT", "3050")),
    "db_path": os.getenv("DB_PATH"),
    "db_user": os.getenv("DB_USER", "SYSDBA"),
    "db_pass": os.getenv("DB_PASS", "masterkey"),
    "db_charset": os.getenv("DB_CHARSET", "WIN1252"),
    "sync_interval": int(os.getenv("SYNC_INTERVAL", "900")),
    "heartbeat_interval": int(os.getenv("HEARTBEAT_INTERVAL", "30")),
    "sync_tables": os.getenv("SYNC_TABLES", "ALL"),
    "log_level": os.getenv("LOG_LEVEL", "INFO"),
    "log_file": os.getenv("LOG_FILE", "firesync-agent.log"),
}

logging.basicConfig(
    level=getattr(logging, CFG["log_level"], logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(CFG["log_file"], encoding="utf-8"), logging.StreamHandler()],
)
log = logging.getLogger("firesync")


def headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {CFG['token']}", "Content-Type": "application/json"}


def db_connect():
    if fdb is None:
        raise RuntimeError("Driver Firebird (fdb) não instalado. Rode: pip install -r requirements.txt")
    dsn = f"{CFG['db_host']}/{CFG['db_port']}:{CFG['db_path']}"
    return fdb.connect(dsn=dsn, user=CFG["db_user"], password=CFG["db_pass"], charset=CFG["db_charset"])


def register():
    try:
        r = requests.post(CFG["register"], headers=headers(), json={
            "agent_uid": CFG["agent_uid"],
            "agent_version": CFG["version"],
            "alias": CFG["alias"],
            "hostname": os.uname().nodename if hasattr(os, "uname") else os.getenv("COMPUTERNAME", "host"),
        }, timeout=15)
        log.info("register: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        log.error("register falhou: %s", e)


def heartbeat() -> List[Dict[str, Any]]:
    try:
        r = requests.post(CFG["heartbeat"], headers=headers(), json={
            "agent_uid": CFG["agent_uid"],
            "agent_version": CFG["version"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, timeout=15)
        if r.ok:
            data = r.json()
            return data.get("pending_commands", []) or []
    except Exception as e:
        log.warning("heartbeat falhou: %s", e)
    return []


def post_result(command_id: str, command_type: str, status: str, result: Any = None, error: Optional[str] = None, duration_ms: int = 0):
    try:
        requests.post(CFG["command_result"], headers=headers(), json={
            "agent_uid": CFG["agent_uid"],
            "command_id": command_id,
            "command_type": command_type,
            "status": status,
            "result": result,
            "error_message": error,
            "duration_ms": duration_ms,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }, timeout=30)
    except Exception as e:
        log.error("post_result falhou: %s", e)


def cmd_ping_test() -> Dict[str, Any]:
    t0 = time.time()
    con = db_connect()
    cur = con.cursor()
    cur.execute("SELECT 1 FROM RDB$DATABASE")
    cur.fetchone()
    con.close()
    return {"ok": True, "latency_ms": int((time.time() - t0) * 1000)}


def cmd_list_tables() -> Dict[str, Any]:
    con = db_connect()
    cur = con.cursor()
    cur.execute("SELECT TRIM(RDB$RELATION_NAME) FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 ORDER BY 1")
    tables = [r[0] for r in cur.fetchall()]
    out = []
    for t in tables:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        cnt = cur.fetchone()[0]
        out.append({"name": t, "row_count": int(cnt)})
    con.close()
    return {"tables": out}


def cmd_run_query(payload: Dict[str, Any]) -> Dict[str, Any]:
    sql = (payload or {}).get("sql", "")
    if not sql.strip(): raise ValueError("SQL vazio")
    con = db_connect()
    cur = con.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = [list(r) for r in cur.fetchall()] if cols else []
    con.close()
    return {"columns": cols, "rows": rows, "row_count": len(rows)}


def handle_command(cmd: Dict[str, Any]):
    cid = cmd.get("command_id") or str(uuid.uuid4())
    ctype = cmd.get("command_type") or cmd.get("type")
    payload = cmd.get("payload") or {}
    log.info("comando recebido: %s (%s)", ctype, cid)
    t0 = time.time()
    try:
        if ctype == "ping_test": res = cmd_ping_test()
        elif ctype == "list_tables": res = cmd_list_tables()
        elif ctype == "run_query": res = cmd_run_query(payload)
        else: raise ValueError(f"command_type desconhecido: {ctype}")
        post_result(cid, ctype, "success", result=res, duration_ms=int((time.time() - t0) * 1000))
    except Exception as e:
        log.error("comando %s falhou: %s\\n%s", ctype, e, traceback.format_exc())
        post_result(cid, ctype, "error", error=str(e), duration_ms=int((time.time() - t0) * 1000))


def do_sync():
    """Sync incremental: envia contagens de tabelas para o Hub."""
    try:
        if CFG["sync_tables"].upper() == "ALL":
            tables_info = cmd_list_tables()["tables"]
        else:
            con = db_connect(); cur = con.cursor()
            tables_info = []
            for t in [x.strip() for x in CFG["sync_tables"].split(",") if x.strip()]:
                cur.execute(f'SELECT COUNT(*) FROM "{t}"')
                tables_info.append({"name": t, "row_count": int(cur.fetchone()[0])})
            con.close()

        payload = {
            "agent_uid": CFG["agent_uid"],
            "agent_version": CFG["version"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database_name": CFG["alias"],
            "sync_type": "incremental",
            "tables": [{"table_name": t["name"], "record_count": t["row_count"]} for t in tables_info],
        }
        r = requests.post(CFG["remote"], headers=headers(), json=payload, timeout=120)
        log.info("sync: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        log.error("sync falhou: %s", e)


def main():
    missing = [k for k in ("remote", "heartbeat", "token", "agent_uid", "db_path") if not CFG[k]]
    if missing:
        log.error("Variáveis ausentes no .env: %s", missing); sys.exit(2)
    log.info("FireSync Agent iniciado — UID=%s alias=%s", CFG["agent_uid"], CFG["alias"])
    register()
    last_sync = 0.0
    while True:
        try:
            cmds = heartbeat()
            for c in cmds: handle_command(c)
            if time.time() - last_sync >= CFG["sync_interval"]:
                do_sync(); last_sync = time.time()
        except KeyboardInterrupt:
            log.info("Encerrando agente."); break
        except Exception as e:
            log.error("loop principal: %s", e)
        time.sleep(CFG["heartbeat_interval"])


if __name__ == "__main__":
    main()
`;

        const requirements = `requests>=2.31.0
python-dotenv>=1.0.0
fdb>=2.0.2
`;

        const runBat = `@echo off
setlocal
cd /d "%~dp0"
if not exist .venv (
  echo Criando ambiente virtual Python...
  python -m venv .venv || (echo Falha ao criar venv & pause & exit /b 1)
)
call .venv\\Scripts\\activate.bat
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
python agent.py
pause
`;

        const runSh = `#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
python agent.py
`;

        const installService = `; ============================================================
; Instalação como serviço Windows (opcional, usando NSSM)
; ============================================================
; 1. Baixe NSSM em https://nssm.cc/download
; 2. Em um terminal admin, na pasta deste agente:
;       nssm install FireSyncAgent
; 3. Path:        %CD%\\.venv\\Scripts\\python.exe
;    Arguments:   %CD%\\agent.py
;    Startup dir: %CD%
; 4. nssm start FireSyncAgent
`;

        const readme = `# FireSync LocalBridge Agent

Agente local pré-configurado para sincronizar o banco **${db.name}** (empresa **${db.companies?.name ?? "-"}**) com o FireSync Hub.

## Arquivos
- \`agent.py\` — agente principal
- \`.env\` — configuração já preenchida com endpoint, token e dados do banco
- \`requirements.txt\` — dependências Python
- \`run.bat\` / \`run.sh\` — script de execução (cria venv e inicia)
- \`install-as-service.txt\` — instruções para rodar como serviço Windows

## Requisitos
- Python 3.9+ instalado
- Acesso de rede de saída para \`${origin}\` (apenas HTTPS de saída, **não precisa de IP fixo nem porta aberta**)
- Firebird ${db.firebird_version ?? "2.5"} acessível em \`${db.host ?? "localhost"}:${db.port ?? 3050}\`

## Como executar

### Windows
Dê duplo clique em \`run.bat\` (ou execute via terminal).

### Linux / macOS
\`\`\`bash
chmod +x run.sh
./run.sh
\`\`\`

Na primeira execução o agente:
1. Cria um ambiente virtual Python (\`.venv\`)
2. Instala as dependências
3. Se registra no FireSync Hub
4. Inicia o loop de heartbeat + sincronização

## Logs
Saída em tela e em \`firesync-agent.log\` (na mesma pasta).

## Identificação
- AGENT_UID: \`${agent_uid}\`
- AGENT_ALIAS: \`${db.name}\`
- Endpoint: \`${origin}\`

Caso o token seja revogado pelas Configurações do Hub, baixe o agente novamente para receber um \`.env\` atualizado.
`;

        const files = {
          [`${folder}/agent.py`]: strToU8(agentPy),
          [`${folder}/.env`]: strToU8(envFile),
          [`${folder}/requirements.txt`]: strToU8(requirements),
          [`${folder}/run.bat`]: strToU8(runBat),
          [`${folder}/run.sh`]: strToU8(runSh),
          [`${folder}/install-as-service.txt`]: strToU8(installService),
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
