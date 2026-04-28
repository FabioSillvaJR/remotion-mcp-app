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
  getCompiledProject,
  generateVideoId,
  loadVideoVersion,
  getLatestVersionNumber,
} from "./utils.js";
import { startRenderProject, readRenderStatus, OUTPUT_DIR } from "./render.js";

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

function baseUrl(): string {
  // BASE_URL takes priority (set this in EasyPanel/Docker to your public domain)
  return (
    process.env.BASE_URL ??
    process.env.MCP_URL ??
    `http://localhost:${port}`
  ).replace(/\/$/, "");
}

function playerUrl(videoId: string): string {
  return `${baseUrl()}/player/${videoId}`;
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

// --- Video tool schemas ---

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

// --- create_video ---

const createVideoSchema = z.object({
  files: z.string().describe(
    'REQUIRED. A JSON string mapping file paths to source code. Example: \'{"\/src\/Video.tsx":"...code..."}\''
  ),
  entryFile: z.string().optional().describe('Entry file path (default: "/src/Video.tsx").'),
  title: z.string().optional().describe("Video title shown in the player."),
  durationInFrames: z.number().optional().describe("Total duration in frames (default: 150)."),
  fps: z.number().optional().describe("Frames per second (default: 30)."),
  width: z.number().optional().describe("Width in pixels (default: 1920)."),
  height: z.number().optional().describe("Height in pixels (default: 1080)."),
});

server.tool(
  {
    name: "create_video",
    description:
      "Create a new video project. Returns a unique videoId that you MUST save â€” it is required for update_video, get_video_code, and render_video. " +
      "The `files` param is a JSON string (not an object) mapping file paths to source code.",
    schema: createVideoSchema as any,
    widget: {
      name: "remotion-player",
      invoking: "Compiling project...",
      invoked: "Video ready",
    },
  },
  async (rawParams: z.infer<typeof createVideoSchema>) => {
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
      return failProject("files must contain at least one file entry.");
    }

    const project = {
      title: rawParams.title,
      width: rawParams.width,
      height: rawParams.height,
      fps: rawParams.fps,
      durationInFrames: rawParams.durationInFrames,
      entryFile: rawParams.entryFile,
      files,
    };

    const parseResult = projectVideoSchema.safeParse(project);
    if (!parseResult.success) {
      return failProject(`Invalid input: ${formatZodIssues(parseResult.error)}`);
    }

    const videoId = generateVideoId();
    const version = 1;

    return compileAndRespondWithProject(
      parseResult.data,
      videoId,
      version,
      [`Player URL: ${playerUrl(videoId)}`],
      "create_video"
    );
  }
);

// --- update_video ---

const updateVideoSchema = z.object({
  videoId: z.string().describe("REQUIRED. The videoId returned by create_video."),
  message: z.string().optional().describe("Short description of this change (like a commit message)."),
  files: z.string().optional().describe(
    "A JSON string with ONLY the changed files. Unchanged files are kept automatically."
  ),
  entryFile: z.string().optional().describe("Change the entry file path."),
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
      "Edit an existing video. Requires the videoId returned by create_video. " +
      "Send only the files that changed â€” all other files are preserved automatically. " +
      "Each call creates a new version (like a git commit). " +
      "Include a 'message' describing what changed.",
    schema: updateVideoSchema as any,
    widget: {
      name: "remotion-player",
      invoking: "Recompiling project...",
      invoked: "Video updated",
    },
  },
  async (rawParams: z.infer<typeof updateVideoSchema>) => {
    const { videoId } = rawParams;

    const latestVersion = await getLatestVersionNumber(videoId);
    const previous = latestVersion ? await loadVideoVersion(videoId, latestVersion) : null;

    if (!previous) {
      return failProject(
        `No video found with ID "${videoId}". Call create_video first and save the returned videoId.`
      );
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
    const newVersion = previous.version + 1;

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
        ? `Changed ${changedCount} file(s). Total: ${Object.keys(mergedFiles).length} file(s).`
        : "Metadata updated (no file changes).",
      `Player URL: ${playerUrl(videoId)}`,
      `Version message: ${rawParams.message ?? `v${newVersion}`}`,
    ];

    return compileAndRespondWithProject(parseResult.data, videoId, newVersion, statusLines, "update_video");
  }
);

