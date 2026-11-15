param(
    [ValidateSet('Start', 'Stop', 'Restart', 'Test', 'Rebuild')]
    [string]$Action = 'Start'
)

# Small progress window for the one click launcher. It never shows a console.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StatusFile = Join-Path $env:TEMP ("memeparty-status-{0}.json" -f ([guid]::NewGuid().ToString('N')))
$Orchestrator = Join-Path $ProjectRoot 'scripts\memeparty.ps1'

$Titles = @{
    Start   = 'MemeParty wird gestartet'
    Stop    = 'MemeParty wird beendet'
    Restart = 'MemeParty wird neu gestartet'
    Test    = 'MemeParty wird geprueft'
    Rebuild = 'MemeParty wird neu gebaut'
}

$Form = New-Object System.Windows.Forms.Form
$Form.Text = 'MemeParty'
$Form.Size = New-Object System.Drawing.Size(480, 190)
$Form.StartPosition = 'CenterScreen'
$Form.FormBorderStyle = 'FixedDialog'
$Form.MaximizeBox = $false
$Form.MinimizeBox = $true
$Form.BackColor = [System.Drawing.Color]::FromArgb(17, 18, 24)
$Form.ForeColor = [System.Drawing.Color]::White
$Form.TopMost = $true
$Form.Icon = [System.Drawing.SystemIcons]::Application

$Header = New-Object System.Windows.Forms.Label
$Header.Text = $Titles[$Action]
$Header.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 13)
$Header.ForeColor = [System.Drawing.Color]::FromArgb(0, 224, 255)
$Header.AutoSize = $true
$Header.Location = New-Object System.Drawing.Point(18, 16)
$Form.Controls.Add($Header)

$StatusLabel = New-Object System.Windows.Forms.Label
$StatusLabel.Text = 'Vorbereitung...'
$StatusLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(215, 218, 228)
$StatusLabel.AutoEllipsis = $true
$StatusLabel.Size = New-Object System.Drawing.Size(436, 44)
$StatusLabel.Location = New-Object System.Drawing.Point(20, 52)
$Form.Controls.Add($StatusLabel)

$Bar = New-Object System.Windows.Forms.ProgressBar
$Bar.Style = 'Marquee'
$Bar.MarqueeAnimationSpeed = 28
$Bar.Size = New-Object System.Drawing.Size(436, 12)
$Bar.Location = New-Object System.Drawing.Point(20, 100)
$Form.Controls.Add($Bar)

$DetailsButton = New-Object System.Windows.Forms.Button
$DetailsButton.Text = 'Log oeffnen'
$DetailsButton.Size = New-Object System.Drawing.Size(110, 28)
$DetailsButton.Location = New-Object System.Drawing.Point(20, 122)
$DetailsButton.Visible = $false
$Form.Controls.Add($DetailsButton)

$CloseButton = New-Object System.Windows.Forms.Button
$CloseButton.Text = 'Schliessen'
$CloseButton.Size = New-Object System.Drawing.Size(110, 28)
$CloseButton.Location = New-Object System.Drawing.Point(346, 122)
$CloseButton.Visible = $false
$Form.Controls.Add($CloseButton)

$script:LogPath = ''

$DetailsButton.Add_Click({
    if ($script:LogPath -and (Test-Path -LiteralPath $script:LogPath)) {
        Start-Process -FilePath 'notepad.exe' -ArgumentList ('"{0}"' -f $script:LogPath)
    }
})
$CloseButton.Add_Click({ $Form.Close() })

Remove-Item -LiteralPath $StatusFile -ErrorAction SilentlyContinue

$Worker = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $Orchestrator),
    '-Action', $Action,
    '-StatusFile', ('"{0}"' -f $StatusFile)
) -WindowStyle Hidden -PassThru

$script:Finished = $false
$script:CloseAt = $null

$Timer = New-Object System.Windows.Forms.Timer
$Timer.Interval = 400
$Timer.Add_Tick({
    if ($script:Finished) {
        if ($script:CloseAt -and (Get-Date) -gt $script:CloseAt) { $Form.Close() }
        return
    }
    if (Test-Path -LiteralPath $StatusFile) {
        try {
            $Raw = [IO.File]::ReadAllText($StatusFile)
            if ($Raw) {
                $State = $Raw | ConvertFrom-Json
                if ($State.step) { $StatusLabel.Text = [string]$State.step }
                if ($State.log) { $script:LogPath = [string]$State.log }
                if ($State.done) {
                    $script:Finished = $true
                    $Bar.Style = 'Blocks'
                    $Bar.MarqueeAnimationSpeed = 0
                    $Bar.Value = 100
                    if ($State.ok) {
                        $StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(120, 235, 150)
                        if ($Action -ne 'Stop') {
                            $StatusLabel.Text = "Fertig. MemeParty laeuft unter $($State.url). Der Browser wurde geoeffnet."
                        } else {
                            $StatusLabel.Text = 'Fertig. MemeParty wurde beendet.'
                        }
                        $CloseButton.Visible = $true
                        $CloseButton.Text = 'OK'
                        $script:CloseAt = (Get-Date).AddSeconds(5)
                    } else {
                        $Bar.Value = 0
                        $StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 140, 140)
                        $StatusLabel.Text = [string]$State.error
                        $DetailsButton.Visible = (Test-Path -LiteralPath $script:LogPath)
                        $CloseButton.Visible = $true
                    }
                }
            }
        } catch { }
    } elseif ($Worker.HasExited) {
        $script:Finished = $true
        $Bar.Style = 'Blocks'
        $Bar.Value = 0
        $StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 140, 140)
        $StatusLabel.Text = 'Der Start ist unerwartet abgebrochen. Bitte MemeParty-Diagnose.cmd ausfuehren.'
        $CloseButton.Visible = $true
    }
    if ($script:Finished -and $script:CloseAt -and (Get-Date) -gt $script:CloseAt) { $Form.Close() }
})
$Timer.Start()

$Form.Add_FormClosed({
    $Timer.Stop()
    if (-not $script:Finished) {
        # The user closed the window while work was running: keep Docker working in background.
    }
})

[void]$Form.ShowDialog()
Remove-Item -LiteralPath $StatusFile -ErrorAction SilentlyContinue
