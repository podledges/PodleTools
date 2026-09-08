// Test-only observation inside an isolated Pi process. The configured/index.ts
// extension owns the widget; synthetic session data is supplied by seed-session.py.
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
	const original = globalThis.setInterval;
	const ticks: number[] = [];
	let animationTimers = 0;
	let shutdown: ReturnType<typeof setTimeout> | undefined;
	// Observe, don't accelerate or replace the real clock. No host is running
	// outside this disposable process and the original is restored on shutdown.
	globalThis.setInterval = ((callback: () => void, ms: number, ...args: unknown[]) => {
		if (ms !== 150) return original(callback, ms, ...args);
		animationTimers++;
		return original(() => { ticks.push(performance.now()); callback(); }, ms);
	}) as typeof setInterval;
	pi.on("session_start", (_event, ctx) => {
		shutdown = setTimeout(() => ctx.shutdown(), 2100);
	});
	pi.on("session_shutdown", () => {
		globalThis.setInterval = original;
		if (shutdown !== undefined) clearTimeout(shutdown);
		writeFileSync(process.env.TODOATTENTION_CADENCE_FILE!, JSON.stringify({ animationTimers, ticks }));
	});
}
