/**
 * Migrated from podledges/PodleDoubleO commit 0c56b62 (PR #25).
 * Copyright 2026 Ayden / podledges. See ../NOTICE.md.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ADHD_STATE_ENTRY, readAdhdStartupDefault, replayAdhdSessionState } from "./footer-support/adhd-state.mjs";
import { formatSgdCost, readRateCache, refreshRate, needsRefresh } from "./footer-support/sgd-rate.mjs";

const contextColor = (text: string) => `\x1b[38;2;114;179;171m${text}\x1b[39m`;
const modelColor = (text: string) => `\x1b[38;2;50;122;122m${text}\x1b[39m`;
const costColor = (text: string) => `\x1b[38;2;177;110;223m${text}\x1b[39m`;
const mascotColor = (text: string) => `\x1b[38;2;156;110;79m${text}\x1b[39m`;
const codexColor = (text: string) => `\x1b[38;2;106;188;190m${text}\x1b[39m`;
const grokColor = (text: string) => `\x1b[38;2;58;134;255m${text}\x1b[39m`;
const featureLabelColor = (text: string) => `\x1b[38;2;255;0;255m${text}\x1b[39m`;
const enabledColor = (text: string) => `\x1b[38;2;204;255;0m${text}\x1b[39m`;
const SHEEP = "Ꮚ •ﻌ•Ꮚ";

// Codex/Grok quota runway via quota-axi, cache-first so render never blocks.
// Mirrors the Windows-side herdr-fleet-ui fleet-quota.js: read the cache,
// kick a detached refresh when it passes the TTL, hide the segment when the
// data is too stale to trust.
const QUOTA_TTL_S = 300;
const QUOTA_STALE_MAX_S = 10_800;
const QUOTA_REFRESH_HELPER = fileURLToPath(new URL("./footer-support/quota-refresh.mjs", import.meta.url));

let quotaMemo = { checkedAt: 0, text: "" };
let quotaRefreshAt = 0;

function quotaCachePath(): string {
  return process.env.PI_FLEET_QUOTA_CACHE
    ?? `${process.env.XDG_CACHE_HOME || `${homedir()}/.cache`}/pi-fleet-quota.json`;
}

function startQuotaRefresh(now: number, cache: string): void {
  quotaRefreshAt = now;
  if (process.env.PI_QUOTA_REFRESH_DISABLE === "1") return;
  try {
    spawn(process.execPath, [QUOTA_REFRESH_HELPER, "--cache", cache], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch {}
}

/** Binding constraint per provider: the valid window with the least % remaining. */
function minRemaining(p: any): number | null {
  if (!Array.isArray(p?.windows) || p.windows.length === 0) return null;
  let best: number | null = null;
  for (const w of p.windows) {
    const raw = typeof w?.percentRemaining === "number"
      ? w.percentRemaining
      : typeof w?.percentUsed === "number"
        ? 100 - w.percentUsed
        : null;
    if (raw == null || !Number.isFinite(raw) || raw < 0 || raw > 100) return null;
    const rem = Math.round(raw);
    if (best == null || rem < best) best = rem;
  }
  return best;
}

function quotaValue(p: any): string {
  const status = p?.state?.status;
  if (status === "error") return "err";
  if (!p || status === "auth_required" || status === "unavailable") return "?";
  const remaining = minRemaining(p);
  return remaining == null ? "?" : `${remaining}%`;
}

function unknownQuotaSegment(): string {
  return `${codexColor("gpt:?")}  ${grokColor("grk:?")}`;
}

