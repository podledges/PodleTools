import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DefaultResourceLoader,
  SettingsManager,
  discoverAndLoadExtensions,
} from "@earendil-works/pi-coding-agent";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const footerRelative = "PiFooter/extensions/firstmate-footer-colors.ts";
const footer = join(root, footerRelative);
const docs = readFileSync(join(root, "PiFooter/README.md"), "utf8");

function temp(t, prefix = "pi-footer-package-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function validRate(path) {
  mkdirSync(dirname(path), { recursive: true });
  const now = new Date();
  writeFileSync(path, JSON.stringify({
    schema: 1,
    base: "USD",
    quote: "SGD",
    rate: 1.25,
    source: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=SGD",
    asOf: now.toISOString().slice(0, 10),
    fetchedAt: now.toISOString(),
  }));
}

function nativeEnv(dir) {
  const home = join(dir, "home");
  const agent = join(dir, "agent");
  const rate = join(dir, "rate.json");
  mkdirSync(home, { recursive: true });
  mkdirSync(agent, { recursive: true });
  validRate(rate);
  return {
    ...process.env,
    HOME: home,
    PI_CODING_AGENT_DIR: agent,
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
    PI_SKIP_VERSION_CHECK: "1",
    PI_SGD_RATE_CACHE: rate,
    PI_QUOTA_REFRESH_DISABLE: "1",
  };
}

function pi(env, args, input) {
  return spawnSync("pi", args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    timeout: 60_000,
  });
}

function rpcCommands(env) {
  return pi(env, ["--mode", "rpc", "--no-session"], '{"type":"get_commands"}\n');
}

test("root Pi manifest exposes exactly the footer and declares unvendored core peers", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.deepEqual(pkg.pi, { extensions: [`./${footerRelative}`] });
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, "UNLICENSED");
  assert.deepEqual(pkg.peerDependencies, {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
  });
  assert.equal(pkg.dependencies, undefined);
});

test("Pi resource loader discovers one package extension and both commands", async t => {
  const dir = temp(t);
  const settingsManager = SettingsManager.inMemory({ packages: [root] }, { projectTrusted: true });
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: join(dir, "agent"),
    settingsManager,
    noContextFiles: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.equal(loaded.extensions[0].path, footer);
  assert.deepEqual([...loaded.extensions[0].commands.keys()].sort(), ["sgd-rate", "sgd-rate-refresh"]);
});

test("packed contents are minimal and helpers work after relocation", async t => {
  const dir = temp(t, "pi-footer-pack-");
  const result = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", dir], {
    cwd: root,
    encoding: "utf8",
  }));
  assert.equal(result.length, 1);
  const names = result[0].files.map(file => file.path);
  for (const expected of [
    "package.json",
    "PiFooter/NOTICE.md",
    "PiFooter/README.md",
    footerRelative,
    "PiFooter/extensions/footer-support/sgd-rate.mjs",
    "PiFooter/extensions/footer-support/refresh.mjs",
    "PiFooter/extensions/footer-support/quota-refresh.mjs",
    "PiFooter/bin/pi-sgd-rate-refresh",
  ]) assert.ok(names.includes(expected), `missing packed asset: ${expected}`);
  // npm always includes the root README and package.json in addition to `files`.
  assert.ok(names.every(name => ["README.md", "package.json"].includes(name) || name.startsWith("PiFooter/")));

  execFileSync("tar", ["-xzf", join(dir, result[0].filename), "-C", dir]);
  const relocated = join(dir, "package");
  // A package consumer gets Pi core from the host via peerDependencies. Running
  // npm install inside this unpacked source would resolve devDependencies and
  // accidentally make this assertion depend on the caller's npm cache.
  assert.equal(existsSync(join(relocated, "node_modules")), false);
  const relocatedFooter = join(relocated, footerRelative);
  const loaded = await discoverAndLoadExtensions([relocatedFooter], relocated, join(dir, "agent"));
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.equal(loaded.extensions[0].path, relocatedFooter);
  assert.deepEqual([...loaded.extensions[0].commands.keys()].sort(), ["sgd-rate", "sgd-rate-refresh"]);
  assert.equal(existsSync(join(relocated, "node_modules")), false);
  const help = execFileSync(join(relocated, "PiFooter/bin/pi-sgd-rate-refresh"), ["--help"], {
    env: { ...process.env, PI_SGD_RATE_CACHE: join(dir, "elsewhere/rate.json") },
    encoding: "utf8",
  });
  assert.match(help, /Refresh USD→SGD/);
  assert.match(help, /elsewhere\/rate\.json/);
});

