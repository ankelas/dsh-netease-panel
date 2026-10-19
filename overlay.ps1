$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class OverlayWin {
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$stateFile = Join-Path $env:TEMP 'dsh-netease-overlay.json'
$script:lineText = ''
$script:transText = ''

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.Bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = [System.Drawing.Color]::Fuchsia
$form.TransparencyKey = [System.Drawing.Color]::Fuchsia

$picture = New-Object System.Windows.Forms.PictureBox
$picture.Dock = 'Bottom'
$picture.Height = 320
$picture.BackColor = [System.Drawing.Color]::Fuchsia
$form.Controls.Add($picture)

$fontMain = New-Object System.Drawing.Font('Microsoft YaHei', 26, ([System.Drawing.FontStyle]::Bold -bor [System.Drawing.FontStyle]::Italic))
$fontTr = New-Object System.Drawing.Font('Microsoft YaHei', 14)
$goldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(216, 165, 35))
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 239))
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0, 0, 0))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

function Render-Overlay {
  $w = $picture.Width
  $h = $picture.Height
  if ($w -le 0 -or $h -le 0) { return }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Fuchsia)
  $rectMain = New-Object System.Drawing.RectangleF(0, 40, $w, 120)
  $rectTr = New-Object System.Drawing.RectangleF(0, 175, $w, 60)
  if ($script:lineText) {
    $g.DrawString($script:lineText, $fontMain, $shadowBrush, ($rectMain.X + 3), ($rectMain.Y + 3), $fmt)
    $g.DrawString($script:lineText, $fontMain, $goldBrush, ($rectMain.X + 1), ($rectMain.Y + 1), $fmt)
    $g.DrawString($script:lineText, $fontMain, $whiteBrush, $rectMain, $fmt)
  }
  if ($script:transText) {
    $g.DrawString($script:transText, $fontTr, $shadowBrush, ($rectTr.X + 2), ($rectTr.Y + 2), $fmt)
    $g.DrawString($script:transText, $fontTr, $whiteBrush, $rectTr, $fmt)
  }
  $g.Dispose()
  $old = $picture.Image
  $picture.Image = $bmp
  if ($old) { $old.Dispose() }
}

$form.Add_Load({
  $hwnd = $form.Handle
  $ex = [OverlayWin]::GetWindowLong($hwnd, -20)
  [OverlayWin]::SetWindowLong($hwnd, -20, $ex -bor 0x20 -bor 0x80 -bor 0x08000000) | Out-Null
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 120
$timer.Add_Tick({
  try {
    if (-not (Test-Path $stateFile)) { return }
    $raw = [System.IO.File]::ReadAllText($stateFile)
    if ([string]::IsNullOrWhiteSpace($raw)) { return }
    $state = $raw | ConvertFrom-Json
    $nextLine = [string]$state.text
    $nextTr = [string]$state.tr
    if ($nextLine -ne $script:lineText -or $nextTr -ne $script:transText) {
      $script:lineText = $nextLine
      $script:transText = $nextTr
      Render-Overlay
    }
  } catch { }
})
$timer.Start()

$form.Show() | Out-Null
[OverlayWin]::ShowWindow($form.Handle, 4) | Out-Null
[System.Windows.Forms.Application]::Run() | Out-Null
