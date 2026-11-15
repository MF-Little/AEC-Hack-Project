#if MACOS
using System;
using AVFoundation;
using Eto.Forms;
using Foundation;
using Rhino;
using Speech;

namespace VisionVoiceVibe
{
  /// <summary>
  /// Continuous speech-to-text with Apple's Speech framework, inside Rhino (Rhino's app already declares
  /// microphone and speech-recognition use). It listens until switched off. A pause of about 1.2 s closes a
  /// phrase, which becomes a note. Recognition stays on the Mac when the system supports it.
  /// </summary>
  public sealed class MacSpeech
  {
    public event Action<string> Partial;        // words so far in the current phrase
    public event Action<string> Phrase;         // a finished phrase
    public event Action<bool, string> Status;   // listening or not, and a line for the window

    SFSpeechRecognizer recognizer;
    AVAudioEngine engine;
    SFSpeechAudioBufferRecognitionRequest request;
    SFSpeechRecognitionTask task;
    UITimer pauseTimer;
    string current = "";
    DateTime lastChange = DateTime.MinValue, taskStarted;
    int quickFailures;

    public bool IsOn { get; private set; }
    public bool OnDevice { get; private set; }

    public void Start()
    {
      if (IsOn) return;
      Status?.Invoke(false, "Asking macOS for speech recognition…");
      SFSpeechRecognizer.RequestAuthorization(status => RhinoApp.InvokeOnUiThread(new Action(() =>
      {
        if (status != SFSpeechRecognizerAuthorizationStatus.Authorized)
        {
          Status?.Invoke(false, "Speech recognition is off for Rhino. Turn it on in System Settings › Privacy & Security › Speech Recognition, then press Voice again.");
          return;
        }
        Begin();
      })));
    }

    void Begin()
    {
      try
      {
        recognizer ??= new SFSpeechRecognizer(NSLocale.CurrentLocale);
        if (!recognizer.Available) recognizer = new SFSpeechRecognizer(new NSLocale("en-US"));
        if (!recognizer.Available) { Status?.Invoke(false, "Speech recognition isn't available right now."); return; }
        OnDevice = recognizer.SupportsOnDeviceRecognition;
        engine = new AVAudioEngine();
        var input = engine.InputNode;
        input.InstallTapOnBus(0, 1024, input.GetBusOutputFormat(0), (buffer, when) =>
        {
          try { request?.Append(buffer); } catch { }
        });
        engine.Prepare();
        if (!engine.StartAndReturnError(out var err))
        {
          Status?.Invoke(false, "Couldn't start the microphone" + (err != null ? ": " + err.LocalizedDescription : ". Allow Rhino in System Settings › Privacy & Security › Microphone."));
          Teardown();
          return;
        }
        IsOn = true;
        quickFailures = 0;
        NewTask();
        pauseTimer = new UITimer { Interval = 0.2 };
        pauseTimer.Elapsed += (s, e) => Tick();
        pauseTimer.Start();
        Status?.Invoke(true, OnDevice ? "Listening. Transcribed on this Mac." : "Listening. Transcribed by Apple's servers.");
      }
      catch (Exception ex)
      {
        Status?.Invoke(false, "Voice couldn't start: " + ex.Message);
        Teardown();
      }
    }

    void NewTask()
    {
      var req = new SFSpeechAudioBufferRecognitionRequest { ShouldReportPartialResults = true };
      if (OnDevice) req.RequiresOnDeviceRecognition = true;
      try { req.AddsPunctuation = true; } catch { }
      request = req;
      current = "";
      taskStarted = DateTime.Now;
      task = recognizer.GetRecognitionTask(req, (result, error) =>
      {
        string text = result?.BestTranscription?.FormattedString;
        bool final = result != null && result.Final;
        bool failed = error != null;
        RhinoApp.InvokeOnUiThread(new Action(() =>
        {
          if (req != request) return;   // a phrase that is already closed
          if (!string.IsNullOrWhiteSpace(text) && text != current)
          {
            current = text;
            lastChange = DateTime.Now;
            Partial?.Invoke(text);
          }
          if (final || failed) Close(failed);
        }));
      });
    }

    void Tick()
    {
      if (!IsOn) return;
      // A pause closes the phrase. Apple also ends a request after about a minute, so close long ones first.
      bool paused = current.Length > 0 && (DateTime.Now - lastChange).TotalSeconds > 1.2;
      bool tooLong = (DateTime.Now - taskStarted).TotalSeconds > 50;
      if (paused || tooLong) Close(false);
    }

    void Close(bool failed)
    {
      var text = current.Trim();
      current = "";
      var oldTask = task; var oldReq = request;
      request = null; task = null;
      try { oldReq?.EndAudio(); oldTask?.Cancel(); } catch { }
      if (text.Length > 0) Phrase?.Invoke(text);
      if (!IsOn) return;
      if (failed && text.Length == 0)
      {
        // nothing was heard before the request ended; restart, but stop if it keeps failing straight away
        quickFailures = (DateTime.Now - taskStarted).TotalSeconds < 2 ? quickFailures + 1 : 0;
        if (quickFailures >= 5) { Stop(); Status?.Invoke(false, "Voice stopped: speech recognition keeps failing. Check the microphone, then press Voice again."); return; }
      }
      NewTask();
    }

    public void Stop()
    {
      if (!IsOn && engine == null) return;
      IsOn = false;
      pauseTimer?.Stop();
      if (current.Trim().Length > 0) Close(false);
      Teardown();
      Status?.Invoke(false, "Voice off.");
    }

    void Teardown()
    {
      try { engine?.InputNode.RemoveTapOnBus(0); } catch { }
      try { engine?.Stop(); } catch { }
      try { request?.EndAudio(); task?.Cancel(); } catch { }
      engine = null; request = null; task = null;
    }
  }
}
#endif
