import { MENTION_RE } from "../chat/remark-mentions";

export const NEW_CHANNEL_DESCRIPTION_MAX = 100;

const VALID_KEYS = new Set([
  "name",
  "description",
  "members",
  "message",
] as const);

const ALL_KEY_NAMES = ["name", "description", "members", "message"];
const ALL_KEY_RE = new RegExp(`(${ALL_KEY_NAMES.join("|")})\\s*:`, "gi");

function parseMembers(value: string): string[] {
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags);
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const slug = m[2];
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

export interface NewChannelSpec {
  name?: string;
  description?: string;
  members?: string[];
  message?: string;
}

export interface ParsedNewChannelCommand {
  preamble: string;
  spec: NewChannelSpec;
  descriptionTruncated: boolean;
}

export function parseNewChannelCommand(
  body: string,
): ParsedNewChannelCommand | null {
  if (!body) return null;
  const strict = strictParse(body);
  if (strict !== null) return strict;
  const normalized = normalizeBody(body);
  if (normalized === body) return null;
  return strictParse(normalized);
}

function strictParse(body: string): ParsedNewChannelCommand | null {
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  let markerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().toLowerCase() === "/channel") {
      markerIdx = i;
      break;
    }
  }
  if (markerIdx === -1) return null;

  const preamble = lines.slice(0, markerIdx).join("\n").trim();
  const spec: NewChannelSpec = {};
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

    if (key === "members") {
      spec.members = parseMembers(value);
      continue;
    }

    let v = value.trim();
    if (key === "description" && v.length > NEW_CHANNEL_DESCRIPTION_MAX) {
      v = v.slice(0, NEW_CHANNEL_DESCRIPTION_MAX);
      descriptionTruncated = true;
    }
    (spec as Record<string, string>)[key] = v;
  }

  return { preamble, spec, descriptionTruncated };
}

function normalizeBody(body: string): string {
  const m = /\/channel/i.exec(body);
  if (!m) return body;
  const prefix = body.slice(0, m.index) + "/channel";
  const after = body.slice(m.index + "/channel".length);
  return prefix + after.replace(ALL_KEY_RE, "\n$1:");
}

export function formatNewChannelCommand(spec: NewChannelSpec): string {
  const lines: string[] = ["/channel"];
  if (spec.name) lines.push(`name: ${spec.name}`);
  if (spec.description) lines.push(`description: ${spec.description}`);
  if (spec.members?.length) {
    lines.push(`members: ${spec.members.map((s) => `@${s}`).join(" ")}`);
  }
  if (spec.message) lines.push(`message: ${spec.message}`);
  return lines.join("\n");
}
