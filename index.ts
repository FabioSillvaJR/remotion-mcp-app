import { MCPServer, text } from "mcp-use/server";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { RULE_INDEX } from "./rules/index.js";
import { RULE_REACT_CODE } from "./rules/react-code.js";
import { RULE_REMOTION_ANIMATIONS } from "./rules/remotion-animations.js";
import { RULE_REMOTION_TIMING } from "./rules/remotion-timing.js";
import { RULE_REMOTION_SEQUENCING } from "./rules/remotion-sequencing.js";
import { RULE_REMOTION_TRANSITIONS } from "./rules/remotion-transitions.js";
import { RULE_REMOTION_TEXT_ANIMATIONS } from "./rules/remotion-text-animations.js";
import { RULE_REMOTION_TRIMMING } from "./rules/remotion-trimming.js";
import {
  DEFAULT_META,
  compileAndRespondWithProject,
  failProject,
  formatZodIssues,
  getSessionProject,
  getCompiledProject,
} from "./utils.js";
import { renderProject, OUTPUT_DIR } from "./render.js";

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

function baseUrl(): string {
  // BASE_URL takes priority (set this in EasyPanel/Docker to your public domain)
  return (
    process.env.BASE_URL ??
    process.env.MCP_URL ??
    `http://localhost:${port}`
  ).replace(/\/$/, "");
}

function playerUrl(sessionId: string): string {
  return `${baseUrl()}/player/${sessionId}`;
}

const server = new MCPServer({
  name: "remotion-mcp",
  title: "Remotion Video Creator",
  version: "2.0.0",
  description:
    "Create Remotion videos from multi-file React projects with props-first composition design.",
  host: process.env.HOST ?? "0.0.0.0",
  baseUrl: process.env.MCP_URL ?? `http://localhost:${port}`,
});

// --- Rule tools ---

server.tool(
  { name: "read_me", description: "IMPORTANT: Call this FIRST. Returns the guide overview and lists all available rule tools." },
  async () => text(RULE_INDEX)
);

server.tool(
  { name: "rule_react_code", description: "Project code reference: file structure, supported imports, component/props patterns" },
  async () => text(RULE_REACT_CODE)
);

server.tool(
  { name: "rule_remotion_animations", description: "Remotion animations: useCurrentFrame, frame-driven animation fundamentals" },
  async () => text(RULE_REMOTION_ANIMATIONS)
);

server.tool(
  { name: "rule_remotion_timing", description: "Remotion timing: interpolate, spring, Easing, spring configs, delay, duration" },
  async () => text(RULE_REMOTION_TIMING)
);

server.tool(
  { name: "rule_remotion_sequencing", description: "Remotion sequencing: Sequence, delay, nested timing, local frames" },
  async () => text(RULE_REMOTION_SEQUENCING)
);

server.tool(
  { name: "rule_remotion_transitions", description: "Remotion transitions: TransitionSeries, fade, slide, wipe, flip, duration calculation" },
  async () => text(RULE_REMOTION_TRANSITIONS)
);

server.tool(
  { name: "rule_remotion_text_animations", description: "Remotion text: typewriter effect, word highlighting, string slicing" },
  async () => text(RULE_REMOTION_TEXT_ANIMATIONS)
);

server.tool(
  { name: "rule_remotion_trimming", description: "Remotion trimming: cut start/end of animations with negative Sequence from" },
  async () => text(RULE_REMOTION_TRIMMING)
);

// --- Video tool ---

const projectVideoSchema = z.object({
  title: z.string().optional().default(DEFAULT_META.title),
  compositionId: z.string().optional().default(DEFAULT_META.compositionId),
  width: z.number().optional().default(DEFAULT_META.width),
  height: z.number().optional().default(DEFAULT_META.height),
  fps: z.number().optional().default(DEFAULT_META.fps),
  durationInFrames: z.number().optional().default(DEFAULT_META.durationInFrames),
  entryFile: z.string().optional().default("/src/Video.tsx"),
  files: z.record(z.string(), z.string()),
  defaultProps: z.record(z.string(), z.unknown()).optional().default({}),
  inputProps: z.record(z.string(), z.unknown()).optional().default({}),
});

