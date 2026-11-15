param(
    [ValidateSet('Start', 'Stop', 'Restart', 'Status', 'Logs', 'Test', 'Rebuild')]
    [string]$Action = 'Start',
    [string]$StatusFile,
    [switch]$NoBrowser,
    [switch]$Console
)

# MemeParty local orchestrator.
# Writes machine readable progress into -StatusFile so the GUI can display it.
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

$LogDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
# Keep the run history small: only the newest nine logs survive, plus the current run.
Get-ChildItem -LiteralPath $LogDir -Filter 'memeparty-*.log' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 9 |
    Remove-Item -Force -ErrorAction SilentlyContinue
$LogPath = Join-Path $LogDir ("memeparty-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$ComposeOut = Join-Path $LogDir 'compose-last.log'
$ComposeErr = Join-Path $LogDir 'compose-last.err.log'
$Url = ''

function Write-Log {
    param([string]$Text)
    $Line = "{0:HH:mm:ss}  {1}" -f (Get-Date), $Text
    Add-Content -LiteralPath $LogPath -Value $Line -Encoding UTF8
    if ($Console) { Write-Host $Line }
}

function Set-Progress {
    param(
        [string]$Step,
        [bool]$Done = $false,
        [bool]$Ok = $false,
        [string]$ErrorText = ''
    )
    Write-Log $Step
    if ($StatusFile) {
        $Payload = [ordered]@{
            step  = $Step
            done  = $Done
            ok    = $Ok
            url   = $Url
            error = $ErrorText
            log   = $LogPath
        }
        try {
            $Json = $Payload | ConvertTo-Json -Compress
            [IO.File]::WriteAllText($StatusFile, $Json, (New-Object Text.UTF8Encoding($false)))
        } catch { }
    }
}

function Get-ComposeArguments {
    param([string[]]$Arguments)
    return @('compose', '--project-name', 'memeparty-local', '--env-file', '.env.local', '-f', 'docker-compose.local.yml') + $Arguments
}

function Test-DockerEngine {
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Start-DockerDesktopIfNeeded {
    if (Test-DockerEngine) { return $true }
    Set-Progress 'Docker Desktop ist nicht aktiv, starte es...'
    $Candidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
    )
    $Exe = $Candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $Exe) {
        if (Get-Command 'Docker Desktop.exe' -ErrorAction SilentlyContinue) {
            $Exe = 'Docker Desktop.exe'
        }
    }
    if (-not $Exe) {
        throw 'Docker Desktop ist nicht installiert. Installiere Docker Desktop (https://www.docker.com/products/docker-desktop/) und starte MemeParty erneut.'
    }
    try {
        Start-Process -FilePath $Exe | Out-Null
        Write-Log "Docker Desktop gestartet: $Exe"
    } catch {
        throw "Docker Desktop konnte nicht gestartet werden: $($_.Exception.Message)"
    }

    $Deadline = (Get-Date).AddMinutes(5)
    $Waited = 0
    while ((Get-Date) -lt $Deadline) {
        Start-Sleep -Seconds 3
        $Waited += 3
        Set-Progress ("Warte auf die Docker Engine ({0} s)..." -f $Waited)
        if (Test-DockerEngine) {
            Write-Log 'Docker Engine ist bereit.'
            return $true
        }
    }
    throw 'Die Docker Engine wurde nicht rechtzeitig bereit. Bitte Docker Desktop manuell starten und MemeParty erneut oeffnen. Details: MemeParty-Diagnose.cmd.'
}

function Assert-DockerLinux {
    $OsType = ''
    try { $OsType = (& docker info --format '{{.OSType}}' 2>$null).Trim() } catch { $OsType = '' }
    if ($OsType -and $OsType -ne 'linux') {
        throw 'Docker Desktop laeuft im Windows-Container-Modus. Bitte auf Linux-Container umstellen (Docker Desktop > Einstellungen > General).'
    }
}

