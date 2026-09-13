#!/usr/bin/env node
const assert = require("node:assert/strict");
const ansi = (r, g, b, text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
const colors = {
  accent: [255, 0, 204],
  dim: [71, 58, 114],
  text: [255, 247, 255],
  warning: [255, 176, 0],
  success: [204, 255, 0],
  muted: [138, 127, 181],
  error: [255, 23, 79],
  toolTitle: [0, 234, 255],
};
const theme = {
  fg(token, text) {
    assert.ok(colors[token], `unexpected theme token ${token}`);
    return ansi(...colors[token], text);
  },
  bold: (text) => `\x1b[1m${text}\x1b[22m`,
  strikethrough: (text) => `\x1b[9m${text}\x1b[29m`,
};
const base = (overrides = {}) => ({ id: 1, subject: "Semantic title", status: "pending", ...overrides });

module.exports = async function testRenderer({ format, reducer, replay, sanitize, selectors, tui, todo, store }) {

  const gray = ansi(176, 176, 176, "●");
  const green = ansi(0, 230, 118, "●");
  const orange = ansi(255, 152, 0, "●");
  const legend = `${green} working${theme.fg("dim", " · ")}${gray} waiting${theme.fg("dim", " · ")}${orange} needs you`;

  // All three classes are structured and deterministic.
  assert.equal(format.classifyAttention(base()), "waiting");
  assert.equal(format.formatAttentionIndicator(base(), theme), gray);
  assert.equal(format.formatAttentionIndicator(base({ metadata: { attention: "unknown" } }), theme), gray);
  assert.equal(format.formatAttentionIndicator(base({ status: "in_progress" }), theme), gray, "stale status is gray");
  assert.equal(
    format.formatAttentionIndicator(base({ status: "in_progress", metadata: { attention: "agent-working" } }), theme),
    green,
  );
  assert.equal(
    format.formatAttentionIndicator(base({ status: "in_progress", blockedBy: [2], metadata: { attention: "agent-working" } }), theme),
    gray,
    "blocked work cannot claim active green",
  );
  assert.equal(format.formatAttentionIndicator(base({ metadata: { attention: "captain-input" } }), theme), orange);
  assert.equal(
    format.formatAttentionIndicator(
      base({ status: "in_progress", blockedBy: [2], metadata: { attention: "captain-input" } }),
      theme,
    ),
    orange,
    "captain input takes precedence over blocked or active state",
  );
  assert.equal(format.formatAttentionIndicator(base({ status: "completed" }), theme), "");
  assert.equal(format.formatAttentionIndicator(base({ status: "deleted" }), theme), "");
  assert.equal(format.WORKING_GREEN_HEX, "#00E676");
  assert.equal(format.WAITING_GRAY_HEX, "#B0B0B0");
  assert.equal(format.CAPTAIN_ORANGE_HEX, "#FF9800");
  assert.equal(format.formatAttentionLegend(theme), legend);
  assert.equal(tui.visibleWidth(legend), 35);
  const legacyCaptainCases = [
    [base({ subject: "Choose deployment", metadata: { attention: "captain-input" } }), "needs you: Choose deployment (decision context missing)"],
    [base({ subject: "Choose deployment", metadata: { attention: "captain-input", attentionReason: 42 } }), "needs you: Choose deployment (decision context invalid)"],
    [base({ subject: "Choose deployment", metadata: { attention: "captain-input", attentionReason: "x".repeat(161) } }), `needs you: ${"x".repeat(159)}… (decision context invalid)`],
  ];
  for (const [legacyTask, expected] of legacyCaptainCases) {
    const main = format.formatOverlayTaskLine(legacyTask, theme, true);
    const details = format.formatCaptainDecisionLines(legacyTask, theme, 48, "  ");
    assert.ok(!main.includes("needs you:"), "captain context is never inline");
    assert.ok(details.length >= 1 && details.every((line) => tui.visibleWidth(line) <= 48));
    assert.equal(format.formatAttentionSubtitle(legacyTask), expected);
    assert.ok(details.join("\n").includes("needs you:"));
  }
  for (const width of [1, 12, 24, 35]) {
    assert.ok(tui.visibleWidth(tui.truncateToWidth(legend, width, "…")) <= width);
  }

  // Waiting reasons remain honest, actionable, static, and terminal-safe.
  for (const [fields, expected] of [
    [{}, "pending; reason unknown"],
    [{ status: "in_progress", activeForm: "implementing changes" }, "waiting; activity unconfirmed"],
    [{ status: "in_progress", activeForm: "supervising" }, "waiting; activity unconfirmed"],
    [{ activeForm: "waiting for worker test results" }, "waiting for worker test results"],
    [{ blockedBy: [2, 3] }, "blocked by dependency #2, #3"],
    [{ metadata: { attention: "waiting", attentionReason: "awaiting CI" }, blockedBy: [2] }, "awaiting CI"],
    [{ metadata: { attention: "waiting", attentionReason: "tests failed; fix assertion" } }, "tests failed; fix assertion"],
    [{ metadata: { attention: "stale" } }, "activity stale; awaiting update"],
    [{ metadata: { attention: "captain-input", attentionReason: "choose merge or hold PR 24" } }, "needs you: choose merge or hold PR 24"],
    [{ metadata: { attention: "captain-input" } }, "needs you: Semantic title (decision context missing)"],
    [{ description: "approve staging deployment", metadata: { attention: "captain-input" } }, "needs you: approve staging deployment (decision context missing)"],
    [{ metadata: { attention: "captain-input", attentionReason: 42 } }, "needs you: Semantic title (decision context invalid)"],
    [{ metadata: { attention: "unknown", attentionReason: 42 } }, "pending; reason unknown"],
    [{ status: "completed", metadata: { attention: "captain-input", attentionReason: "old reason" } }, ""],
    [{ status: "deleted" }, ""],
  ]) assert.equal(format.formatAttentionSubtitle(base(fields)), expected);
  const dangerous = format.formatAttentionSubtitle(base({ metadata: { attentionReason: "awaiting\nCI\x1b[31m\u202e" } }));
  assert.ok(!/[\n\x1b\u202e]/.test(dangerous));
  for (let frame = 0; frame < 12; frame++) {
    assert.equal(format.formatAttentionIndicator(base({ metadata: { attention: "captain-input" } }), theme, frame), orange);
    assert.equal(format.formatAttentionIndicator(base({ blockedBy: [2], metadata: { attention: "agent-working" } }), theme, frame), gray);
  }
  // Attention uses the documented fixed palette; completion retains its theme token.
  const alternate = { ...theme, fg: (token, text) => `<${token}>${text}</${token}>` };
  assert.equal(format.formatAttentionIndicator(base({ metadata: { attention: "captain-input" } }), alternate), orange);
  assert.equal(format.overlayStatusGlyph("completed", alternate), "<success>✓</success>");
  assert.equal(format.overlayStatusGlyph("completed", theme), ansi(204, 255, 0, "✓"));

  // IDs remain visible and the indicator is immediately beside the ID.
  const state = { tasks: [base()], nextId: 2 };
  assert.equal(selectors.selectShowTaskIds(state), true);
  const overlay = format.formatOverlayTaskLine(base(), theme, selectors.selectShowTaskIds(state));
  assert.ok(overlay.includes(`${theme.fg("dim", "#1")} ${gray}`));

  // Narrow-width truncation preserves ANSI and the ID/marker prefix.
  const narrow = tui.truncateToWidth(overlay, 14, "…");
  assert.ok(tui.visibleWidth(narrow) <= 14);
  assert.ok(narrow.includes("#1"));
  assert.ok(narrow.includes(gray));
  assert.ok(narrow.endsWith("\x1b[0m") || narrow.endsWith("\x1b[39m") || narrow.includes("…"));

  // Legacy title decoration is normalized without deleting semantic content.
  assert.equal(sanitize.normalizeLegacyTitleMarker("● Semantic title"), "Semantic title");
  assert.equal(sanitize.normalizeLegacyTitleMarker(" ●  ● Semantic title"), "Semantic title");
  assert.equal(sanitize.normalizeLegacyTitleMarker("●"), "●");
  let current = { tasks: [], nextId: 1 };
  const missingDecision = reducer.applyTaskMutation(current, "create", {
    subject: "● Ask captain",
    metadata: { attention: "captain-input" },
  });
  assert.equal(missingDecision.op.kind, "error");
  assert.match(missingDecision.op.message, /attentionReason is required/);
  const nullDecision = reducer.applyTaskMutation(current, "create", {
    subject: "● Ask captain",
    metadata: { attention: "captain-input", attentionReason: null },
  });
  assert.equal(nullDecision.op.kind, "error");
  assert.match(nullDecision.op.message, /attentionReason is required/);
  const missingUpdateDecision = reducer.applyTaskMutation(
    { tasks: [base()], nextId: 2 },
    "update",
    { id: 1, metadata: { attention: "captain-input" } },
  );
  assert.equal(missingUpdateDecision.op.kind, "error");
  assert.match(missingUpdateDecision.op.message, /attentionReason is required/);
  const invalidDecision = reducer.applyTaskMutation(current, "create", {
    subject: "● Ask captain",
    metadata: { attention: "captain-input", attentionReason: "x".repeat(161) },
  });
  assert.equal(invalidDecision.op.kind, "error");
  assert.match(invalidDecision.op.message, /at most 160 characters/);
  current = reducer.applyTaskMutation(current, "create", {
    subject: "● Ask captain",
    metadata: { attention: "captain-input", attentionReason: " choose\nmerge or \x1b[31mhold PR 24 " },
  }).state;
  assert.equal(current.tasks[0].subject, "Ask captain");
  assert.deepEqual(current.tasks[0].metadata, {
    attention: "captain-input",
    attentionReason: "choose merge or hold PR 24",
  });

  // Captain answer -> waiting -> verified active -> paused transitions.
  current = reducer.applyTaskMutation(current, "update", {
    id: 1,
    metadata: { attention: "waiting", attentionReason: null },
  }).state;
  assert.equal(format.classifyAttention(current.tasks[0]), "waiting");
  assert.equal(format.formatAttentionIndicator(current.tasks[0], theme), gray);
  current = reducer.applyTaskMutation(current, "update", {
    id: 1,
    status: "in_progress",
    activeForm: "implementing answer",
    metadata: { attention: "agent-working" },
  }).state;
  assert.equal(format.classifyAttention(current.tasks[0]), "agent-working");
  assert.equal(format.formatAttentionIndicator(current.tasks[0], theme), green);
  current = reducer.applyTaskMutation(current, "update", {
    id: 1,
    status: "pending",
    metadata: { attention: "waiting" },
  }).state;
  assert.equal(format.classifyAttention(current.tasks[0]), "waiting");
  assert.equal(format.formatAttentionIndicator(current.tasks[0], theme), gray);

  // Replay migrates old title markers and leaves metadata/persistence intact.
  const replayed = replay.replayFromBranch({
    sessionManager: {
      getBranch: () => [{
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: { action: "list", params: {}, tasks: [{ ...base(), subject: "● Historic semantic" }], nextId: 2 },
        },
      }],
    },
  });
  assert.equal(replayed.tasks[0].subject, "Historic semantic");
  assert.equal(replayed.nextId, 2);

  // Tool list/get/update renderers carry real color bindings.
  const tasks = [
    base({ id: 1 }),
    base({ id: 2, status: "in_progress", metadata: { attention: "agent-working" } }),
    base({ id: 3, subject: "Refresh TodoAttention", blockedBy: [1], metadata: { attention: "captain-input", attentionReason: "choose merge or hold PR 24" } }),
    base({ id: 4, status: "completed" }),
    base({ id: 5, status: "deleted" }),
  ];
  assert.deepEqual(selectors.selectTodoCounts({ tasks, nextId: 6 }), {
    total: 4,
    pending: 2,
    inProgress: 1,
    completed: 1,
  });
  assert.deepEqual(tasks[1].metadata, { attention: "agent-working" });
  assert.equal(tasks[4].id, 5);
  const list = format.renderTodoResult({ details: { action: "list", params: { includeDeleted: true }, tasks, nextId: 6 } }, theme).render(120).join("\n");
  assert.ok(list.includes(legend), "list tool result includes the labeled shared legend");
  assert.ok(list.includes(gray));
  assert.ok(list.includes(green));
  assert.ok(list.includes(orange));
  assert.equal((list.match(/\x1b\[38;2;0;230;118m●\x1b\[39m/g) || []).length, 2);
  const listLines = list.split("\n");
  const listCaptain = listLines.findIndex((line) => line.includes("Refresh TodoAttention"));
  assert.ok(listCaptain >= 0 && !listLines[listCaptain].includes("needs you:"));
  assert.match(listLines[listCaptain + 1].replace(/\x1b\[[0-9;]*m/g, ""), /^    └─ needs you: choose merge or hold PR 24$/);
  const completedLine = list.split("\n").find((line) => line.includes("#4"));
  const deletedLine = list.split("\n").find((line) => line.includes("#5"));
  assert.ok(completedLine.includes(ansi(204, 255, 0, "✓")));
  assert.ok(!deletedLine.includes(ansi(204, 255, 0, "✓")));
  assert.ok(completedLine && !completedLine.includes(green) && !completedLine.includes(orange) && !completedLine.includes(gray));
  assert.ok(deletedLine && !deletedLine.includes(green) && !deletedLine.includes(orange) && !deletedLine.includes(gray));
  const create = format.renderTodoResult({ details: { action: "create", params: { subject: "waiting" }, tasks: [base()], nextId: 2 } }, theme).render(80).join("\n");
  assert.ok(create.includes("#1"));
  assert.ok(create.includes(gray));
  assert.ok(!create.includes("working") && !create.includes("needs you"), "mutation result stays legend-free");
  const update = format.renderTodoResult({ details: { action: "update", params: { id: 2 }, tasks, nextId: 6 } }, theme).render(80).join("\n");
  assert.ok(update.includes("#2"));
  assert.ok(update.includes(green));
  assert.ok(!update.includes("needs you"), "mutation result stays legend-free");
  const getLines = format.renderTodoResult({ details: { action: "get", params: { id: 3 }, tasks, nextId: 6 } }, theme).render(80);
  const get = getLines.join("\n");
  assert.ok(get.includes(orange));
  assert.equal(getLines.length, 2);
  assert.ok(getLines[0].includes("Refresh TodoAttention") && !getLines[0].includes("needs you:"));
  assert.match(getLines[1].replace(/\x1b\[[0-9;]*m/g, ""), /^    └─ needs you: choose merge or hold PR 24$/);
  for (const width of [12, 24, 40]) {
    const narrowGet = format.renderTodoResult({ details: { action: "get", params: { id: 3 }, tasks, nextId: 6 } }, theme).render(width);
    assert.ok(narrowGet.length >= 2);
    assert.ok(narrowGet.every((line) => tui.visibleWidth(line) <= width));
    assert.ok(narrowGet.slice(1).every((line) => /^    /.test(line.replace(/\x1b\[[0-9;]*m/g, ""))));
  }
  const deleted = format.renderTodoResult({ details: { action: "delete", params: { id: 5 }, tasks, nextId: 6 } }, theme).render(80).join("\n");
  assert.ok(deleted.includes("#5"));
  assert.ok(!deleted.includes(gray) && !deleted.includes(green) && !deleted.includes(orange));
  assert.ok(!deleted.includes("working") && !deleted.includes("needs you"), "mutation result stays legend-free");

  const complete = format.renderTodoResult({ details: { action: "update", params: { id: 4 }, tasks, nextId: 6 } }, theme).render(80).join("\n");
  assert.ok(complete.includes("\x1b[38;2;204;255;0m✓"));
  const preserved = base({ blockedBy: [2], owner: "worker", metadata: { attention: "waiting", attentionReason: "awaiting CI", unrelated: { keep: 1 } } });
  const original = JSON.stringify(preserved);
  format.formatOverlayTaskLine(preserved, theme, true, 5);
  assert.equal(JSON.stringify(preserved), original);
  // `/todos` uses the same formatting owner and labeled key.
  store.commitState("command-test", { tasks, nextId: 6 });
  const commandStateBefore = JSON.stringify(store.getState("command-test"));
  let command;
  todo.registerTodosCommand({ registerCommand: (_name, value) => { command = value; } });
  let notification = "";
  await command.handler("", {
    hasUI: true,
    sessionManager: { getSessionId: () => "command-test" },
    ui: { theme, notify: (text) => { notification = text; } },
  });
  assert.ok(notification.includes(legend));
  assert.ok(notification.includes(gray) && notification.includes(green) && notification.includes(orange));
  for (const label of ["working", "waiting", "needs you"]) assert.ok(notification.includes(label));
  const commandLines = notification.split("\n");
  const commandCaptain = commandLines.findIndex((line) => line.includes("Refresh TodoAttention"));
  assert.ok(commandCaptain >= 0 && !commandLines[commandCaptain].includes("needs you:"));
  assert.match(commandLines[commandCaptain + 1].replace(/\x1b\[[0-9;]*m/g, ""), /^    └─ needs you: choose merge or hold PR 24$/);
  assert.equal(JSON.stringify(store.getState("command-test")), commandStateBefore, "legend rendering never persists data");

  const dependencyState = { tasks: [preserved, base({ id: 2 })], nextId: 3 };
  const result = reducer.applyTaskMutation(dependencyState, "update", { id: 1, metadata: { attentionReason: null } });
  assert.deepEqual(result.state.tasks[0].blockedBy, [2]);
  assert.deepEqual(result.state.tasks[0].metadata, { attention: "waiting", unrelated: { keep: 1 } });
  assert.equal(result.state.tasks[0].owner, "worker");
  console.log("renderer contract: ok");
};
