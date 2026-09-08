import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { sha256Hex } from "../staging.ts";
import { parseMarkers, STAGED_WIDGET } from "../marker.ts";
import {
  assertInstalledPiShortcutPrecedence,
  dispatchEditorKey,
  getShortcuts,
  matchesKey,
  RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS,
  WSL_BINDINGS,
  type RegisteredShortcut,
} from "./pi-key-dispatch-harness.ts";
import createExtension, {
  SHORTCUTS,
  resetPasteLinkerCaptureState,
  stageClipboardScreenshot,
} from "../index.ts";

const MIN_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300000002000100cfc8cd690000000049454e44ae426082",
  "hex",
);

const ALT_V = "\x1bv";
const CTRL_V = "\x16";
const CTRL_ALT_V = "\x1b\x16";
const KITTY_ALT_V = "\x1b[118;3u";
const KITTY_CTRL_ALT_V = "\x1b[118;7u";

type MockUi = {
  editorText: string;
  widgets: Map<string, string[] | undefined>;
  notifications: Array<{ message: string; type?: string }>;
  pasteToEditor(text: string): void;
  getEditorText(): string;
  setEditorText(text: string): void;
  setWidget(id: string, lines: string[] | undefined): void;
  setStatus(id: string, text: string | undefined): void;
  notify(message: string, type?: string): void;
  onTerminalInput?: (handler: () => undefined) => () => void;
};

function createMockUi(): MockUi {
  const ui: MockUi = {
    editorText: "",
    widgets: new Map(),
    notifications: [],
    pasteToEditor(text: string) {
      this.editorText += text;
    },
    getEditorText() {
      return this.editorText;
    },
    setEditorText(text: string) {
      this.editorText = text;
    },
    setWidget(id, lines) {
      this.widgets.set(id, lines);
    },
    setStatus() {},
    notify(message, type) {
      this.notifications.push({ message, type });
    },
  };
  return ui;
}

function createMockCtx(ui: MockUi, modelInput: string[] = ["text", "image"]): ExtensionContext {
  return {
    hasUI: true,
    ui,
    model: { input: modelInput },
  } as unknown as ExtensionContext;
}

function createMockPi() {
  const shortcuts = new Map<string, { description?: string; handler: (ctx: ExtensionContext) => Promise<void> | void }>();
  const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>();
  const pi = {
    registerShortcut(shortcut: string, options: { description?: string; handler: (ctx: ExtensionContext) => Promise<void> | void }) {
      shortcuts.set(shortcut, options);
    },
    on(event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    shortcuts,
    handlers,
  };
  return pi as typeof pi & ExtensionAPI;
}

test("installed Pi still lets extension shortcuts consume Alt+V before pasteImage", () => {
  assertInstalledPiShortcutPrecedence();
  assert.equal(
    RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS.includes(
      "app.clipboard.pasteImage" as never,
    ),
    false,
  );
  assert.equal(matchesKey(ALT_V, "alt+v"), true);
});

test("isolated Pi key dispatch: one capture, zero native pasteImage", async () => {
  resetPasteLinkerCaptureState();
  const root = mkdtempSync(join(tmpdir(), "paste-key-"));
  const staged = join(root, "paste-unique.png");
  writeFileSync(staged, MIN_PNG);
  const sha = sha256Hex(MIN_PNG);
  const stdout = `${JSON.stringify({
    schema: 1,
    kind: "image",
    label: "Screenshot Pasted",
    path: staged,
    sha256: sha,
  })}\n`;

  let captureCalls = 0;
  const runner = async () => {
    captureCalls += 1;
    return { stdout, stderr: "", code: 0 };
  };

  const ui = createMockUi();
  ui.editorText = "please look";
  const ctx = createMockCtx(ui);
  const pi = createMockPi();
  createExtension(pi);

  assert.deepEqual([...pi.shortcuts.keys()], [...SHORTCUTS]);
  const registered = pi.shortcuts.get("alt+v");
  assert.ok(registered, "extension must register alt+v");
  assert.ok(pi.shortcuts.get("ctrl+alt+v"), "extension must register ctrl+alt+v");

  const extensionShortcuts = getShortcuts(
    [
      {
        shortcuts: new Map<string, RegisteredShortcut>([
          [
            "alt+v",
            {
              shortcut: "alt+v",
              extensionPath: "paste-linker",
              handler: () =>
                stageClipboardScreenshot(ctx, {
                  captureBin: "/tmp/mock-paste-capture",
                  windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
                  stagingDir: root,
                  runner,
                }),
            },
          ],
        ]),
      },
    ],
    WSL_BINDINGS,
  );
  assert.ok(extensionShortcuts.has("alt+v"), "alt+v must not be skipped as reserved");

  let nativePaste = 0;
  const dispatched = dispatchEditorKey(ALT_V, {
    shortcuts: extensionShortcuts,
    keybindings: WSL_BINDINGS,
    onPasteImage: () => {
      nativePaste += 1;
    },
  });
  await dispatched.extensionWork;

  assert.equal(dispatched.consumedByExtension, true);
  assert.equal(dispatched.extensionHandlerCalls, 1);
  assert.equal(dispatched.nativePasteImageCalls, 0);
  assert.equal(nativePaste, 0);
  assert.equal(captureCalls, 1);
  const markers = parseMarkers(ui.editorText);
  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.sha256, sha);
  assert.match(ui.editorText, /please look/);
  assert.equal(ui.widgets.get("paste-linker")?.[0], STAGED_WIDGET);
});