function Initialize-LocalConfig {
    if (Test-Path -LiteralPath '.env.local') { return }
    Set-Progress 'Lege lokale Konfiguration an...'
    $Port = 8080
    $ListenerPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort)
    while (($ListenerPorts -contains $Port) -and ($Port -lt 8090)) { $Port++ }
    if ($ListenerPorts -contains $Port) { throw 'Die Ports 8080 bis 8090 sind belegt. Bitte einen freien Port als LOCAL_PORT in .env.local eintragen.' }
    $Bytes = New-Object byte[] 32
    $Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Generator.GetBytes($Bytes) } finally { $Generator.Dispose() }
    $Password = [BitConverter]::ToString($Bytes).Replace('-', '').ToLowerInvariant()
    $EnvironmentText = "LOCAL_PORT=$Port`nLOCAL_DB_PASSWORD=$Password`n"
    [IO.File]::WriteAllText((Join-Path $ProjectRoot '.env.local'), $EnvironmentText, (New-Object Text.UTF8Encoding($false)))
    Write-Log 'Lokale Konfiguration und Datenbankpasswort wurden automatisch angelegt.'
}

function Get-LocalUrl {
    $PortLine = Get-Content -LiteralPath '.env.local' | Where-Object { $_ -match '^LOCAL_PORT=' } | Select-Object -First 1
    if (-not $PortLine) { throw 'LOCAL_PORT fehlt in .env.local.' }
    $PortNumber = 0
    if (-not [int]::TryParse(($PortLine -split '=', 2)[1], [ref]$PortNumber) -or $PortNumber -lt 1024 -or $PortNumber -gt 65535) {
        throw 'LOCAL_PORT muss eine Zahl zwischen 1024 und 65535 sein.'
    }
    return "http://localhost:$PortNumber"
}

function Invoke-ComposeStreaming {
    param([string[]]$Arguments, [string]$StepText)
    $All = Get-ComposeArguments -Arguments $Arguments
    Write-Log ("docker " + ($All -join ' '))
    Remove-Item -LiteralPath $ComposeOut, $ComposeErr -ErrorAction SilentlyContinue
    $Process = Start-Process -FilePath 'docker' -ArgumentList $All -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $ComposeOut -RedirectStandardError $ComposeErr -NoNewWindow -PassThru
    $Start = Get-Date
    while (-not $Process.HasExited) {
        Start-Sleep -Milliseconds 1000
        $Elapsed = [int]((Get-Date) - $Start).TotalSeconds
        Set-Progress ("{0} ({1} s)" -f $StepText, $Elapsed)
        $Process.Refresh()
    }
    # ExitCode is only reliable after WaitForExit on redirected processes.
    $Process.WaitForExit()
    $Process.Refresh()
    $ExitCode = $Process.ExitCode
    if ($null -eq $ExitCode) { $ExitCode = 0 }
    if (Test-Path -LiteralPath $ComposeOut) { Get-Content -LiteralPath $ComposeOut | Add-Content -LiteralPath $LogPath -Encoding UTF8 }
    if (Test-Path -LiteralPath $ComposeErr) { Get-Content -LiteralPath $ComposeErr | Add-Content -LiteralPath $LogPath -Encoding UTF8 }
    return $ExitCode
}

function Wait-Ready {
    param([string]$TargetUrl, [int]$TimeoutSeconds = 180)
    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $Waited = 0
    while ((Get-Date) -lt $Deadline) {
        try {
            $Response = Invoke-WebRequest -Uri "$TargetUrl/ready" -TimeoutSec 5 -UseBasicParsing
            $Body = $Response.Content | ConvertFrom-Json
            if ($Body.ok) { return $true }
        } catch { }
        Start-Sleep -Seconds 2
        $Waited += 2
        Set-Progress ("Warte bis MemeParty antwortet ({0} s)..." -f $Waited)
    }
    return $false
}

function Get-StackState {
    $Raw = & docker $(Get-ComposeArguments -Arguments @('ps', '--format', '{{.Service}}:{{.State}}')) 2>$null
    return @($Raw)
}

function Invoke-Start {
    Start-DockerDesktopIfNeeded | Out-Null
    Assert-DockerLinux
    Initialize-LocalConfig
    $script:Url = Get-LocalUrl
    Set-Progress 'Baue und starte MemeParty (erster Start dauert einige Minuten)...'
    $Code = Invoke-ComposeStreaming -Arguments @('up', '-d', '--build', '--wait', '--wait-timeout', '600') -StepText 'Baue und starte Container'
    if ($Code -ne 0) { throw "Docker Compose ist fehlgeschlagen (Code $Code). Details: $LogPath" }
    Set-Progress 'Pruefe die Bereitschaft...'
    if (-not (Wait-Ready -TargetUrl $script:Url)) { throw "MemeParty antwortet nicht auf $($script:Url)/ready. Details: $LogPath" }
    Set-Progress ("Bereit: {0}" -f $script:Url) -Done $true -Ok $true
    if (-not $NoBrowser) { Start-Process $script:Url }
    return $script:Url
}

