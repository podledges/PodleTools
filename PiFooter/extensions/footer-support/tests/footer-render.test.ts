import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { RATE_SOURCE } from "../sgd-rate.mjs";

export const entries = [
  { type: "message", message: { role: "assistant", usage: { input: 100, output: 20, cacheRead: 400, cacheWrite: 50, cost: { input: .2, output: .3, cacheRead: .25, cacheWrite: .5, total: 1.25 } } }, usage: { cost: { total: 999 } } },
  { type: "message", message: { role: "toolResult", usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: { total: .5 } } } },
  { type: "compaction", usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: { total: .0035 } } },
  { type: "custom", data: { cost: 999 } },
];

const defaultQuota = {
  providers: [
    { provider: "codex", state: { status: "fresh" }, windows: [{ percentRemaining: 55 }] },
    { provider: "grok", state: { status: "fresh" }, windows: [{ percentRemaining: 72 }] },
  ],
};

function plain(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

export async function renderHarness(t: any, source: string, options: {
  withRate?: boolean;
  quota?: unknown;
  calm?: boolean;
  telegramStatus?: string;
  adhdMarker?: string;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "footer-render-"));
  const old = {
    HOME: process.env.HOME,
    PI_SGD_RATE_CACHE: process.env.PI_SGD_RATE_CACHE,
    FM_CONFIG_OVERRIDE: process.env.FM_CONFIG_OVERRIDE,
    FM_HOME: process.env.FM_HOME,
    FM_ROOT_OVERRIDE: process.env.FM_ROOT_OVERRIDE,
  };
  process.env.HOME = dir;
  process.env.PI_SGD_RATE_CACHE = join(dir, "rate.json");
  process.env.FM_CONFIG_OVERRIDE = join(dir, "firstmate-config");
  delete process.env.FM_HOME;
  delete process.env.FM_ROOT_OVERRIDE;
  const projectCwd = join(dir, "project");
  mkdirSync(join(dir, ".cache"));
  mkdirSync(process.env.FM_CONFIG_OVERRIDE);
  mkdirSync(join(projectCwd, "config"), { recursive: true });
  writeFileSync(join(process.env.FM_CONFIG_OVERRIDE, "calm"), options.calm === false ? "off\n" : "on\n");
  if (options.adhdMarker !== undefined) writeFileSync(join(projectCwd, "config", "adhd"), options.adhdMarker);
  writeFileSync(join(dir, ".cache/pi-fleet-quota.json"), JSON.stringify(options.quota ?? defaultQuota));
  if (options.withRate !== false) {
    writeFileSync(process.env.PI_SGD_RATE_CACHE, JSON.stringify({
      schema: 1,
      base: "USD",
      quote: "SGD",
      rate: 1.25,
      source: RATE_SOURCE,
      asOf: new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
    }));
  }

  const hooks = new Map<string, any[]>();
  const commands = new Map<string, any>();
  const statuses = new Map<string, string>([["telegram", options.telegramStatus ?? "telegram connected"]]);
  let footer: any;
  let fetchCalls = 0;
  let renderRequests = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls++; throw new Error("test offline"); };
  t.after(async () => {
    for (const handler of hooks.get("session_shutdown") ?? []) await handler({}, ctx);
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  const extension = (await import(source + "?fixture=" + Math.random())).default;
  const sessionEntries: any[] = structuredClone(entries);
  const original = structuredClone(entries);
  const ctx: any = {
    hasUI: true,
    cwd: projectCwd,
    model: { id: "gpt-6-astra", reasoning: true, contextWindow: 200000 },
    thinkingLevel: "high",
    sessionManager: { getEntries: () => sessionEntries, getBranch: () => sessionEntries, getSessionName: () => "Test session" },
    getContextUsage: () => ({ tokens: 12345, contextWindow: 200000 }),
    ui: {
      notify() {},
      setFooter: (factory: any) => {
        footer = factory(
          { requestRender() { renderRequests++; } },
          { fg: (_color: string, text: string) => `\x1b[2m${text}\x1b[22m` },
          { onBranchChange: () => () => {}, getGitBranch: () => "branch", getExtensionStatuses: () => statuses },
        );
      },
    },
  };
  const pi = {
    on(event: string, handler: any) {
      hooks.set(event, [...(hooks.get(event) ?? []), handler]);
    },
    registerCommand(name: string, command: any) { commands.set(name, command); },
    appendEntry(customType: string, data: unknown) {
      sessionEntries.push({ type: "custom", customType, data });
    },
  };
  extension(pi);
  for (const handler of hooks.get("session_start") ?? []) await handler({}, ctx);
  const emit = async (event: string, value: unknown = {}) => {
    for (const handler of hooks.get(event) ?? []) await handler(value, ctx);
  };
  return {
    dir,
    footer,
    sessionEntries,
    original,
    statuses,
    ctx,
    commands,
    emit,
    fetchCalls: () => fetchCalls,
    renderRequests: () => renderRequests,
  };
}

const source = fileURLToPath(new URL("../../firstmate-footer-colors.ts", import.meta.url));

test("two-line layout keeps exact colors, sheep spacing, display widths, and right-aligned live model", async t => {
  const h = await renderHarness(t, source);
  const normal = h.footer.render(120);
  assert.equal(normal.length, 2);
  assert.match(plain(normal[0]), /^12k \/ 200k   Ꮚ •ﻌ•Ꮚ   \[\$2\.192\]   Ꮚ •ﻌ•Ꮚ   gpt:55%  grk:72% +gpt-6-astra • high$/);
  assert.equal(plain(normal[1]), "adhd ×   calm ✔   telegram ✔");
  assert.match(normal[1], /\x1b\[38;2;255;0;255mcalm\x1b\[39m \x1b\[38;2;204;255;0m✔\x1b\[39m/);
  assert.match(normal[1], /\x1b\[2madhd ×\x1b\[22m/);
  for (const width of [120, 80, 40, 10]) {
    const lines = h.footer.render(width);
    assert.equal(lines.length, 2);
    assert.ok(lines.every((line: string) => visibleWidth(line) <= width), `line exceeded ${width} columns`);
  }
  assert.match(plain(h.footer.render(40)[0]), /gpt-6-astra • high$/);
  assert.equal(plain(h.footer.render(40)[1]), "adhd ×   calm ✔   telegram ✔");
  assert.deepEqual(h.sessionEntries, h.original);
  assert.equal(h.fetchCalls(), 0);
});

test("scoped ADHD marker starts enabled and latest session toggles win across reloads", async t => {
  const h = await renderHarness(t, source, { adhdMarker: " ON\n" });
  assert.match(plain(h.footer.render(120)[1]), /^adhd ✔/);

  await h.emit("input", { text: "normal mode" });
  await h.emit("session_shutdown");
  await h.emit("session_start");
  assert.match(plain(h.footer.render(120)[1]), /^adhd ×/);

  await h.emit("input", { text: "/i-have-adhd" });
  await h.emit("session_shutdown");
  await h.emit("session_start");
  assert.match(plain(h.footer.render(120)[1]), /^adhd ✔/);
});

test("adhd, calm, and Telegram indicators follow their real state transitions", async t => {
  const h = await renderHarness(t, source);
  assert.equal(plain(h.footer.render(120)[1]), "adhd ×   calm ✔   telegram ✔");

  await h.emit("input", { text: "/i-have-adhd" });
  assert.equal(plain(h.footer.render(120)[1]), "adhd ✔   calm ✔   telegram ✔");
  assert.equal(h.sessionEntries.at(-1).customType, "firstmate-footer-adhd-state");
  assert.equal((h.footer.render(120)[1].match(/\x1b\[38;2;204;255;0m✔\x1b\[39m/g) ?? []).length, 3);

  await h.emit("session_shutdown");
  await h.emit("session_start");
  assert.match(plain(h.footer.render(120)[1]), /^adhd ✔/);

  writeFileSync(join(h.dir, "firstmate-config/calm"), "off\n");
  h.statuses.set("telegram", "telegram disconnected");
  assert.equal(plain(h.footer.render(120)[1]), "adhd ✔   calm ×   telegram ×");

  h.statuses.set("telegram", "telegram awaiting pairing");
  assert.match(plain(h.footer.render(120)[1]), /telegram ×$/);
  h.statuses.set("telegram", "telegram follower");
  assert.match(plain(h.footer.render(120)[1]), /telegram ✔$/);

  h.statuses.set("telegram", "telegram disconnected");
  await h.emit("input", { text: "stop adhd mode" });
  assert.equal(plain(h.footer.render(120)[1]), "adhd ×   calm ×   telegram ×");
  assert.equal((h.footer.render(120)[1].match(/\x1b\[2m(?:adhd|calm|telegram) ×\x1b\[22m/g) ?? []).length, 3);
  assert.ok(h.renderRequests() >= 2);
});

test("model and effort refresh from Pi events instead of a configured name", async t => {
  const h = await renderHarness(t, source);
  h.ctx.model = { id: "gpt-live-next", reasoning: true, contextWindow: 300000 };
  h.ctx.thinkingLevel = "xhigh";
  await h.emit("model_select", { model: h.ctx.model, previousModel: undefined, source: "set" });
  await h.emit("thinking_level_select", { level: "xhigh", previousLevel: "high" });
  const line = plain(h.footer.render(120)[0]);
  assert.match(line, /gpt-live-next • xhigh$/);
  assert.doesNotMatch(line, /gpt-6-astra/);
  assert.ok(h.renderRequests() >= 2);
});

test("quota renders genuine zero separately from error and invalid samples", async t => {
  const exhausted = await renderHarness(t, source, { quota: {
    providers: [
      { provider: "codex", state: { status: "fresh" }, windows: [{ percentRemaining: 0 }] },
      { provider: "grok", state: { status: "fresh" }, windows: [{ percentUsed: 100 }] },
    ],
  } });
  assert.match(plain(exhausted.footer.render(120)[0]), /gpt:0%  grk:0%/);

  const unavailable = await renderHarness(t, source, { quota: {
    providers: [
      { provider: "codex", state: { status: "error", error: "controlled failure" }, windows: [] },
      { provider: "grok", state: { status: "fresh" }, windows: [{ percentRemaining: -1 }] },
    ],
  } });
  assert.match(plain(unavailable.footer.render(120)[0]), /gpt:err  grk:\?/);
  assert.doesNotMatch(plain(unavailable.footer.render(120)[0]), /gpt:0%|grk:0%/);
});

test("auth-required and missing quota providers remain unknown", async t => {
  const h = await renderHarness(t, source, { quota: {
    providers: [
      { provider: "codex", state: { status: "auth_required" }, windows: [] },
    ],
  } });
  assert.match(plain(h.footer.render(120)[0]), /gpt:\?  grk:\?/);
  assert.doesNotMatch(plain(h.footer.render(120)[0]), /gpt:0%|grk:0%/);
});

test("zero usage displays 0.000 only with a valid SGD rate", async t => {
  const h = await renderHarness(t, source);
  h.sessionEntries.splice(0);
  assert.match(plain(h.footer.render(120)[0]), /\[\$0\.000\]/);
  assert.equal(h.fetchCalls(), 0);
});

test("missing rate bootstraps outside render; offline zero usage stays unavailable", async t => {
  const h = await renderHarness(t, source, { withRate: false });
  h.sessionEntries.splice(0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.fetchCalls(), 1);
  for (let i = 0; i < 4; i++) assert.match(plain(h.footer.render(120)[0]), /\[\$—\]/);
  assert.equal(h.fetchCalls(), 1);
});
