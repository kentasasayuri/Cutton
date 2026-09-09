$ErrorActionPreference = 'Stop'
try { & (Join-Path $PSScriptRoot 'start.ps1') }
catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'Cutton', 'OK', 'Information') | Out-Null
    exit 1
}
