import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { SessionProjectState } from "./utils.js";

export const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/data-criacoes";

const CHROME_PATH =
  process.env.REMOTION_CHROMIUM_PATH ??
  process.env.CHROME_EXECUTABLE_PATH ??
  undefined;

// ─── Render status ────────────────────────────────────────────────────────────

export type RenderStatus =
  | { status: "rendering"; progress: number; startedAt: string }
  | { status: "done"; filename: string; startedAt: string; finishedAt: string }
  | { status: "failed"; error: string; startedAt: string; finishedAt: string };

function statusPath(videoId: string): string {
  return join(OUTPUT_DIR, "videos", videoId, "render-status.json");
}

async function writeStatus(videoId: string, s: RenderStatus): Promise<void> {
  try {
    await mkdir(dirname(statusPath(videoId)), { recursive: true });
    await writeFile(statusPath(videoId), JSON.stringify(s), "utf-8");
  } catch {
    // non-fatal
  }
}

export async function readRenderStatus(videoId: string): Promise<RenderStatus | null> {
  try {
    const raw = await readFile(statusPath(videoId), "utf-8");
    return JSON.parse(raw) as RenderStatus;
  } catch {
    return null;
  }
}

// ─── Start async render (fire-and-forget, returns immediately) ───────────────

export function startRenderProject(
  videoId: string,
  project: SessionProjectState
): void {
  const startedAt = new Date().toISOString();
  writeStatus(videoId, { status: "rendering", progress: 0, startedAt }).catch(() => {});
  runRender(videoId, project, startedAt).catch(() => {});
}

async function runRender(
  videoId: string,
  project: SessionProjectState,
  startedAt: string
): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const tmpDir = join(tmpdir(), `remotion-render-${videoId}-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    for (const [filePath, content] of Object.entries(project.files)) {
      const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
      const fullPath = join(tmpDir, normalized);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    }

    const relativeEntry = project.entryFile.startsWith("/")
      ? "." + project.entryFile
      : "./" + project.entryFile;

    const rootContent = [
      `import { registerRoot, Composition } from "remotion";`,
      `import Main from ${JSON.stringify(relativeEntry)};`,
      `registerRoot(() => (`,
      `  <Composition`,
      `    id=${JSON.stringify(project.compositionId)}`,
      `    component={Main}`,
      `    width={${project.width}}`,
      `    height={${project.height}}`,
      `    fps={${project.fps}}`,
      `    durationInFrames={${project.durationInFrames}}`,
      `  />`,
      `));`,
    ].join("\n");

    const rootFile = join(tmpDir, "remotion-root.tsx");
    await writeFile(rootFile, rootContent, "utf-8");

    const appNodeModules = join(process.cwd(), "node_modules");
    const bundleLocation = await bundle({
      entryPoint: rootFile,
      webpackOverride: (config) => {
        config.resolve = {
          ...config.resolve,
          modules: [appNodeModules, ...((config.resolve?.modules as string[] | undefined) ?? [])],
        };
        return config;
      },
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: project.compositionId,
    });

    const safeTitle = project.title.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
    const filename = `${safeTitle}-${videoId}.mp4`;
    const outputPath = join(OUTPUT_DIR, filename);

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      ...(CHROME_PATH ? { browserExecutable: CHROME_PATH } : {}),
      chromiumOptions: { disableWebSecurity: true, ignoreCertificateErrors: true },
      onProgress: ({ progress }) => {
        writeStatus(videoId, {
          status: "rendering",
          progress: Math.round(progress * 100) / 100,
          startedAt,
        }).catch(() => {});
      },
    });

    await writeStatus(videoId, {
      status: "done",
      filename,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    await writeStatus(videoId, {
      status: "failed",
      error: (err as Error).message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
