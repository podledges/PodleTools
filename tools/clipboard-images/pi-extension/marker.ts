export const MARKER_VERSION = "pl1";
export const DEFAULT_LABEL = "Screenshot Pasted";
export const STAGED_WIDGET =
  "Screenshot staged — not sent until you submit";
export const INCLUDED_WIDGET = "Screenshot included with submission";
export const LINK_ONLY_WIDGET =
  "Staged as link — not sent as image bytes";

const MARKER_RE =
  /#«pl1:([A-Za-z0-9_-]+):([a-fA-F0-9]{64}):([^»]+)»(?: ([^\r\n]+))?/g;

export type PasteKind = "image";

export type ParsedMarker = {
  kind: PasteKind;
  sha256: string;
  path: string;
  label: string;
  raw: string;
};

function assertSafeText(value: string, what: string): void {
  if (/[\r\n\x1b]/.test(value)) {
    throw new Error(`${what} contains a forbidden control character`);
  }
}

export function isCommentSafeMarkerLine(line: string): boolean {
  return (
    line.startsWith("#") &&
    !/[\r\n\x1b]/.test(line) &&
    !/[;|&`$()]/.test(line.slice(1).split("«")[0] ?? "")
  );
}

export function formatMarker(
  kind: PasteKind,
  sha256: string,
  path: string,
  label = DEFAULT_LABEL,
): string {
  if (kind !== "image") {
    throw new Error(`unsupported paste kind: ${kind}`);
  }
  if (!/^[a-fA-F0-9]{64}$/.test(sha256)) {
    throw new Error("sha256 must be 64 hex characters");
  }
  if (!path.startsWith("/")) {
    throw new Error("path must be an absolute WSL path");
  }
  assertSafeText(path, "path");
  assertSafeText(label, "label");
  const line = `#«pl1:${kind}:${sha256.toLowerCase()}:${encodeURIComponent(path)}» ${label}`;
  assertSafeText(line, "marker");
  if (!isCommentSafeMarkerLine(line)) {
    throw new Error("marker is not comment-safe");
  }
  return line;
}

export function parseMarkers(text: string): ParsedMarker[] {
  const found: ParsedMarker[] = [];
  const re = new RegExp(MARKER_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const kind = match[1];
    const sha256 = match[2]?.toLowerCase();
    const encodedPath = match[3];
    const label = (match[4] || DEFAULT_LABEL).trim();
    if (kind !== "image" || !sha256 || !encodedPath) continue;
    let path: string;
    try {
      path = decodeURIComponent(encodedPath);
    } catch {
      continue;
    }
    if (!path.startsWith("/")) continue;
    if (/[\r\n\x1b]/.test(path) || /[\r\n\x1b]/.test(label)) continue;
    found.push({
      kind,
      sha256,
      path,
      label,
      raw: match[0],
    });
  }
  return found;
}

export function stripMarkers(text: string, replacementFor: (marker: ParsedMarker) => string): string {
  const markers = parseMarkers(text);
  let next = text;
  for (const marker of markers) {
    next = next.replace(marker.raw, replacementFor(marker));
  }
  return next.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
