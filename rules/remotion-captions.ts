export const RULE_REMOTION_CAPTIONS = `# Remotion Captions — Subtitles from SRT

## Workflow

1. Call \`fetch_captions\` with the SRT URL and the \`videoId\`
2. The tool saves the parsed captions JSON on the server and returns:
   - \`captionsUrl\` — a same-server URL (e.g. \`https://your-server/api/captions/<videoId>\`)
   - \`count\` — number of cues
   - \`durationMs\` — total duration in ms (use to calculate \`durationInFrames\`)
3. Write the component using \`delayRender\` + \`fetch(captionsUrl)\`

⚠️ **Never fetch the original external .srt URL inside the component** — it may timeout during rendering.
The \`captionsUrl\` returned by \`fetch_captions\` is always safe to fetch (same server as the renderer).

---

## Import
\`\`\`tsx
import { useCurrentFrame, useVideoConfig, delayRender, continueRender, AbsoluteFill } from "remotion";
import { useEffect, useState, useRef } from "react";
\`\`\`

## Caption type
\`\`\`ts
type Caption = { text: string; startMs: number; endMs: number; timestampMs: number; confidence: number };
\`\`\`

## Complete pattern — fetch from captionsUrl (same-server, safe during render)

Replace CAPTIONS_URL with the exact \`captionsUrl\` returned by \`fetch_captions\`.

\`\`\`tsx
import {
  useCurrentFrame, useVideoConfig,
  delayRender, continueRender, AbsoluteFill,
} from "remotion";
import { useEffect, useState, useRef } from "react";

type Caption = { text: string; startMs: number; endMs: number };

// Replace with the captionsUrl returned by fetch_captions:
const CAPTIONS_URL = "https://your-server/api/captions/YOUR_VIDEO_ID";

export default function VideoWithCaptions() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const [captions, setCaptions] = useState<Caption[]>([]);
  const handle = useRef(delayRender("Loading captions"));

  useEffect(() => {
    fetch(CAPTIONS_URL)
      .then((r) => r.json())
      .then((data: Caption[]) => {
        setCaptions(data);
        continueRender(handle.current);
      })
      .catch(() => continueRender(handle.current));
  }, []);

  const active = captions.find((c) => currentMs >= c.startMs && currentMs < c.endMs);

  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {/* main content here */}

      {active && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 60, pointerEvents: "none" }}>
          <div style={{
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 38,
            fontFamily: "sans-serif",
            fontWeight: 600,
            padding: "10px 28px",
            borderRadius: 8,
            maxWidth: "80%",
            textAlign: "center",
            lineHeight: 1.4,
          }}>
            {active.text}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
\`\`\`

## durationInFrames

\`fetch_captions\` returns \`durationMs\`. Use it to set the duration:
\`\`\`
durationInFrames = Math.ceil((durationMs / 1000) * fps)
\`\`\`
The tool output already shows the ready-to-use value at 30fps and 60fps.

## Subtitle style variants

**TikTok-style large centered:**
\`\`\`tsx
<div style={{ color: "#fff", fontSize: 56, fontWeight: 900,
  textShadow: "0 3px 12px rgba(0,0,0,0.9)", textAlign: "center",
  maxWidth: "75%", lineHeight: 1.2 }}>
  {active.text}
</div>
\`\`\`

**Outlined (no box):**
\`\`\`tsx
<div style={{ color: "#fff", fontSize: 40, fontWeight: 700,
  WebkitTextStroke: "2px #000", textAlign: "center", maxWidth: "80%" }}>
  {active.text}
</div>
\`\`\`

**Bottom bar (full-width strip):**
\`\`\`tsx
<div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
  background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 32,
  fontWeight: 600, padding: "18px 40px", textAlign: "center" }}>
  {active.text}
</div>
\`\`\`

## Rules

1. **Always call \`fetch_captions\` first** — it saves the captions and returns the safe \`captionsUrl\`
2. **Use the \`captionsUrl\` from the tool response** — never use the original external URL in the component
3. **Always call \`continueRender\` in both \`.then()\` and \`.catch()\`** to avoid render hangs
4. **The \`handle\` ref** (\`useRef(delayRender(...))\`) must be stable — created once outside the effect
5. The data from \`CAPTIONS_URL\` is already parsed JSON (array of captions) — call \`.json()\` not \`.text()\`
`;


