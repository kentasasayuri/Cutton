param(
    [string]$ComfyDir = (Join-Path $env:USERPROFILE 'Apps\ComfyUI'),
    [ValidateRange(1024, 65535)][int]$Port = 8188
)
$ErrorActionPreference = 'Stop'
$comfyInstallDir = (Resolve-Path -LiteralPath $ComfyDir).Path
$editorRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeDir = Join-Path $editorRoot 'data'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$runtimeFile = Join-Path $runtimeDir 'comfyui-runtime.json'
$pythonExe = Join-Path $comfyInstallDir '.venv\Scripts\python.exe'
$mainScript = Join-Path $comfyInstallDir 'main.py'
if (!(Test-Path -LiteralPath $pythonExe -PathType Leaf) -or !(Test-Path -LiteralPath $mainScript -PathType Leaf)) {
    throw 'ComfyUI と専用 .venv が見つかりません。'
}
$baseUrl = 'http://127.0.0.1:' + $Port
try {
    $health = Invoke-RestMethod -Uri ($baseUrl + '/system_stats') -TimeoutSec 2
    if ($health.system.comfyui_version) {
        Write-Output ('ComfyUI は起動済みです: ' + $baseUrl)
        exit 0
    }
} catch { }
$stdoutLog = Join-Path $runtimeDir 'comfyui.stdout.log'
$stderrLog = Join-Path $runtimeDir 'comfyui.stderr.log'
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
$env:OPENBLAS_NUM_THREADS = '2'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:DO_NOT_TRACK = '1'
$arguments = @('-u', ('"' + $mainScript + '"'), '--cpu', '--listen', '127.0.0.1', '--port', [string]$Port, '--cache-none', '--preview-method', 'none', '--disable-auto-launch', '--disable-api-nodes')
$comfyProcess = Start-Process -FilePath $pythonExe -ArgumentList $arguments -WorkingDirectory $comfyInstallDir -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
try { $comfyProcess.PriorityClass = 'BelowNormal' } catch { }
$ready = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    Start-Sleep -Seconds 2
    try {
        $health = Invoke-RestMethod -Uri ($baseUrl + '/system_stats') -TimeoutSec 2
        if ($health.system.comfyui_version) { $ready = $true; break }
    } catch { }
    $comfyProcess.Refresh()
    if ($comfyProcess.HasExited) { break }
}
if (!$ready) {
    if (!$comfyProcess.HasExited) { Stop-Process -Id $comfyProcess.Id -ErrorAction SilentlyContinue }
    throw ('ComfyUI の起動を確認できません。ログ: ' + $stderrLog)
}
$owner = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$serverProcess = if ($owner) { Get-Process -Id $owner.OwningProcess } else { $comfyProcess }
try { $serverProcess.PriorityClass = 'BelowNormal' } catch { }
$record = [ordered]@{
    pid = $serverProcess.Id
    launcherPid = $comfyProcess.Id
    startedAt = $serverProcess.StartTime.ToUniversalTime().ToString('o')
    mainScript = $mainScript
    comfyDir = $comfyInstallDir
    url = $baseUrl
    mode = 'cpu'
    threads = 2
    stdoutLog = $stdoutLog
    stderrLog = $stderrLog
}
$record | ConvertTo-Json | Set-Content -LiteralPath $runtimeFile -Encoding UTF8
Write-Output ('ComfyUI をCPUモードで起動しました: ' + $baseUrl)
Write-Output ('PID: ' + $serverProcess.Id + ' / 同時CPUスレッド: 2 / ノード結果キャッシュ: 無効')