// --- get_video_code ---

const getVideoCodeSchema = z.object({
  videoId: z.string().describe("The videoId returned by create_video."),
  version: z.number().optional().describe("Specific version number. Omit to get the latest."),
});

server.tool(
  {
    name: "get_video_code",
    description:
      "Returns the full source code and metadata of a video project. " +
      "Use before update_video to inspect current state. " +
      "Optionally specify a version to retrieve an older snapshot.",
    schema: getVideoCodeSchema as any,
  },
  async (rawParams: z.infer<typeof getVideoCodeSchema>) => {
    const { videoId, version } = rawParams;
    const project = await loadVideoVersion(videoId, version);

    if (!project) {
      return text(
        `No video found with ID "${videoId}"${version ? ` at version ${version}` : ""}. Call create_video first.`
      );
    }

    const filesSummary = Object.entries(project.files)
      .map(([p, code]) => `--- ${p} ---\n${code}`)
      .join("\n\n");

    return text(
      [
        `Video ID: ${videoId}`,
        `Version: v${project.version}  |  ${project.message}  |  ${project.timestamp}`,
        `Title: ${project.title}`,
        `Entry file: ${project.entryFile}`,
        `Resolution: ${project.width}Ã—${project.height}`,
        `FPS: ${project.fps}`,
        `Duration: ${project.durationInFrames} frames (${(project.durationInFrames / project.fps).toFixed(2)}s)`,
        `Files (${Object.keys(project.files).length}):`,
        "",
        filesSummary,
      ].join("\n")
    );
  }
);

// --- render_video ---

const renderVideoSchema = z.object({
  videoId: z.string().describe("The videoId returned by create_video."),
});

server.tool(
  {
    name: "render_video",
    description:
      "Start rendering a video to MP4. Returns immediately — rendering runs in the background. " +
      "Returns a status URL (/video/<videoId>) where the user can track progress and download the file when done.",
    schema: renderVideoSchema as any,
  },
  async (rawParams: z.infer<typeof renderVideoSchema>) => {
    const { videoId } = rawParams;
    const project = await loadVideoVersion(videoId);

    if (!project) {
      return text(`No video found with ID "${videoId}". Call create_video first.`);
    }

    startRenderProject(videoId, project);

    const statusUrl = `${baseUrl()}/video/${videoId}`;
    return text(
      [
        `Render started for video "${project.title}".`,
        `Status & download: ${statusUrl}`,
        `The user can open this URL to track progress and download the MP4 when ready.`,
      ].join("\n")
    );
  }
);

// --- Static routes (registered directly on server.app so mcp-use preserves them) ---

server.app.get("/.well-known/openai-apps-challenge", (c) => {
  return c.text("gP0NHv0ywqzsT3-iJ5is_xR6HysaW9Gbls7TeneGl8M");
});

