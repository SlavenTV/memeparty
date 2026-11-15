@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title MemeParty - Diagnose und Steuerung

:menu
cls
echo ==========================================================
echo   MemeParty - Diagnose
echo ==========================================================
echo.
echo   [1] Starten
echo   [2] Beenden (Daten bleiben erhalten)
echo   [3] Status anzeigen
echo   [4] Logs anzeigen
echo   [5] Selbsttest (HTTP, WebSockets, Redis, PostgreSQL)
echo   [6] Alles neu bauen
echo   [7] Fenster schliessen
echo.
set "CHOICE="
set /p "CHOICE=Auswahl [1]: "
if not defined CHOICE set "CHOICE=1"

set "ACTION="
if "%CHOICE%"=="1" set "ACTION=Start"
if "%CHOICE%"=="2" set "ACTION=Stop"
if "%CHOICE%"=="3" set "ACTION=Status"
if "%CHOICE%"=="4" set "ACTION=Logs"
if "%CHOICE%"=="5" set "ACTION=Test"
if "%CHOICE%"=="6" set "ACTION=Rebuild"
if "%CHOICE%"=="7" exit /b 0

if not defined ACTION (
    echo.
    echo Ungueltige Auswahl.
    timeout /t 2 >nul
    goto menu
)

echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\memeparty.ps1" -Action %ACTION% -Console
echo.
echo Fertig. Details stehen in logs\memeparty-*.log
pause
goto menu
