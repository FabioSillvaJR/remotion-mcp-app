export const RULE_REMOTION_ICONIFY = `# Remotion Iconify SVG Icons

Use the Iconify CDN API to embed SVG icons in videos. No package install required — just URLs.

## Icon identifier format

Icons are identified as \`prefix:name\`, e.g. \`mdi:home\`, \`ph:star\`, \`lucide:check\`.
Always call \`search_iconify\` before writing code to find the correct identifier.

## SVG URL pattern

\`\`\`
https://api.iconify.design/{prefix}/{name}.svg
\`\`\`

Example: \`https://api.iconify.design/mdi/home.svg\`

## Usage — simple display with \`<img>\`

Best for most cases. Fast, no extra fetch needed.

\`\`\`tsx
<img
  src="https://api.iconify.design/mdi/home.svg"
  style={{ width: 64, height: 64 }}
/>
\`\`\`

SVG icons are monochrome (black) by default. To colorize with CSS \`filter\`:

\`\`\`tsx
<img
  src="https://api.iconify.design/mdi/home.svg"
  style={{
    width: 64,
    height: 64,
    filter: "invert(1)",            // white
    // filter: "brightness(0) saturate(100%) invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)" // any color
  }}
/>
\`\`\`

## Usage — colored SVG with \`dangerouslySetInnerHTML\`

For full color control (fill, stroke), fetch the SVG text and inject it:

\`\`\`tsx
import { delayRender, continueRender, useCurrentFrame } from "remotion";
import { useState, useEffect, useRef } from "react";

const ColoredIcon: React.FC<{ iconId: string; color: string; size: number }> = ({ iconId, color, size }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const handle = useRef(delayRender("icon-" + iconId));

  useEffect(() => {
    const [prefix, name] = iconId.split(":");
    fetch(\`https://api.iconify.design/\${prefix}/\${name}.svg\`)
      .then((r) => r.text())
      .then((text) => {
        const colored = text.replace(/(<svg[^>]*)(>)/, \`$1 fill="\${color}" $2\`);
        setSvg(colored);
      })
      .finally(() => continueRender(handle.current));
  }, [iconId, color]);

  if (!svg) return null;
  return (
    <div
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
\`\`\`

## URL parameters (optional)

Append to the SVG URL for server-side color/size:

| Parameter | Example | Effect |
|---|---|---|
| \`color\` | \`?color=%23ff0000\` | Set fill color (URL-encoded hex) |
| \`width\` | \`?width=128\` | Set viewBox width |
| \`height\` | \`?height=128\` | Set viewBox height |

Example: \`https://api.iconify.design/mdi/home.svg?color=%23ffffff&width=128\`

This is the simplest approach — pass color in the URL, use \`<img>\`:

\`\`\`tsx
const iconUrl = \`https://api.iconify.design/mdi/home.svg?color=%23ff6600\`;
<img src={iconUrl} style={{ width: 80, height: 80 }} />
\`\`\`

## Sizing

Use CSS \`width\`/\`height\` on the \`<img>\` element. SVG scales perfectly at any size.

## Workflow

1. Call \`search_iconify\` with a keyword to find icon identifiers (e.g. \`mdi:fire\`, \`ph:star\`)
2. Pick the best match
3. Build the URL: \`https://api.iconify.design/{prefix}/{name}.svg\`
4. Use \`<img src={url} style={{ width, height }} />\` for simple display
5. Append \`?color=%23{hex}\` to the URL for colored icons without extra fetch
`;
