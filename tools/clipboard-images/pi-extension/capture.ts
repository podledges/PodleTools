/** Invoke the deployed paste-capture CLI. Never reads the clipboard itself. */

import { spawn } from "node:child_process";
import { parseToolsCaptureStdout, type ToolsCaptureJson } from "./capture-stdout.ts";
import {
  defaultStagingRoot,
  readStagedImage,
  type StagedImage,
} from "./staging.ts";

export const DEFAULT_CAPTURE_BIN =
  "/home/podles/.local/share/paste-linker/bin/paste-capture";
/** Live Windows capture script installed by activation, not the missing WindOS tree. */
export const DEFAULT_WINDOWS_SCRIPT =
  "/mnt/c/Users/ayden/AppData/Local/PodlePaste/deploy/Capture-CurrentClipboardImage.ps1";
export const CAPTURE_TIMEOUT_MS = 30_000;
export const CLIPBOARD_RETRY_ATTEMPTS = 8;
export const CLIPBOARD_RETRY_DELAY_MS = 50;

const RETRYABLE_CAPTURE =
  /clipboard is not an image|clipboard changed during capture|advertised an image but returned no image data|still has the previous screenshot/i;

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export type ExecRunner = (
  command: string,
  args: string[],
  options?: { timeout?: number },
) => Promise<ExecResult>;

export type CaptureOptions = {
  captureBin?: string;
  windowsScript?: string;
  stagingDir?: string;
  timeoutMs?: number;
  runner?: ExecRunner;
  rejectSha256?: string;
  retryAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type CaptureSuccess = {
  capture: ToolsCaptureJson;
  image: StagedImage;
};

function assertAbsolutePath(value: string, what: string): string {
  if (!value.startsWith("/")) {
    throw new Error(`${what} must be an absolute path`);
  }
  if (value.includes("\0") || /[\r\n]/.test(value)) {
    throw new Error(`${what} rejected`);
  }
  if (value.includes("..")) {
    throw new Error(`${what} rejected`);
  }
  return value;
}

export function resolveCaptureConfig(options: CaptureOptions = {}): {
  command: string;
  args: string[];
  stagingDir: string;
  timeoutMs: number;
} {
  const command = assertAbsolutePath(
    options.captureBin ||
      process.env.PODLE_PASTE_CAPTURE ||
      DEFAULT_CAPTURE_BIN,
    "capture program",
  );
  const windowsScript = assertAbsolutePath(
    options.windowsScript ||
      process.env.PODLE_PASTE_WINDOWS_SCRIPT ||
      DEFAULT_WINDOWS_SCRIPT,
    "Windows capture script",
  );
  const stagingDir = assertAbsolutePath(
    options.stagingDir ||
      process.env.PODLE_PASTE_STAGING_ROOT ||
      defaultStagingRoot(),
    "staging directory",
  );
  const args = ["--script", windowsScript, "--staging-dir", stagingDir];
  return {
    command,
    args,
    stagingDir,
    timeoutMs: options.timeoutMs ?? CAPTURE_TIMEOUT_MS,
  };
}

export function defaultExec(
  command: string,
  args: string[],
  options: { timeout?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const timeoutMs = options.timeout ?? CAPTURE_TIMEOUT_MS;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        code: code ?? 1,
      });
    });
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isRetryableCaptureFailure(message: string): boolean {
  return RETRYABLE_CAPTURE.test(message);
}

async function captureOnce(
  options: CaptureOptions,
): Promise<CaptureSuccess> {
  const resolved = resolveCaptureConfig(options);
  const runner = options.runner ?? defaultExec;
  const result = await runner(resolved.command, resolved.args, {
    timeout: resolved.timeoutMs,
  });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim() || `exit ${result.code}`;
    throw new Error(`capture failed: ${detail}`);
  }
  const capture = parseToolsCaptureStdout(result.stdout);
  const rejectSha = options.rejectSha256?.toLowerCase();
  if (rejectSha && capture.sha256 === rejectSha) {
    throw new Error(
      "clipboard still has the previous screenshot; finish the new snip first",
    );
  }
  const read = readStagedImage(capture.path, capture.sha256, resolved.stagingDir);
  if (!read.ok) {
    throw new Error(read.error.message);
  }
  if (read.image.mimeType !== "image/png") {
    throw new Error("staged capture is not a PNG");
  }
  return { capture, image: read.image };
}

export async function captureCurrentClipboard(
  options: CaptureOptions = {},
): Promise<CaptureSuccess> {
  const attempts = options.retryAttempts ?? CLIPBOARD_RETRY_ATTEMPTS;
  const delayMs = options.retryDelayMs ?? CLIPBOARD_RETRY_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await captureOnce(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (
        attempt >= attempts - 1 ||
        !isRetryableCaptureFailure(lastError.message)
      ) {
        throw lastError;
      }
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError ?? new Error("capture failed");
}
