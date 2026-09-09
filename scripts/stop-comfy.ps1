$ErrorActionPreference = 'Stop'
$editorRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeFile = Join-Path $editorRoot 'data\comfyui-runtime.json'
if (!(Test-Path -LiteralPath $runtimeFile -PathType Leaf)) { Write-Output 'このランチャーが起動したComfyUIの記録はありません。'; exit 0 }
$record = Get-Content -LiteralPath $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
$trackedId = [int]$record.pid
$trackedProcess = Get-Process -Id $trackedId -ErrorAction SilentlyContinue
if (!$trackedProcess) { Write-Output 'ComfyUI は既に停止しています。'; exit 0 }
$processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $trackedId)
$expectedStart = [DateTime]::Parse($record.startedAt).ToUniversalTime()
$actualStart = $trackedProcess.StartTime.ToUniversalTime()
if ([Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 1 -or !$processInfo.CommandLine.Contains([string]$record.mainScript)) {
    throw '保存されたPIDが別のプロセスを指しているため停止しません。'
}
Stop-Process -Id $trackedId
Write-Output ('ComfyUI を停止しました（PID: ' + $trackedId + '）。')