## Import
\`\`\`tsx
import { parseSrt } from "@remotion/captions";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
\`\`\`

## parseSrt return shape
\`\`\`ts
parseSrt({ input: string }) => {
  captions: Array<{
    text: string;       // subtitle text
    startMs: number;    // start time in milliseconds
    endMs: number;      // end time in milliseconds
    timestampMs: number;// midpoint
    confidence: number; // always 1 for SRT
  }>
}
\`\`\`

## Step 1 — Get the SRT content

When the user provides a .srt URL, call \`fetch_captions\` with that URL.
The tool fetches server-side and returns the raw SRT text.
You MUST do this BEFORE generating the component.

## Step 2 — Embed inline + parse at module level (NO fetch in component)

\`\`\`tsx
import { parseSrt } from "@remotion/captions";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

// ✅ Embed the raw SRT text returned by fetch_captions directly here:
const SRT_TEXT = \`1
00:00:00,500 --> 00:00:02,000
Hello world

2
00:00:02,500 --> 00:00:05,000
This is the second line
\`;

// Parse at module level — synchronous, no fetch, works in both player and renderer
const { captions } = parseSrt({ input: SRT_TEXT });

// Auto-calculate duration from last caption (add 1s buffer)
const FPS = 30;
const lastCue = captions[captions.length - 1];
const DURATION_IN_FRAMES = lastCue
  ? Math.ceil(((lastCue.endMs + 1000) / 1000) * FPS)
  : 150;

export default function VideoWithCaptions() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const active = captions.find(
    (c) => currentMs >= c.startMs && currentMs < c.endMs
  );

  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {/* your main video content here */}

      {/* Subtitle overlay — bottom center */}
      {active && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 60,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.75)",
              color: "#fff",
              fontSize: 38,
              fontFamily: "sans-serif",
              fontWeight: 600,
              padding: "10px 28px",
              borderRadius: 8,
              maxWidth: "80%",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {active.text}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
\`\`\`

## durationInFrames for create_video / update_video

Pass the calculated value in the tool call:
\`\`\`
durationInFrames: DURATION_IN_FRAMES  (calculated from last caption endMs + 1s buffer)
\`\`\`

## Subtitle style variants

**TikTok-style large centered text:**
\`\`\`tsx
<div style={{
  color: "#fff",
  fontSize: 56,
  fontWeight: 900,
  textShadow: "0 3px 12px rgba(0,0,0,0.9)",
  textAlign: "center",
  maxWidth: "75%",
  lineHeight: 1.2,
}}>
  {active.text}
</div>
\`\`\`

**Outlined text (no background box):**
\`\`\`tsx
<div style={{
  color: "#fff",
  fontSize: 40,
  fontWeight: 700,
  WebkitTextStroke: "2px #000",
  textAlign: "center",
  maxWidth: "80%",
}}>
  {active.text}
</div>
\`\`\`

**Bottom bar (full-width strip):**
\`\`\`tsx
<div style={{
  position: "absolute", bottom: 0, left: 0, right: 0,
  background: "rgba(0,0,0,0.8)",
  color: "#fff", fontSize: 32, fontWeight: 600,
  padding: "18px 40px", textAlign: "center",
}}>
  {active.text}
</div>
\`\`\`

## Rules

1. **Always use \`fetch_captions\` first** when given a URL — never put the URL inside fetch() in the component
2. **Embed the SRT text as a \`const\` string** at the top of the file — no runtime network calls
3. **Parse at module level** (outside the component function) — synchronous, zero latency
4. SRT text may contain HTML tags (\`<i>\`, \`<b>\`) — strip or ignore them in the render
5. The \`DURATION_IN_FRAMES\` export can be used as the \`durationInFrames\` value in the tool call
`;

