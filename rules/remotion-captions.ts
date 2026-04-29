export const RULE_REMOTION_CAPTIONS = `# Remotion Captions — Subtitles from SRT

## Workflow

1. Call \`fetch_captions\` with the SRT URL and the \`videoId\`
2. The tool saves the parsed captions JSON on the server and returns:
   - \`captionsUrl\` — a same-server URL (e.g. \`https://your-server/api/captions/<videoId>\`)
   - \`count\` — number of cues
   - \`durationMs\` — total duration in ms (use to calculate \`durationInFrames\`)
3. Write the component using \`delayRender\` + \`fetch(captionsUrl)\`

## ⛔ FORBIDDEN — NEVER do this

\`\`\`tsx
// ❌ WRONG: original external URL in the component
fetch("https://tmpfiles.org/dl/anything.srt")
fetch("https://any-external-domain.com/file.srt")
\`\`\`

External URLs may be unreachable from the render server (Docker).
This causes: **"A delayRender() was called but not cleared after 28000ms"** → render fails.

## ✅ ALWAYS use the captionsUrl returned by fetch_captions

The \`captionsUrl\` points to the SAME server running the renderer. It will NEVER timeout.

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

## Complete pattern — fetch from captionsUrl with graceful degradation

Replace CAPTIONS_URL with the exact \`captionsUrl\` returned by \`fetch_captions\`.
If captions fail to load (404, network error), the video renders WITHOUT captions instead of hanging.

**Font**: always use the same \`fontFamily\` loaded via \`loadFont()\` (from \`@remotion/google-fonts/...\`) as the rest of the video. If the video uses a custom Google Font, import and call \`loadFont()\` at module level and use its returned \`fontFamily\` in the subtitle \`div\`. Never use \`"sans-serif"\` or a hardcoded string if the project already loads a custom font.

\`\`\`tsx
import {
  useCurrentFrame, useVideoConfig,
  delayRender, continueRender, AbsoluteFill,
} from "remotion";
import { useEffect, useState, useRef } from "react";
// ✅ Import the same font used in the rest of the video, e.g.:
import { loadFont } from "@remotion/google-fonts/Montserrat";

type Caption = { text: string; startMs: number; endMs: number };

// ✅ Use ONLY the captionsUrl returned by fetch_captions — never the original .srt URL
const CAPTIONS_URL = "https://your-server/api/captions/YOUR_VIDEO_ID";

// Load font at module level — same font as the rest of the video
const { fontFamily } = loadFont("normal", { weights: ["700"] });

export default function VideoWithCaptions() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const [captions, setCaptions] = useState<Caption[]>([]);
  const handle = useRef(delayRender("Loading captions"));

  useEffect(() => {
    fetch(CAPTIONS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
        return r.json();
      })
      .then((data: Caption[]) => {
        setCaptions(data);
      })
      .catch(() => {
        // Captions unavailable — render continues without subtitles (no hang)
      })
      .finally(() => {
        continueRender(handle.current);
      });
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
            fontFamily,  // ✅ from loadFont() — NOT "sans-serif"
            fontWeight: 700,
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
  fontFamily,  // ✅ from loadFont() — same font as the video
  textShadow: "0 3px 12px rgba(0,0,0,0.9)", textAlign: "center",
  maxWidth: "75%", lineHeight: 1.2 }}>
  {active.text}
</div>
\`\`\`

**Outlined (no box):**
\`\`\`tsx
<div style={{ color: "#fff", fontSize: 40, fontWeight: 700,
  fontFamily,  // ✅ from loadFont()
  WebkitTextStroke: "2px #000", textAlign: "center", maxWidth: "80%" }}>
  {active.text}
</div>
\`\`\`

**Bottom bar (full-width strip):**
\`\`\`tsx
<div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
  background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 32,
  fontFamily,  // ✅ from loadFont()
  fontWeight: 600, padding: "18px 40px", textAlign: "center" }}>
  {active.text}
</div>
\`\`\`

## Rules

1. **ONLY use the \`captionsUrl\` from \`fetch_captions\`** — the original .srt URL MUST NOT appear in the component
2. **Always use \`.finally(() => continueRender(...))\`** — guarantees render never hangs even if captions 404
3. **The \`handle\` ref** (\`useRef(delayRender(...))\`) must be created once at module level, not inside the effect
4. The data from \`CAPTIONS_URL\` is already parsed JSON (array of captions) — call \`.json()\` not \`.text()\`
5. If \`fetch_captions\` returns an error (URL unreachable, 404), do NOT proceed with caption code — tell the user their URL is unavailable and ask for a working one
6. **Font**: ALWAYS pass \`fontFamily\` (from \`loadFont()\`) to the subtitle \`div\`. NEVER use \`"sans-serif"\` or any hardcoded font string. If the video uses a Google Font, import it at module level and use its \`fontFamily\`. If no font is defined yet, add one consistent with the video design.
7. **Order**: \`fetch_captions\` requires an existing \`videoId\`. When creating a new video with captions: (1) \`create_video\` → get videoId, (2) \`fetch_captions\` with videoId, (3) \`update_video\` with caption code.
\`;
