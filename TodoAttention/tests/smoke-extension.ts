import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commitState, setActiveRenderSession, sid } from "../state/store.js";
import { TodoOverlay } from "../todo-overlay.js";

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		const sessionId = sid(ctx);
		commitState(sessionId, {
			nextId: 6,
			tasks: [
				{ id: 1, subject: "Yellow waiting", status: "pending", metadata: { attention: "waiting" } },
				{
					id: 2,
					subject: "Verified active",
					status: "in_progress",
					activeForm: "running isolated smoke",
					metadata: { attention: "agent-working" },
				},
				{ id: 3, subject: "Captain decision", status: "pending", metadata: { attention: "captain-input" } },
				{
					id: 4,
					subject: "Blocked is yellow",
					status: "in_progress",
					blockedBy: [1],
					metadata: { attention: "agent-working" },
				},
				{ id: 5, subject: "Completed keeps completion style", status: "completed" },
			],
		});
		setActiveRenderSession(sessionId);
		const overlay = new TodoOverlay();
		overlay.setUICtx(ctx.ui);
		overlay.update();
		setTimeout(() => ctx.shutdown(), 750);
	});
}
