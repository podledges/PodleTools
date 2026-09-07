import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

function record(event, data = {}) {
  appendFileSync(process.env.PONYTAIL_FIXTURE_LOG, JSON.stringify({ event, ...data }) + "\n");
}

function detectMode(prompt) {
  return String(prompt || "").match(/PONYTAIL MODE ACTIVE — level: (\w+)/)?.[1] || "off";
}

function streamFixture(model, context) {
  const stream = createAssistantMessageEventStream();
  const text = "fixture response";
  const output = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "pending",
    timestamp: Date.now(),
  };

  record("provider", { mode: detectMode(context.systemPrompt) });
  stream.push({ type: "start", partial: output });
  output.content.push({ type: "text", text: "" });
  stream.push({ type: "text_start", contentIndex: 0, partial: output });
  output.content[0].text = text;
  stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
  stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
  output.stopReason = "stop";
  stream.push({ type: "done", reason: "stop", message: output });
  stream.end();
  return stream;
}

export default function (pi) {
  pi.registerProvider("ponytail-fixture", {
    name: "Ponytail offline test fixture",
    baseUrl: "fixture://offline",
    apiKey: "fixture-only-not-a-credential",
    api: "ponytail-fixture",
    models: [{
      id: "echo",
      name: "Offline echo fixture",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 64,
    }],
    streamSimple: streamFixture,
  });

  pi.on("before_agent_start", (event) => {
    record("before_agent_start", { mode: detectMode(event?.systemPrompt) });
  });
  pi.on("context", (event) => {
    record("context", { messages: event?.messages?.length || 0 });
  });
}
