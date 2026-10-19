$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class OverlayWin {
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
}
"@

$stateFile = Join-Path $env:TEMP 'dsh-netease-overlay.json'

$window = New-Object System.Windows.Window
$window.WindowStyle = 'None'
$window.AllowsTransparency = $true
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.Topmost = $true
$window.ShowInTaskbar = $false
$window.ShowActivated = $false
$window.WindowState = 'Normal'
$window.Left = 0
$window.Top = 0
$window.Width = [System.Windows.SystemParameters]::PrimaryScreenWidth
$window.Height = [System.Windows.SystemParameters]::PrimaryScreenHeight

$canvas = New-Object System.Windows.Controls.Canvas
$canvas.ClipToBounds = $true
$window.Content = $canvas

$window.Add_SourceInitialized({
  $helper = New-Object System.Windows.Interop.WindowInteropHelper($window)
  $hwnd = $helper.Handle
  $ex = [OverlayWin]::GetWindowLong($hwnd, -20)
  [OverlayWin]::SetWindowLong($hwnd, -20, $ex -bor 0x20 -bor 0x80 -bor 0x08000000) | Out-Null
})

$script:blocks = @{}

function New-Block {
  $panel = New-Object System.Windows.Controls.StackPanel
  $panel.Width = [double]($canvas.ActualWidth * 0.6)
  if ($panel.Width -le 0) { $panel.Width = 700 }
  $panel.HorizontalAlignment = 'Center'

  $main = New-Object System.Windows.Controls.TextBlock
  $main.FontFamily = New-Object System.Windows.Media.FontFamily('Microsoft YaHei')
  $main.FontSize = 26
  $main.FontWeight = [System.Windows.FontWeights]::Bold
  $main.FontStyle = [System.Windows.FontStyles]::Italic
  $main.Foreground = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(255, 255, 254, 239))
  $main.TextAlignment = 'Center'
  $main.TextWrapping = 'Wrap'
  $main.Effect = New-Object System.Windows.Media.Effects.DropShadowEffect
  $main.Effect.Color = [System.Windows.Media.Color]::FromArgb(255, 216, 165, 35)
  $main.Effect.BlurRadius = 10
  $main.Effect.ShadowDepth = 0
  $main.Effect.Opacity = 0.95

  $tr = New-Object System.Windows.Controls.TextBlock
  $tr.FontFamily = New-Object System.Windows.Media.FontFamily('Microsoft YaHei')
  $tr.FontSize = 15
  $tr.Foreground = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(210, 255, 254, 239))
  $tr.TextAlignment = 'Center'
  $tr.TextWrapping = 'Wrap'
  $tr.Margin = New-Object System.Windows.Thickness(0, 6, 0, 0)

  $panel.Children.Add($main) | Out-Null
  $panel.Children.Add($tr) | Out-Null
  return @{ panel = $panel; main = $main; tr = $tr }
}

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(120)
$timer.Add_Tick({
  try {
    if (-not (Test-Path $stateFile)) { return }
    $raw = [System.IO.File]::ReadAllText($stateFile)
    if ([string]::IsNullOrWhiteSpace($raw)) { return }
    $state = $raw | ConvertFrom-Json
    $items = @($state.lines)
    $w = $canvas.ActualWidth
    $h = $canvas.ActualHeight
    if ($w -le 0) { $w = $window.Width }
    if ($h -le 0) { $h = $window.Height }
    $seen = @{}
    foreach ($item in $items) {
      if (-not $item) { continue }
      $key = [string]$item.key
      if ([string]::IsNullOrEmpty($key)) { continue }
      $seen[$key] = $true
      $block = $script:blocks[$key]
      if (-not $block) {
        $block = New-Block
        $script:blocks[$key] = $block
        $canvas.Children.Add($block.panel) | Out-Null
        $block.panel.RenderTransformOrigin = New-Object System.Windows.Point(0.5, 0.5)
        $block.panel.RenderTransform = New-Object System.Windows.Media.RotateTransform([double]$item.rot)
        $s = [double]$item.seed
        $r1 = [Math]::Abs([Math]::Sin($s) * 10000); $r1 = $r1 - [Math]::Floor($r1)
        $r2 = [Math]::Abs([Math]::Sin($s + 17) * 10000); $r2 = $r2 - [Math]::Floor($r2)
        $block.px = 0.15 + $r1 * 0.7
        $block.py = 0.2 + $r2 * 0.55
      }
      $block.panel.Width = [Math]::Max(320, ($w * 0.4))
      $block.main.Text = [string]$item.text
      $block.tr.Text = [string]$item.tr
      $block.panel.Opacity = [double]$item.opacity
      $cx = $block.px * $w
      $cy = $block.py * $h
      $left = [Math]::Max(12, [Math]::Min(($w - $block.panel.Width - 12), ($cx - ($block.panel.Width / 2))))
      $top = [Math]::Max(16, [Math]::Min(($h - 200), ($cy - 50)))
      [System.Windows.Controls.Canvas]::SetLeft($block.panel, $left)
      [System.Windows.Controls.Canvas]::SetTop($block.panel, $top)
    }
    foreach ($key in @($script:blocks.Keys)) {
      if (-not $seen.ContainsKey($key)) {
        $canvas.Children.Remove($script:blocks[$key].panel) | Out-Null
        $script:blocks.Remove($key)
      }
    }
  } catch { }
})
$timer.Start()

$window.Show() | Out-Null
$app = New-Object System.Windows.Application
$app.Run() | Out-Null
