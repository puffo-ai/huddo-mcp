export const NEW_AGENT_DESCRIPTION_MAX = 100;

const VALID_KEYS = new Set([
  "name",
  "role",
  "description",
  "message",
] as const);

const ALL_KEY_NAMES = ["name", "role", "description", "message", "soul", "comment"];
const ALL_KEY_RE = new RegExp(`(${ALL_KEY_NAMES.join("|")})\\s*:`, "gi");

export interface NewAgentSpec {
  name?: string;
  role?: string;
  description?: string;
  message?: string;
}

export interface ParsedNewAgentCommand {
  preamble: string;
  spec: NewAgentSpec;
  descriptionTruncated: boolean;
}

export function parseNewAgentCommand(
  body: string,
): ParsedNewAgentCommand | null {
  if (!body) return null;
  const strict = strictParse(body);
  if (strict !== null) return strict;
  const normalized = normalizeBody(body);
  if (normalized === body) return null;
  return strictParse(normalized);
}

function strictParse(body: string): ParsedNewAgentCommand | null {
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  let markerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().toLowerCase() === "/agent") {
      markerIdx = i;
      break;
    }
  }
  if (markerIdx === -1) return null;

  const preamble = lines.slice(0, markerIdx).join("\n").trim();
  const spec: NewAgentSpec = {};
  let descriptionTruncated = false;
  const seen = new Set<string>();

  for (let i = markerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;

    const m = /^([a-zA-Z]+)\s*:\s*(.*)$/.exec(raw);
    if (!m) return null;

    const key = m[1].toLowerCase();
    const value = m[2];

    if (!(VALID_KEYS as ReadonlySet<string>).has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    let v = value.trim();
    if (key === "description" && v.length > NEW_AGENT_DESCRIPTION_MAX) {
      v = v.slice(0, NEW_AGENT_DESCRIPTION_MAX);
      descriptionTruncated = true;
    }
    (spec as Record<string, string>)[key] = v;
  }

  return { preamble, spec, descriptionTruncated };
}

function normalizeBody(body: string): string {
  const m = /\/agent/i.exec(body);
  if (!m) return body;
  const prefix = body.slice(0, m.index) + "/agent";
  const after = body.slice(m.index + "/agent".length);
  return prefix + after.replace(ALL_KEY_RE, "\n$1:");
}

export function specFromAgentProfile(args: {
  display_name: string;
  role_short?: string;
  role?: string;
  message?: string;
}): NewAgentSpec {
  const role = args.role ?? "";
  const description = role.includes(":")
    ? role.slice(role.indexOf(":") + 1).trim()
    : "";
  return {
    name: args.display_name,
    role: args.role_short || undefined,
    description: description || undefined,
    message: args.message,
  };
}

export function formatNewAgentCommand(spec: NewAgentSpec): string {
  const lines: string[] = ["/agent"];
  if (spec.name) lines.push(`name: ${spec.name}`);
  if (spec.role) lines.push(`role: ${spec.role}`);
  if (spec.description) lines.push(`description: ${spec.description}`);
  if (spec.message) lines.push(`message: ${spec.message}`);
  return lines.join("\n");
}
