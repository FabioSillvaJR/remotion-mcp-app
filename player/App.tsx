import React, {
  useState,
  useEffect,
  useMemo,
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Player } from "@remotion/player";
import * as ReactModule from "react";
import * as ReactJsxRuntimeModule from "react/jsx-runtime";
import * as ReactJsxDevRuntimeModule from "react/jsx-dev-runtime";
import * as RemotionModule from "remotion";
import type { VideoProjectData } from "../types";
import { RUNTIME_BUNDLE_GLOBAL, RUNTIME_PACKAGE_GLOBAL } from "../types";

// ---------------------------------------------------------------------------
// Bootstrap runtime packages so the video bundle can resolve its imports
// ---------------------------------------------------------------------------

const runtimePackages: Record<string, Record<string, unknown>> = {
  react: ReactModule as Record<string, unknown>,
  "react/jsx-runtime": ReactJsxRuntimeModule as Record<string, unknown>,
  "react/jsx-dev-runtime": ReactJsxDevRuntimeModule as Record<string, unknown>,
  remotion: RemotionModule as Record<string, unknown>,
};
(globalThis as Record<string, unknown>)[RUNTIME_PACKAGE_GLOBAL] = runtimePackages;

// ---------------------------------------------------------------------------
// Bundle evaluation
// ---------------------------------------------------------------------------

