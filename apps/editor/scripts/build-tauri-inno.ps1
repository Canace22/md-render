param(
  [string]$AppExePath = $env:TAURI_APP_EXE_PATH,
  [string]$WebView2BootstrapperPath = $env:WEBVIEW2_BOOTSTRAPPER_PATH,
  [string]$OutputDir = $env:TAURI_INNO_OUTPUT_DIR,
  [string]$OutputSuffix = $env:TAURI_INNO_OUTPUT_SUFFIX,
  [string]$SignToolCommand = $env:WINDOWS_SIGNTOOL_COMMAND
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WebView2BootstrapperUrl = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
$EditorDir = Split-Path -Parent $PSScriptRoot
$TauriDir = Join-Path $EditorDir 'src-tauri'
$InnoScript = Join-Path $TauriDir 'installers\windows\md-render-tauri.iss'
$PackageJsonPath = Join-Path $EditorDir 'package.json'

function Resolve-InnoCompiler {
  $candidates = @(
    $env:INNO_SETUP_COMPILER,
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

  $compiler = $candidates | Select-Object -First 1
  if (!$compiler) {
    throw 'Inno Setup 6 compiler not found. Install Inno Setup or set INNO_SETUP_COMPILER.'
  }

  return (Resolve-Path -LiteralPath $compiler).Path
}

function Resolve-WebView2Bootstrapper([string]$RequestedPath) {
  if (!$RequestedPath) {
    $cacheDir = Join-Path $TauriDir 'target\inno-cache'
    New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
    $RequestedPath = Join-Path $cacheDir 'MicrosoftEdgeWebview2Setup.exe'

    if (!(Test-Path -LiteralPath $RequestedPath -PathType Leaf)) {
      Write-Host 'Downloading the official Microsoft Edge WebView2 Evergreen Bootstrapper...'
      Invoke-WebRequest -Uri $WebView2BootstrapperUrl -OutFile $RequestedPath
    }
  }

  $resolvedPath = (Resolve-Path -LiteralPath $RequestedPath).Path
  $signature = Get-AuthenticodeSignature -FilePath $resolvedPath
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notlike '*Microsoft Corporation*') {
    throw "WebView2 bootstrapper signature is not valid: $resolvedPath"
  }

  return $resolvedPath
}

if (!$AppExePath) {
  $AppExePath = Join-Path $TauriDir 'target\release\md-render-tauri-preview.exe'
}
if (!$OutputDir) {
  $OutputDir = Join-Path $TauriDir 'target\release\bundle\inno'
}

$resolvedAppExePath = (Resolve-Path -LiteralPath $AppExePath).Path
$resolvedWebView2Path = Resolve-WebView2Bootstrapper $WebView2BootstrapperPath
$resolvedOutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$version = (Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json).version
$compiler = Resolve-InnoCompiler

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$compilerArguments = @(
  "/DAppVersion=$version",
  "/DAppExePath=$resolvedAppExePath",
  "/DWebView2BootstrapperPath=$resolvedWebView2Path",
  "/DOutputDir=$resolvedOutputDir",
  "/DOutputSuffix=$OutputSuffix"
)

if ($SignToolCommand) {
  $compilerArguments += '/DSignedBuild=1'
  $compilerArguments += "/Smdrender=$SignToolCommand"
}

$compilerArguments += $InnoScript
& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0) {
  throw "Inno Setup failed with exit code $LASTEXITCODE"
}

Write-Host "Inno Setup output: $resolvedOutputDir"
