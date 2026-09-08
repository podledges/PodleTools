import type { ImageContent } from "@earendil-works/pi-ai";
import {
  DEFAULT_LABEL,
  parseMarkers,
  type ParsedMarker,
} from "./marker.ts";
import { defaultStagingRoot, readStagedImage } from "./staging.ts";

export type TransformOutcome =
  | { marker: ParsedMarker; status: "attached" }
  | { marker: ParsedMarker; status: "link-only"; reason: string }
  | { marker: ParsedMarker; status: "failed"; reason: string };

export type TransformInput = {
  text: string;
  images?: ImageContent[];
  modelAcceptsImages: boolean;
  stagingRoot?: string;
};

export type TransformResult = {
  text: string;
  images: ImageContent[];
  outcomes: TransformOutcome[];
  attachedCount: number;
  failedCount: number;
  linkOnlyCount: number;
};

function replacementFor(outcome: TransformOutcome): string {
  if (outcome.status === "attached") {
    return `[${outcome.marker.label || DEFAULT_LABEL}]`;
  }
  if (outcome.status === "link-only") {
    return `[${outcome.marker.label || DEFAULT_LABEL} — link only, not attached as image bytes]`;
  }
  return `[${outcome.marker.label || DEFAULT_LABEL} — not attached: ${outcome.reason}]`;
}

export function transformPastedScreenshots(input: TransformInput): TransformResult {
  const markers = parseMarkers(input.text);
  const images: ImageContent[] = [...(input.images ?? [])];
  const outcomes: TransformOutcome[] = [];
  const root = input.stagingRoot ?? defaultStagingRoot();

  let nextText = input.text;
  for (const marker of markers) {
    const read = readStagedImage(marker.path, marker.sha256, root);
    let outcome: TransformOutcome;
    if (!read.ok) {
      outcome = { marker, status: "failed", reason: read.error.message };
    } else if (!input.modelAcceptsImages) {
      outcome = {
        marker,
        status: "link-only",
        reason: "current model does not accept image input",
      };
    } else {
      images.push({
        type: "image",
        data: read.image.bytes.toString("base64"),
        mimeType: read.image.mimeType,
      });
      outcome = { marker, status: "attached" };
    }
    outcomes.push(outcome);
    nextText = nextText.replace(marker.raw, replacementFor(outcome));
  }

  return {
    text: nextText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"),
    images,
    outcomes,
    attachedCount: outcomes.filter((item) => item.status === "attached").length,
    failedCount: outcomes.filter((item) => item.status === "failed").length,
    linkOnlyCount: outcomes.filter((item) => item.status === "link-only").length,
  };
}

export function modelAcceptsImages(model: { input?: readonly string[] } | undefined): boolean {
  return Array.isArray(model?.input) && model.input.includes("image");
}