function compileBundle(
  bundleCode: string
): { component: React.ComponentType<Record<string, unknown>> } | { error: string } {
  try {
    const fn = new Function(
      `${bundleCode}\nreturn typeof ${RUNTIME_BUNDLE_GLOBAL} !== "undefined" ? ${RUNTIME_BUNDLE_GLOBAL} : null;`
    );
    const exports = fn() as { default?: unknown } | null;
    if (!exports || typeof exports !== "object") {
      return { error: "Bundle did not return exports." };
    }
    if (typeof exports.default !== "function") {
      return { error: "Bundle must export a default React component." };
    }
    return { component: exports.default as React.ComponentType<Record<string, unknown>> };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[player] runtime error:", err.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={s.errorBox}>
          <strong style={{ display: "block", marginBottom: 6 }}>Player Error</strong>
          <pre style={s.errorPre}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionId(): string {
  const match = window.location.pathname.match(/\/player\/([^/?#]+)/);
  return match?.[1] ?? "";
}

type RenderResult = { filename?: string; error?: string };

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [project, setProject] = useState<VideoProjectData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);

  const sessionId = useMemo(getSessionId, []);

  useEffect(() => {
    if (!sessionId) {
      setLoadError("Missing session ID in URL.");
      return;
    }
    fetch(`/api/project/${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        return r.json() as Promise<VideoProjectData>;
      })
      .then((data) => setProject(data))
      .catch((e: Error) => setLoadError(e.message));
  }, [sessionId]);

  const compiled = useMemo(() => {
    if (!project || project.compileError) return null;
    return compileBundle(project.bundle);
  }, [project]);

  async function handleRender() {
    if (!sessionId || rendering) return;
    setRendering(true);
    setRenderResult(null);
    try {
      const res = await fetch(`/render/${sessionId}`, { method: "POST" });
      const data = (await res.json()) as RenderResult;
      setRenderResult(data);
    } catch (e) {
      setRenderResult({ error: (e as Error).message });
    } finally {
      setRendering(false);
    }
  }

  // ----------- Render states -----------

  if (loadError) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.errorBox}>
            <strong>Failed to load project</strong>
            <p style={{ margin: "6px 0 0", opacity: 0.8 }}>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={s.page}>
        <div style={s.loadingWrap}>
          <div style={s.spinner} />
          <span style={s.loadingText}>Loading player…</span>
        </div>
      </div>
    );
  }

  const { meta, defaultProps, inputProps } = project;
  const mergedProps = { ...defaultProps, ...inputProps };
  const compileError =
    project.compileError ??
    (compiled && "error" in compiled ? compiled.error : null);
  const component =
    compiled && !("error" in compiled) ? compiled.component : null;
  const duration = (meta.durationInFrames / meta.fps).toFixed(1);
  const canRender = !compileError && !rendering;

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>{meta.title}</h1>
            <p style={s.subtitle}>
              {meta.width}×{meta.height} · {meta.fps} fps · {duration}s ·{" "}
              {meta.durationInFrames} frames
            </p>
          </div>

          <button
            onClick={handleRender}
            disabled={!canRender}
            style={{
              ...s.renderBtn,
              opacity: canRender ? 1 : 0.45,
              cursor: canRender ? "pointer" : "not-allowed",
            }}
          >
            {rendering ? (
              <>
                <span style={s.spinnerSmall} />
                Rendering…
              </>
            ) : (
              "▶ Render Video"
            )}
          </button>
        </div>

        {/* ── Render result banner ── */}
        {renderResult && (
          <div
            style={renderResult.error ? s.errorBanner : s.successBanner}
          >
            {renderResult.error ? (
              `Render failed: ${renderResult.error}`
            ) : (
              <>
                Video rendered!{" "}
                <a
                  href={`/download/${renderResult.filename}`}
                  download
                  style={{ color: "#a78bfa", fontWeight: 600 }}
                >
                  Download MP4
                </a>
              </>
            )}
          </div>
        )}

        {/* ── Player ── */}
        <div style={s.playerWrap}>
          {compileError ? (
            <div style={{ ...s.errorBox, borderRadius: 0 }}>
              <strong style={{ display: "block", marginBottom: 8 }}>
                Compilation Error
              </strong>
              <pre style={s.errorPre}>{compileError}</pre>
            </div>
          ) : component ? (
            <ErrorBoundary>
              <Player
                component={component as React.ComponentType}
                compositionWidth={meta.width}
                compositionHeight={meta.height}
                fps={meta.fps}
                durationInFrames={meta.durationInFrames}
                inputProps={mergedProps}
                style={{ width: "100%", display: "block" }}
                controls
                loop
              />
            </ErrorBoundary>
          ) : (
            <div style={s.loadingWrap}>
              <div style={s.spinner} />
              <span style={s.loadingText}>Loading composition…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#090909",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "32px 16px 64px",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: 1200,
    background: "#111",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #222",
    boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "20px 24px",
    borderBottom: "1px solid #1e1e1e",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#f5f5f5",
    lineHeight: 1.3,
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "#555",
    fontVariantNumeric: "tabular-nums",
  },
  playerWrap: {
    background: "#000",
    width: "100%",
  },
  renderBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 20px",
    background: "#6d28d9",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
    transition: "opacity 0.15s",
    fontFamily: "inherit",
  },
  spinnerSmall: {
    display: "inline-block",
    width: 11,
    height: 11,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    flexShrink: 0,
  },
  errorBanner: {
    margin: "16px 24px 0",
    padding: "12px 16px",
    background: "#2d1515",
    border: "1px solid #5a2020",
    borderRadius: 8,
    color: "#f87171",
    fontSize: 13,
  },
  successBanner: {
    margin: "16px 24px 0",
    padding: "12px 16px",
    background: "#0f2d1a",
    border: "1px solid #1a5c30",
    borderRadius: 8,
    color: "#4ade80",
    fontSize: 13,
  },
  errorBox: {
    padding: "16px 24px",
    background: "#1a0a0a",
    color: "#f87171",
    fontSize: 13,
  },
  errorPre: {
    margin: 0,
    fontSize: 11,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    opacity: 0.85,
    lineHeight: 1.6,
  },
  loadingWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "60px 24px",
  },
  spinner: {
    width: 20,
    height: 20,
    border: "2px solid #333",
    borderTopColor: "#6d28d9",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    flexShrink: 0,
  },
  loadingText: {
    color: "#555",
    fontSize: 14,
  },
};
