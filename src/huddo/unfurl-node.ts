import { lookup } from "node:dns/promises";
import { privateAddress } from "./unfurl-core";

export async function publicHost(url: URL): Promise<boolean> {
  try {
    const addresses = await lookup(url.hostname, { all: true });
    return addresses.length > 0 && !addresses.some((a) => privateAddress(a.address));
  } catch {
    return false;
  }
}
