import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  DEFAULT_WINDOWS_SCRIPT,
  captureCurrentClipboard,
  isRetryableCaptureFailure,
  resolveCaptureConfig,
  type ExecResult,
} from "../capture.ts";
import { parseToolsCaptureStdout } from "../capture-stdout.ts";
import { sha256Hex } from "../staging.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");

const MIN_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300000002000100cfc8cd690000000049454e44ae426082",
  "hex",
);

test("Tools success JSON is what Pi consumes", () => {
  const line = readFileSync(join(fixtures, "tools-success.jsonl"), "utf8");
  const parsed = parseToolsCaptureStdout(line);
  assert.equal(parsed.schema, 1);
  assert.equal(parsed.kind, "image");
  assert.equal(parsed.label, "Screenshot Pasted");
  assert.ok(parsed.path.startsWith("/mnt/c/"));
  assert.equal(parsed.sha256.length, 64);
});

test("raw WindOS JSON is rejected (Pi must not call PS1 directly)", () => {
  const line = readFileSync(join(fixtures, "windos-success.jsonl"), "utf8");
  assert.throws(() => parseToolsCaptureStdout(line), /absolute WSL path/);
});

test("resolveCaptureConfig always uses argv --script and --staging-dir", () => {
  const resolved = resolveCaptureConfig({
    captureBin: "/tmp/mock-paste-capture",
    windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
    stagingDir: "/tmp/staging",
  });
  assert.equal(resolved.command, "/tmp/mock-paste-capture");
  assert.deepEqual(resolved.args, [
    "--script",
    "/tmp/Capture-CurrentClipboardImage.ps1",
    "--staging-dir",
    "/tmp/staging",
  ]);
  assert.doesNotMatch(resolved.args.join(" "), /latest|list|Screenshots2/);
});

test("relative capture paths are rejected", () => {
  assert.throws(
    () =>
      resolveCaptureConfig({
        captureBin: "paste-capture",
        windowsScript: "/tmp/script.ps1",
        stagingDir: "/tmp/staging",
      }),
    /absolute path/,
  );
});

test("mock capture validates staged PNG path/hash/magic/size", async () => {
  const root = mkdtempSync(join(tmpdir(), "paste-capture-"));
  const staged = join(root, "paste-unique.png");
  writeFileSync(staged, MIN_PNG);
  const sha = sha256Hex(MIN_PNG);
  const stdout = `${JSON.stringify({
    schema: 1,
    kind: "image",
    label: "Screenshot Pasted",
    path: staged,
    sha256: sha,
  })}\n`;

  const calls: string[][] = [];
  const runner = async (command: string, args: string[]): Promise<ExecResult> => {
    calls.push([command, ...args]);
    return { stdout, stderr: "", code: 0 };
  };

  const result = await captureCurrentClipboard({
    captureBin: "/tmp/mock-paste-capture",
    windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
    stagingDir: root,
    runner,
  });
  assert.equal(calls.length, 1);
  assert.equal(result.capture.sha256, sha);
  assert.equal(result.image.mimeType, "image/png");
  assert.deepEqual(result.image.bytes, MIN_PNG);
});

test("hash mismatch from mock capture does not attach", async () => {
  const root = mkdtempSync(join(tmpdir(), "paste-capture-bad-"));
  const staged = join(root, "paste-unique.png");
  writeFileSync(staged, MIN_PNG);
  const stdout = `${JSON.stringify({
    schema: 1,
    kind: "image",
    label: "Screenshot Pasted",
    path: staged,
    sha256: "a".repeat(64),
  })}\n`;
  await assert.rejects(
    () =>
      captureCurrentClipboard({
        captureBin: "/tmp/mock-paste-capture",
        windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
        stagingDir: root,
        runner: async () => ({ stdout, stderr: "", code: 0 }),
      }),
    /hash/,
  );
});

test("nonzero capture exit is a failure with no JSON success", async () => {
  await assert.rejects(
    () =>
      captureCurrentClipboard({
        captureBin: "/tmp/mock-paste-capture",
        windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
        stagingDir: "/tmp/staging",
        runner: async () => ({
          stdout: "",
          stderr: "no image on clipboard\n",
          code: 2,
        }),
      }),
    /no image on clipboard/,
  );
});

