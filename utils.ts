import { text, widget } from "mcp-use/server";
import { z } from "zod";
import { build, type Loader, type Plugin } from "esbuild";
import path from "node:path";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as ReactModule from "react";
import * as ReactJsxRuntimeModule from "react/jsx-runtime";
import * as ReactJsxDevRuntimeModule from "react/jsx-dev-runtime";
import * as RemotionModule from "remotion";
import {
  RUNTIME_BUNDLE_GLOBAL,
  RUNTIME_PACKAGE_GLOBAL,
  type VideoProjectData,
} from "./types.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const USER_FILE_NAMESPACE = "user-file";
const SHIM_FILE_NAMESPACE = "runtime-shim";
const SUPPORTED_FILE_EXTENSIONS = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".ogg",
] as const;

const RUNTIME_MODULES: Record<string, Record<string, unknown>> = {
  react: ReactModule as Record<string, unknown>,
  "react/jsx-runtime": ReactJsxRuntimeModule as Record<string, unknown>,
  "react/jsx-dev-runtime": ReactJsxDevRuntimeModule as Record<string, unknown>,
  remotion: RemotionModule as Record<string, unknown>,
};

function createRuntimeShim(moduleName: string, moduleNamespace: Record<string, unknown>): string {
  const namedExports = Object.keys(moduleNamespace)
    .filter((name) => name !== "default" && IDENTIFIER_PATTERN.test(name))
    .sort();

  const exportLines = namedExports.map((name) => `export const ${name} = runtime.${name};`).join("\n");

  return [
    `const modules = globalThis.${RUNTIME_PACKAGE_GLOBAL};`,
    `const runtime = modules?.[${JSON.stringify(moduleName)}];`,
    `if (!runtime) throw new Error(${JSON.stringify(`Missing runtime module: ${moduleName}`)});`,
    "export default runtime.default;",
    exportLines,
    "",
  ].join("\n");
}

const SHIM_MODULE_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(RUNTIME_MODULES).map(([moduleName, moduleNamespace]) => [
    moduleName,
    createRuntimeShim(moduleName, moduleNamespace),
  ])
);

function normalizeVirtualPath(filePath: string): string {
  const unixPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(`/${unixPath}`);
  if (!normalized.startsWith("/")) {
    throw new Error(`Invalid file path: ${filePath}`);
  }
  return normalized;
}

function normalizeFileMap(files: Record<string, string>): Record<string, string> {
  const normalizedFiles: Record<string, string> = {};
  for (const [rawFilePath, contents] of Object.entries(files)) {
    if (typeof contents !== "string") {
      throw new Error(`File \"${rawFilePath}\" must be a string.`);
    }
    normalizedFiles[normalizeVirtualPath(rawFilePath)] = contents;
  }
  return normalizedFiles;
}

function getLoader(filePath: string): Loader {
  const extension = path.posix.extname(filePath).toLowerCase();
  switch (extension) {
    case ".tsx":
      return "tsx";
    case ".ts":
      return "ts";
    case ".jsx":
      return "jsx";
    case ".mjs":
    case ".cjs":
    case ".js":
      return "js";
    case ".json":
      return "json";
    case ".css":
      return "css";
    case ".svg":
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".webp":
    case ".mp4":
    case ".webm":
    case ".mov":
    case ".mp3":
    case ".wav":
    case ".ogg":
      return "dataurl";
    default:
      return "tsx";
  }
}

function resolveVirtualImport(
  importPath: string,
  importer: string,
  files: Record<string, string>
): string | null {
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  const basePath = importPath.startsWith("/")
    ? normalizeVirtualPath(importPath)
    : normalizeVirtualPath(path.posix.resolve(path.posix.dirname(importer), importPath));

  const candidates = new Set<string>();
  const extension = path.posix.extname(basePath);

  if (extension.length > 0) {
    candidates.add(basePath);
  } else {
    candidates.add(basePath);
    for (const candidateExtension of SUPPORTED_FILE_EXTENSIONS) {
      candidates.add(`${basePath}${candidateExtension}`);
      candidates.add(path.posix.join(basePath, `index${candidateExtension}`));
    }
  }

  for (const candidate of candidates) {
    if (candidate in files) {
      return candidate;
    }
  }

  return null;
}

