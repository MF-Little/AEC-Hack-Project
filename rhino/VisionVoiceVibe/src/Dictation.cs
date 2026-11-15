using System;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;

namespace VisionVoiceVibe
{
  /// <summary>
  /// Starts the operating system's own dictation in the focused text box. On a Mac this sends AppKit's
  /// startDictation: action (found by reflection, so the plug-in still builds and runs on Windows).
  /// </summary>
  public static class Dictation
  {
    public static string Hint => RuntimeInformation.IsOSPlatform(OSPlatform.OSX)
      ? "Start macOS Dictation (the 🎤 key, or press Fn twice), speak, then press Enter. Turn Dictation on in System Settings › Keyboard if it's off."
      : "Press Windows + H to start voice typing, speak, then press Enter.";

    public static bool TryStart()
    {
      if (!RuntimeInformation.IsOSPlatform(OSPlatform.OSX)) return false;
      try
      {
        var appType = Type.GetType("AppKit.NSApplication, Microsoft.macOS");
        var selType = Type.GetType("ObjCRuntime.Selector, Microsoft.macOS");
        if (appType == null || selType == null) return false;
        var shared = appType.GetProperty("SharedApplication", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        var sel = Activator.CreateInstance(selType, new object[] { "startDictation:" });
        var send = appType.GetMethods().FirstOrDefault(m => m.Name == "SendAction" && m.GetParameters().Length == 3);
        if (shared == null || send == null) return false;
        return send.Invoke(shared, new[] { sel, null, null }) is bool ok && ok;
      }
      catch { return false; }
    }
  }
}
