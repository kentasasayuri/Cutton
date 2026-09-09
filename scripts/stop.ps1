param([int]$Port = 4318)
$ErrorActionPreference = 'Stop'
try { $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 } catch { Write-Output 'Cutton is not running.'; exit 0 }
if ($health.app -ne 'Cutton') { throw 'This port does not belong to Cutton.' }
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if ($serverProcess.Name -ne 'node.exe' -or $serverProcess.CommandLine -notmatch 'server[/\\]index\.mjs') { throw 'The server process does not match Cutton.' }
Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
Write-Output 'Cutton stopped.'
