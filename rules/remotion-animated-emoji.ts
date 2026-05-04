export const RULE_REMOTION_ANIMATED_EMOJI = `# Remotion Animated Emoji

Use \`@remotion/animated-emoji\` to display animated Google Noto Emoji in videos.

## Import

\`\`\`tsx
import { AnimatedEmoji } from "@remotion/animated-emoji";
\`\`\`

## Basic usage

\`\`\`tsx
<AnimatedEmoji emoji="fire" />
\`\`\`

The \`emoji\` prop value must be an exact name from \`getAvailableEmojis()\`.
Always call \`search_animated_emoji\` before writing code to find the correct name.

## CRITICAL: calculateSrc (required — no public folder on this server)

The default \`calculateSrc\` uses \`staticFile()\` which does NOT work on this server.
You MUST override it with a CDN URL using jsDelivr:

\`\`\`tsx
import { AnimatedEmoji } from "@remotion/animated-emoji";
import type { CalculateEmojiSrc } from "@remotion/animated-emoji";

const calculateEmojiSrc: CalculateEmojiSrc = ({ emoji, scale }) =>
  \`https://cdn.jsdelivr.net/gh/remotion-dev/animated-emoji/public/\${emoji}-\${scale}x.webm\`;

export const MyComponent: React.FC = () => (
  <AnimatedEmoji emoji="fire" calculateSrc={calculateEmojiSrc} />
);
\`\`\`

Define \`calculateEmojiSrc\` at the module level (outside components), not inside hooks.

## Props

| Prop | Type | Description |
|---|---|---|
| \`emoji\` | string | Emoji name (use \`search_animated_emoji\` to find it) |
| \`calculateSrc\` | CalculateEmojiSrc | **Required** on this server — use jsDelivr CDN |
| \`scale\` | 0.5 \| 1 \| 2 | Resolution: 0.5=512px, 1=1024px, 2=2048px. Default: 1 |

Use \`scale={0.5}\` for small/medium display (faster load), \`scale={1}\` for large display.

## Sizing

\`AnimatedEmoji\` fills its container. Wrap in a \`<div>\` with explicit dimensions:

\`\`\`tsx
<div style={{ width: 200, height: 200 }}>
  <AnimatedEmoji emoji="party-popper" calculateSrc={calculateEmojiSrc} scale={0.5} />
</div>
\`\`\`

## Duration

Each emoji has a fixed \`durationInSeconds\` (returned by \`search_animated_emoji\`).
The animation loops automatically. No need to manage timing — just render it in a \`<Sequence>\`.

## Example in a Sequence

\`\`\`tsx
import { Sequence } from "remotion";
import { AnimatedEmoji } from "@remotion/animated-emoji";
import type { CalculateEmojiSrc } from "@remotion/animated-emoji";

const calculateEmojiSrc: CalculateEmojiSrc = ({ emoji, scale }) =>
  \`https://cdn.jsdelivr.net/gh/remotion-dev/animated-emoji/public/\${emoji}-\${scale}x.webm\`;

export default function Video() {
  return (
    <Sequence from={0} durationInFrames={90}>
      <div style={{ position: "absolute", bottom: 40, right: 40, width: 120, height: 120 }}>
        <AnimatedEmoji emoji="fire" calculateSrc={calculateEmojiSrc} scale={0.5} />
      </div>
    </Sequence>
  );
}
\`\`\`

## Workflow

1. Call \`search_animated_emoji\` with a keyword to find available emoji names
2. Pick the best match from the results
3. Use the \`calculateSrc\` CDN pattern shown above
4. Wrap in a sized \`<div>\`
`;
