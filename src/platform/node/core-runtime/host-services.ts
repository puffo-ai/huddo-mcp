import { closeSync, constants, fstatSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, readSync, renameSync, unlinkSync, writeSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { SyncHttp } from "./sync-http";

/** What `client::node` imports from `globalThis.huddoNodeHost` (core-v2 crates/client/src/node/host_api.rs). */
export type NodeHostServices = Readonly<{
  fsOpen(path: string, create: boolean, exclusive: boolean, readOnly: boolean): number;
  fsRead(fd: number, length: number, offset: number): Uint8Array;
  fsWrite(fd: number, bytes: Uint8Array, offset: number): void;
  fsTruncate(fd: number, size: number): void;
  fsSync(fd: number): void;
  fsSize(fd: number): number;
  fsClose(fd: number): void;
  fsUnlink(path: string): boolean;
  fsExists(path: string): boolean;
  fsReadFile(path: string): Uint8Array | undefined;
  fsWriteFile(path: string, bytes: Uint8Array): void;
  fsRename(from: string, to: string): boolean;
  warn(message: string): void;
  httpSend(method: string, url: string, headersJson: string, body: Uint8Array | undefined, timeoutMs: number): unknown;
}>;

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Makes a rename survive a crash; Windows can't open a directory, and NTFS keeps renames in its journal. */
function syncDirectory(dir: string): void {
  if (process.platform === "win32") return;
  const fd = openSync(dir, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function nodeHostServices(http: SyncHttp): NodeHostServices {
  return {
    fsOpen(path, create, exclusive, readOnly) {
      if (readOnly) return openSync(path, constants.O_RDONLY);
      if (create) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const flags = constants.O_RDWR | (create ? constants.O_CREAT : 0) | (exclusive ? constants.O_EXCL : 0);
      return openSync(path, flags, 0o600);
    },
    fsRead(fd, length, offset) {
      const buffer = Buffer.alloc(length);
      let read = 0;
      while (read < length) {
        const n = readSync(fd, buffer, read, length - read, offset + read);
        if (n === 0) break;
        read += n;
      }
      return buffer.subarray(0, read);
    },
    fsWrite(fd, bytes, offset) {
      let written = 0;
      while (written < bytes.length) written += writeSync(fd, bytes, written, bytes.length - written, offset + written);
    },
    fsTruncate: (fd, size) => ftruncateSync(fd, size),
    fsSync: (fd) => fsyncSync(fd),
    fsSize: (fd) => fstatSync(fd).size,
    fsClose: (fd) => closeSync(fd),
    fsUnlink(path) {
      try {
        unlinkSync(path);
        return true;
      } catch (error) {
        if (missing(error)) return false;
        throw error;
      }
    },
    fsExists: (path) => existsSync(path),
    fsReadFile(path) {
      try {
        return readFileSync(path);
      } catch (error) {
        if (missing(error)) return undefined;
        throw error;
      }
    },
    fsWriteFile(path, bytes) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.${process.pid}.tmp`;
      const fd = openSync(temp, "w", 0o600);
      try {
        writeSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, path);
      syncDirectory(dirname(path));
    },
    fsRename(from, to) {
      try {
        renameSync(from, to);
        return true;
      } catch (error) {
        if (missing(error)) return false;
        throw error;
      }
    },
    warn: (message) => process.stderr.write(`${message}\n`),
    httpSend: (method, url, headersJson, body, timeoutMs) =>
      http({ method, url, headers: JSON.parse(headersJson) as Record<string, string>, body, timeoutMs }),
  };
}
