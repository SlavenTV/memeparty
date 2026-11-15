param([ValidateSet('Start','Stop','Status','Logs','Test')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

function Invoke-Compose {
    param([string[]]$ComposeArguments)
    & docker compose --project-name memeparty-local --env-file .env.local -f docker-compose.local.yml @ComposeArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose ist fehlgeschlagen (Code $LASTEXITCODE)." }
}

try {
    Write-Host "MemeParty - Lokaler Test" -ForegroundColor Cyan
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop fehlt. Installiere Docker Desktop, starte es im Modus Linux-Container und fuehre diese Datei erneut aus. Anleitung: LOKAL_STARTEN.md'
    }
    & docker info --format '{{.OSType}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop ist nicht bereit. Starte Docker Desktop und warte, bis die Engine laeuft.' }
    $OsType = (& docker info --format '{{.OSType}}').Trim()
    if ($OsType -ne 'linux') { throw 'Bitte Docker Desktop auf Linux-Container umstellen.' }
    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 fehlt. Aktualisiere Docker Desktop.' }

    if (-not (Test-Path -LiteralPath '.env.local')) {
        if ($Action -ne 'Start') { throw 'MemeParty wurde noch nicht eingerichtet. Starte zuerst Start-MemeParty.cmd.' }
        $Port = 8080
        $ListenerPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort)
        while (($ListenerPorts -contains $Port) -and ($Port -lt 8090)) { $Port++ }
        if ($ListenerPorts -contains $Port) { throw 'Die Ports 8080 bis 8090 sind belegt. Gib einen freien LOCAL_PORT in .env.local an.' }
        $Bytes = New-Object byte[] 32
        $Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $Generator.GetBytes($Bytes) } finally { $Generator.Dispose() }
        $Password = [BitConverter]::ToString($Bytes).Replace('-','').ToLowerInvariant()
        $EnvironmentText = "LOCAL_PORT=$Port`nLOCAL_DB_PASSWORD=$Password`n"
        [IO.File]::WriteAllText((Join-Path $ProjectRoot '.env.local'), $EnvironmentText, (New-Object Text.UTF8Encoding($false)))
        Write-Host 'Lokale Konfiguration und Datenbankpasswort wurden automatisch angelegt.'
    }
    $PortLine = Get-Content -LiteralPath '.env.local' | Where-Object { $_ -match '^LOCAL_PORT=' } | Select-Object -First 1
    if (-not $PortLine) { throw 'LOCAL_PORT fehlt in .env.local.' }
    $PortNumber = 0
    if (-not [int]::TryParse(($PortLine -split '=',2)[1], [ref]$PortNumber) -or $PortNumber -lt 1024 -or $PortNumber -gt 65535) { throw 'LOCAL_PORT muss eine Zahl zwischen 1024 und 65535 sein.' }
    $Url = "http://localhost:$PortNumber"

    switch ($Action) {
        'Start' {
            Write-Host 'Die erste Einrichtung kann einige Minuten dauern. Node.js und Datenbanken werden in Docker eingerichtet.'
            Invoke-Compose -ComposeArguments @('up','-d','--build','--wait','--wait-timeout','240')
            $Ready = Invoke-RestMethod -Uri "$Url/ready" -TimeoutSec 15
            if (-not $Ready.ok) { throw 'Die Anwendung ist noch nicht bereit. Fuehre Logs-MemeParty.cmd aus.' }
            Write-Host "Bereit: $Url" -ForegroundColor Green
            Write-Host 'Zweiter Spieler: dieselbe Adresse in einem Inkognito-Fenster oder anderen Browser oeffnen.'
            Write-Host 'Lobby erstellen, Code teilen, beide auf Bereit setzen und Spiel starten.'
            Start-Process $Url
        }
        'Stop' {
            Invoke-Compose -ComposeArguments @('down')
            Write-Host 'MemeParty gestoppt. Gespeicherte Daten bleiben erhalten.' -ForegroundColor Green
        }
        'Status' {
            Invoke-Compose -ComposeArguments @('ps')
            Write-Host "Adresse: $Url"
        }
        'Logs' { Invoke-Compose -ComposeArguments @('logs','--tail','150','frontend','backend','postgres','redis') }
        'Test' {
            Invoke-Compose -ComposeArguments @('up','-d','--build','--wait','--wait-timeout','240')
            $Ready = Invoke-RestMethod -Uri "$Url/ready" -TimeoutSec 15
            if (-not $Ready.ok) { throw 'Die Bereitschaftspruefung ist fehlgeschlagen.' }
            Invoke-Compose -ComposeArguments @('exec','-T','backend','node','--import','tsx','scripts/smoke-test.ts')
            Write-Host 'HTTP, Cookies, WebSockets, Redis und PostgreSQL erfolgreich geprueft.' -ForegroundColor Green
        }
    }
    exit 0
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host 'Details: Logs-MemeParty.cmd. Hilfe: LOKAL_STARTEN.md'
    exit 1
}
