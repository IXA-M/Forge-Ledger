$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$viteEntry = Join-Path $projectRoot 'node_modules/vite/bin/vite.js'
$localData = Join-Path $env:LOCALAPPDATA 'AlbionForgeLedger'
$manifestPath = Join-Path $localData 'server.json'
$logPath = Join-Path $localData 'server.log'
$errorLogPath = Join-Path $localData 'server-error.log'

function Show-LauncherMessage([string]$message, [string]$title = 'Albion Forge Ledger') {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, $title, 'OK', 'Information') | Out-Null
}

function Get-RunningPlannerUrl {
  foreach ($candidatePort in 5173..5200) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$candidatePort/" -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200 -and $response.Content.Contains('<title>Albion Forge Ledger</title>')) {
        return "http://127.0.0.1:$candidatePort/"
      }
    } catch {
      continue
    }
  }

  return $null
}

try {
  $runningUrl = Get-RunningPlannerUrl
  if ($runningUrl) {
    Start-Process $runningUrl
    exit 0
  }

  if (-not (Test-Path -LiteralPath $viteEntry)) {
    $npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npmCommand) {
      Show-LauncherMessage 'Node.js and npm are required. Install Node.js 20 or newer, then click this shortcut again.' 'Setup required'
      exit 1
    }

    New-Item -ItemType Directory -Force -Path $localData | Out-Null
    Show-LauncherMessage 'First start: installing the app dependencies. This can take a minute.' 'Setting up Forge Ledger'
    $install = Start-Process -FilePath $npmCommand -ArgumentList 'install' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath
    if ($install.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $viteEntry)) {
      Show-LauncherMessage "Dependency installation failed. See the log at:`n$logPath`n$errorLogPath" 'Could not start Forge Ledger'
      exit 1
    }
  }

  $port = $null
  foreach ($candidatePort in 5173..5200) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
    try {
      $listener.Start()
      $listener.Stop()
      $port = $candidatePort
      break
    } catch {
      $listener.Stop()
    }
  }

  if (-not $port) {
    Show-LauncherMessage 'No free local app port was found between 5173 and 5200. Close an unused local development server and try again.' 'Could not start Forge Ledger'
    exit 1
  }

  New-Item -ItemType Directory -Force -Path $localData | Out-Null
  Remove-Item -LiteralPath $logPath, $errorLogPath -Force -ErrorAction SilentlyContinue
  $nodeCommand = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $nodeCommand) {
    Show-LauncherMessage 'Node.js was not found. Install Node.js 20 or newer, then click this shortcut again.' 'Setup required'
    exit 1
  }

  $arguments = @("`"$viteEntry`"", '--host', '127.0.0.1', '--port', "$port", '--strictPort')
  $server = Start-Process -FilePath $nodeCommand -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath
  $url = "http://127.0.0.1:$port/"
  $ready = $false

  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($server.HasExited) { break }
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200 -and $response.Content.Contains('<title>Albion Forge Ledger</title>')) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 300
    }
  }

  if (-not $ready) {
    $details = if (Test-Path -LiteralPath $errorLogPath) { Get-Content -LiteralPath $errorLogPath -Raw } else { 'No server error details were written.' }
    Show-LauncherMessage "The app did not become ready. See:`n$errorLogPath`n`n$details" 'Could not start Forge Ledger'
    exit 1
  }

  [pscustomobject]@{
    ProcessId = $server.Id
    Port = $port
    ProjectRoot = $projectRoot
    StartedAt = $server.StartTime.ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  Start-Process $url
} catch {
  Show-LauncherMessage "Could not start Forge Ledger:`n$($_.Exception.Message)" 'Could not start Forge Ledger'
  exit 1
}