const createVideoSchema = z.object({
  files: z.string().describe(
    'REQUIRED. A JSON string of {path: code} mapping file paths to source code. Example: \'{"\/src\/Video.tsx":"import {AbsoluteFill} from \\"remotion\\";\\nexport default function Video(){return <AbsoluteFill\/>;}"}\'. For edits, only include changed files — unchanged files are kept from the previous call.'
  ),
  entryFile: z.string().optional().describe('Entry file path (default: "/src/Video.tsx"). Must match a key in files.'),
  title: z.string().optional().describe("Title shown in the video player"),
  durationInFrames: z.number().optional().describe("Total duration in frames (default: 150)"),
  fps: z.number().optional().describe("Frames per second (default: 30)"),
  width: z.number().optional().describe("Width in pixels (default: 1920)"),
  height: z.number().optional().describe("Height in pixels (default: 1080)"),
});

server.tool(
  {
    name: "create_video",
    description:
      "Create or update a video. The `files` param is a JSON string (not an object) mapping file paths to source code. " +
      'Pass it as: files: JSON.stringify({"/src/Video.tsx": "...your code..."}). ' +
      "For edits, only include changed files — previous files are preserved automatically.",
    schema: createVideoSchema as any,
    widget: {
      name: "remotion-player",
      invoking: "Compiling project...",
      invoked: "Video ready",
    },
  },
  async (rawParams: z.infer<typeof createVideoSchema>, ctx) => {
    const sessionId = ctx.session?.sessionId ?? "default";

    // Parse files from JSON string
    let files: Record<string, string>;
    try {
      const parsed = JSON.parse(rawParams.files);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return failProject('files must be a JSON object like {"\/src\/Video.tsx": "...code..."}');
      }
      files = parsed as Record<string, string>;
    } catch {
      return failProject('files must be a valid JSON string, e.g. \'{"\/src\/Video.tsx":"...code..."}\'');
    }

    if (Object.keys(files).length === 0) {
      return failProject('files must contain at least one file entry.');
    }

    // Merge with previous session state (if any)
    const previous = getSessionProject(sessionId);
    const mergedFiles = previous
      ? { ...previous.files, ...files }
      : files;

    const project = {
      title: rawParams.title ?? previous?.title,
      compositionId: previous?.compositionId,
      width: rawParams.width ?? previous?.width,
      height: rawParams.height ?? previous?.height,
      fps: rawParams.fps ?? previous?.fps,
      durationInFrames: rawParams.durationInFrames ?? previous?.durationInFrames,
      entryFile: rawParams.entryFile ?? previous?.entryFile,
      files: mergedFiles,
      defaultProps: previous?.defaultProps,
      inputProps: previous?.inputProps,
    };

    const parseResult = projectVideoSchema.safeParse(project);
    if (!parseResult.success) {
      return failProject(`Invalid input: ${formatZodIssues(parseResult.error)}`);
    }

    const statusLines: string[] = [];
    if (previous) {
      statusLines.push("Merged with previous project.");
    }
    statusLines.push(`Player URL: ${playerUrl(sessionId)}`);

    return compileAndRespondWithProject(parseResult.data, sessionId, statusLines, "create_video");
  }
);

// --- update_video tool ---

const updateVideoSchema = z.object({
  files: z.string().optional().describe(
    'A JSON string of {path: code} with only the changed files. Unchanged files are kept automatically from the previous create_video call.'
  ),
  entryFile: z.string().optional().describe('Change the entry file path.'),
  title: z.string().optional().describe("Update the video title."),
  durationInFrames: z.number().optional().describe("Update total duration in frames."),
  fps: z.number().optional().describe("Update frames per second."),
  width: z.number().optional().describe("Update width in pixels."),
  height: z.number().optional().describe("Update height in pixels."),
});

