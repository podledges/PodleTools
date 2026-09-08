import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  formatMarker,
  isCommentSafeMarkerLine,
  parseMarkers,
} from "../marker.ts";
import { detectImageMagic, readStagedImage, sha256Hex } from "../staging.ts";
import { transformPastedScreenshots } from "../transform.ts";

const here = dirname(fileURLToPath(import.meta.url));
const extensionFiles = [
  join(here, "..", "index.ts"),
  join(here, "..", "marker.ts"),
  join(here, "..", "staging.ts"),
  join(here, "..", "transform.ts"),
  join(here, "..", "capture-stdout.ts"),
  join(here, "..", "capture.ts"),
];

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function pngHash(): string {
  return createHash("sha256").update(PNG_1X1).digest("hex");
}

test("marker round-trip carries path and hash", () => {
  const path = "/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging/paste-abc.png";
  const sha = pngHash();
  const line = formatMarker("image", sha, path);
  assert.equal(isCommentSafeMarkerLine(line), true);
  assert.match(line, /^#«pl1:image:/);
  assert.doesNotMatch(line, /[\r\n\x1b]/);
  const parsed = parseMarkers(`hello\n${line}\nworld`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.path, path);
  assert.equal(parsed[0]?.sha256, sha);
  assert.equal(parsed[0]?.kind, "image");
});

test("marker is never an executable shell command", () => {
  const line = formatMarker(
    "image",
    pngHash(),
    "/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging/paste.png",
  );
  assert.ok(line.startsWith("#"));
  assert.doesNotMatch(line, /[\r\n]/);
  assert.doesNotMatch(line, /\$\(/);
  assert.doesNotMatch(line, /`/);
  assert.doesNotMatch(line, /\|/);
  assert.doesNotMatch(line, /;/);
  const fakeShell = (command: string) => {
    if (command.startsWith("#")) return { executed: false };
    return { executed: true };
  };
  assert.equal(fakeShell(line).executed, false);
});

test("typed Screenshots2 paths are not markers and are not attached", () => {
  const text = "please read /mnt/c/Users/ayden/Pictures/Screenshots2/clipboard-1.png";
  assert.equal(parseMarkers(text).length, 0);
  const result = transformPastedScreenshots({
    text,
    modelAcceptsImages: true,
    stagingRoot: mkdtempSync(join(tmpdir(), "paste-linker-")),
  });
  assert.equal(result.attachedCount, 0);
  assert.equal(result.images.length, 0);
  assert.equal(result.text, text);
});

test("transform attaches only verified staged PNG bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "paste-linker-"));
  const file = join(root, "paste-one.png");
  writeFileSync(file, PNG_1X1);
  const sha = sha256Hex(PNG_1X1);
  const marker = formatMarker("image", sha, file);
  const result = transformPastedScreenshots({
    text: `look\n${marker}\nplease`,
    modelAcceptsImages: true,
    stagingRoot: root,
  });
  assert.equal(result.attachedCount, 1);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0]?.mimeType, "image/png");
  assert.equal(result.images[0]?.data, PNG_1X1.toString("base64"));
  assert.match(result.text, /\[Screenshot Pasted\]/);
  assert.doesNotMatch(result.text, /«pl1:/);
});

test("two unique pastes attach both hashes", () => {
  const root = mkdtempSync(join(tmpdir(), "paste-linker-"));
  const pngA = PNG_1X1;
  const pngB = Buffer.from(PNG_1X1);
  pngB[pngB.length - 8] = (pngB[pngB.length - 8] ?? 0) ^ 1;
  writeFileSync(join(root, "a.png"), pngA);
  writeFileSync(join(root, "b.png"), pngB);
  const text = [
    formatMarker("image", sha256Hex(pngA), join(root, "a.png")),
    formatMarker("image", sha256Hex(pngB), join(root, "b.png")),
  ].join("\n");
  const result = transformPastedScreenshots({
    text,
    modelAcceptsImages: true,
    stagingRoot: root,
  });
  assert.equal(result.attachedCount, 2);
  assert.equal(result.images.length, 2);
});

test("stale hash does not attach", () => {
  const root = mkdtempSync(join(tmpdir(), "paste-linker-"));
  const file = join(root, "stale.png");
  writeFileSync(file, PNG_1X1);
  const marker = formatMarker("image", "a".repeat(64), file);
  const result = transformPastedScreenshots({
    text: marker,
    modelAcceptsImages: true,
    stagingRoot: root,
  });
  assert.equal(result.attachedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(result.images.length, 0);
  assert.match(result.text, /not attached/);
});

test("non-vision models stay link-only", () => {
  const root = mkdtempSync(join(tmpdir(), "paste-linker-"));
  const file = join(root, "vision.png");
  writeFileSync(file, PNG_1X1);
  const marker = formatMarker("image", sha256Hex(PNG_1X1), file);
  const result = transformPastedScreenshots({
    text: marker,
    modelAcceptsImages: false,
    stagingRoot: root,
  });
  assert.equal(result.attachedCount, 0);
  assert.equal(result.linkOnlyCount, 1);
  assert.equal(result.images.length, 0);
  assert.match(result.text, /link only/);
});

test("text without markers is preserved", () => {
  const result = transformPastedScreenshots({
    text: "just a question",
    modelAcceptsImages: true,
    stagingRoot: mkdtempSync(join(tmpdir(), "paste-linker-")),
  });
  assert.equal(result.text, "just a question");
  assert.equal(result.images.length, 0);
});

test("existing input images are preserved", () => {
  const root = mkdtempSync(join(tmpdir(), "paste-linker-"));
  const file = join(root, "paste.png");
  writeFileSync(file, PNG_1X1);
  const prior = {
    type: "image" as const,
    data: "abc",
    mimeType: "image/jpeg",
  };
  const result = transformPastedScreenshots({
    text: formatMarker("image", sha256Hex(PNG_1X1), file),
    images: [prior],
    modelAcceptsImages: true,
    stagingRoot: root,
  });
  assert.equal(result.images[0], prior);
  assert.equal(result.images.length, 2);
});

test("symlink outside staging root is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "paste-linker-"));
  const outside = join(mkdtempSync(join(tmpdir(), "paste-outside-")), "secret.png");
  writeFileSync(outside, PNG_1X1);
  const link = join(root, "escape.png");
  symlinkSync(outside, link);
  const read = readStagedImage(link, sha256Hex(PNG_1X1), root);
  assert.equal(read.ok, false);
  if (!read.ok) assert.equal(read.error.code, "outside-root");
});

test("non-image magic is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "paste-linker-"));
  const file = join(root, "notes.png");
  const bytes = Buffer.from("not an image");
  writeFileSync(file, bytes);
  const read = readStagedImage(file, sha256Hex(bytes), root);
  assert.equal(read.ok, false);
  if (!read.ok) assert.equal(read.error.code, "unsupported-magic");
});

test("PNG magic detection", () => {
  assert.equal(detectImageMagic(PNG_1X1)?.mimeType, "image/png");
  assert.equal(detectImageMagic(Buffer.from("hello")), null);
});

test("source never scans Screenshots2, auto-sends, or restores WezTerm", () => {
  mkdirSync(join(here, ".."), { recursive: true });
  for (const file of extensionFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Screenshots2/);
    assert.doesNotMatch(source, /sendUserMessage/);
    assert.doesNotMatch(source, /wezterm/i);
    assert.doesNotMatch(source, /pasteImage/);
    assert.doesNotMatch(source, /iterdir|readdir|opendir/);
  }
  const index = readFileSync(join(here, "..", "index.ts"), "utf8");
  assert.match(index, /registerShortcut/);
  assert.match(index, /alt\+v/);
});

test("fixture marker matches encoder", () => {
  const fixture = JSON.parse(
    readFileSync(join(here, "..", "fixtures", "marker-contract.json"), "utf8"),
  );
  assert.equal(
    formatMarker("image", fixture.sha256, fixture.path, fixture.label),
    fixture.marker,
  );
});
