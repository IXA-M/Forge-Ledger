$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$iconPath = Join-Path $PSScriptRoot 'forge-ledger.ico'
$powerShellPath = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'

if (-not ('ForgeLedgerNativeMethods' -as [type])) {
  Add-Type @'
using System.Runtime.InteropServices;
public static class ForgeLedgerNativeMethods {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(System.IntPtr handle);
}
'@
}

if (-not (Test-Path -LiteralPath $desktop)) {
  throw "The Windows Desktop folder was not found: $desktop"
}

if (-not (Test-Path -LiteralPath $iconPath)) {
  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new(64, 64)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $gold = [System.Drawing.ColorTranslator]::FromHtml('#c8a454')
  $dark = [System.Drawing.ColorTranslator]::FromHtml('#171811')
  $background = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $background.AddArc(2, 2, 20, 20, 180, 90)
  $background.AddArc(42, 2, 20, 20, 270, 90)
  $background.AddArc(42, 42, 20, 20, 0, 90)
  $background.AddArc(2, 42, 20, 20, 90, 90)
  $background.CloseFigure()
  $graphics.FillPath([System.Drawing.SolidBrush]::new($gold), $background)

  $shield = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(32, 8), [System.Drawing.Point]::new(50, 14),
    [System.Drawing.Point]::new(49, 31), [System.Drawing.Point]::new(44, 42),
    [System.Drawing.Point]::new(32, 54), [System.Drawing.Point]::new(20, 42),
    [System.Drawing.Point]::new(15, 31), [System.Drawing.Point]::new(14, 14)
  )
  $graphics.FillPolygon([System.Drawing.SolidBrush]::new($dark), $shield)
  $font = [System.Drawing.Font]::new('Segoe UI', 29, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.SolidBrush]::new($gold)
  $graphics.DrawString('F', $font, $brush, 21, 12)

  $iconHandle = $bitmap.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
  $iconStream = [System.IO.File]::Create($iconPath)
  $icon.Save($iconStream)
  $iconStream.Dispose()
  $icon.Dispose()
  $bitmap.Dispose()
  $graphics.Dispose()
  $background.Dispose()
  $font.Dispose()
  $brush.Dispose()
  [ForgeLedgerNativeMethods]::DestroyIcon($iconHandle) | Out-Null
}

$shell = New-Object -ComObject WScript.Shell
$shortcuts = @(
  @{ Name = 'Albion Forge Ledger'; Script = 'Start-ForgeLedger.ps1' },
  @{ Name = 'Stop Albion Forge Ledger'; Script = 'Stop-ForgeLedger.ps1' }
)

foreach ($entry in $shortcuts) {
  $shortcutPath = Join-Path $desktop "$($entry.Name).lnk"
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $scriptPath = Join-Path $PSScriptRoot $entry.Script
  $shortcut.TargetPath = $powerShellPath
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.IconLocation = "$iconPath,0"
  $shortcut.WindowStyle = 7
  $shortcut.Description = if ($entry.Script -eq 'Start-ForgeLedger.ps1') { 'Start Albion Forge Ledger in your browser' } else { 'Stop the local Albion Forge Ledger server' }
  $shortcut.Save()
}

Write-Host "Desktop shortcuts created in $desktop."
