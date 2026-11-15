' MemeParty beenden - Container stoppen, Daten bleiben erhalten.
Option Explicit

Dim fso, shell, root, command
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ _
    & root & "\scripts\memeparty-gui.ps1"" -Action Stop"

shell.Run command, 0, False
