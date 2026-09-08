import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { captureCurrentClipboard } from "./capture.ts";
import {
  INCLUDED_WIDGET,
  LINK_ONLY_WIDGET,
  formatMarker,
  parseMarkers,
  STAGED_WIDGET,
} from "./marker.ts";
import { modelAcceptsImages, transformPastedScreenshots } from "./transform.ts";

export const SHORTCUT = "alt+v";
export const WIDGET_ID = "paste-linker";
export const STATUS_ID = "paste-linker";

type SubmitKind = "included" | "link-only";

let unsubscribeInput: (() => void) | undefined;
let lastSubmit: SubmitKind | null = null;

function setWidget(ctx: ExtensionContext, lines: string[] | undefined): void {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_ID, lines);
}

function setStatus(ctx: ExtensionContext, text: string | undefined): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(STATUS_ID, text);
}

export function refreshFromEditor(ctx: ExtensionContext): void {
  if (!ctx.hasUI || typeof ctx.ui.getEditorText !== "function") return;
  const text = ctx.ui.getEditorText() ?? "";
  const markers = parseMarkers(text);
  if (markers.length > 0) {
    lastSubmit = null;
    const extra = modelAcceptsImages(ctx.model)
      ? []
      : ["Current model does not accept images; submit will stay link-only."];
    const lines = [
      markers.length === 1
        ? STAGED_WIDGET
        : `${STAGED_WIDGET} (${markers.length} screenshots)`,
      ...extra,
    ];
    setWidget(ctx, lines);
    setStatus(ctx, STAGED_WIDGET);
    return;
  }
  if (lastSubmit === "included") {
    setWidget(ctx, [INCLUDED_WIDGET]);
    setStatus(ctx, INCLUDED_WIDGET);
    return;
  }
  if (lastSubmit === "link-only") {
    setWidget(ctx, [LINK_ONLY_WIDGET]);
    setStatus(ctx, LINK_ONLY_WIDGET);
    return;
  }
  setWidget(ctx, undefined);
  setStatus(ctx, undefined);
}

function insertMarker(ctx: ExtensionContext, marker: string): void {
  if (!ctx.hasUI) return;
  if (typeof ctx.ui.pasteToEditor === "function") {
    ctx.ui.pasteToEditor(`${marker}\n`);
    return;
  }
  if (typeof ctx.ui.setEditorText === "function") {
    const current = ctx.ui.getEditorText?.() ?? "";
    ctx.ui.setEditorText(current ? `${current}\n${marker}` : marker);
  }
}

export async function stageClipboardScreenshot(
  ctx: ExtensionContext,
  options?: Parameters<typeof captureCurrentClipboard>[0],
): Promise<void> {
  try {
    const { capture } = await captureCurrentClipboard(options);
    const marker = formatMarker(
      capture.kind,
      capture.sha256,
      capture.path,
      capture.label,
    );
    insertMarker(ctx, marker);
    refreshFromEditor(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (ctx.hasUI) {
      ctx.ui.notify(message, "warning");
    }
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerShortcut(SHORTCUT, {
    description: "Stage current clipboard screenshot (not sent until submit)",
    handler: async (ctx) => {
      await stageClipboardScreenshot(ctx);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    lastSubmit = null;
    unsubscribeInput?.();
    if (ctx.hasUI && typeof ctx.ui.onTerminalInput === "function") {
      unsubscribeInput = ctx.ui.onTerminalInput(() => {
        refreshFromEditor(ctx);
        return undefined;
      });
    }
    refreshFromEditor(ctx);
  });

  pi.on("session_shutdown", () => {
    unsubscribeInput?.();
    unsubscribeInput = undefined;
    lastSubmit = null;
  });

  pi.on("model_select", (_event, ctx) => {
    refreshFromEditor(ctx);
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" };
    }

    const markers = parseMarkers(event.text);
    if (markers.length === 0) {
      if (lastSubmit === null) {
        refreshFromEditor(ctx);
      }
      return { action: "continue" };
    }

    const result = transformPastedScreenshots({
      text: event.text,
      images: event.images,
      modelAcceptsImages: modelAcceptsImages(ctx.model),
    });

    for (const outcome of result.outcomes) {
      if (outcome.status === "failed" && ctx.hasUI) {
        ctx.ui.notify(outcome.reason, "warning");
      }
    }

    if (result.attachedCount > 0) {
      lastSubmit = "included";
      setWidget(ctx, [INCLUDED_WIDGET]);
      setStatus(ctx, INCLUDED_WIDGET);
    } else if (result.linkOnlyCount > 0 || result.failedCount > 0) {
      lastSubmit = "link-only";
      setWidget(ctx, [LINK_ONLY_WIDGET]);
      setStatus(ctx, LINK_ONLY_WIDGET);
    }

    return {
      action: "transform",
      text: result.text,
      images: result.images,
    };
  });
}
