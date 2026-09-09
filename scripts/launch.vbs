Option Explicit
Dim shell, files, scriptPath, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
scriptPath = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "launch.ps1")
' The URL protocol never passes arguments to PowerShell or to the editor.
command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptPath & """"
shell.Run command, 0, False