function formatCompileFailure(error: unknown): string {
  const fallback = (error as Error)?.message ?? "Unknown build error.";
  const maybe = error as {
    errors?: Array<{
      text: string;
      location?: {
        file?: string;
        line?: number;
        column?: number;
        lineText?: string;
      } | null;
    }>;
  };

  if (!Array.isArray(maybe.errors) || maybe.errors.length === 0) {
    return fallback;
  }

  const lines = maybe.errors.slice(0, 5).map((err) => {
    const location = err.location;
    if (!location) {
      return err.text;
    }

    const column = typeof location.column === "number" ? location.column + 1 : undefined;
    const at = [location.file, location.line, column].filter(Boolean).join(":");
    const context = location.lineText ? `\n> ${location.lineText.trim()}` : "";
    return `${at} ${err.text}${context}`;
  });

  return lines.join("\n");
}

function addRemotionCompileHints(message: string): string {
  const hints: string[] = [];

  if (message.includes("No matching export") && message.includes("TransitionSeries")) {
    hints.push(
      "Hint: import TransitionSeries from @remotion/transitions, not from remotion."
    );
  }
  if (message.includes("No matching export") && message.includes("fade")) {
    hints.push("Hint: import fade from @remotion/transitions/fade.");
  }
  if (message.toLowerCase().includes("unterminated string literal")) {
    hints.push("Hint: check for missing quote characters in JSX style/object literals.");
  }

  if (!hints.length) {
    return message;
  }
  return `${message}\n\n${hints.join("\n")}`;
}

async function compileProjectBundle(files: Record<string, string>, entryFile: string): Promise<string> {
  const normalizedFiles = normalizeFileMap(files);
  const normalizedEntry = normalizeVirtualPath(entryFile);

  if (!(normalizedEntry in normalizedFiles)) {
    const availableFiles = Object.keys(normalizedFiles).sort().join(", ");
    throw new Error(
      `Entry file \"${normalizedEntry}\" does not exist. Available files: ${availableFiles || "none"}.`
    );
  }

  const virtualProjectPlugin: Plugin = {
    name: "virtual-project",
    setup(buildContext) {
      buildContext.onResolve({ filter: /.*/ }, (args) => {
        if (args.path in SHIM_MODULE_SOURCES) {
          return { path: args.path, namespace: SHIM_FILE_NAMESPACE };
        }

        if (args.path.startsWith(".") || args.path.startsWith("/")) {
          const importer = args.importer && args.importer !== "<stdin>" ? args.importer : normalizedEntry;
          const resolvedFilePath = resolveVirtualImport(args.path, importer, normalizedFiles);
          if (resolvedFilePath) {
            return { path: resolvedFilePath, namespace: USER_FILE_NAMESPACE };
          }

          return {
            errors: [
              {
                text: `Cannot resolve import \"${args.path}\" from \"${importer}\".`,
              },
            ],
          };
        }

        // Allow all bare specifiers and let esbuild resolve from node_modules.
        return;
      });

      buildContext.onLoad({ filter: /.*/, namespace: SHIM_FILE_NAMESPACE }, (args) => {
        return {
          contents: SHIM_MODULE_SOURCES[args.path],
          loader: "js",
          resolveDir: "/",
        };
      });

      buildContext.onLoad({ filter: /.*/, namespace: USER_FILE_NAMESPACE }, (args) => {
        const contents = normalizedFiles[args.path];
        if (typeof contents !== "string") {
          return {
            errors: [{ text: `Could not load file \"${args.path}\".` }],
          };
        }
        return {
          contents,
          loader: getLoader(args.path),
          // Resolve bare imports from project node_modules, not from the virtual path.
          resolveDir: process.cwd(),
        };
      });
    },
  };

  let result;
  try {
    result = await build({
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: ["es2020"],
      globalName: RUNTIME_BUNDLE_GLOBAL,
      jsx: "automatic",
      logLevel: "silent",
      stdin: {
        loader: "ts",
        resolveDir: process.cwd(),
        contents: [
          `import * as entryModule from ${JSON.stringify(normalizedEntry)};`,
          `export default entryModule.default;`,
          `export * from ${JSON.stringify(normalizedEntry)};`,
        ].join("\n"),
      },
      plugins: [virtualProjectPlugin],
    });
  } catch (error) {
    throw new Error(addRemotionCompileHints(formatCompileFailure(error)));
  }

  const output = result.outputFiles[0]?.text;
  if (!output) {
    throw new Error("Compilation produced no JavaScript output.");
  }

  return output;
}

