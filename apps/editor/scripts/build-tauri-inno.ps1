param(
  [string]$AppExePath = $env:TAURI_APP_EXE_PATH,
  [string]$WebView2BootstrapperPath = $env:WEBVIEW2_BOOTSTRAPPER_PATH,
  [string]$OutputDir = $env:TAURI_INNO_OUTPUT_DIR,
  [string]$OutputSuffix = $env:TAURI_INNO_OUTPUT_SUFFIX,
  [string]$SignToolCommand = $env:WINDOWS_SIGNTOOL_COMMAND
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# npm can launch Windows PowerShell from pwsh with incompatible PowerShell 7 module paths.
if ($PSVersionTable.PSEdition -eq 'Desktop' -and $env:PSModulePath) {
  $modulePathSeparator = [System.IO.Path]::PathSeparator
  $env:PSModulePath = (($env:PSModulePath -split [regex]::Escape($modulePathSeparator)) |
    Where-Object { $_ -and $_ -notmatch '[\\/]PowerShell(?:[\\/]|$)' }) -join $modulePathSeparator
}

$WebView2BootstrapperUrl = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
$ChineseLanguageUrl = 'https://raw.githubusercontent.com/jrsoftware/issrc/is-6_7_1/Files/Languages/Unofficial/ChineseSimplified.isl'
$ChineseLanguageSha256 = '7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278'
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

function Resolve-ChineseLanguageFile {
  $cacheDir = Join-Path $TauriDir 'target\inno-cache'
  $languagePath = Join-Path $cacheDir 'ChineseSimplified.isl'
  New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

  $needsDownload = !(Test-Path -LiteralPath $languagePath -PathType Leaf)
  if (!$needsDownload) {
    $cachedHash = (Get-FileHash -LiteralPath $languagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $needsDownload = $cachedHash -ne $ChineseLanguageSha256
  }

  if ($needsDownload) {
    Write-Host 'Downloading the Inno Setup 6.7.1 Simplified Chinese translation...'
    Invoke-WebRequest -Uri $ChineseLanguageUrl -OutFile $languagePath
  }

  $languageHash = (Get-FileHash -LiteralPath $languagePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($languageHash -ne $ChineseLanguageSha256) {
    throw "Simplified Chinese translation checksum mismatch: $languagePath"
  }

  return (Resolve-Path -LiteralPath $languagePath).Path
}

if (!$AppExePath) {
  $AppExePath = Join-Path $TauriDir 'target\release\md-render.exe'
}
if (!$OutputDir) {
  $OutputDir = Join-Path $TauriDir 'target\release\bundle\inno'
}

$resolvedAppExePath = (Resolve-Path -LiteralPath $AppExePath).Path
$resolvedWebView2Path = Resolve-WebView2Bootstrapper $WebView2BootstrapperPath
$resolvedChineseLanguagePath = Resolve-ChineseLanguageFile
$resolvedOutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$version = (Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json).version
$compiler = Resolve-InnoCompiler

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$compilerArguments = @(
  "/DAppVersion=$version",
  "/DAppExePath=$resolvedAppExePath",
  "/DWebView2BootstrapperPath=$resolvedWebView2Path",
  "/DChineseLanguageFile=$resolvedChineseLanguagePath",
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