test("runtime sources have no machine-specific source or dependency paths", () => {
  const source = [
    readFileSync(footer, "utf8"),
    readFileSync(join(root, "PiFooter/extensions/footer-support/sgd-rate.mjs"), "utf8"),
    readFileSync(join(root, "PiFooter/extensions/footer-support/quota-refresh.mjs"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /\/nix\/store|\.npm-global|\.treehouse|node_modules/);
  assert.match(source, /import\.meta\.url/);
  assert.match(source, /process\.execPath/);
});

test("native install, ordinary discovery, coexistence, and remove preserve unrelated state", t => {
  const dir = temp(t, "pi-footer-native-");
  const env = nativeEnv(dir);
  const agent = env.PI_CODING_AGENT_DIR;
  const unrelated = join(dir, "unrelated.ts");
  writeFileSync(unrelated, 'export default pi => pi.registerCommand("unrelated-command", { handler() {} });\n');
  const originalSettings = { extensions: [unrelated], quietStartup: true };
  writeFileSync(join(agent, "settings.json"), JSON.stringify(originalSettings));
  writeFileSync(join(agent, "auth.json"), '{"test-sentinel":"do-not-copy-or-edit"}\n');

  const installed = pi(env, ["install", root]);
  assert.equal(installed.status, 0, installed.stderr);
  const afterInstall = JSON.parse(readFileSync(join(agent, "settings.json"), "utf8"));
  assert.deepEqual(afterInstall.extensions, [unrelated]);
  assert.equal(afterInstall.quietStartup, true);
  assert.equal(afterInstall.packages.length, 1);
  assert.equal(afterInstall.defaultModel, undefined);
  assert.equal(afterInstall.defaultProvider, undefined);
  assert.equal(readFileSync(join(agent, "auth.json"), "utf8"), '{"test-sentinel":"do-not-copy-or-edit"}\n');

  const discovered = rpcCommands(env);
  assert.equal(discovered.status, 0, discovered.stderr);
  const response = JSON.parse(discovered.stdout.trim());
  const names = response.data.commands.map(command => command.name);
  assert.ok(names.includes("unrelated-command"));
  assert.ok(names.includes("sgd-rate"));
  assert.ok(names.includes("sgd-rate-refresh"));
  const footerCommand = response.data.commands.find(command => command.name === "sgd-rate");
  assert.equal(footerCommand.sourceInfo.origin, "package");
  assert.equal(footerCommand.sourceInfo.path, footer);

  const removed = pi(env, ["remove", root]);
  assert.equal(removed.status, 0, removed.stderr);
  const afterRemove = JSON.parse(readFileSync(join(agent, "settings.json"), "utf8"));
  assert.deepEqual(afterRemove, { ...originalSettings, packages: [] });
  assert.equal(readFileSync(join(agent, "auth.json"), "utf8"), '{"test-sentinel":"do-not-copy-or-edit"}\n');
});

test("ordinary discovery exposes duplicate legacy ownership instead of hiding it", t => {
  const dir = temp(t, "pi-footer-duplicate-");
  const env = nativeEnv(dir);
  const extensions = join(env.PI_CODING_AGENT_DIR, "extensions");
  mkdirSync(extensions, { recursive: true });
  writeFileSync(join(extensions, "firstmate-footer-colors.ts"), `
    export default function (pi) {
      pi.registerCommand("sgd-rate", { handler() {} });
      pi.registerCommand("sgd-rate-refresh", { handler() {} });
      pi.on("session_start", (_event, ctx) => ctx.ui.setFooter(() => ({ render: () => ["legacy"], invalidate() {} })));
    }
  `);
  assert.equal(pi(env, ["install", root]).status, 0);
  const discovered = rpcCommands(env);
  assert.equal(discovered.status, 0, discovered.stderr);
  const names = JSON.parse(discovered.stdout.trim()).data.commands.map(command => command.name);
  assert.ok(names.includes("sgd-rate:1"));
  assert.ok(names.includes("sgd-rate:2"));
  assert.ok(names.includes("sgd-rate-refresh:1"));
  assert.ok(names.includes("sgd-rate-refresh:2"));
});

test("ordinary discovery remains fatal for a readable broken legacy entry", t => {
  const dir = temp(t, "pi-footer-broken-");
  const env = nativeEnv(dir);
  const extensions = join(env.PI_CODING_AGENT_DIR, "extensions");
  const legacy = join(dir, "legacy-footer.ts");
  mkdirSync(extensions, { recursive: true });
  writeFileSync(legacy, 'throw new Error("controlled broken legacy footer");\n');
  symlinkSync(legacy, join(extensions, "firstmate-footer-colors.ts"));
  pi(env, ["install", root]);

  const result = rpcCommands(env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /controlled broken legacy footer/);
  assert.match(result.stderr, /Failed to load extension/);
  // rpcCommands invokes ordinary discovery with no --no-extensions/-ne escape hatch.
});

test("dangling Home Manager link is detected even though test -e alone is false", t => {
  const dir = temp(t, "pi-footer-dangling-");
  const link = join(dir, "firstmate-footer-colors.ts");
  const target = join(dir, "missing-nix-generation.ts");
  symlinkSync(target, link);
  assert.equal(lstatSync(link).isSymbolicLink(), true);
  assert.equal(readlinkSync(link), target);
  assert.equal(existsSync(link), false);
  assert.match(docs, /test -L/);
  assert.match(docs, /readlink -e/);
  assert.match(docs, /Installing it cannot remove or repair/);
});

test("migration guidance uses native mechanics and narrowly preserves legacy entries", () => {
  for (const command of [
    "pi install git:git@github.com:podledges/PodleTools.git",
    "pi update git:git@github.com:podledges/PodleTools.git",
    "pi remove git:git@github.com:podledges/PodleTools.git",
    "/reload",
  ]) assert.ok(docs.includes(command), `missing guidance: ${command}`);
  assert.match(docs, /one active footer owner/i);
  assert.match(docs, /Do not move, delete, or disable any other extension/);
  assert.match(docs, /--no-extensions -e[\s\S]+not[\s\S]+production activation command/i);
  assert.match(docs, /Home Manager can recreate the conflict/);
  assert.match(docs, /this task did\s+not perform either operation on the primary machine/i);
});