server.tool(
  {
    name: "update_video",
    description:
      "Edit an existing video project without replacing it. " +
      "Send only the files that changed — all other files from the previous call are preserved automatically. " +
      "You can also update metadata (title, fps, durationInFrames, width, height). " +
      "Requires a prior create_video call in the same session.",
    schema: updateVideoSchema as any,
    widget: {
      name: "remotion-player",
      invoking: "Recompiling project...",
      invoked: "Video updated",
    },
  },
  async (rawParams: z.infer<typeof updateVideoSchema>, ctx) => {
    const sessionId = ctx.session?.sessionId ?? "default";

    const previous = getSessionProject(sessionId);
    if (!previous) {
      return failProject("No previous project found in this session. Call create_video first.");
    }

    let updatedFiles: Record<string, string> = {};
    if (rawParams.files) {
      try {
        const parsed = JSON.parse(rawParams.files);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return failProject('files must be a JSON object like {"\/src\/Video.tsx": "...code..."}');
        }
        updatedFiles = parsed as Record<string, string>;
      } catch {
        return failProject('files must be a valid JSON string, e.g. \'{"\/src\/Video.tsx":"...code..."}\'');
      }
    }

    const mergedFiles = { ...previous.files, ...updatedFiles };

    const project = {
      title: rawParams.title ?? previous.title,
      compositionId: previous.compositionId,
      width: rawParams.width ?? previous.width,
      height: rawParams.height ?? previous.height,
      fps: rawParams.fps ?? previous.fps,
      durationInFrames: rawParams.durationInFrames ?? previous.durationInFrames,
      entryFile: rawParams.entryFile ?? previous.entryFile,
      files: mergedFiles,
      defaultProps: previous.defaultProps,
      inputProps: previous.inputProps,
    };

    const parseResult = projectVideoSchema.safeParse(project);
    if (!parseResult.success) {
      return failProject(`Invalid input: ${formatZodIssues(parseResult.error)}`);
    }

    const changedCount = Object.keys(updatedFiles).length;
    const statusLines = [
      changedCount > 0
        ? `Updated ${changedCount} file(s). Total: ${Object.keys(mergedFiles).length} file(s).`
        : "Metadata updated (no file changes).",
      `Player URL: ${playerUrl(sessionId)}`,
    ];

    return compileAndRespondWithProject(parseResult.data, sessionId, statusLines, "update_video");
  }
);

// --- render_video tool ---

const renderVideoSchema = z.object({
  sessionId: z.string().optional().describe(
    "Session ID returned by create_video. If omitted, the current session is used."
  ),
});

server.tool(
  {
    name: "render_video",
    description:
      "Render the current video project to an MP4 file saved in the /data-criacoes volume. " +
      "Returns the download URL when complete. Call this after create_video when the user wants a rendered file.",
    schema: renderVideoSchema as any,
  },
  async (rawParams: z.infer<typeof renderVideoSchema>, ctx) => {
    const sid = rawParams.sessionId ?? ctx.session?.sessionId ?? "default";
    const project = getSessionProject(sid);
    if (!project) {
      return text(`No video project found for session "${sid}". Call create_video first.`);
    }
    try {
      const filename = await renderProject(sid, project);
      const downloadUrl = `${baseUrl()}/download/${filename}`;
      return text(
        [
          `Video rendered successfully.`,
          `Download: ${downloadUrl}`,
          `Saved to: ${OUTPUT_DIR}/${filename}`,
        ].join("\n")
      );
    } catch (err) {
      return text(`Render failed: ${(err as Error).message}`);
    }
  }
);

// --- Static routes (registered directly on server.app so mcp-use preserves them) ---

server.app.get("/.well-known/openai-apps-challenge", (c) => {
  return c.text("gP0NHv0ywqzsT3-iJ5is_xR6HysaW9Gbls7TeneGl8M");
});

// Serve the standalone player HTML
server.app.get("/player/:sessionId", async (c) => {
  const playerBundlePath = join(process.cwd(), "dist", "player-bundle.js");
  let bundleJs = "";
  try {
    bundleJs = await readFile(playerBundlePath, "utf-8");
  } catch {
    bundleJs = 'document.getElementById("root").textContent = "Player bundle not built. Run npm run build:player.";';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Remotion Player</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #090909; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${bundleJs}</script>
</body>
</html>`;

  return c.html(html);
});

// Return project data as JSON (used by the player page)
server.app.get("/api/project/:sessionId", (c) => {
  const sid = c.req.param("sessionId");
  const project = getCompiledProject(sid);
  if (!project) {
    return c.json({ error: "Session not found or not yet compiled." }, 404);
  }
  return c.json(project);
});

// Trigger server-side render
server.app.post("/render/:sessionId", async (c) => {
  const sid = c.req.param("sessionId");
  const project = getSessionProject(sid);
  if (!project) {
    return c.json({ error: `No project found for session "${sid}". Call create_video first.` }, 404);
  }
  try {
    const filename = await renderProject(sid, project);
    return c.json({ filename });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Serve rendered video files from /data-criacoes
server.app.get("/download/:filename", async (c) => {
  const filename = c.req.param("filename");
  // Basic path traversal protection
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return c.text("Invalid filename.", 400);
  }
  const filePath = join(OUTPUT_DIR, filename);
  if (!existsSync(filePath)) {
    return c.text("File not found.", 404);
  }
  const data = await readFile(filePath);
  return c.body(data, 200, {
    "Content-Type": "video/mp4",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

await server.listen(port);
