import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const core = process.env.PI_CORE_PACKAGE ?? "/home/podles/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { DefaultResourceLoader, SettingsManager } = await import(pathToFileURL(path.join(core, "dist/index.js")));
const fixture = path.resolve(process.argv[2]);
const loader = new DefaultResourceLoader({
  cwd: path.dirname(fixture),
  agentDir: process.env.PI_CODING_AGENT_DIR,
  settingsManager: SettingsManager.inMemory({ packages: [] }),
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  additionalExtensionPaths: [fixture],
});
await loader.reload();
const loaded = loader.getExtensions();
assert.deepEqual(loaded.errors, [], "Pi-supported fixture must load and pass all contracts");
assert.equal(loaded.extensions.length, 1, "no global or project extensions discovered");
loaded.runtime.invalidate();
console.log("isolated Pi SDK contracts: ok (no model/session created)");