function validatePositiveNumber(name: string, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return `${name} must be a positive number.`;
  }
  return null;
}

export const DEFAULT_META = {
  title: "Untitled",
  compositionId: "Main",
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 150,
};

const ERROR_FALLBACK_BUNDLE = `var ${RUNTIME_BUNDLE_GLOBAL} = { default: function RemotionFallback() { return null; } };`;

export type SessionProjectState = {
  title: string;
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  entryFile: string;
  files: Record<string, string>;
  defaultProps: Record<string, unknown>;
  inputProps: Record<string, unknown>;
};

export type ProjectVideoInput = {
  title: string;
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  entryFile: string;
  files: Record<string, string>;
  defaultProps: Record<string, unknown>;
  inputProps: Record<string, unknown>;
};

const compiledProjects = new Map<string, VideoProjectData>();
const MAX_COMPILED = 250;

// Video storage root — same volume as rendered MP4s
const VIDEOS_DIR = process.env.OUTPUT_DIR
  ? path.join(process.env.OUTPUT_DIR, "videos")
  : "/data-criacoes/videos";

// ─── Video ID generation ─────────────────────────────────────────────────────

export function generateVideoId(): string {
  // 8-char hex — 4 billion possibilities, URL-safe
  return randomUUID().split("-")[0];
}

// ─── Version persistence ──────────────────────────────────────────────────────

export type VideoVersion = SessionProjectState & {
  version: number;
  message: string;
  timestamp: string;
};

export async function saveVideoVersion(
  videoId: string,
  version: number,
  project: SessionProjectState,
  message: string
): Promise<void> {
  try {
    const dir = path.join(VIDEOS_DIR, videoId);
    await mkdir(dir, { recursive: true });
    const data: VideoVersion = { ...project, version, message, timestamp: new Date().toISOString() };
    await writeFile(path.join(dir, `v${version}.json`), JSON.stringify(data), "utf-8");
    await writeFile(path.join(dir, "current.txt"), String(version), "utf-8");
  } catch {
    // Non-fatal — compiled bundle and in-memory Map still work
  }
}

