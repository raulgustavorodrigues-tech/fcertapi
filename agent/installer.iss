; ============================================================
; FireSync LocalBridge Agent — Inno Setup installer
; Gera: firesync-agent-setup.exe
;
; Requisitos: Inno Setup 6.x (https://jrsoftware.org/isinfo.php)
; Uso:        iscc installer.iss
;
; O instalador aceita um parâmetro opcional para injetar o .env
; pré-configurado do Hub em tempo de instalação:
;
;   firesync-agent-setup.exe /VERYSILENT /ENVFILE="C:\path\firesync-agent.env"
;
; Se /ENVFILE não for passado, o instalador procura por
; "firesync-agent.env" ao lado do próprio setup.
; ============================================================

#define AppId          "{{7B4F1F8E-3C6E-4D2B-9A5C-FIRESYNC0001}}"
#define AppName        "FireSync LocalBridge Agent"
#define AppShortName   "FireSync"
#define AppVersion     "1.1.0"
#define AppPublisher   "FireSync"
#define ServiceName    "FireSyncAgent"
#define ExeName        "firesync-agent.exe"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppShortName}
DefaultGroupName={#AppShortName}
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputBaseFilename=firesync-agent-setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayName={#AppName}
WizardStyle=modern

[Files]
Source: "dist\{#ExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\{#AppShortName}\logs"; Permissions: users-modify

[Code]
var
  EnvFileParam: String;

function InitializeSetup(): Boolean;
begin
  EnvFileParam := ExpandConstant('{param:ENVFILE|}');
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Src, Dst: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    Dst := ExpandConstant('{app}\firesync-agent.env');

    // 1) Copia .env passado via /ENVFILE=
    if (EnvFileParam <> '') and FileExists(EnvFileParam) then
    begin
      FileCopy(EnvFileParam, Dst, False);
    end
    else
    begin
      // 2) .env ao lado do próprio setup
      Src := ExpandConstant('{src}\firesync-agent.env');
      if FileExists(Src) then
        FileCopy(Src, Dst, False);
    end;

    // 3) Instala/inicia o serviço Windows via CLI do próprio agente
    Exec(ExpandConstant('{app}\{#ExeName}'), '--install-service', '',
         SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Log('FireSync --install-service rc=' + IntToStr(ResultCode));
    // Marcador para diagnóstico do install.bat (silent não mostra MsgBox)
    SaveStringToFile(
      ExpandConstant('{commonappdata}\FireSync\install-service.rc'),
      IntToStr(ResultCode), False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    Exec(ExpandConstant('{app}\{#ExeName}'), '--uninstall-service', '',
         SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{commonappdata}\{#AppShortName}"
