# FireSync LocalBridge Agent

Ponte local entre o Firebird do cliente e o **FireSync Hub**.
Não requer IP fixo, nem porta aberta — apenas HTTPS de saída (padrão *pull*).

Este diretório é a **fonte canônica** do agente. O binário Windows
(`firesync-agent-setup.exe`) é gerado a partir daqui via PyInstaller +
Inno Setup e distribuído pelos endpoints do Hub.

## Estrutura

```
agent/
├─ agent.py                # código do agente (single-file)
├─ requirements.txt        # dependências Python
├─ firesync-agent.spec     # spec PyInstaller (--onefile)
├─ installer.iss           # script Inno Setup
├─ build-windows.bat       # build local (Windows)
└─ README.md
```

## Build local (Windows)

Pré-requisitos:
- Python 3.10+ 64-bit
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) no `PATH` (opcional, para gerar o `.exe` de instalação)

```cmd
cd agent
build-windows.bat
```

Artefatos:
- `dist\firesync-agent.exe` — executável autônomo (~15 MB)
- `Output\firesync-agent-setup.exe` — instalador Inno Setup

## Build automatizado (CI)

O workflow `.github/workflows/build-agent.yml` roda em `windows-latest`,
gera `firesync-agent-setup.exe` e publica em **GitHub Releases**.
O Hub consome esse asset via `AGENT_INSTALLER_URL`.

## Modos de execução

| Comando                              | Descrição                                          |
|--------------------------------------|----------------------------------------------------|
| `firesync-agent.exe --run`           | Foreground (debug)                                 |
| `firesync-agent.exe --install-service` | Registra e inicia como serviço Windows           |
| `firesync-agent.exe --uninstall-service` | Remove o serviço                               |
| `firesync-agent.exe --version`       | Imprime versão                                     |

O instalador Inno Setup roda `--install-service` automaticamente ao final.

## Configuração (`firesync-agent.env`)

Fica em `C:\Program Files\FireSync\firesync-agent.env`. É gerado pelo Hub
(endpoint `/api/public/agent-installer`) já preenchido com endpoint,
token e credenciais do banco. Após alterar, reinicie o serviço:

```cmd
sc stop  FireSyncAgent
sc start FireSyncAgent
```

## Logs

Arquivo rotativo em `C:\ProgramData\FireSync\logs\firesync-agent.log`
(5 MB × 5 arquivos).

## Serviço Windows

- Nome: `FireSyncAgent`
- Startup: **Automatic** (inicia com o Windows)
- Failure actions: restart em 60s (até 3 tentativas / 24h)
