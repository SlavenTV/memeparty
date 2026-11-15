@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-windows.ps1" -Action Status
set "MP_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %MP_EXIT%
