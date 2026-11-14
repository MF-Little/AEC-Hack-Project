# Gaze Decoder: hackathon pitch and use cases

## One-line pitch

**Google Ads for buildings: we learn what people respond to in a space, and turn it into design specs instead of ads.**

Clients decide on million-dollar glazing and finishes from renders and whoever talks loudest in the meeting. Gaze Decoder gives them behavioural evidence instead.

## Hero use case: the Glass Taste Test

A client can't say what glass they want, so they walk the room. The same windows cycle through three glasses: low-iron clear (91% VLT), fritted dot (58%) and bronze tint (35%). The app records where they look, for how long, and what they say. Then it outputs a spec line, for example:

> 08 80 00 Glazing: low-iron laminated, VLT ≥ 88%, slimline frame. Confidence: medium. Based on 42 s of attention and 2 positive remarks.

Why it wins:
- It's concrete and fits a decision every project makes.
- The output is something an architect would actually issue.
- It's built: glass widget, glass test table and spec card are all in the prototype.

## Supporting use cases

| Use case | The hook |
| --- | --- |
| What does the client mean by "warm"? | They say "warm and calm"; the app maps the words to the hidden VLT, tint and plaster finish they were looking at. A translator from client language to spec. |
| Value-engineering shield | "If we must cut $200k, what will nobody notice?" Elements are ranked by attention so cuts protect what people value. |
| Calm waiting rooms (healthcare) | Patients and nurses walk the waiting-room options. Builds on Ulrich (1984): patients with a nature view recovered faster. |
| Sensory-friendly design | Fast scanning, many short glances and negative remarks can flag spaces that may overwhelm neurodivergent users. Frame it as flags for review, not a diagnosis. |
| Community engagement without sticky dots | Residents walk a library proposal on their phone and leave voice notes; quieter people get heard. |
| Wayfinding before concrete | Task: "find room 214". The app logs which signs people actually looked at. One healthcare study found signs took 62% of visitors' looking time. |
| Sales-suite finishes | Buyers tour finish packages; developers learn what drives "I want this one". |

## Why now

- Browser 3D and WebXR run on any laptop or headset, with no install.
- An LLM turns spoken remarks into design reasoning.
- Clients already pay for experience data: Leesman benchmarks 1.6M+ employees; WELL covers 6.49B sq ft.
- No precedent found joins element metadata, attention, voice notes and spec output in one tool.

## Answers to likely judge questions

- **"Looking isn't liking."** Correct. That's why we pair attention with voice notes and a closing "which would you pick?", and report noticed and liked separately.
- **"Privacy?"** Participant codes only, text not audio, a consent screen and a debrief showing what was recorded.
- **"Business model?"** Charged per study as a design service (pre-occupancy research), or licensed to firms and glass and finish manufacturers.
- **"Is it real gaze?"** Today it tracks the centre of view, weighted outward in rings. On a Quest Pro it would use true eye tracking, with about 1° accuracy.

## 3-minute demo script

1. **30 s, problem:** glazing chosen from renders; nobody asks the 800 people who will sit there.
2. **60 s, live walk:**
   - Stand in the arched window's ring.
   - Press 1, 2 and 3 about 10 seconds apart, saying a reaction each time ("bright and calm", "too dark").
   - Show the heatmap painting the surfaces.
3. **30 s, Decode walk:** show the glass test table, the preferred glass and the spec line.
4. **30 s:** the supporting use cases slide.
5. **30 s:** why now, then the ask.

## Live links (private to the owner until shared)

- Prototype: https://claude.ai/artifact/9VuyNQKuKgY5NWUEYgTyMB
- Prototype report (doc): https://claude.ai/artifact/9GiqyTXvBQdiikEFiJ16Tc
- AEC opportunities (doc): https://claude.ai/artifact/Hs51qerfuLKxAdMUs1TPqC
- GitHub repo: https://github.com/MF-Little/AEC-Hack-Project
