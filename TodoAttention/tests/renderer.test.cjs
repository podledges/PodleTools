#!/usr/bin/env node
const assert = require("node:assert/strict");
const path = require("node:path");
const { createJiti } = require(process.env.JITI_PATH);

const root = path.resolve(process.argv[2]);
const jiti = createJiti(process.cwd(), { interopDefault: true });
const load = (relative) => jiti.import(path.join(root, relative));
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

(async () => {
  const format = await load("view/format.ts");
  const reducer = await load("state/state-reducer.ts");
  const replay = await load("state/replay.ts");
  const sanitize = await load("tool/sanitize.ts");
  const selectors = await load("state/selectors.ts");
  const tui = await jiti.import("@earendil-works/pi-tui");

  const yellow = ansi(255, 255, 0, "●");
  const blue = ansi(0, 102, 255, "●");
  const pink = ansi(255, 0, 204, "●");

  // All three classes are structured and deterministic.
  assert.equal(format.classifyAttention(base()), "waiting");
  assert.equal(format.formatAttentionIndicator(base(), theme), yellow);
  assert.equal(format.formatAttentionIndicator(base({ metadata: { attention: "unknown" } }), theme), yellow);
  assert.equal(format.formatAttentionIndicator(base({ status: "in_progress" }), theme), yellow, "stale status is yellow");
  assert.equal(
    format.formatAttentionIndicator(base({ status: "in_progress", metadata: { attention: "agent-working" } }), theme),
    blue,
  );
  assert.equal(
    format.formatAttentionIndicator(base({ status: "in_progress", blockedBy: [2], metadata: { attention: "agent-working" } }), theme),
    yellow,
    "blocked work cannot claim active blue",
  );
  assert.equal(format.formatAttentionIndicator(base({ metadata: { attention: "captain-input" } }), theme), pink);
  assert.equal(
    format.formatAttentionIndicator(
      base({ status: "in_progress", blockedBy: [2], metadata: { attention: "captain-input" } }),
      theme,
    ),
    pink,
    "captain input takes precedence over blocked or active state",
  );
  assert.equal(format.formatAttentionIndicator(base({ status: "completed" }), theme), "");
  assert.equal(format.formatAttentionIndicator(base({ status: "deleted" }), theme), "");
  assert.equal(format.ACTIVE_BLUE_HEX, "#0066FF");
  assert.equal(format.WAITING_YELLOW_HEX, "#FFFF00");

  // IDs remain visible and the indicator is immediately beside the ID.
  const state = { tasks: [base()], nextId: 2 };
  assert.equal(selectors.selectShowTaskIds(state), true);
  const overlay = format.formatOverlayTaskLine(base(), theme, selectors.selectShowTaskIds(state));
  assert.ok(overlay.includes(`${theme.fg("dim", "#1")} ${yellow}`));

  // Narrow-width truncation preserves ANSI and the ID/marker prefix.
  const narrow = tui.truncateToWidth(overlay, 14, "…");
  assert.ok(tui.visibleWidth(narrow) <= 14);
  assert.ok(narrow.includes("#1"));
  assert.ok(narrow.includes(yellow));
  assert.ok(narrow.endsWith("\x1b[0m") || narrow.endsWith("\x1b[39m") || narrow.includes("…"));

  // Legacy title decoration is normalized without deleting semantic content.
  assert.equal(sanitize.normalizeLegacyTitleMarker("● Semantic title"), "Semantic title");
  assert.equal(sanitize.normalizeLegacyTitleMarker(" ●  ● Semantic title"), "Semantic title");
  assert.equal(sanitize.normalizeLegacyTitleMarker("●"), "●");
  let current = { tasks: [], nextId: 1 };
  current = reducer.applyTaskMutation(current, "create", {
    subject: "● Ask captain",
    metadata: { attention: "captain-input" },
  }).state;
  assert.equal(current.tasks[0].subject, "Ask captain");

  // Captain answer -> waiting -> verified active -> paused transitions.
  current = reducer.applyTaskMutation(current, "update", { id: 1, metadata: { attention: "waiting" } }).state;
  assert.equal(format.classifyAttention(current.tasks[0]), "waiting");
  assert.equal(format.formatAttentionIndicator(current.tasks[0], theme), yellow);
  current = reducer.applyTaskMutation(current, "update", {
    id: 1,
    status: "in_progress",
    activeForm: "implementing answer",
    metadata: { attention: "agent-working" },
  }).state;
  assert.equal(format.classifyAttention(current.tasks[0]), "agent-working");
  assert.equal(format.formatAttentionIndicator(current.tasks[0], theme), blue);
  current = reducer.applyTaskMutation(current, "update", {
    id: 1,
    status: "pending",
    metadata: { attention: "waiting" },
  }).state;
  assert.equal(format.classifyAttention(current.tasks[0]), "waiting");
  assert.equal(format.formatAttentionIndicator(current.tasks[0], theme), yellow);

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
    base({ id: 3, metadata: { attention: "captain-input" } }),
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
  assert.ok(list.includes(yellow));
  assert.ok(list.includes(blue));
  assert.ok(list.includes(pink));
  assert.equal((list.match(/\x1b\[38;2;0;102;255m●\x1b\[39m/g) || []).length, 1);
  const completedLine = list.split("\n").find((line) => line.includes("#4"));
  const deletedLine = list.split("\n").find((line) => line.includes("#5"));
  assert.ok(completedLine && !completedLine.includes(blue) && !completedLine.includes(pink) && !completedLine.includes(yellow));
  assert.ok(deletedLine && !deletedLine.includes(blue) && !deletedLine.includes(pink) && !deletedLine.includes(yellow));
  const create = format.renderTodoResult({ details: { action: "create", params: { subject: "waiting" }, tasks: [base()], nextId: 2 } }, theme).render(80).join("\n");
  assert.ok(create.includes("#1"));
  assert.ok(create.includes(yellow));
  const update = format.renderTodoResult({ details: { action: "update", params: { id: 2 }, tasks, nextId: 6 } }, theme).render(80).join("\n");
  assert.ok(update.includes("#2"));
  assert.ok(update.includes(blue));
  const get = format.renderTodoResult({ details: { action: "get", params: { id: 3 }, tasks, nextId: 6 } }, theme).render(80).join("\n");
  assert.ok(get.includes(pink));
  const deleted = format.renderTodoResult({ details: { action: "delete", params: { id: 5 }, tasks, nextId: 6 } }, theme).render(80).join("\n");
  assert.ok(deleted.includes("#5"));
  assert.ok(!deleted.includes(yellow) && !deleted.includes(blue) && !deleted.includes(pink));

  console.log("renderer contract: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
