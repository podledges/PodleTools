/**
 * Isolated replica of installed Pi 0.85.1 editor key routing.
 *
 * CustomEditor.handleInput checks onExtensionShortcut first; a truthy return
 * skips app.clipboard.pasteImage. getShortcuts only skips reserved built-ins.
 * app.clipboard.pasteImage is not reserved, so registerShortcut("alt+v") wins.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const requireFromPi = createRequire(
  "/home/podles/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/package.json",
);
export const { matchesKey } = await import(
  pathToFileURL(requireFromPi.resolve("@earendil-works/pi-tui/dist/keys.js")).href
) as { matchesKey: (data: string, keyId: string) => boolean };

export const INSTALLED_PI_BUNDLE =
  "/home/podles/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks/chunk-JVUZSMYM.js";

export const RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS = [
  "app.interrupt",
  "app.clear",
  "app.exit",
  "app.suspend",
  "app.thinking.cycle",
  "app.model.cycleForward",
  "app.model.cycleBackward",
  "app.model.select",
  "app.tools.expand",
  "app.thinking.toggle",
  "app.editor.external",
  "app.message.copy",
  "app.message.followUp",
  "tui.input.submit",
  "tui.select.confirm",
  "tui.select.cancel",
  "tui.input.copy",
  "tui.editor.deleteToLineEnd",
] as const;

/** WSL/Windows resolved bindings (Pi 0.85.1). */
export const WSL_BINDINGS: Record<string, string | string[]> = {
  "app.clipboard.pasteImage": "alt+v",
  "app.interrupt": "escape",
};

export type RegisteredShortcut = {
  shortcut: string;
  extensionPath: string;
  handler: (ctx: unknown) => Promise<void> | void;
};

export type BuiltinBinding = {
  keybinding: string;
  restrictOverride: boolean;
};

export function buildBuiltinKeybindings(
  resolvedKeybindings: Record<string, string | string[]>,
): Record<string, BuiltinBinding> {
  const builtinKeybindings: Record<string, BuiltinBinding> = {};
  for (const [keybinding, keys] of Object.entries(resolvedKeybindings)) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const restrictOverride =
      RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS.includes(
        keybinding as (typeof RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS)[number],
      );
    for (const key of keyList) {
      const normalizedKey = key.toLowerCase();
      const existing = builtinKeybindings[normalizedKey];
      if (existing?.restrictOverride && !restrictOverride) continue;
      builtinKeybindings[normalizedKey] = { keybinding, restrictOverride };
    }
  }
  return builtinKeybindings;
}

export function getShortcuts(
  extensions: Array<{ shortcuts: Map<string, RegisteredShortcut> }>,
  resolvedKeybindings: Record<string, string | string[]>,
): Map<string, RegisteredShortcut> {
  const builtinKeybindings = buildBuiltinKeybindings(resolvedKeybindings);
  const extensionShortcuts = new Map<string, RegisteredShortcut>();
  for (const ext of extensions) {
    for (const [key, shortcut] of ext.shortcuts) {
      const normalizedKey = key.toLowerCase();
      const builtIn = builtinKeybindings[normalizedKey];
      if (builtIn?.restrictOverride === true) continue;
      extensionShortcuts.set(normalizedKey, shortcut);
    }
  }
  return extensionShortcuts;
}

export type DispatchResult = {
  consumedByExtension: boolean;
  nativePasteImageCalls: number;
  extensionHandlerCalls: number;
  extensionWork: Promise<void>;
};

export function dispatchEditorKey(
  data: string,
  options: {
    shortcuts: Map<string, RegisteredShortcut>;
    keybindings: Record<string, string | string[]>;
    onPasteImage: () => void;
  },
): DispatchResult {
  const result: DispatchResult = {
    consumedByExtension: false,
    nativePasteImageCalls: 0,
    extensionHandlerCalls: 0,
    extensionWork: Promise.resolve(),
  };

  const onExtensionShortcut = (input: string): boolean => {
    for (const [shortcutStr, shortcut] of options.shortcuts) {
      if (matchesKey(input, shortcutStr)) {
        result.extensionHandlerCalls += 1;
        result.extensionWork = Promise.resolve(shortcut.handler({}));
        return true;
      }
    }
    return false;
  };

  const matchesBinding = (input: string, action: string): boolean => {
    const keys = options.keybindings[action];
    if (keys === undefined) return false;
    const list = Array.isArray(keys) ? keys : [keys];
    return list.some((key) => matchesKey(input, key));
  };

  // Installed Pi: if (!this.onExtensionShortcut?.(data)) { pasteImage ... }
  if (!onExtensionShortcut(data)) {
    if (matchesBinding(data, "app.clipboard.pasteImage")) {
      result.nativePasteImageCalls += 1;
      options.onPasteImage();
      return result;
    }
  } else {
    result.consumedByExtension = true;
  }
  return result;
}

export function assertInstalledPiShortcutPrecedence(bundlePath = INSTALLED_PI_BUNDLE): void {
  const source = readFileSync(bundlePath, "utf8");
  const handleInput =
    /handleInput\(data\)\{if\(!this\.onExtensionShortcut\?\.\(data\)\)\{if\(this\.keybindings\.matches\(data,"app\.clipboard\.pasteImage"\)\)/;
  if (!handleInput.test(source)) {
    throw new Error(
      "installed Pi no longer checks onExtensionShortcut before pasteImage",
    );
  }
  const reservedMatch = source.match(
    /RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS=(\[[^\]]+\])/,
  );
  if (!reservedMatch) {
    throw new Error("could not find reserved keybinding list in installed Pi");
  }
  if (reservedMatch[1]?.includes("app.clipboard.pasteImage")) {
    throw new Error(
      "installed Pi now reserves pasteImage; extension shortcut would be skipped",
    );
  }
}
