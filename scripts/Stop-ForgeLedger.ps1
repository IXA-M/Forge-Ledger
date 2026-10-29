$ErrorActionPreference = 'Stop'

$manifestPath = Join-Path (Join-Path $env:LOCALAPPDATA 'AlbionForgeLedger') 'server.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  for ($candidatePort = 5173; $candidatePort -le 5200; $candidatePort++) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$candidatePort/" -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200 -and $response.Content.Contains('<title>Albion Forge Ledger</title>')) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show("Forge Ledger is running at http://127.0.0.1:$candidatePort but was started outside the desktop shortcut. It has been left running.", 'Albion Forge Ledger', 'OK', 'Information') | Out-Null
        exit 0
      }
    } catch {
      continue
    }
  }

  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('Forge Ledger is not running.', 'Albion Forge Ledger', 'OK', 'Information') | Out-Null
  exit 0
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($manifest.ProcessId)" -ErrorAction SilentlyContinue
$expectedEntry = Join-Path $manifest.ProjectRoot 'node_modules/vite/bin/vite.js'
$expectedPort = "--port $($manifest.Port)"

if (-not $process -or $process.Name -ne 'node.exe' -or $process.CommandLine -notlike "*$expectedEntry*" -or $process.CommandLine -notlike "*$expectedPort*") {
  Remove-Item -LiteralPath $manifestPath -Force
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('The saved server process is no longer running. No other process was stopped.', 'Albion Forge Ledger', 'OK', 'Information') | Out-Null
  exit 0
}

Stop-Process -Id $manifest.ProcessId -Force
Remove-Item -LiteralPath $manifestPath -Force