test("default Windows script is the live PodlePaste deploy path", () => {
  const resolved = resolveCaptureConfig({
    captureBin: "/tmp/mock-paste-capture",
  });
  assert.equal(
    DEFAULT_WINDOWS_SCRIPT,
    "/mnt/c/Users/ayden/AppData/Local/PodlePaste/deploy/Capture-CurrentClipboardImage.ps1",
  );
  assert.equal(resolved.args[1], DEFAULT_WINDOWS_SCRIPT);
  assert.equal(
    resolved.args.includes(
      "/mnt/c/Users/ayden/AppData/Local/PodleWindOS/tools/clipboard-images/Capture-CurrentClipboardImage.ps1",
    ),
    false,
  );
  const deployDir = "/mnt/c/Users/ayden/AppData/Local/PodlePaste/deploy";
  if (existsSync(deployDir)) {
    assert.equal(existsSync(DEFAULT_WINDOWS_SCRIPT), true);
  }
});

test("bounded retry waits for snip clipboard then stages the new PNG", async () => {
  const root = mkdtempSync(join(tmpdir(), "paste-retry-"));
  const staged = join(root, "paste-unique.png");
  writeFileSync(staged, MIN_PNG);
  const sha = sha256Hex(MIN_PNG);
  const stdout = `${JSON.stringify({
    schema: 1,
    kind: "image",
    label: "Screenshot Pasted",
    path: staged,
    sha256: sha,
  })}\n`;
  let calls = 0;
  const sleeps: number[] = [];
  const result = await captureCurrentClipboard({
    captureBin: "/tmp/mock-paste-capture",
    windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
    stagingDir: root,
    retryAttempts: 8,
    retryDelayMs: 10,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    runner: async (): Promise<ExecResult> => {
      calls += 1;
      if (calls < 3) {
        return { stdout: "", stderr: "clipboard is not an image\n", code: 2 };
      }
      return { stdout, stderr: "", code: 0 };
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [10, 20]);
  assert.equal(result.capture.sha256, sha);
});

test("stale previous screenshot is not substituted; retry waits for a new hash", async () => {
  const root = mkdtempSync(join(tmpdir(), "paste-stale-"));
  const stalePath = join(root, "stale.png");
  const freshPath = join(root, "fresh.png");
  const stalePng = Buffer.concat([MIN_PNG, Buffer.from([0x00])]);
  writeFileSync(stalePath, MIN_PNG);
  writeFileSync(freshPath, stalePng);
  const staleSha = sha256Hex(MIN_PNG);
  const freshSha = sha256Hex(stalePng);
  assert.notEqual(staleSha, freshSha);
  let calls = 0;
  const result = await captureCurrentClipboard({
    captureBin: "/tmp/mock-paste-capture",
    windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
    stagingDir: root,
    rejectSha256: staleSha,
    retryAttempts: 5,
    retryDelayMs: 5,
    sleep: async () => {},
    runner: async (): Promise<ExecResult> => {
      calls += 1;
      if (calls === 1) {
        return {
          stdout: `${JSON.stringify({
            schema: 1,
            kind: "image",
            label: "Screenshot Pasted",
            path: stalePath,
            sha256: staleSha,
          })}\n`,
          stderr: "",
          code: 0,
        };
      }
      return {
        stdout: `${JSON.stringify({
          schema: 1,
          kind: "image",
          label: "Screenshot Pasted",
          path: freshPath,
          sha256: freshSha,
        })}\n`,
        stderr: "",
        code: 0,
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.capture.sha256, freshSha);
  assert.equal(result.capture.path, freshPath);
});

test("JSON framing failures are not retried as snip races", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      captureCurrentClipboard({
        captureBin: "/tmp/mock-paste-capture",
        windowsScript: "/tmp/Capture-CurrentClipboardImage.ps1",
        stagingDir: "/tmp/staging",
        retryAttempts: 8,
        sleep: async () => {
          throw new Error("should not sleep");
        },
        runner: async () => {
          calls += 1;
          return {
            stdout: "",
            stderr: "paste-capture: capture stdout must be one JSON object followed by a newline",
            code: 1,
          };
        },
      }),
    /one JSON object followed by a newline/,
  );
  assert.equal(calls, 1);
  assert.equal(
    isRetryableCaptureFailure("capture stdout must be one JSON object followed by a newline"),
    false,
  );
});