function Invoke-Stop {
    Start-DockerDesktopIfNeeded | Out-Null
    Set-Progress 'Stoppe MemeParty...'
    $Code = Invoke-ComposeStreaming -Arguments @('down') -StepText 'Stoppe Container'
    if ($Code -ne 0) { throw "Docker Compose down ist fehlgeschlagen (Code $Code). Details: $LogPath" }
    Set-Progress 'MemeParty gestoppt. Daten bleiben erhalten.' -Done $true -Ok $true
}

function Invoke-Test {
    Start-DockerDesktopIfNeeded | Out-Null
    Assert-DockerLinux
    Initialize-LocalConfig
    $script:Url = Get-LocalUrl
    $Code = Invoke-ComposeStreaming -Arguments @('up', '-d', '--build', '--wait', '--wait-timeout', '600') -StepText 'Baue und starte Container'
    if ($Code -ne 0) { throw "Docker Compose ist fehlgeschlagen (Code $Code). Details: $LogPath" }
    if (-not (Wait-Ready -TargetUrl $script:Url)) { throw "Bereitschaftspruefung fehlgeschlagen. Details: $LogPath" }
    Set-Progress 'Fuehre Smoke-Test aus (HTTP, Cookies, WebSockets, Redis, PostgreSQL)...'
    $Code = Invoke-ComposeStreaming -Arguments @('exec', '-T', 'backend', 'node', '--import', 'tsx', 'scripts/smoke-test.ts') -StepText 'Smoke-Test laeuft'
    if ($Code -ne 0) { throw "Der Smoke-Test ist fehlgeschlagen (Code $Code). Details: $LogPath" }
    Set-Progress 'Alle Pruefungen erfolgreich.' -Done $true -Ok $true
}

function Invoke-Rebuild {
    Start-DockerDesktopIfNeeded | Out-Null
    Assert-DockerLinux
    Initialize-LocalConfig
    $script:Url = Get-LocalUrl
    $Code = Invoke-ComposeStreaming -Arguments @('build', '--no-cache') -StepText 'Baue Images ohne Cache neu'
    if ($Code -ne 0) { throw "Der Neubau ist fehlgeschlagen (Code $Code). Details: $LogPath" }
    $Code = Invoke-ComposeStreaming -Arguments @('up', '-d', '--wait', '--wait-timeout', '600') -StepText 'Starte Container'
    if ($Code -ne 0) { throw "Docker Compose ist fehlgeschlagen (Code $Code). Details: $LogPath" }
    if (-not (Wait-Ready -TargetUrl $script:Url)) { throw "MemeParty antwortet nicht. Details: $LogPath" }
    Set-Progress 'Neu gebaut und gestartet.' -Done $true -Ok $true
    if (-not $NoBrowser) { Start-Process $script:Url }
}

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop ist nicht installiert. Lade es von https://www.docker.com/products/docker-desktop/ herunter, installiere es und starte MemeParty erneut.'
    }
    switch ($Action) {
        'Start' {
            $Existing = Get-StackState
            if (($Existing -join ',') -match 'backend:running') {
                $script:Url = Get-LocalUrl
                if (Wait-Ready -TargetUrl $script:Url -TimeoutSeconds 10) {
                    Set-Progress ("MemeParty laeuft bereits: {0}" -f $script:Url) -Done $true -Ok $true
                    if (-not $NoBrowser) { Start-Process $script:Url }
                    exit 0
                }
            }
            Invoke-Start | Out-Null
        }
        'Stop' { Invoke-Stop }
        'Restart' { Invoke-Stop; Invoke-Start | Out-Null }
        'Rebuild' { Invoke-Rebuild }
        'Test' { Invoke-Test }
        'Status' {
            $script:Url = Get-LocalUrl
            Set-Progress 'Lese Status...'
            $State = Get-StackState
            Write-Log ("Status: " + ($State -join ' | '))
            Set-Progress ("MemeParty laeuft auf {0}" -f $script:Url) -Done $true -Ok $true
        }
        'Logs' {
            $All = Get-ComposeArguments -Arguments @('logs', '--tail', '200', 'frontend', 'backend', 'postgres', 'redis')
            & docker @All
        }
    }
    exit 0
} catch {
    $Message = $_.Exception.Message
    Write-Log ("FEHLER: " + $Message)
    Set-Progress $Message -Done $true -Ok $false -ErrorText $Message
    exit 1
}