test("ctrl+v does not fire the screenshot capture", async () => {
  let captureCalls = 0;
  const extensionShortcuts = getShortcuts(
    [
      {
        shortcuts: new Map<string, RegisteredShortcut>([
          [
            "alt+v",
            {
              shortcut: "alt+v",
              extensionPath: "paste-linker",
              handler: () => {
                captureCalls += 1;
              },
            },
          ],
        ]),
      },
    ],
    WSL_BINDINGS,
  );
  let nativePaste = 0;
  const dispatched = dispatchEditorKey(CTRL_V, {
    shortcuts: extensionShortcuts,
    keybindings: { ...WSL_BINDINGS, "app.clipboard.pasteImage": "alt+v" },
    onPasteImage: () => {
      nativePaste += 1;
    },
  });
  assert.equal(dispatched.consumedByExtension, false);
  assert.equal(captureCalls, 0);
  assert.equal(nativePaste, 0);
  assert.equal(dispatched.nativePasteImageCalls, 0);
});

test("removed draft marker clears staged widget", async () => {
  const pi = createMockPi();
  createExtension(pi);
  const ui = createMockUi();
  const ctx = createMockCtx(ui);
  ui.editorText = `#«pl1:image:${"a".repeat(64)}:%2Ftmp%2Fpaste.png» Screenshot Pasted`;
  const start = pi.handlers.get("session_start")?.[0];
  await start?.({ reason: "startup" }, ctx);
  assert.equal(ui.widgets.get("paste-linker")?.[0], STAGED_WIDGET);
  ui.editorText = "just text now";
  const { refreshFromEditor } = await import("../index.ts");
  refreshFromEditor(ctx);
  assert.equal(ui.widgets.get("paste-linker"), undefined);
});

test("input transform attaches on submit and never auto-sends", async () => {
  const root = mkdtempSync(join(tmpdir(), "paste-submit-"));
  const staged = join(root, "paste.png");
  writeFileSync(staged, MIN_PNG);
  const sha = sha256Hex(MIN_PNG);
  const pi = createMockPi();
  createExtension(pi);
  const ui = createMockUi();
  const ctx = createMockCtx(ui);
  const marker = `#«pl1:image:${sha}:${encodeURIComponent(staged)}» Screenshot Pasted`;
  const input = pi.handlers.get("input")?.[0];
  const previous = process.env.PODLE_PASTE_STAGING_ROOT;
  process.env.PODLE_PASTE_STAGING_ROOT = root;
  try {
    const result = await input?.(
      { text: `look\n${marker}`, images: [], source: "interactive" },
      ctx,
    );
    assert.equal(result?.action, "transform");
    assert.equal(result?.images?.length, 1);
    assert.match(result?.text ?? "", /\[Screenshot Pasted\]/);
    assert.equal(ui.widgets.get("paste-linker")?.[0], "Screenshot included with submission");
  } finally {
    if (previous === undefined) delete process.env.PODLE_PASTE_STAGING_ROOT;
    else process.env.PODLE_PASTE_STAGING_ROOT = previous;
  }
});