export async function getLatestVersionNumber(videoId: string): Promise<number | null> {
  try {
    const raw = await readFile(path.join(VIDEOS_DIR, videoId, "current.txt"), "utf-8");
    const n = parseInt(raw.trim(), 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export async function loadVideoVersion(videoId: string, version?: number): Promise<VideoVersion | null> {
  try {
    const v = version ?? (await getLatestVersionNumber(videoId));
    if (!v) return null;
    const raw = await readFile(path.join(VIDEOS_DIR, videoId, `v${v}.json`), "utf-8");
    return JSON.parse(raw) as VideoVersion;
  } catch {
    return null;
  }
}

function buildProjectData(
  overrides: Partial<VideoProjectData["meta"]> & { title?: string },
  config: {
    bundle?: string;
    defaultProps?: Record<string, unknown>;
    inputProps?: Record<string, unknown>;
    compileError?: string;
  }
): VideoProjectData {
  return {
    meta: {
      title: overrides.title ?? DEFAULT_META.title,
      compositionId: overrides.compositionId ?? DEFAULT_META.compositionId,
      width: overrides.width ?? DEFAULT_META.width,
      height: overrides.height ?? DEFAULT_META.height,
      fps: overrides.fps ?? DEFAULT_META.fps,
      durationInFrames: overrides.durationInFrames ?? DEFAULT_META.durationInFrames,
    },
    bundle: config.bundle ?? ERROR_FALLBACK_BUNDLE,
    defaultProps: config.defaultProps ?? {},
    inputProps: config.inputProps ?? {},
    compileError: config.compileError,
  };
}

export function formatZodIssues(error: z.ZodError): string {
  if (!error.issues.length) {
    return "Invalid input.";
  }

  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

function cloneFileMap(value: Record<string, string>): Record<string, string> {
  return { ...value };
}

function rememberCompiledProject(videoId: string, data: VideoProjectData): void {
  if (!videoId) return;
  if (compiledProjects.has(videoId)) compiledProjects.delete(videoId);
  compiledProjects.set(videoId, data);
  while (compiledProjects.size > MAX_COMPILED) {
    const oldest = compiledProjects.keys().next().value;
    if (typeof oldest === "string") compiledProjects.delete(oldest);
    else break;
  }
}

export function getCompiledProject(videoId: string): VideoProjectData | null {
  return compiledProjects.get(videoId) ?? null;
}

export function failProject(
  message: string,
  fallbackMeta?: Partial<VideoProjectData["meta"]>,
  fallbackProps?: {
    defaultProps?: Record<string, unknown>;
    inputProps?: Record<string, unknown>;
  }
) {
  const errorProject = buildProjectData(fallbackMeta ?? {}, {
    compileError: message,
    defaultProps: fallbackProps?.defaultProps,
    inputProps: fallbackProps?.inputProps,
  });

  return widget({
    props: { videoProject: JSON.stringify(errorProject) },
    output: text(`Project error: ${message}`),
  });
}

export async function getSessionProject(sessionId: string): Promise<SessionProjectState | null> {
  // Legacy shim: load latest version from disk if available
  // (sessionId used here as a fallback key; callers should prefer loadVideoVersion)
  return loadSessionFromDiskLegacy(sessionId);
}

async function loadSessionFromDiskLegacy(key: string): Promise<SessionProjectState | null> {
  // Try the old sessions path for backward compat
  try {
    const filePath = path.join(
      process.env.OUTPUT_DIR ?? "/data-criacoes",
      "sessions",
      `${key}.json`
    );
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as SessionProjectState;
  } catch {
    return null;
  }
}

export async function compileAndRespondWithProject(
  parsedInput: ProjectVideoInput,
  videoId: string,
  version: number,
  statusPrefixLines: string[],
  iterateToolName: "create_video" | "update_video"
) {
  const {
    title,
    compositionId,
    width,
    height,
    fps,
    durationInFrames,
    entryFile,
    files,
    defaultProps,
    inputProps,
  } = parsedInput;

  const meta = { title, compositionId, width, height, fps, durationInFrames };

  for (const [fieldName, value] of [
    ["width", width],
    ["height", height],
    ["fps", fps],
    ["durationInFrames", durationInFrames],
  ] as const) {
    const error = validatePositiveNumber(fieldName, value);
    if (error) {
      return failProject(error, meta, { defaultProps, inputProps });
    }
  }

  const currentState: SessionProjectState = {
    title,
    compositionId,
    width,
    height,
    fps,
    durationInFrames,
    entryFile,
    files: cloneFileMap(files),
    defaultProps: cloneRecord(defaultProps),
    inputProps: cloneRecord(inputProps),
  };

  // Persist this version to disk (like a git commit)
  const versionMessage = statusPrefixLines.find((l) => l.startsWith("Version message:"))?.replace("Version message: ", "") ?? `v${version}`;
  await saveVideoVersion(videoId, version, currentState, versionMessage);

  let bundle: string;
  try {
    bundle = await compileProjectBundle(files, entryFile);
  } catch (error) {
    return failProject(`Project compilation error: ${(error as Error).message}`, meta, {
      defaultProps,
      inputProps,
    });
  }

  const projectData: VideoProjectData = buildProjectData(meta, {
    bundle,
    defaultProps,
    inputProps,
  });

  rememberCompiledProject(videoId, projectData);

  return widget({
    props: { videoProject: JSON.stringify(projectData) },
    output: text(
      [
        ...statusPrefixLines.filter((l) => !l.startsWith("Version message:")),
        `Video ID: ${videoId}  |  Version: v${version}`,
        `Entry: ${entryFile} (${Object.keys(files).length} files).`,
        `${width}x${height}, ${fps}fps, ${durationInFrames} frames (~${(
          durationInFrames / fps
        ).toFixed(1)}s).`,
        `To edit: call update_video with videoId "${videoId}" and only the changed files/metadata.`,
        `To render: call render_video with videoId "${videoId}".`,
      ]
        .filter((line) => line.trim().length > 0)
        .join("\n")
    ),
  });
}
