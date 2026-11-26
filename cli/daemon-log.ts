import { appendFileSync, existsSync, renameSync, statSync } from "node:fs";
import { daemonLogPath } from "./ipc";

const LOG_CAP_BYTES = 1024 * 1024;

let foreground = false;

export function logToStderr(on: boolean): void {
  foreground = on;
}

export function log(message: string): void {
  const line = `${new Date().toISOString()} [${process.pid}] ${message}\n`;
  if (foreground) process.stderr.write(line);
  try {
    const path = daemonLogPath();
    if (existsSync(path) && statSync(path).size > LOG_CAP_BYTES) renameSync(path, `${path}.1`);
    appendFileSync(path, line);
  } catch {}
}
