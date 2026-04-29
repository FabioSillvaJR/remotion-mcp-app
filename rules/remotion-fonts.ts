export const RULE_REMOTION_FONTS = `# Remotion Fonts — Google Fonts via @remotion/google-fonts

Use \`@remotion/google-fonts\` to load Google Fonts reliably during rendering.
Each font is its own sub-path import. The \`loadFont()\` call handles delayRender/continueRender automatically.

## Available fonts (pre-installed)

| Font                | Import path                                      | Best for           |
|---------------------|--------------------------------------------------|--------------------|
| Bebas Neue          | \`@remotion/google-fonts/BebasNeue\`               | Titles, Impact     |
| Anton               | \`@remotion/google-fonts/Anton\`                   | Bold headlines     |
| Montserrat          | \`@remotion/google-fonts/Montserrat\`              | Modern body/titles |
| League Spartan      | \`@remotion/google-fonts/LeagueSpartan\`           | Geometric bold     |
| Luckiest Guy        | \`@remotion/google-fonts/LuckiestGuy\`             | Fun/playful        |
| Archivo Black       | \`@remotion/google-fonts/ArchivoBlack\`            | Display/poster     |
| Poppins             | \`@remotion/google-fonts/Poppins\`                 | Clean UI text      |
| Inter               | \`@remotion/google-fonts/Inter\`                   | Tech/modern UI     |
| Roboto              | \`@remotion/google-fonts/Roboto\`                  | Material/body      |

**Impact** is a system font — no import needed, just use \`fontFamily: "Impact"\` directly.

## Basic usage — single font

\`\`\`tsx
import { loadFont } from "@remotion/google-fonts/BebasNeue";
import { AbsoluteFill } from "remotion";

const { fontFamily } = loadFont();

export default function Video() {
  return (
    <AbsoluteFill style={{ background: "#111", justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily, fontSize: 120, color: "#fff", letterSpacing: 8 }}>
        BEBAS NEUE
      </div>
    </AbsoluteFill>
  );
}
\`\`\`

## Usage with specific weight (e.g. Montserrat ExtraBold = weight 800)

\`\`\`tsx
import { loadFont } from "@remotion/google-fonts/Montserrat";
import { AbsoluteFill } from "remotion";

const { fontFamily } = loadFont("normal", { weights: ["800"] });

export default function Video() {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a", justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily, fontSize: 96, fontWeight: 800, color: "#fff" }}>
        Montserrat ExtraBold
      </div>
    </AbsoluteFill>
  );
}
\`\`\`

## Usage with multiple fonts in the same component

\`\`\`tsx
import { loadFont as loadBebas }     from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadPoppins }   from "@remotion/google-fonts/Poppins";
import { AbsoluteFill } from "remotion";

const { fontFamily: bebas }   = loadBebas();
const { fontFamily: poppins } = loadPoppins("normal", { weights: ["400", "700"] });

export default function Video() {
  return (
    <AbsoluteFill style={{ background: "#0d0d0d", flexDirection: "column",
                           justifyContent: "center", alignItems: "center", gap: 16 }}>
      <div style={{ fontFamily: bebas, fontSize: 100, color: "#fff", letterSpacing: 6 }}>
        HEADLINE
      </div>
      <div style={{ fontFamily: poppins, fontSize: 28, fontWeight: 400, color: "#aaa" }}>
        Subtitle text in Poppins
      </div>
    </AbsoluteFill>
  );
}
\`\`\`

## loadFont signature

\`\`\`ts
loadFont(
  style?: "normal" | "italic",           // default: "normal"
  options?: {
    weights?: string[];                  // e.g. ["400", "700", "900"]
    subsets?: string[];                  // e.g. ["latin", "latin-ext"]
    document?: Document;
  }
): { fontFamily: string }
\`\`\`

## Notes
- Call \`loadFont()\` at module level (outside the component), not inside hooks or render
- \`fontFamily\` is a CSS string ready to use in \`style\` props — no extra quotes needed
- Fonts with only one weight (Bebas Neue, Anton, Archivo Black, Luckiest Guy) don't need a \`weights\` option
- For Roboto Bold use: \`loadFont("normal", { weights: ["700"] })\`
- Impact needs no import: \`style={{ fontFamily: "Impact, Haettenschweiler, sans-serif" }}\`
`;
