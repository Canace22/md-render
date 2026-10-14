#define MyAppName "MD Render"
#define MyAppPublisher "Canace"
#define MyAppExeName "md-render.exe"

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#ifndef AppExePath
  #define AppExePath "..\..\target\release\md-render.exe"
#endif

#ifndef WebView2BootstrapperPath
  #error WebView2BootstrapperPath must point to the Microsoft Evergreen Bootstrapper
#endif

#ifndef OutputDir
  #define OutputDir "..\..\target\release\bundle\inno"
#endif

#ifndef OutputSuffix
  #define OutputSuffix ""
#endif

[Setup]
AppId={{637CB57E-4F2C-4C08-A064-EDB997271E62}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppVerName={#MyAppName} {#AppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://github.com/Canace22/md-render
AppSupportURL=https://github.com/Canace22/md-render/issues
AppUpdatesURL=https://github.com/Canace22/md-render/releases
DefaultDirName={autopf}\MD Render
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes
LicenseFile=..\..\..\..\..\LICENSE
OutputDir={#OutputDir}
OutputBaseFilename=MD-Render-{#AppVersion}-x64{#OutputSuffix}-setup
SetupIconFile=..\..\..\assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern dynamic
WizardSizePercent=110
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
#ifdef SignedBuild
SignTool=mdrender
SignedUninstaller=yes
#endif

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
chinesesimplified.WebView2InstallStatus=正在检查 Microsoft Edge WebView2 运行时…
chinesesimplified.WebView2InstallFailed=Microsoft Edge WebView2 运行时安装失败（退出码 %d）。请检查网络或管理员权限后重试。
english.WebView2InstallStatus=Checking the Microsoft Edge WebView2 Runtime…
english.WebView2InstallFailed=Microsoft Edge WebView2 Runtime installation failed (exit code %d). Check the network or administrator permissions and try again.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#WebView2BootstrapperPath}"; DestName: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy noencryption
#ifdef SignedBuild
Source: "{#AppExePath}"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion signonce
#else
Source: "{#AppExePath}"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion
#endif

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  BootstrapperPath: String;
  ResultCode: Integer;
begin
  Result := '';
  ResultCode := -1;
  BootstrapperPath := ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe');
  if not FileExists(BootstrapperPath) then
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
  WizardForm.StatusLabel.Caption := CustomMessage('WebView2InstallStatus');

  if not Exec(
    BootstrapperPath,
    '/silent /install',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
    Result := Format(CustomMessage('WebView2InstallFailed'), [ResultCode])
  else if ResultCode <> 0 then
    Result := Format(CustomMessage('WebView2InstallFailed'), [ResultCode]);
end;
