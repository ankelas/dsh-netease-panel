$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}

[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionManager2 {
    int NotImpl1();
    int NotImpl2();
    int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
}

[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl session);
}

[ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionControl {
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName(string name, ref Guid eventContext);
    int GetIconPath(out IntPtr path);
    int SetIconPath(string path, ref Guid eventContext);
    int GetGroupingParam(out Guid groupingParam);
    int SetGroupingParam(ref Guid groupingParam, ref Guid eventContext);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
}

[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName(string name, ref Guid eventContext);
    int GetIconPath(out IntPtr path);
    int SetIconPath(string path, ref Guid eventContext);
    int GetGroupingParam(out Guid groupingParam);
    int SetGroupingParam(ref Guid groupingParam, ref Guid eventContext);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out int pid);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool enable);
}

[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid eventContext);
    int GetMasterVolume(out float level);
    int SetMute(bool mute, ref Guid eventContext);
    int GetMute(out bool mute);
}

public static class AudioVolume {
    private static ISimpleAudioVolume Find(int pid) {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice device;
        enumerator.GetDefaultAudioEndpoint(0, 1, out device);
        Guid iid = typeof(IAudioSessionManager2).GUID;
        object obj;
        device.Activate(ref iid, 1, IntPtr.Zero, out obj);
        var manager = (IAudioSessionManager2)obj;
        IAudioSessionEnumerator sessions;
        manager.GetSessionEnumerator(out sessions);
        int count;
        sessions.GetCount(out count);
        ISimpleAudioVolume fallback = null;
        for (int i = 0; i < count; i++) {
            IAudioSessionControl control;
            sessions.GetSession(i, out control);
            var control2 = control as IAudioSessionControl2;
            if (control2 == null) continue;
            int spid;
            control2.GetProcessId(out spid);
            if (spid == pid) {
                var volume = (ISimpleAudioVolume)(object)control;
                int state;
                control.GetState(out state);
                if (state == 1) return volume;
                if (fallback == null) fallback = volume;
            }
        }
        return fallback;
    }

    public static float GetVolume(int pid) {
        var volume = Find(pid);
        if (volume == null) return -1f;
        float level;
        volume.GetMasterVolume(out level);
        return level;
    }

    public static bool SetVolume(int pid, float level) {
        var volume = Find(pid);
        if (volume == null) return false;
        Guid ctx = Guid.Empty;
        return volume.SetMasterVolume(level, ref ctx) == 0;
    }
}
"@

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $type) {
  $m = $asTaskGeneric.MakeGenericMethod($type)
  $t = $m.Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]

function Find-Session($manager) {
  foreach ($s in $manager.GetSessions()) {
    if ($s.SourceAppUserModelId -match 'cloudmusic|netease|orpheus') { return $s }
  }
  return $null
}

function Find-CloudMusicPid {
  $p = Get-Process cloudmusic -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
  if (-not $p) { $p = Get-Process cloudmusic -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if ($p) { return [int]$p.Id }
  return 0
}

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $cmd = $line.Trim()
  if ($cmd -eq 'quit') { break }
  try {
    $mgr = Await ($managerType::RequestAsync()) $managerType
    $s = Find-Session $mgr
    if ($cmd -eq 'state') {
      $cmPid = Find-CloudMusicPid
      $vol = -1.0
      $muted = $false
      if ($cmPid -gt 0) { $vol = [AudioVolume]::GetVolume($cmPid) }
      if ($null -eq $s) {
        $fallbackTitle = ''
        $fallbackArtist = ''
        if ($cmPid -gt 0) {
          $proc = Get-Process -Id $cmPid -ErrorAction SilentlyContinue
          if ($proc -and $proc.MainWindowTitle) {
            $parts = $proc.MainWindowTitle -split ' - ', 2
            if ($parts.Count -eq 2) {
              $fallbackTitle = $parts[0].Trim()
              $fallbackArtist = $parts[1].Trim()
            } else {
              $fallbackTitle = $proc.MainWindowTitle.Trim()
            }
          }
        }
        Emit @{ ok = $true; session = $false; title = $fallbackTitle; artist = $fallbackArtist; status = 'Unknown'; app = 'cloudmusic.exe'; volume = $(if ($vol -ge 0) { [math]::Round($vol * 100, 1) } else { $null }); muted = $muted }
        continue
      }
      $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType
      $info = $s.GetPlaybackInfo()
      Emit @{
        ok = $true
        session = $true
        title = [string]$p.Title
        artist = [string]$p.Artist
        album = [string]$p.AlbumTitle
        status = [string]$info.PlaybackStatus
        app = [string]$s.SourceAppUserModelId
        volume = $(if ($vol -ge 0) { [math]::Round($vol * 100, 1) } else { $null })
        muted = $muted
      }
    }
    elseif ($cmd -eq 'toggle' -or $cmd -eq 'next' -or $cmd -eq 'prev') {
      if ($null -eq $s) { Emit @{ ok = $false; error = 'no-session' }; continue }
      if ($cmd -eq 'toggle') { $r = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
      elseif ($cmd -eq 'next') { $r = Await ($s.TrySkipNextAsync()) ([bool]) }
      else { $r = Await ($s.TrySkipPreviousAsync()) ([bool]) }
      Emit @{ ok = [bool]$r }
    }
    elseif ($cmd -like 'setvol *') {
      $raw = $cmd.Substring(7).Trim()
      $n = 0.0
      if (-not [double]::TryParse($raw, [ref]$n)) { Emit @{ ok = $false; error = 'bad-volume' }; continue }
      $n = [math]::Max(0, [math]::Min(100, $n))
      $cmPid = Find-CloudMusicPid
      $ok = $false
      if ($cmPid -gt 0) { $ok = [AudioVolume]::SetVolume($cmPid, [float]($n / 100)) }
      Emit @{ ok = [bool]$ok; volume = [math]::Round($n, 1) }
    }
    elseif ($cmd -like 'open *') {
      $url = $cmd.Substring(5).Trim()
      if ($url -match '^orpheus://') { Start-Process $url; Emit @{ ok = $true; opened = $url } }
      else { Emit @{ ok = $false; error = 'bad-url' } }
    }
    else {
      Emit @{ ok = $false; error = 'unknown-command' }
    }
  }
  catch {
    Emit @{ ok = $false; error = $_.Exception.Message }
  }
}
