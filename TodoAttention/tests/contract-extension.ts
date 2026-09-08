// Loaded by Pi's public DefaultResourceLoader, inside a complete scratch package.
// No custom Jiti aliases, global module paths, model/session, or package edits.
import * as tui from "@earendil-works/pi-tui";
import extension from "../index.js";
import { TodoOverlay } from "../todo-overlay.js";
import * as config from "../config.js";
import * as store from "../state/store.js";
import * as format from "../view/format.js";
import * as reducer from "../state/state-reducer.js";
import * as replay from "../state/replay.js";
import * as selectors from "../state/selectors.js";
import * as sanitize from "../tool/sanitize.js";
import testRenderer from "./renderer.test.cjs";
import testAnimation from "./animation.test.cjs";

export default async function (): Promise<void> {
	await testRenderer({ format, reducer, replay, sanitize, selectors, tui });
	await testAnimation({ TodoOverlay, store, format, config, extension, visibleWidth: tui.visibleWidth });
}
