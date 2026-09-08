#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ansi = (rgb, text) => `\x1b[38;2;${rgb.join(";")}m${text}\x1b[39m`;
const palette = { accent: [255, 0, 204], success: [204, 255, 0], dim: [71, 58, 114], muted: [138, 127, 181], warning: [255, 176, 0], text: [255, 247, 255], error: [255, 23, 79] };
const theme = { fg: (token, text) => ansi(palette[token], text), strikethrough: (s) => s };
const task = (fields = {}) => ({ id: 1, subject: "Test 界 👩‍💻", status: "in_progress", metadata: { attention: "agent-working" }, ...fields });

class Clock {
  now = 0;
  timers = new Map();
  add(fn, ms, repeat) {
    const handle = { unref() {} };
    this.timers.set(handle, { fn, ms, repeat, at: this.now + ms });
    return handle;
  }
  advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const entry = [...this.timers].sort((a, b) => a[1].at - b[1].at).find(([, t]) => t.at <= end);
      if (!entry) break;
      const [handle, timer] = entry;
      this.now = timer.at;
      if (timer.repeat) timer.at += timer.ms;
      else this.timers.delete(handle);
      timer.fn();
    }
    this.now = end;
  }
  intervals() { return [...this.timers.values()].filter((t) => t.repeat).length; }
}

