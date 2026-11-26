import { join } from "node:path";
import { registerNewDevice } from "../src/identity/device/register-device";
import { canRegisterAgain, deviceRejection } from "./device-check";
import { acquireProcessLock, identityDir, readJson, releaseProcessLock, writeJson } from "./home";
import { accountFor, activeSlug, type Runtime } from "./runtime";

export const REGISTER_AGAIN_HOLD_MS = 60 * 60_000;

export type Registered = { ok: true; device: string } | { ok: false; reason: string };

type RegisterRecord = { at: number; device?: string; registered?: string; failed?: string; told?: boolean };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Registers a new device for `slug` with its root key after the server rejected device `rejected`, at most once an
 * hour per identity across all processes. Another process that already replaced the device counts as success.
 */
export async function registerAgain(rt: Runtime, slug: string, rejected: string, serverUrl: string): Promise<Registered> {
  const dir = identityDir(slug);
  const lock = join(dir, "register.lock");
  if (!acquireProcessLock(lock)) return { ok: false, reason: "another huddo process is registering this device" };
  try {
    const stored = rt.keyStore.identity(slug);
    if (!stored) return { ok: false, reason: `no identity ${slug} in this HUDDO_HOME` };
    if (stored.device_id !== rejected) return { ok: true, device: stored.device_id };
    const record = join(dir, "register-again.json");
    const last = readJson<RegisterRecord>(record);
    if (last?.at && Date.now() - last.at < REGISTER_AGAIN_HOLD_MS) return { ok: false, reason: "it was already tried less than an hour ago" };
    const at = Date.now();
    writeJson(record, { at, device: rejected });
    try {
      const fresh = await registerNewDevice({ ...stored, server_url: serverUrl }, rt.crypto);
      await rt.keyStore.saveIdentity({ ...fresh, server_url: stored.server_url });
      writeJson(record, { at, device: rejected, registered: fresh.device_id, told: false });
      return { ok: true, device: fresh.device_id };
    } catch (e) {
      writeJson(record, { at, device: rejected, failed: message(e) });
      return { ok: false, reason: message(e) };
    }
  } finally {
    releaseProcessLock(lock);
  }
}

const whenUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.toISOString().slice(11, 16)} UTC on ${d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}`;
};

/**
 * What to tell the agent after a re-registration: whispers sealed to the old device can no longer be opened. Returns
 * it once per re-registration (`told` in the record), for whichever process the agent talks to next. The daemon
 * registers in its own process, so the record is how the notice reaches a later command or tool call.
 */
export function reregisterNotice(as?: string): string | null {
  try {
    const slug = activeSlug(as);
    if (!slug) return null;
    const record = join(identityDir(slug), "register-again.json");
    const last = readJson<RegisterRecord>(record);
    if (!last?.registered || last.told !== false) return null;
    writeJson(record, { ...last, told: true });
    return `This device was registered again at ${whenUtc(last.at)}, so whispers sent to the old device before then can't be read. Say so in your original chat.`;
  } catch {
    return null;
  }
}

function rejectionIn(e: unknown): unknown {
  for (let cur = e, depth = 0; cur && depth < 5; cur = (cur as { cause?: unknown }).cause, depth += 1) {
    if (deviceRejection(cur)) return cur;
  }
  return null;
}

/**
 * Direct mode: after a command failed because the server does not know this device (or says it expired), checks the
 * device with one subkey rotation and, if that is rejected too, registers the device again. Returns a note for the
 * error line and whether the device was registered, or null.
 */
export async function recoverDevice(rt: Runtime, as: string | undefined, e: unknown): Promise<{ registered: boolean; note: string } | null> {
  if (!canRegisterAgain(deviceRejection(rejectionIn(e)))) return null;
  const slug = activeSlug(as);
  if (!slug) return null;
  const acct = accountFor(rt, slug);
  try {
    await acct.http.rotateSubkey();
    return null;
  } catch (check) {
    if (!canRegisterAgain(deviceRejection(check))) return null;
  }
  const got = await registerAgain(rt, slug, acct.identity.device_id, acct.identity.server_url);
  return got.ok
    ? { registered: true, note: `this device was registered again with the root key (device ${got.device}); run the command again` }
    : { registered: false, note: `registering this device again failed: ${got.reason}` };
}