function quotaSegment(): string {
  const now = Date.now();
  if (now - quotaMemo.checkedAt < 10_000) return quotaMemo.text;
  quotaMemo.checkedAt = now;
  let text = unknownQuotaSegment();
  const cache = quotaCachePath();
  try {
    const ageS = (now - statSync(cache).mtimeMs) / 1000;
    if (ageS > QUOTA_TTL_S && now - quotaRefreshAt > 120_000) {
      startQuotaRefresh(now, cache);
    }
    if (ageS <= QUOTA_STALE_MAX_S) {
      const data = JSON.parse(readFileSync(cache, "utf8"));
      const parts = ([
        ["codex", "gpt", codexColor],
        ["grok", "grk", grokColor],
      ] as const).map(([name, label, color]) => {
        const provider = (data?.providers ?? []).find((item: any) => item?.provider === name);
        return color(`${label}:${quotaValue(provider)}`);
      });
      text = parts.join("  ");
    }
  } catch {
    // No cache yet (or unreadable): report unknown truthfully and seed one.
    if (now - quotaRefreshAt > 120_000) startQuotaRefresh(now, cache);
  }
  quotaMemo.text = text;
  return text;
}

function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count < 1000) return Math.round(count).toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function usageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function telegramConnected(statuses: ReadonlyMap<string, string>): boolean {
  const status = statuses.get("telegram");
  if (!status) return false;
  const plain = stripAnsi(status).toLowerCase();
  return /\b(connected|leader|follower|active|processing|dispatching|queued)\b/.test(plain)
    && !/\b(disconnected|error|not configured|awaiting pairing|electing)\b/.test(plain);
}

function calmEnabled(ctx: any): boolean {
  const configRoot = process.env.FM_CONFIG_OVERRIDE
    ?? (process.env.FM_HOME ? `${process.env.FM_HOME}/config` : undefined)
    ?? (process.env.FM_ROOT_OVERRIDE ? `${process.env.FM_ROOT_OVERRIDE}/config` : undefined)
    ?? `${ctx.cwd}/config`;
  try {
    return readFileSync(`${configRoot}/calm`, "utf8").trim() === "on";
  } catch {
    return false;
  }
}

function adhdToggle(text: string): boolean | undefined {
  const normalized = text.trim().toLowerCase();
  if (/^\/(?:skill:)?i-have-adhd(?:\s|$)/.test(normalized)) return true;
  if (/^(?:stop adhd mode|normal mode)[.!]?$/.test(normalized)) return false;
  return undefined;
}

