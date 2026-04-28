import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { SessionProjectState } from "./utils.js";

export const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/data-criacoes";

const CHROME_PATH =
  process.env.REMOTION_CHROMIUM_PATH ??
  process.env.CHROME_EXECUTABLE_PATH ??
  undefined;

export async function renderProject(
  sessionId: string,
  project: SessionProjectState
): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const tmpDir = join(tmpdir(), `remotion-render-${sessionId}-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    // Write all user source files to disk
    for (const [filePath, content] of Object.entries(project.files)) {
      const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
      const fullPath = join(tmpDir, normalized);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    }

    // Build relative entry path for the root file's import statement
    const relativeEntry = project.entryFile.startsWith("/")
      ? "." + project.entryFile
      : "./" + project.entryFile;

    // Create Remotion root that registers the composition
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

    // Bundle with webpack – resolve node_modules from main app directory
    const appNodeModules = join(process.cwd(), "node_modules");
    const bundleLocation = await bundle({
      entryPoint: rootFile,
      webpackOverride: (config) => {
        config.resolve = {
          ...config.resolve,
          modules: [
            appNodeModules,
            ...((config.resolve?.modules as string[] | undefined) ?? []),
          ],
        };
        return config;
      },
    });

    // Select the registered composition
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: project.compositionId,
    });

    // Render to /data-criacoes
    const safeTitle = project.title.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
    const filename = `${safeTitle}-${Date.now()}.mp4`;
    const outputPath = join(OUTPUT_DIR, filename);

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      ...(CHROME_PATH ? { browserExecutable: CHROME_PATH } : {}),
      chromiumOptions: {
        disableWebSecurity: true,
        ignoreCertificateErrors: true,
      },
    });

    return filename;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
