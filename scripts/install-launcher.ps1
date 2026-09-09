$ErrorActionPreference = 'Stop'
$launchPath = Join-Path $PSScriptRoot 'launch.vbs'
if (-not (Test-Path -LiteralPath $launchPath)) { throw 'Launcher is missing.' }
$wscript = Join-Path $env:WINDIR 'System32/wscript.exe'
$command = '"' + $wscript + '" "' + $launchPath + '"'
$key = 'HKCU:\Software\Classes\cutton'
$existing = (Get-ItemProperty -LiteralPath "$key\shell\open\command" -ErrorAction SilentlyContinue).'(default)'
if ($existing -and $existing -ne $command) { throw 'The cutton protocol is already registered to another application. No changes were made.' }
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Cutton.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
if ((Test-Path -LiteralPath $shortcutPath) -and ($shortcut.TargetPath -ne $wscript -or $shortcut.Arguments -ne ('"' + $launchPath + '"'))) { throw 'An unrelated Cutton shortcut exists; it was left unchanged.' }
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-Item -LiteralPath $key -Value 'URL:Cutton Launcher'
New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
# Deliberately no %1: URLs cannot provide paths, commands, or project changes.
Set-Item -LiteralPath "$key\shell\open\command" -Value $command
$shortcut.TargetPath = $wscript
$shortcut.Arguments = '"' + $launchPath + '"'
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.Description = 'Cutton'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output 'Cutton launcher and per-user URL protocol are ready.'
