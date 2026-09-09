param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$portText = if ($env:CUTTON_PORT) { $env:CUTTON_PORT } elseif ($env:YACHICUT_PORT) { $env:YACHICUT_PORT } else { '4318' }
$port = 0
if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw 'Cuttonのポート番号が不正です。' }
$url = "http://127.0.0.1:$port"
function Test-CuttonReady {
    try { $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 1; return $health.app -eq 'Cutton' -and $health.ok -eq $true } catch { return $false }
}
$mutex = [System.Threading.Mutex]::new($false, "Local\CuttonLauncher-$port")
$locked = $false
try {
    try { $locked = $mutex.WaitOne(45000) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Cuttonは起動の準備中です。少し待ってからもう一度開いてください。' }
    if (-not (Test-CuttonReady)) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) { throw '編集画面のファイルが見つかりません。Cuttonのセットアップを確認してください。' }
        $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($listener) { throw "別のアプリが接続先 $port を使用しています。そのアプリを終了してからCuttonを開いてください。" }
        $outputDir = Join-Path $projectRoot 'output'
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        $nodePath = if ($node) { $node.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
        if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Cuttonの実行環境が見つかりません。セットアップを確認してください。' }
        $serverPath = Join-Path $projectRoot 'server/index.mjs'
        $engine = Start-Process -FilePath $nodePath -ArgumentList @('"' + $serverPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $outputDir 'server.log') -RedirectStandardError (Join-Path $outputDir 'server-error.log') -PassThru
        $ready = $false
        $deadline = [DateTime]::UtcNow.AddSeconds(35)
        while ([DateTime]::UtcNow -lt $deadline) {
            if (Test-CuttonReady) { $ready = $true; break }
            $engine.Refresh()
            if ($engine.HasExited) { break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw 'Cuttonを起動できませんでした。アプリの output/server-error.log に原因を記録しています。' }
    }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
if (-not $NoBrowser) { Start-Process "$url/?launch=projects" }
Write-Output "Cutton ready: $url/?launch=projects"
