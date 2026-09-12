#!/usr/bin/env node
/** Refresh the quota-axi JSON cache atomically; rendering never waits for this process. */
import { closeSync, mkdirSync, openSync, renameSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const cacheIndex = args.indexOf("--cache");
const cache = cacheIndex >= 0 ? args[cacheIndex + 1] : undefined;
if (!cache || args.length !== 2) {
  console.error("Usage: quota-refresh.mjs --cache PATH");
  process.exit(2);
}

mkdirSync(dirname(cache), { recursive: true, mode: 0o700 });
const temporary = `${cache}.${process.pid}.tmp`;
let fd;
try {
  fd = openSync(temporary, "wx", 0o600);
  const command = process.env.PI_QUOTA_AXI || "quota-axi";
  const child = spawn(command, ["--json", "--provider", "codex,grok"], {
    stdio: ["ignore", fd, "ignore"],
  });
  const code = await new Promise((resolve) => {
    child.once("error", () => resolve(127));
    child.once("close", (value) => resolve(value ?? 1));
  });
  closeSync(fd);
  fd = undefined;
  if (code !== 0) process.exitCode = Number(code) || 1;
  else renameSync(temporary, cache);
} finally {
  if (fd !== undefined) closeSync(fd);
  try { unlinkSync(temporary); } catch {}
}
