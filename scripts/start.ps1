param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$port = if ($env:CUTTON_PORT) { $env:CUTTON_PORT } elseif ($env:YACHICUT_PORT) { $env:YACHICUT_PORT } else { '4318' }
$url = "http://127.0.0.1:$port"
$healthy = $false
try { $state = Invoke-RestMethod "$url/api/state" -TimeoutSec 2; $healthy = $null -ne $state.storyboard } catch {}
if (-not $healthy) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) {
        throw 'ビルドがありません。アプリのフォルダで npm install と npm run build を実行してください。'
    }
    $outputDir = Join-Path $projectRoot 'output'
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $serverPath = Join-Path $projectRoot 'server/index.mjs'
    Start-Process -FilePath $nodePath -ArgumentList @('"' + $serverPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $outputDir 'server.log') -RedirectStandardError (Join-Path $outputDir 'server-error.log') | Out-Null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $state = Invoke-RestMethod "$url/api/state" -TimeoutSec 1; $healthy = $null -ne $state.storyboard; if ($healthy) { break } } catch {}
        Start-Sleep -Milliseconds 300
    }
    if (-not $healthy) { throw '起動できませんでした。output/server-error.log を確認してください。' }
}
if (-not $NoBrowser) { Start-Process $url }
