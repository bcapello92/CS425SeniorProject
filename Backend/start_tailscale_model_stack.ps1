param(
    [int]$TriagePort = 8000,
    [int]$ImagePort = 8001,
    [int]$ChatPort = 8002,
    [int]$TriageHttpsPort = 8443,
    [int]$ImageHttpsPort = 8445,
    [int]$ChatHttpsPort = 8444,
    [string]$ImageDataDir,
    [string]$ImageIndexDir,
    [switch]$SkipServe,
    [switch]$ResetServe
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-TailscaleExe {
    $command = Get-Command "tailscale.exe" -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    $candidates = @(
        "C:\Program Files\Tailscale\tailscale.exe",
        "C:\Program Files (x86)\Tailscale\tailscale.exe",
        (Join-Path $env:LOCALAPPDATA "Tailscale\tailscale.exe")
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    throw "Could not find tailscale.exe. Install Tailscale or add it to PATH."
}

function Get-VenvPython {
    $backendVenvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
    if (Test-Path $backendVenvPython) {
        return $backendVenvPython
    }

    $repoRoot = Split-Path $PSScriptRoot -Parent
    $repoVenvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
    if (Test-Path $repoVenvPython) {
        return $repoVenvPython
    }

    throw "Could not find a Python virtual environment. Checked '$backendVenvPython' and '$repoVenvPython'."
}

function Get-TailscaleInfo {
    $statusJson = & $script:TailscaleExe status --json | ConvertFrom-Json
    $dnsName = [string]$statusJson.Self.DNSName
    if (-not $dnsName) {
        throw "Tailscale is not connected on this machine."
    }

    return @{
        DnsName = $dnsName.TrimEnd(".")
    }
}

function Start-ServiceWindow {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command,
        [hashtable]$Environment = @{}
    )

    $envAssignments = foreach ($entry in $Environment.GetEnumerator()) {
        '$env:{0} = ''{1}''' -f $entry.Key, ($entry.Value -replace "'", "''")
    }

    $scriptLines = @()
    $scriptLines += '$Host.UI.RawUI.WindowTitle = ''' + ($Title -replace "'", "''") + ''''
    $scriptLines += '$ErrorActionPreference = ''Stop'''
    $scriptLines += 'Set-Location ''' + ($WorkingDirectory -replace "'", "''") + ''''

    if ($envAssignments) {
        $scriptLines += $envAssignments
    }

    $scriptLines += $Command

    $scriptBody = $scriptLines -join [Environment]::NewLine
    $tempScript = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-tailscale-" + [Guid]::NewGuid().ToString() + ".ps1")
    Set-Content -Path $tempScript -Value $scriptBody -Encoding UTF8
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $tempScript) | Out-Null
}

function Wait-ForHttp {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5 | Out-Null
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for $Url"
}

function Resolve-ImageDataDir {
    param(
        [string]$Candidate
    )

    $options = @()
    if ($Candidate) {
        $options += $Candidate
    }

    $repoRoot = Split-Path $PSScriptRoot -Parent
    $options += (Join-Path $PSScriptRoot "imageRetrieval\data")
    $options += (Join-Path $repoRoot "data")
    $options += $repoRoot

    foreach ($option in $options) {
        if (-not $option) {
            continue
        }

        $resolved = $null
        try {
            $resolved = (Resolve-Path $option -ErrorAction Stop).Path
        } catch {
            continue
        }

        if ((Test-Path (Join-Path $resolved "imgs")) -or (Test-Path (Join-Path $resolved "images"))) {
            return $resolved
        }
    }

    throw "Could not find an image dataset directory with an 'imgs' or 'images' folder. Pass -ImageDataDir explicitly."
}

$script:TailscaleExe = Get-TailscaleExe
$pythonExe = Get-VenvPython
$repoRoot = Split-Path $PSScriptRoot -Parent
$imageDir = Join-Path $PSScriptRoot "imageRetrieval"

 $ImageDataDir = Resolve-ImageDataDir -Candidate $ImageDataDir

if (-not $ImageIndexDir) {
    $ImageIndexDir = Join-Path $imageDir "index"
}

$tailscaleInfo = Get-TailscaleInfo
$triageUrl = "https://{0}:{1}" -f $tailscaleInfo.DnsName, $TriageHttpsPort
$chatUrl = "https://{0}:{1}" -f $tailscaleInfo.DnsName, $ChatHttpsPort
$imageUrl = "https://{0}:{1}" -f $tailscaleInfo.DnsName, $ImageHttpsPort

Write-Host "Starting model services on localhost for Tailscale..."

Start-ServiceWindow `
    -Title "Triage API (Tailscale)" `
    -WorkingDirectory $PSScriptRoot `
    -Command "& '$pythonExe' -m uvicorn triage_model_server:app --host 127.0.0.1 --port $TriagePort"

Start-ServiceWindow `
    -Title "Ollama Chat (Tailscale)" `
    -WorkingDirectory $PSScriptRoot `
    -Command "& '$pythonExe' -m uvicorn ollama_service:app --host 127.0.0.1 --port $ChatPort"

Start-ServiceWindow `
    -Title "Image Retrieval (Tailscale)" `
    -WorkingDirectory $imageDir `
    -Command "& '$pythonExe' -m uvicorn imageRetrieval_server:app --host 127.0.0.1 --port $ImagePort" `
    -Environment @{
        IMAGE_DATA_DIR = $ImageDataDir
        IMAGE_INDEX_DIR = $ImageIndexDir
        IMAGE_BASE_URL = $imageUrl
    }

Write-Host "Waiting for local health checks..."
Wait-ForHttp -Url ("http://127.0.0.1:{0}/health" -f $ChatPort)
Wait-ForHttp -Url ("http://127.0.0.1:{0}/health" -f $ImagePort)
Wait-ForHttp -Url ("http://127.0.0.1:{0}/docs" -f $TriagePort)

if (-not $SkipServe) {
    if ($ResetServe) {
        & $script:TailscaleExe serve reset
    }

    & $script:TailscaleExe serve --bg --yes --https=$TriageHttpsPort "http://127.0.0.1:$TriagePort"
    & $script:TailscaleExe serve --bg --yes --https=$ChatHttpsPort "http://127.0.0.1:$ChatPort"
    & $script:TailscaleExe serve --bg --yes --https=$ImageHttpsPort "http://127.0.0.1:$ImagePort"
}

Write-Host ""
Write-Host "Model stack ready."
Write-Host ("  Triage API:      {0}/triage" -f $triageUrl)
Write-Host ("  Chat service:    {0}/chat" -f $chatUrl)
Write-Host ("  Image retrieval: {0}/search-images" -f $imageUrl)
Write-Host ("  Image files:     {0}/images/<filename>" -f $imageUrl)
Write-Host ""
Write-Host "If another machine should use these services, point it at:"
Write-Host ("  MODEL_URL={0}" -f $triageUrl)
Write-Host ("  CHAT_SERVICE_URL={0}" -f $chatUrl)
Write-Host ("  IMAGE_RETRIEVAL_URL={0}" -f $imageUrl)
