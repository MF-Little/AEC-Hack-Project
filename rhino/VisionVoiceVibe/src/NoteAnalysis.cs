using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace VisionVoiceVibe
{
  /// <summary>Scores a remark for tone and spots words that point at a metadata field. Same word lists as the web prototype.</summary>
  public static class NoteAnalysis
  {
    static readonly HashSet<string> Pos = new HashSet<string>("love like likes liked nice beautiful great good calm cozy cosy soft warm amazing wow pretty elegant peaceful favorite favourite prefer gorgeous lovely bright airy open interesting cool".Split(' '));
    static readonly HashSet<string> Neg = new HashSet<string>("hate dislike ugly cold harsh dark gloomy cramped heavy boring bad dull busy weird closed strange awkward".Split(' '));
    static readonly HashSet<string> Flip = new HashSet<string> { "not", "don't", "dont", "never", "no", "isn't", "isnt", "doesn't", "doesnt" };

    static readonly (Regex Re, string Attr, string What)[] CueRules =
    {
      (new Regex(@"\b(dark|dim|gloomy|bright|light|airy|sunny|glare)\b"), "Glass", "light transmission"),
      (new Regex(@"\b(curv\w*|round\w*|arch\w*|soft|organic|flow\w*)\b"), "Geometry", "form"),
      (new Regex(@"\b(sharp|clean|crisp|modern|minimal|straight|square|angular)\b"), "Geometry", "form"),
      (new Regex(@"\b(frame\w*|thick|thin|black|mullion\w*|heavy)\b"), "Frame", "frame"),
      (new Regex(@"\b(view|outside|horizon|sky|landscape|trees?|see)\b"), "Facing", "view"),
      (new Regex(@"\b(low|high|floor|sill|sit|seat)\b"), "Sill", "sill height"),
      (new Regex(@"\b(warm|cold|cool|tint\w*|colou?r|brown|bronze|green)\b"), "Glass", "tint"),
      (new Regex(@"\b(big|large|tall|wide|small|narrow|huge|tiny|long)\b"), "Size", "proportion"),
      (new Regex(@"\b(wall|plaster|texture|concrete|floor|ceiling|material)\b"), "Material", "material"),
    };

    public static (int Sentiment, List<Cue> Cues) Analyse(string text)
    {
      var cleaned = Regex.Replace((text ?? "").Replace('’', '\'').ToLowerInvariant(), @"[^a-z'\s]", " ");
      var toks = cleaned.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
      int sent = 0;
      for (int i = 0; i < toks.Length; i++)
      {
        bool flip = (i >= 1 && Flip.Contains(toks[i - 1])) || (i >= 2 && Flip.Contains(toks[i - 2]));
        if (Pos.Contains(toks[i])) sent += flip ? -1 : 1;
        else if (Neg.Contains(toks[i])) sent += flip ? 1 : -1;
      }
      var low = string.Join(" ", toks);
      var cues = CueRules.Where(c => c.Re.IsMatch(low)).Select(c => new Cue { Attr = c.Attr, What = c.What }).ToList();
      return (Math.Max(-2, Math.Min(2, sent)), cues);
    }
  }
}
