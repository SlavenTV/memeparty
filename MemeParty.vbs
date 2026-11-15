' MemeParty - Ein-Klick-Start ohne Konsolenfenster.
' Startet das Fortschrittsfenster, das Docker bei Bedarf selbst hochfaehrt.
Option Explicit

Dim fso, shell, root, action, command
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
action = "Start"
If WScript.Arguments.Count > 0 Then action = WScript.Arguments(0)

command = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ _
    & root & "\scripts\memeparty-gui.ps1"" -Action " & action

shell.Run command, 0, False
