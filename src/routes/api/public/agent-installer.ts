// GET /api/public/agent-installer?database_id=...&token=...
//
// Retorna um ZIP com:
//   - firesync-agent.env    (config pré-preenchida do Hub)
//   - install.bat           (baixa o .exe do GitHub Releases e roda silent)
//   - LEIA-ME.txt           (instruções em pt-BR)
//
// O binário firesync-agent-setup.exe é gerado pelo workflow
// .github/workflows/build-agent.yml e publicado como GitHub Release.
// A URL do asset fica em AGENT_INSTALLER_URL (variável de ambiente do Hub).

import { createFileRoute } from "@tanstack/react-router";
import { zipSync, strToU8 } from "fflate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_INSTALLER_URL =
  "https://github.com/lovable-dev/firesync-hub/releases/latest/download/firesync-agent-setup.exe";

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

export const Route = createFileRoute("/api/public/agent-installer")({
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
        if (!db.agent_token || db.agent_token !== token)
          return err(401, "Token inválido");

        const origin = `${url.protocol}//${url.host}`;
        const folder = `firesync-agent-${slug(db.agent_uid ?? db.name)}`;
        const installerUrl = process.env.AGENT_INSTALLER_URL || DEFAULT_INSTALLER_URL;

        const envFile = `# FireSync Agent — configuração gerada em ${new Date().toISOString()}
# Empresa: ${db.companies?.name ?? "-"} | Banco: ${db.name}

REMOTE_ENDPOINT=${origin}/api/public/sync
HEARTBEAT_ENDPOINT=${origin}/api/public/heartbeat
COMMAND_RESULT_ENDPOINT=${origin}/api/public/command_result
REGISTER_ENDPOINT=${origin}/api/public/register
LOGS_ENDPOINT=${origin}/api/public/logs

API_TOKEN=${db.agent_token}
AGENT_UID=${db.agent_uid ?? ""}
AGENT_ALIAS=${db.name}



DB_TYPE=firebird
DB_HOST=${db.host ?? "localhost"}
DB_PORT=${db.port ?? 3050}
DB_PATH=${db.filepath ?? ""}
DB_USER=${db.username ?? "SYSDBA"}
DB_PASS=${db.password_encrypted ?? "masterkey"}
DB_CHARSET=${db.charset ?? "WIN1252"}
DB_FIREBIRD_VERSION=${db.firebird_version ?? "2.5"}

SYNC_INTERVAL=${db.sync_interval ?? 900}
HEARTBEAT_INTERVAL=30
SYNC_TABLES=${db.sync_tables ?? "ALL"}
SYNC_ENTREGAS_WINDOW_DAYS=30
LOG_LEVEL=INFO
`;

        // IMPORTANTE: .bat DEVE ter line endings CRLF e SEM caracteres
        // acentuados fora de comentarios REM — cmd.exe fecha o console
        // silenciosamente quando encontra `^` de continuacao com LF-only
        // ou UTF-8 sem chcp. Mantemos o corpo em ASCII puro e convertemos
        // para CRLF antes de zipar (ver toCrlf abaixo).
        const installBatLf = `@echo off
REM ============================================================
REM  FireSync LocalBridge - instalacao (servico Windows)
REM  Empresa: ${(db.companies?.name ?? "-").replace(/[^\x20-\x7e]/g, "?")}
REM  Banco:   ${(db.name ?? "-").replace(/[^\x20-\x7e]/g, "?")}
REM ============================================================
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ===== FireSync LocalBridge - instalador =====
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo ERRO: execute este arquivo como Administrador.
    echo        [botao direito] ^> "Executar como administrador"
    echo.
    pause
    exit /b 1
)

set "INSTALLER_URL=${origin}/api/public/agent-download?token=${db.agent_token}"
set "INSTALLER_EXE=%~dp0firesync-agent-setup.exe"
set "ENVFILE=%~dp0firesync-agent.env"

if exist "%INSTALLER_EXE%" (
    echo [1/3] Instalador ja incluido no ZIP - pulando download.
    for %%A in ("%INSTALLER_EXE%") do echo       Arquivo local: %%~zA bytes
) else (
    echo [1/3] Baixando instalador do FireSync Agent...
    echo       URL: %INSTALLER_URL%
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri '%INSTALLER_URL%' -OutFile '%INSTALLER_EXE%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 goto :download_fail
    if not exist "%INSTALLER_EXE%" goto :download_fail
    for %%A in ("%INSTALLER_EXE%") do echo       OK: %%~zA bytes
)

echo       Validando o executavel...
powershell -NoProfile -Command "$b=[IO.File]::ReadAllBytes('%INSTALLER_EXE%')[0..1]; if($b[0] -ne 77 -or $b[1] -ne 90){ exit 1 }"
if errorlevel 1 (
    echo.
    echo ERRO: o arquivo NAO e um executavel Windows valido.
    del "%INSTALLER_EXE%" >nul 2>&1
    pause
    exit /b 5
)



echo [2/3] Instalando (silencioso) e registrando servico...
"%INSTALLER_EXE%" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /ENVFILE="%ENVFILE%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo ERRO na instalacao. Codigo: %RC%
    echo Verifique o log do Inno Setup em %TEMP%\Setup Log*.txt
    echo.
    pause
    exit /b 3
)

echo [3/3] Verificando servico FireSyncAgent...
sc query FireSyncAgent >nul 2>&1
if errorlevel 1 (
    echo AVISO: servico FireSyncAgent nao foi encontrado apos a instalacao.
    echo Tente reinstalar ou verifique o log do Inno Setup.
    echo.
    pause
    exit /b 4
)

sc query FireSyncAgent | findstr /I "RUNNING" >nul
if errorlevel 1 (
    echo Iniciando servico...
    sc start FireSyncAgent
)

echo.
echo ============================================================
echo  Instalacao concluida. O agente sobe com o Windows e mantem
echo  comunicacao continua com o Hub.
echo.
echo  Logs: C:\\ProgramData\\FireSync\\logs\\firesync-agent.log
echo ============================================================
echo.
pause
exit /b 0

:download_fail
echo.
echo ERRO: falha ao baixar o instalador.
echo URL: %INSTALLER_URL%
echo Verifique sua conexao com a internet e proxies/firewall.
echo.
pause
exit /b 2
`;
        // Converte para CRLF (obrigatorio para .bat em Windows)
        const installBat = installBatLf.replace(/\r?\n/g, "\r\n");


        const readme = `FireSync LocalBridge — Instalação
=================================

Empresa: ${db.companies?.name ?? "-"}
Banco:   ${db.name}
Gerado:  ${new Date().toISOString()}

1) Clique com o botão direito em "install.bat" e escolha
   "Executar como administrador".

2) O script vai:
   - Baixar o instalador oficial (firesync-agent-setup.exe)
   - Instalar em C:\\Program Files\\FireSync\\
   - Registrar o serviço Windows "FireSyncAgent" (auto-start)
   - Iniciar o serviço

3) Pronto. O agente sobe junto com o Windows e mantém
   comunicação contínua com o Hub. Sem IP fixo, sem porta aberta.

Verificar status:
    sc query FireSyncAgent

Reiniciar após alterar o .env:
    sc stop  FireSyncAgent
    sc start FireSyncAgent

Desinstalar:
    Painel de Controle > Programas > "FireSync LocalBridge Agent"
`;

        // Busca o instalador do GitHub pelo lado do servidor (Cloudflare
        // alcança o GitHub sem o problema de TLS do servidor local) e embute
        // no ZIP, para o operador não precisar baixar nada na máquina.
        let exeBytes: Uint8Array | null = null;
        try {
          const exeResp = await fetch(installerUrl, { redirect: "follow" });
          if (exeResp.ok) {
            const buf = await exeResp.arrayBuffer();
            const arr = new Uint8Array(buf);
            // valida assinatura MZ (executável Windows) antes de embutir
            if (arr.length > 1000 && arr[0] === 0x4d && arr[1] === 0x5a) {
              exeBytes = arr;
            }
          }
        } catch {
          exeBytes = null; // se falhar, o ZIP sai sem o exe e o .bat baixa como fallback
        }

        const files: Record<string, Uint8Array> = {
          [`${folder}/install.bat`]:            strToU8(installBat),
          [`${folder}/firesync-agent.env`]:     strToU8(envFile),
          [`${folder}/LEIA-ME.txt`]:            strToU8(readme),
        };
        if (exeBytes) {
          files[`${folder}/firesync-agent-setup.exe`] = exeBytes;
        }

        const zipped = zipSync(files, { level: 6 });
        const ab = zipped.buffer.slice(
          zipped.byteOffset,
          zipped.byteOffset + zipped.byteLength,
        ) as ArrayBuffer;

        // Registra o download em agent_events (event_type='log')
        // — trilha de auditoria de quem baixou o instalador e quando.
        try {
          await supabaseAdmin.from("agent_events").insert({
            database_id: db.id,
            event_type: "log",
            level: "INFO",
            message: `installer_download: ${folder}`,
            context: {
              action: "installer_download",
              installer_url: installerUrl,
              user_agent: request.headers.get("user-agent") ?? null,
              ip: request.headers.get("x-forwarded-for")
                ?? request.headers.get("cf-connecting-ip")
                ?? null,
            } as any,
          });
        } catch { /* auditoria não pode bloquear o download */ }

        return new Response(ab, {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${folder}-installer.zip"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
