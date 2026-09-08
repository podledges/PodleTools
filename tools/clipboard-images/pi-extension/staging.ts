import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { sep } from "node:path";

export const DEFAULT_STAGING_ROOT =
  "/mnt/c/Users/ayden/AppData/Local/PodlePaste/staging";
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87 = Buffer.from("GIF87a");
const GIF89 = Buffer.from("GIF89a");

export type ImageMagic = {
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
};

export function defaultStagingRoot(): string {
  return process.env.PODLE_PASTE_STAGING_ROOT || DEFAULT_STAGING_ROOT;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function detectImageMagic(bytes: Buffer): ImageMagic | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG)) {
    return { mimeType: "image/png" };
  }
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(JPEG)) {
    return { mimeType: "image/jpeg" };
  }
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).equals(GIF87) || bytes.subarray(0, 6).equals(GIF89))
  ) {
    return { mimeType: "image/gif" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp" };
  }
  return null;
}

export function isPathInsideRoot(filePath: string, root: string): boolean {
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return filePath === root || filePath.startsWith(rootWithSep);
}

export type StagedImage = {
  path: string;
  sha256: string;
  mimeType: ImageMagic["mimeType"];
  bytes: Buffer;
};

export type StagingError = {
  code:
    | "outside-root"
    | "missing"
    | "not-file"
    | "too-large"
    | "hash-mismatch"
    | "unsupported-magic"
    | "unreadable";
  message: string;
};

export function readStagedImage(
  requestedPath: string,
  expectedSha256: string,
  stagingRoot: string,
): { ok: true; image: StagedImage } | { ok: false; error: StagingError } {
  let rootReal: string;
  try {
    rootReal = realpathSync(stagingRoot);
  } catch {
    return {
      ok: false,
      error: { code: "missing", message: "staging root is not available" },
    };
  }

  let fileReal: string;
  try {
    fileReal = realpathSync(requestedPath);
  } catch {
    return {
      ok: false,
      error: { code: "missing", message: "staged screenshot is missing" },
    };
  }

  if (!isPathInsideRoot(fileReal, rootReal)) {
    return {
      ok: false,
      error: {
        code: "outside-root",
        message: "refusing to read a file outside the paste staging root",
      },
    };
  }

  try {
    const stat = statSync(fileReal);
    if (!stat.isFile()) {
      return {
        ok: false,
        error: { code: "not-file", message: "staged path is not a file" },
      };
    }
    if (stat.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: { code: "too-large", message: "staged screenshot exceeds size limit" },
      };
    }
  } catch {
    return {
      ok: false,
      error: { code: "unreadable", message: "staged screenshot is unreadable" },
    };
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(fileReal);
  } catch {
    return {
      ok: false,
      error: { code: "unreadable", message: "staged screenshot is unreadable" },
    };
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: { code: "too-large", message: "staged screenshot exceeds size limit" },
    };
  }

  const digest = sha256Hex(bytes);
  if (digest !== expectedSha256.toLowerCase()) {
    return {
      ok: false,
      error: {
        code: "hash-mismatch",
        message: "staged screenshot hash does not match the paste marker",
      },
    };
  }

  const magic = detectImageMagic(bytes);
  if (!magic) {
    return {
      ok: false,
      error: {
        code: "unsupported-magic",
        message: "staged file is not a supported image",
      },
    };
  }

  return {
    ok: true,
    image: {
      path: fileReal,
      sha256: digest,
      mimeType: magic.mimeType,
      bytes,
    },
  };
}
