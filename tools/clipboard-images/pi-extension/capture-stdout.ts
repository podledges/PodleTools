/** Validate paste-capture stdout. Matches PodleTools PR 16 JSON, not raw WindOS JSON. */

export type ToolsCaptureJson = {
  schema: 1;
  kind: "image";
  label: "Screenshot Pasted";
  path: string;
  sha256: string;
  windows_path?: string;
};

export function parseToolsCaptureStdout(stdout: string): ToolsCaptureJson {
  if (!stdout) {
    throw new Error("empty capture output");
  }
  const line = stdout.split(/\r?\n/, 1)[0] ?? "";
  if (!line) {
    throw new Error("empty capture output");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(line);
  } catch {
    throw new Error("capture stdout is not valid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("capture stdout must be a JSON object");
  }
  const record = payload as Record<string, unknown>;
  if (record.schema !== 1) {
    throw new Error("capture JSON schema must be 1");
  }
  if (record.kind !== "image") {
    throw new Error("capture JSON kind must be 'image'");
  }
  if (record.label !== "Screenshot Pasted") {
    throw new Error("capture JSON label must be 'Screenshot Pasted'");
  }
  if (typeof record.path !== "string" || !record.path.startsWith("/")) {
    throw new Error("capture path must be an absolute WSL path");
  }
  if (record.path.includes("..") || /[\r\n\x1b]/.test(record.path)) {
    throw new Error("capture path rejected");
  }
  if (typeof record.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(record.sha256)) {
    throw new Error("capture JSON sha256 must be 64 hex characters");
  }
  const result: ToolsCaptureJson = {
    schema: 1,
    kind: "image",
    label: "Screenshot Pasted",
    path: record.path,
    sha256: record.sha256.toLowerCase(),
  };
  if (typeof record.windows_path === "string" && record.windows_path) {
    result.windows_path = record.windows_path;
  }
  return result;
}