// Serve the standalone player HTML
server.app.get("/player/:videoId", async (c) => {
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
server.app.get("/api/project/:videoId", async (c) => {
  const vid = c.req.param("videoId");
  const compiled = getCompiledProject(vid);
  if (compiled) return c.json(compiled);
  return c.json({ error: "Project not found or not yet compiled." }, 404);
});

// /video/:videoId — render status page + binary download when done
server.app.get("/video/:videoId", async (c) => {
  const vid = c.req.param("videoId");

  // Validate: no path traversal
  if (!vid || vid.includes("..") || vid.includes("/") || vid.includes("\\")) {
    return c.text("Invalid videoId.", 400);
  }

  const status = await readRenderStatus(vid);

  // JSON API if client requests it
  const accept = c.req.header("accept") ?? "";
  if (accept.includes("application/json")) {
    if (!status) return c.json({ status: "not_started" });
    return c.json(status);
  }

  // HTML status page
  const progressPct = status?.status === "rendering" ? Math.round(status.progress * 100) : null;
  const isDone = status?.status === "done";
  const isFailed = status?.status === "failed";
  const videoUrl = isDone ? `/video/${vid}/download` : null;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Render — ${vid}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d0d; color: #e8e8e8; font-family: system-ui, sans-serif;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; gap: 24px; padding: 32px; }
    h1 { font-size: 1.4rem; font-weight: 600; }
    .badge { display: inline-block; padding: 4px 14px; border-radius: 99px; font-size: .85rem; font-weight: 600; }
    .badge.rendering { background: #2a3a8a; color: #aac0ff; }
    .badge.done      { background: #1a4a2a; color: #7dffa0; }
    .badge.failed    { background: #4a1a1a; color: #ff9090; }
    .bar-wrap { width: 320px; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
    .bar      { height: 100%; background: #5b8cff; border-radius: 4px;
                transition: width .6s ease; width: ${progressPct ?? 0}%; }
    #pct-label { font-size: .9rem; color: #aac0ff; }
    video { max-width: min(860px, 100%); border-radius: 8px; background: #000; }
    a.dl { display: inline-block; padding: 12px 32px; background: #5b8cff; color: #fff;
           border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 1rem; }
    a.dl:hover { background: #3a6ae8; }
    .err { color: #ff9090; font-size: .9rem; max-width: 480px; text-align: center; }
    .note { color: #555; font-size: .8rem; }
  </style>
</head>
<body>
  <h1>Video Render</h1>
  <span class="badge ${status?.status ?? "rendering"}">
    ${isDone ? "Done" : isFailed ? "Failed" : `Rendering… ${progressPct ?? 0}%`}
  </span>
  ${!isDone && !isFailed ? `<div class="bar-wrap"><div class="bar" id="progress-bar"></div></div><span id="pct-label">${progressPct ?? 0}%</span>` : ""}
  ${isDone && videoUrl ? `
    <video controls autoplay>
      <source src="${videoUrl}" type="video/mp4"/>
    </video>
    <a class="dl" href="${videoUrl}" download>Download MP4</a>` : ""}
  ${isFailed ? `<p class="err">${(status as { error: string }).error}</p>` : ""}
  ${!isDone && !isFailed ? `<p class="note" id="poll-note">Checking progress…</p>` : ""}
  <p class="note">Video ID: ${vid}</p>
</body>
<script>
(function() {
  var isDone = ${JSON.stringify(isDone)};
  var isFailed = ${JSON.stringify(isFailed)};
  if (isDone || isFailed) return;
  var videoId = ${JSON.stringify(vid)};
  var interval = setInterval(function() {
    fetch('/video/' + videoId, { headers: { 'Accept': 'application/json' } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.status === 'done') {
          clearInterval(interval);
          window.location.reload();
        } else if (data.status === 'failed') {
          clearInterval(interval);
          window.location.reload();
        } else if (data.status === 'rendering') {
          var pct = Math.round((data.progress || 0) * 100);
          var bar = document.getElementById('progress-bar');
          var lbl = document.getElementById('pct-label');
          var badge = document.querySelector('.badge');
          if (bar) bar.style.width = pct + '%';
          if (lbl) lbl.textContent = pct + '%';
          if (badge) badge.textContent = 'Rendering… ' + pct + '%';
          var note = document.getElementById('poll-note');
          if (note) note.textContent = 'Last checked: ' + new Date().toLocaleTimeString();
        }
      })
      .catch(function() {});
  }, 2000);
})();
</script>
</html>`;

  return c.html(html, isDone ? 200 : isFailed ? 500 : 202);
});

// /video/:videoId/download — serve MP4 binary directly
server.app.get("/video/:videoId/download", async (c) => {
  const vid = c.req.param("videoId");
  if (!vid || vid.includes("..") || vid.includes("/") || vid.includes("\\")) {
    return c.text("Invalid videoId.", 400);
  }
  const status = await readRenderStatus(vid);
  if (status?.status !== "done") {
    return c.text("Video not ready yet.", 404);
  }
  const filePath = join(OUTPUT_DIR, status.filename);
  if (!existsSync(filePath)) {
    return c.text("File not found on disk.", 404);
  }
  const data = await readFile(filePath);
  return new Response(data.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${status.filename}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "no-store",
    },
  });
});

// Serve rendered video files (legacy /download/:filename kept for backward compat)
server.app.get("/download/:filename", async (c) => {
  const filename = c.req.param("filename");
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
