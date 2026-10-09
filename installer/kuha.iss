; Inno Setup recipe for dist\KuhaSetup.exe: wraps dist\Kuha\ (made by build.ps1, which also runs this) in one installer.
; Per-user, no admin rights. Uninstalling removes the program only: events, chats and the log stay in
; %LOCALAPPDATA%\Kuha, which this script never touches.
#define AppVersion "0.1.0"

[Setup]
; AppId names this app to Windows; changing it would make a new install not replace the old one
AppId={{6F0B3C0E-52B8-4E0F-9C55-6D1A7B7E4C21}
AppName=Kuha
AppVersion={#AppVersion}
AppPublisher=Kuha
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\Kuha
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=KuhaSetup
SetupIconFile=..\backend\kuha.ico
UninstallDisplayIcon={app}\Kuha.exe
UninstallDisplayName=Kuha
WizardStyle=modern
; lzma2/normal: /max takes several times longer for a few percent, and the CLIP weights barely compress either way
Compression=lzma2/normal
SolidCompression=yes
LZMAUseSeparateProcess=yes
; the mutex launcher.py holds: setup and uninstall ask the user to close Kuha first instead of failing on files in use
AppMutex=Kuha.SingleInstance

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\Kuha\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{userprograms}\Kuha"; Filename: "{app}\Kuha.exe"
Name: "{userdesktop}\Kuha"; Filename: "{app}\Kuha.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Kuha.exe"; Description: "{cm:LaunchProgram,Kuha}"; Flags: nowait postinstall skipifsilent
