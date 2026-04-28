export const RULE_REMOTION_TRANSITIONS = `# Remotion Transitions — TransitionSeries

TransitionSeries is the BEST way to build multi-scene videos.
It handles scene switching automatically — no overlapping, no manual durationInFrames math.

## Correct imports (important)
\`\`\`tsx
import {TransitionSeries, linearTiming, springTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {wipe} from "@remotion/transitions/wipe";
import {flip} from "@remotion/transitions/flip";
\`\`\`

Do NOT import \`TransitionSeries\` from \`remotion\`.

## ⚠️ CRITICAL RULES — violating these causes "Cannot read properties of undefined (reading 'getProgress')"

1. **Transition must NEVER be the first child** — always start with a Sequence
2. **Transition must NEVER be the last child** — always end with a Sequence
3. **Never place two Transition elements consecutively** — must alternate: Sequence → Transition → Sequence
4. **presentation prop is REQUIRED** on every Transition — never omit it
5. **Do not wrap children in React.Fragment** — pass raw JSX elements only

Correct order: Sequence → Transition → Sequence → Transition → Sequence

## Basic usage
\`\`\`jsx
return (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={60}>
      <AbsoluteFill style={{ backgroundColor: "#667eea", justifyContent: "center", alignItems: "center" }}>
        <div style={{ color: "#fff", fontSize: 48 }}>Scene A</div>
      </AbsoluteFill>
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 15 })}
    />
    <TransitionSeries.Sequence durationInFrames={60}>
      <AbsoluteFill style={{ backgroundColor: "#764ba2", justifyContent: "center", alignItems: "center" }}>
        <div style={{ color: "#fff", fontSize: 48 }}>Scene B</div>
      </AbsoluteFill>
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
\`\`\`

## Available transitions
- fade()
- slide({ direction: "from-left" })
- wipe({ direction: "from-right" })
- flip({ direction: "from-top" })

Directions: "from-left", "from-right", "from-top", "from-bottom"

## Timing
- linearTiming({ durationInFrames: 20 })
- springTiming({ config: { damping: 200 }, durationInFrames: 25 })

## Duration calculation
Transitions OVERLAP adjacent scenes. Total = sum of sequences - sum of transitions.
Example: two 60-frame scenes + one 15-frame transition = 105 frames total.

## Many scenes with transitions — SAFE flatMap pattern
The \`flatMap\` pattern must guarantee: never starts or ends with a Transition.
Add the transition BEFORE each scene (except the first), not after.

\`\`\`jsx
const scenes = [
  { bg: "#667eea", text: "Introduction" },
  { bg: "#764ba2", text: "Features" },
  { bg: "#f093fb", text: "Conclusion" },
];

return (
  <TransitionSeries>
    {scenes.flatMap((scene, i) => {
      const seq = (
        <TransitionSeries.Sequence key={"s" + i} durationInFrames={90}>
          <AbsoluteFill style={{ backgroundColor: scene.bg, justifyContent: "center", alignItems: "center" }}>
            <div style={{ color: "#fff", fontSize: 64, fontWeight: 700 }}>{scene.text}</div>
          </AbsoluteFill>
        </TransitionSeries.Sequence>
      );
      // Transition goes BEFORE the scene (except first scene)
      if (i === 0) return [seq];
      return [
        <TransitionSeries.Transition
          key={"t" + i}
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 20 })}
        />,
        seq,
      ];
    })}
  </TransitionSeries>
);
\`\`\`

This guarantees: first child = Sequence, last child = Sequence, no consecutive Transitions.

## ❌ Common mistakes that cause the getProgress error

\`\`\`jsx
// ❌ WRONG: transition added AFTER last scene
scenes.flatMap((scene, i) => {
  const seq = <TransitionSeries.Sequence ...>{...}</TransitionSeries.Sequence>;
  if (i === scenes.length - 1) return [seq]; // last = Sequence ✓
  return [seq, <TransitionSeries.Transition .../>]; // BUT: transition is last when array ends
  // This is actually fine IF the last scene check is correct — but easy to get wrong
});

// ❌ WRONG: missing presentation prop
<TransitionSeries.Transition timing={linearTiming({ durationInFrames: 20 })} />

// ❌ WRONG: transition as first child
<TransitionSeries>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
  <TransitionSeries.Sequence durationInFrames={60}>...</TransitionSeries.Sequence>
</TransitionSeries>
\`\`\`
`;