module.exports = async function testAnimation({ TodoOverlay, store, format, config, extension, visibleWidth }) {
  const configFile = path.join(process.env.XDG_CONFIG_HOME, "rpiv-todo/config.json");
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  const motion = (value) => fs.writeFileSync(configFile, JSON.stringify({ reducedMotion: value }));
  motion(false);
  const originals = { setInterval, clearInterval, setTimeout, clearTimeout };
  const clock = new Clock();
  global.setInterval = (fn, ms) => clock.add(fn, ms, true);
  global.setTimeout = (fn, ms) => clock.add(fn, ms, false);
  global.clearInterval = global.clearTimeout = (handle) => clock.timers.delete(handle);
  try {
    let component;
    let width = 100;
    let registrations = 0;
    const requests = [];
    const tui = { requestRender(force) { requests.push({ at: clock.now, force }); component?.render(width); } };
    const ui = {
      theme,
      getToolsExpanded: () => false,
      setWidget(_key, factory) {
        component?.dispose?.();
        component = factory?.(tui, theme);
        if (factory) registrations++;
      },
    };
    const snapshot = (tasks) => ({ tasks, nextId: 100 });
    const state = (tasks, id = "animation-test") => {
      store.setActiveRenderSession(id);
      store.commitState(id, snapshot(tasks));
    };
    const overlay = new TodoOverlay();
    assert.equal(clock.timers.size, 0, "construction never starts a timer");
    state([task(), task({ id: 2 })]);
    overlay.setUICtx(ui);
    overlay.update();
    const render = () => component?.render(width) ?? [];
    const blue = (glyph) => ansi([0, 102, 255], glyph);
    assert.ok(render().join("\n").includes(blue("⠋")));
    assert.equal(clock.intervals(), 1, "one timer for multiple active tasks");
    const before = registrations;
    for (let i = 0; i < 20; i++) { overlay.update(); render(); }
    assert.equal(registrations, before, "refresh never replaces the widget");
    assert.equal(clock.intervals(), 1);
    requests.length = 0;
    const untouched = JSON.stringify(store.getRenderState());
    for (const glyph of ["⠙", "⠹", "⠸", "⠼", "⠴", "⠋"]) {
      clock.advance(150);
      assert.ok(render().join("\n").includes(blue(glyph)));
    }
    clock.advance(5100);
    assert.equal(requests.length, 40, "exactly 40 differential requests / 6 seconds (6.667 Hz)");
    assert.ok(requests.every((r, i) => r.force === undefined && (!i || r.at - requests[i - 1].at === 150)));
    assert.equal(JSON.stringify(store.getRenderState()), untouched, "frames never persist or mutate tasks");
    console.log("deterministic cadence: 40 requests / 6000 ms = 6.667 Hz; 0 forced redraws");

    const staticCases = [
      task({ status: "pending" }),
      task({ blockedBy: [2] }),
      task({ metadata: { attention: "captain-input" }, blockedBy: [2] }),
      task({ metadata: { attention: "waiting" } }),
      task({ metadata: { attention: "stale" } }),
      task({ metadata: { attention: "unknown" } }),
      task({ metadata: {} }),
      task({ status: "completed" }),
      task({ status: "deleted" }),
    ];
    for (const value of staticCases) {
      state([task()]); overlay.update(); render();
      assert.equal(clock.intervals(), 1);
      state([value]); overlay.update();
      assert.equal(clock.intervals(), 0, `stop synchronously on ${JSON.stringify(value)}`);
      const lines = render().join("\n");
      assert.ok(!format.ATTENTION_FRAMES.some((frame) => lines.includes(frame)));
      const count = requests.length;
      clock.advance(600);
      assert.equal(requests.length, count, "static states never schedule redraws");
    }
    state([task()]); overlay.update(); render();
    state([]); overlay.update();
    assert.equal(clock.intervals(), 0, "clear/removal stops timer");
    assert.equal(component, undefined);

    state([task()]); overlay.update(); render();
    overlay.toggleCollapse();
    assert.equal(clock.intervals(), 0);
    assert.ok(!render().join("\n").includes("#1"));
    overlay.toggleCollapse(); render();
    assert.equal(clock.intervals(), 1);
    for (const w of [0, 1, 4, 8, 9, 10, 12, 20, 80]) {
      width = w;
      for (const line of render()) assert.ok(visibleWidth(line) <= w, `width ${w}`);
      if (w < 10) assert.equal(clock.intervals(), 0, "invisible marker doesn't animate");
    }
    width = 100;
    render();
    for (const glyph of [...format.ATTENTION_FRAMES, "●", "✓"]) assert.equal(visibleWidth(glyph), 1);
    const lengths = format.ATTENTION_FRAMES.map((_, frame) => visibleWidth(format.formatOverlayTaskLine(task(), theme, true, frame)));
    assert.equal(new Set(lengths).size, 1);
    motion(true);
    clock.advance(150);
    assert.equal(clock.intervals(), 0);
    assert.ok(render().join("\n").includes(blue("●")));
    for (const value of [false, "true", null]) { motion(value); assert.equal(config.getReducedMotion(), false); }
    render(); assert.equal(clock.intervals(), 1);

    // Budget-hidden active tasks don't keep an otherwise static widget ticking.
    state([...Array.from({ length: 20 }, (_, i) => task({ id: i + 1, status: "pending" })), task({ id: 50 })]);
    overlay.update(); render();
    assert.equal(clock.intervals(), 0);

    state([task()]); overlay.update(); render();
    const staleComponent = component;
    component.dispose();
    assert.equal(clock.intervals(), 0, "host widget removal disposes clock");
    overlay.update(); render();
    assert.equal(clock.intervals(), 1);
    staleComponent.dispose();
    assert.equal(clock.intervals(), 1, "old component cannot stop a replacement");
    assert.deepEqual(staleComponent.render(100), []);
    store.setActiveRenderSession("replacement");
    const count = requests.length;
    clock.advance(150);
    assert.equal(clock.intervals(), 0);
    assert.equal(requests.length, count, "no redraw of a stale session");
    overlay.dispose(); overlay.dispose();

    state([task()]); overlay.setUICtx(ui); overlay.update(); render();
    overlay.setUICtx({ ...ui }); render();
    assert.equal(clock.intervals(), 0, "UI identity switch clears old resources");
    overlay.update(); render();
    ui.setWidget = () => { throw Error("stale context"); };
    // Bind the throwing UI and prove cleanup precedes stale-context access.
    overlay.dispose();
    overlay.setUICtx(ui);
    ui.setWidget = (_key, factory) => { component = factory?.(tui, theme); };
    overlay.update(); render();
    ui.setWidget = () => { throw Error("stale context"); };
    assert.throws(() => overlay.dispose(), /stale context/);
    assert.equal(clock.intervals(), 0);
    overlay.dispose();

    // Real extension handlers (injected overlay module, no model or host process).
    ui.setWidget = (_key, factory) => { component?.dispose?.(); component = factory?.(tui, theme); };
    const handlers = new Map();
    const pi = { on: (event, fn) => handlers.set(event, fn), registerTool() {}, registerCommand() {}, registerShortcut() {} };
    const ctx = (id, mode = "tui") => ({ mode, hasUI: mode === "tui" || mode === "rpc", ui, sessionManager: {
      getSessionId: () => id,
      getBranch: () => [{ type: "message", message: { role: "toolResult", toolName: "todo", details: { ...snapshot([task()]), action: "list", params: {} } } }],
    } });
    for (const reason of ["quit", "reload", "new", "resume", "fork"]) {
      store.clearActiveRenderSession();
      extension(pi, async () => ({ TodoOverlay }));
      assert.equal(clock.timers.size, 0, "extension factory starts no prewarm/animation resources");
      await handlers.get("session_start")({ reason: "startup" }, ctx(reason)); render();
      assert.equal(clock.intervals(), 1);
      assert.equal(clock.timers.size, 2, "animation + deferred prewarm only");
      await handlers.get("session_shutdown")({ reason }, ctx("child"));
      assert.equal(clock.intervals(), 1, "child teardown doesn't stop foreground");
      await handlers.get("session_shutdown")({ reason }, ctx(reason));
      assert.equal(clock.timers.size, 0, `all timers disposed on ${reason}`);
      await handlers.get("session_shutdown")({ reason }, ctx(reason));
    }
    // A pending lazy import cannot resurrect a widget after unload.
    store.clearActiveRenderSession();
    let resolveImport;
    extension(pi, () => new Promise((resolve) => { resolveImport = resolve; }));
    const starting = handlers.get("session_start")({ reason: "startup" }, ctx("late-import"));
    await handlers.get("session_shutdown")({ reason: "reload" }, ctx("late-import"));
    resolveImport({ TodoOverlay });
    await starting;
    assert.equal(clock.timers.size, 0);
    assert.equal(component, undefined);

    for (const mode of ["rpc", "print", "json"]) {
      store.clearActiveRenderSession();
      extension(pi, async () => ({ TodoOverlay }));
      await handlers.get("session_start")({ reason: "startup" }, ctx(mode, mode));
      assert.equal(clock.timers.size, 0, `${mode} starts no TUI timers`);
      await handlers.get("session_shutdown")({ reason: "quit" }, ctx(mode, mode));
    }
    console.log("animation/lifecycle/static fallback/Unicode contract: ok");
  } finally {
    Object.assign(global, originals);
    fs.unlinkSync(configFile);
  }
};
