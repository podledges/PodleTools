import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ADHD_STATE_ENTRY = "firstmate-footer-adhd-state";

export function readAdhdStartupDefault(cwd, readFile = readFileSync) {
  if (typeof cwd !== "string" || cwd.length === 0) return false;
  try {
    return readFile(join(cwd, "config", "adhd"), "utf8").trim().toLowerCase() === "on";
  } catch {
    return false;
  }
}

export function replayAdhdSessionState(startupDefault, entries) {
  let enabled = startupDefault;
  for (const entry of entries) {
    if (entry?.type === "custom" && entry?.customType === ADHD_STATE_ENTRY) {
      enabled = entry.data?.enabled === true;
    }
  }
  return enabled;
}
