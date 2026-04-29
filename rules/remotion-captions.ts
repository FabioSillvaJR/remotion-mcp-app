export const RULE_REMOTION_CAPTIONS = `# Remotion Captions — Subtitles from SRT/URL

Use \`@remotion/captions\` to render synchronized subtitles from a .srt file URL.

## Import
\`\`\`tsx
import { parseSrt } from "@remotion/captions";
import { delayRender, continueRender, useCurrentFrame, useVideoConfig } from "remotion";
\`\`\`

## parseSrt return shape
\`\`\`ts
parseSrt({ input: string }) => {
  captions: Array<{
    text: string;       // subtitle text
    startMs: number;    // start time in milliseconds
    endMs: number;      // end time in milliseconds
    timestampMs: number;// midpoint (startMs + endMs) / 2
    confidence: number; // always 1 for SRT
  }>
}
\`\`\`

## Complete pattern — fetch SRT from URL + render active caption

\`\`\`tsx
import { parseSrt } from "@remotion/captions";
import {
  AbsoluteFill,
  delayRender,
  continueRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useEffect, useState, useRef } from "react";

type Caption = { text: string; startMs: number; endMs: number };

export default function VideoWithCaptions() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const [captions, setCaptions] = useState<Caption[]>([]);
  const handle = useRef(delayRender("Loading captions"));

  useEffect(() => {
    fetch("https://example.com/subtitles.srt")
      .then((r) => r.text())
      .then((text) => {
        const { captions: parsed } = parseSrt({ input: text });
        setCaptions(parsed);
        continueRender(handle.current);
      })
      .catch(() => continueRender(handle.current));
  }, []);

  // Find the active caption for the current time
  const active = captions.find(
    (c) => currentMs >= c.startMs && currentMs < c.endMs
  );

  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {/* your main video content here */}

      {/* Subtitle overlay */}
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

## durationInFrames from SRT (auto-calculate total duration)

When the user provides a SRT URL, calculate the durationInFrames from the last caption's endMs:

\`\`\`tsx
// After fetching and parsing:
const lastCue = parsed[parsed.length - 1];
const totalMs = lastCue ? lastCue.endMs + 500 : 5000; // 500ms buffer after last cue
const durationInFrames = Math.ceil((totalMs / 1000) * fps);
\`\`\`

Or pass it as a fixed value in the create_video call if the user specifies the video length.

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
\`\`\`

## Important rules

1. **Always call \`delayRender\` before fetching** and \`continueRender\` in both the success and error handlers — otherwise the renderer hangs waiting for content
2. **Handle fetch errors** — always call \`continueRender\` in .catch() to avoid hanging renders
3. **SRT text may contain HTML tags** (\`<i>\`, \`<b>\`) — sanitize or strip them if not needed
4. The \`handle\` ref pattern (\`useRef(delayRender(...))\`) is required because delayRender must be called once and stored
5. \`parseSrt\` expects plain text string, not a stream — always \`.text()\` the response first
`;
