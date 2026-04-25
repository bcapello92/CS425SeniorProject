param(
    [int]$TriagePort = 8000,
    [int]$ImagePort = 8001,
    [int]$ChatPort = 8002,
    [int]$VoicePort = 8003,
    [int]$TriageHttpsPort = 8443,
    [int]$ImageHttpsPort = 8445,
    [int]$ChatHttpsPort = 8444,
    [int]$VoiceHttpsPort = 8446,
    [string]$ImageDataDir,
    [string]$ImageIndexDir,
    [switch]$SkipServe,
    [switch]$ResetServe
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tailscaleService = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
if ($tailscaleService -and $tailscaleService.Status -ne "Running") {
    try {
        Start-Service -Name "Tailscale"
    } catch {
        Write-Warning "Could not start Tailscale automatically. Open PowerShell as Administrator or run: Start-Service Tailscale"
    }
}

$backendScript = Join-Path $PSScriptRoot "Backend\start_tailscale_model_stack.ps1"
if (-not (Test-Path $backendScript)) {
    throw "Could not find Backend\start_tailscale_model_stack.ps1"
}

$arguments = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $backendScript,
    "-TriagePort", $TriagePort,
    "-ImagePort", $ImagePort,
    "-ChatPort", $ChatPort,
    "-VoicePort", $VoicePort,
    "-TriageHttpsPort", $TriageHttpsPort,
    "-ImageHttpsPort", $ImageHttpsPort,
    "-ChatHttpsPort", $ChatHttpsPort,
    "-VoiceHttpsPort", $VoiceHttpsPort
)

if ($ImageDataDir) {
    $arguments += @("-ImageDataDir", $ImageDataDir)
}

if ($ImageIndexDir) {
    $arguments += @("-ImageIndexDir", $ImageIndexDir)
}

if ($SkipServe) {
    $arguments += "-SkipServe"
}

if ($ResetServe) {
    $arguments += "-ResetServe"
}

& powershell.exe @arguments
