using Rhino.PlugIns;

namespace VisionVoiceVibe
{
  public sealed class VvvPlugIn : PlugIn
  {
    public static VvvPlugIn Instance { get; private set; }

    public VvvPlugIn() { Instance = this; }

    protected override LoadReturnCode OnLoad(ref string errorMessage)
    {
      Walk.Init();
      return LoadReturnCode.Success;
    }
  }
}
