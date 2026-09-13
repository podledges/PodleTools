import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ADHD_STATE_ENTRY,
  readAdhdStartupDefault,
  replayAdhdSessionState,
} from "../adhd-state.mjs";

function project(t, name = "project") {
  const root = mkdtempSync(join(tmpdir(), "footer-adhd-state-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, name);
  mkdirSync(join(cwd, "config"), { recursive: true });
  return { root, cwd };
}

function state(enabled) {
  return { type: "custom", customType: ADHD_STATE_ENTRY, data: { enabled } };
}

test("trimmed, case-normalized exact on enables the scoped startup default", t => {
  const { cwd } = project(t);
  writeFileSync(join(cwd, "config", "adhd"), "  On\n");
  assert.equal(readAdhdStartupDefault(cwd), true);
});

test("absent, empty, off, malformed, and unreadable markers disable", t => {
  const { cwd } = project(t);
  assert.equal(readAdhdStartupDefault(cwd), false, "absent");

  for (const [label, content] of [["empty", ""], ["off", "off\n"], ["malformed", "on please"]]) {
    writeFileSync(join(cwd, "config", "adhd"), content);
    assert.equal(readAdhdStartupDefault(cwd), false, label);
  }

  assert.equal(readAdhdStartupDefault(cwd, () => { throw new Error("unreadable"); }), false, "unreadable");
});

test("latest explicit branch entry overrides the startup default both directions", () => {
  assert.equal(replayAdhdSessionState(true, [state(false)]), false);
  assert.equal(replayAdhdSessionState(false, [state(true)]), true);
  assert.equal(replayAdhdSessionState(true, [state(false), state(true)]), true);
  assert.equal(replayAdhdSessionState(false, [state(true), state(false)]), false);
});

test("unrelated entries do not change the existing false default", () => {
  assert.equal(replayAdhdSessionState(false, [
    { type: "custom", customType: "something-else", data: { enabled: true } },
    { type: "message", message: { role: "user", content: "on" } },
  ]), false);
});

test("marker lookup is scoped to the supplied project cwd", t => {
  const { root, cwd: firstmateCwd } = project(t, "firstmate");
  const unrelatedCwd = join(root, "unrelated");
  mkdirSync(join(unrelatedCwd, "config"), { recursive: true });
  writeFileSync(join(firstmateCwd, "config", "adhd"), "on\n");

  assert.equal(readAdhdStartupDefault(firstmateCwd), true);
  assert.equal(readAdhdStartupDefault(unrelatedCwd), false);
});