export default function (pi: ExtensionAPI) {
  let rate = readRateCache();
  let refreshController: AbortController | undefined;
  let requestRender = () => {};
  let adhdEnabled = false;
  let alive = true;
  const refresh = async (ctx: any, explicit = false) => {
    if (refreshController) return;
    const controller = refreshController = new AbortController();
    try {
      const result = await refreshRate({ signal: controller.signal });
      if (!alive || controller.signal.aborted) return;
      rate = result.rate ?? rate;
      requestRender();
      if (ctx.hasUI && (explicit || !rate)) ctx.ui.notify(
        rate
          ? `USD→SGD ${rate.rate} (as of ${rate.asOf}); ${result.status}. Footer $ is an SGD estimate, not subscription billing.`
          : `SGD estimate unavailable; no valid exchange rate (${result.error}). Run /sgd-rate-refresh when online.`,
        result.status === "refreshed" ? "info" : "warning",
      );
    } finally { if (refreshController === controller) refreshController = undefined; }
  };
  pi.registerCommand("sgd-rate-refresh", {
    description: "Refresh the cached USD→SGD rate (bounded HTTPS; retain last-known-good)",
    handler: async (_args, ctx) => { await refresh(ctx, true); },
  });
  pi.registerCommand("sgd-rate", {
    description: "Show the footer's exchange-rate source and timestamp without fetching",
    handler: async (_args, ctx) => {
      rate = readRateCache() ?? rate;
      requestRender();
      ctx.ui.notify(rate
        ? `USD→SGD ${rate.rate}; as of ${rate.asOf}; fetched ${rate.fetchedAt}; ${rate.source}. Footer $ is SGD, estimated, not subscription billing.`
        : "SGD estimate unavailable; no valid cached rate. Run /sgd-rate-refresh.", "info");
    },
  });
  pi.on("input", (event) => {
    const enabled = adhdToggle(event.text);
    if (enabled === undefined || enabled === adhdEnabled) return;
    adhdEnabled = enabled;
    pi.appendEntry(ADHD_STATE_ENTRY, { enabled });
    requestRender();
  });
  pi.on("turn_start", () => { rate = readRateCache() ?? rate; });
  pi.on("model_select", () => requestRender());
  pi.on("thinking_level_select", () => requestRender());
  pi.on("session_shutdown", () => {
    alive = false;
    adhdEnabled = false;
    refreshController?.abort();
    requestRender = () => {};
  });
  pi.on("session_start", (_event, ctx) => {
    alive = true;
    rate = readRateCache() ?? rate;
    const startupDefault = readAdhdStartupDefault(ctx.cwd);
    const stateEntries = (ctx.sessionManager as any).getBranch?.() ?? ctx.sessionManager.getEntries();
    adhdEnabled = replayAdhdSessionState(startupDefault, stateEntries);
    // Bootstrap/refresh on startup, never on footer render. Render uses memory only.
    if (needsRefresh(rate)) void refresh(ctx);
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() { unsubscribe(); requestRender = () => {}; },
        invalidate() {},
        render(width: number): string[] {
          let cost = 0;
          for (const entry of ctx.sessionManager.getEntries()) {
            const message = (entry as any).message;
            const usage = message?.usage ?? (entry as any).usage;
            if (usage) cost += usageNumber(usage.cost?.total);
          }

          const contextUsage = ctx.getContextUsage() as any;
          const contextWindow = usageNumber(contextUsage?.contextWindow) || usageNumber((ctx.model as any)?.contextWindow);
          const contextTokens = usageNumber(contextUsage?.tokens) || usageNumber(contextUsage?.input) || (
            usageNumber(contextUsage?.percent) && contextWindow
              ? Math.round((usageNumber(contextUsage?.percent) / 100) * contextWindow)
              : 0
          );
          const contextDisplay = `${formatTokens(contextTokens)} / ${formatTokens(contextWindow)}`;

          const sheepSeparator = `   ${mascotColor(SHEEP)}   `;
          const leftStyled = [
            contextColor(contextDisplay),
            costColor(`[$${formatSgdCost(cost, rate)}]`),
            quotaSegment(),
          ].join(sheepSeparator);

          const modelName = ctx.model?.id || "no-model";
          const rightSidePlain = ctx.model?.reasoning
            ? `${modelName} • ${ctx.thinkingLevel || "thinking off"}`
            : modelName;
          const rightSide = modelColor(rightSidePlain);
          const minPadding = 2;
          // Measure the strings that are actually rendered — padding math on a
          // separately-assembled plain string is what crashed the TUI before.
          const leftWidth = visibleWidth(leftStyled);
          const rightWidth = visibleWidth(rightSide);
          let statsLine: string;
          if (leftWidth + minPadding + rightWidth <= width) {
            statsLine = leftStyled + " ".repeat(width - leftWidth - rightWidth) + rightSide;
          } else if (rightWidth + minPadding < width) {
            const availableLeft = width - rightWidth - minPadding;
            const truncatedLeft = truncateToWidth(leftStyled, availableLeft, "...");
            statsLine = truncatedLeft
              + " ".repeat(width - visibleWidth(truncatedLeft) - rightWidth)
              + rightSide;
          } else {
            statsLine = truncateToWidth(rightSide, width, "...");
          }

          const statuses = footerData.getExtensionStatuses();
          const features = [
            ["adhd", adhdEnabled],
            ["calm", calmEnabled(ctx)],
            ["telegram", telegramConnected(statuses)],
          ] as const;
          const featureLine = features.map(([label, enabled]) => enabled
            ? `${featureLabelColor(label)} ${enabledColor("✔")}`
            : theme.fg("dim", `${label} ×`)
          ).join("   ");

          return [statsLine, featureLine].map((line) => truncateToWidth(line, width));
        },
      };
    });
  });
}