test("non-vision submit stays link-only", async () => {
  const root = mkdtempSync(join(tmpdir(), "paste-novision-"));
  const staged = join(root, "paste.png");
  writeFileSync(staged, MIN_PNG);
  const sha = sha256Hex(MIN_PNG);
  const pi = createMockPi();
  createExtension(pi);
  const ui = createMockUi();
  const ctx = createMockCtx(ui, ["text"]);
  const marker = `#«pl1:image:${sha}:${encodeURIComponent(staged)}» Screenshot Pasted`;
  const input = pi.handlers.get("input")?.[0];
  const previous = process.env.PODLE_PASTE_STAGING_ROOT;
  process.env.PODLE_PASTE_STAGING_ROOT = root;
  try {
    const result = await input?.(
      { text: marker, images: [], source: "interactive" },
      ctx,
    );
    assert.equal(result?.images?.length, 0);
    assert.match(result?.text ?? "", /link only/);
    assert.equal(ui.widgets.get("paste-linker")?.[0], "Staged as link — not sent as image bytes");
  } finally {
    if (previous === undefined) delete process.env.PODLE_PASTE_STAGING_ROOT;
    else process.env.PODLE_PASTE_STAGING_ROOT = previous;
  }
});

test("ctrl+alt+v and kitty CSI-u alt+v consume like alt+v", () => {
  assert.equal(matchesKey(CTRL_ALT_V, "ctrl+alt+v"), true);
  assert.equal(matchesKey(KITTY_ALT_V, "alt+v"), true);
  assert.equal(matchesKey(KITTY_CTRL_ALT_V, "ctrl+alt+v"), true);
  const extensionShortcuts = getShortcuts(
    [
      {
        shortcuts: new Map<string, RegisteredShortcut>([
          [
            "alt+v",
            {
              shortcut: "alt+v",
              extensionPath: "paste-linker",
              handler: () => {},
            },
          ],
          [
            "ctrl+alt+v",
            {
              shortcut: "ctrl+alt+v",
              extensionPath: "paste-linker",
              handler: () => {},
            },
          ],
        ]),
      },
    ],
    WSL_BINDINGS,
  );
  for (const data of [ALT_V, CTRL_ALT_V, KITTY_ALT_V, KITTY_CTRL_ALT_V]) {
    const dispatched = dispatchEditorKey(data, {
      shortcuts: extensionShortcuts,
      keybindings: WSL_BINDINGS,
      onPasteImage: () => {
        throw new Error("native pasteImage must not run");
      },
    });
    assert.equal(dispatched.consumedByExtension, true, data);
    assert.equal(dispatched.nativePasteImageCalls, 0, data);
  }
});

test("installed Pi loader loads this extension with both shortcuts", async () => {
  const { loadExtensions } = await import(
    "/home/podles/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js"
  );
  const indexPath = join(dirname(fileURLToPath(import.meta.url)), "..", "index.ts");
  const result = await loadExtensions([indexPath], process.cwd());
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  const keys = [...result.extensions[0].shortcuts.keys()].sort();
  assert.deepEqual(keys, ["alt+v", "ctrl+alt+v"]);
});

test("capture failure notifies and does not insert a marker", async () => {
  resetPasteLinkerCaptureState();
  const ui = createMockUi();
  const ctx = createMockCtx(ui);
  const { stageClipboardScreenshot } = await import("../index.ts");
  await stageClipboardScreenshot(ctx, {
    captureBin: "/tmp/mock-paste-capture",
    windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
    stagingDir: "/tmp/staging",
    runner: async () => ({ stdout: "", stderr: "clipboard empty", code: 2 }),
  });
  assert.equal(parseMarkers(ui.editorText).length, 0);
  assert.equal(ui.notifications.length, 1);
  assert.match(ui.notifications[0]?.message ?? "", /clipboard empty/);
});
