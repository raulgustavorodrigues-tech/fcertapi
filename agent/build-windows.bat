@echo off
REM ============================================================
REM Build local (Windows) — gera dist\firesync-agent.exe
REM e Output\firesync-agent-setup.exe (se Inno Setup instalado)
REM ============================================================
setlocal
cd /d "%~dp0"

where python >nul 2>&1 || (echo Python 3.10+ e necessario & exit /b 1)

if not exist .venv (
    python -m venv .venv || exit /b 1
)
call .venv\Scripts\activate.bat

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller

REM 1) EXE
pyinstaller --clean --noconfirm firesync-agent.spec || exit /b 1
echo.
echo === EXE gerado em: dist\firesync-agent.exe ===

REM 2) Instalador (opcional, requer Inno Setup no PATH)
where iscc >nul 2>&1
if %ERRORLEVEL%==0 (
    iscc installer.iss || exit /b 1
    echo === Instalador gerado em: Output\firesync-agent-setup.exe ===
) else (
    echo AVISO: Inno Setup ^(iscc^) nao encontrado no PATH.
    echo        Instale de https://jrsoftware.org/isinfo.php para gerar o setup.
)

endlocal
