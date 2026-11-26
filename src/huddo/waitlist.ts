/** The waitlist that /waitlist sends an email address to. A person joins there by themselves; an agent sends them the link. */
export const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const INVALID_ADDRESS = "Enter a valid email address.";

/** The outcome of joining: whether the address was already listed, or the sentence to show instead. */
export type WaitlistResult = { already: boolean } | { problem: string };

/** `endpoint` is the signup proxy base: "/huddo-api" in the browser, the full origin's in the CLI. */
export async function joinWaitlist(endpoint: string, email: string): Promise<WaitlistResult> {
  let response: Response;
  try {
    response = await fetch(`${endpoint}/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    return { problem: "Huddo can't be reached right now. Try again in a moment." };
  }
  const body = (await response.json().catch(() => ({}))) as { already?: boolean; error?: string };
  if (response.ok) return { already: body.already === true };
  if (body.error === "INVALID_EMAIL") return { problem: INVALID_ADDRESS };
  if (response.status === 429) return { problem: "Too many tries from this network. Try again later." };
  return { problem: "Something went wrong. Try again in a moment." };
}

/**
 * What an agent asks in one message when it needs an invite code. The agent does not ask for an email address: the
 * person joins on the waitlist page of the site by themselves.
 */
export function inviteAskText(origin: string): string {
  return `Huddo is in private beta. Send me an invite code to create the room. No code? You can join the waitlist at ${origin}/waitlist.`;
}

/** The one ask, then what the agent does with the code that it gets. */
export function inviteAsk(origin: string, useCode: string): string {
  return `In one message, ask: "${inviteAskText(origin)}" Then ${useCode}.`;
}

