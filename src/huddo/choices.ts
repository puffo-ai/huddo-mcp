export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const MAX_OPTION_CHARS = 80;
export const MAX_DESCRIPTION_CHARS = 200;
export const MAX_ANSWER_CHARS = 500;
export const CHOICE_CLOSE_CONTENT_TYPE = "huddo/choice-close/v1";

const KEY = /^[A-Za-z0-9_-]{1,32}$/;

export interface ChoiceOption {
  key: string;
  label: string;
  description?: string;
}

export interface Choice {
  questionId: string;
  key?: string;
  text?: string;
}

export type OptionInput = string | { key?: unknown; label?: unknown; description?: unknown };

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

export function cleanOptions(raw: unknown): ChoiceOption[] | null {
  if (!Array.isArray(raw) || raw.length < MIN_OPTIONS || raw.length > MAX_OPTIONS) return null;
  const out: ChoiceOption[] = [];
  for (const [i, value] of raw.entries()) {
    const item = typeof value === "string" ? { label: value } : value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    if (!item || typeof item.label !== "string") return null;
    const label = squash(item.label);
    const key = item.key === undefined ? `o${i + 1}` : item.key;
    if (!label || label.length > MAX_OPTION_CHARS || typeof key !== "string" || !KEY.test(key)) return null;
    if (out.some((o) => o.key === key || o.label.toLowerCase() === label.toLowerCase())) return null;
    let description: string | undefined;
    if (item.description !== undefined) {
      if (typeof item.description !== "string") return null;
      description = squash(item.description);
      if (description.length > MAX_DESCRIPTION_CHARS) return null;
    }
    out.push(description ? { key, label, description } : { key, label });
  }
  return out;
}

const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);

export function optionsOf(content: unknown): ChoiceOption[] | null {
  return cleanOptions(record(content)?.options);
}

export function isClosedContent(content: unknown): boolean {
  return record(content)?.closed === true;
}

export function choiceOf(content: unknown): Choice | null {
  const choice = record(record(content)?.choice);
  if (!choice) return null;
  if (typeof choice.question_id === "string" && choice.question_id) {
    if (typeof choice.key === "string" && KEY.test(choice.key)) return { questionId: choice.question_id, key: choice.key };
    const text = typeof choice.text === "string" ? choice.text.trim() : "";
    if (text && text.length <= MAX_ANSWER_CHARS) return { questionId: choice.question_id, text };
    return null;
  }
  const { question, option } = choice;
  if (typeof question !== "string" || !question || !Number.isInteger(option)) return null;
  const index = option as number;
  return index >= 0 && index < MAX_OPTIONS ? { questionId: question, key: `o${index + 1}` } : null;
}

export function optionsContent(text: string, options: ChoiceOption[]) {
  return { text, attachments: [], options };
}

export function choiceContent(option: ChoiceOption, questionId: string) {
  return { text: option.label, attachments: [], choice: { question_id: questionId, key: option.key } };
}

export function textAnswerContent(text: string, questionId: string) {
  const answer = text.trim().slice(0, MAX_ANSWER_CHARS);
  return { text: answer, attachments: [], choice: { question_id: questionId, text: answer } };
}

export function closeContent(target: string) {
  return { type: "choice-close", target };
}

export function isCloseContent(content: unknown): boolean {
  const c = record(content);
  return c?.type === "choice-close" && typeof c.target === "string";
}

export function closeTargetOf(contentType: unknown, content: unknown): string | null {
  if (contentType !== CHOICE_CLOSE_CONTENT_TYPE || !isCloseContent(content)) return null;
  return (content as { target: string }).target;
}

/** Questions their own asker closed; a close from anyone else is ignored. */
export function closedQuestions(
  messages: ReadonlyArray<{ id: string; sender: string; contentType: unknown; content: unknown }>,
): Set<string> {
  const owners = new Map(messages.map((m) => [m.id, m.sender]));
  const closed = new Set<string>();
  for (const m of messages) {
    const target = closeTargetOf(m.contentType, m.content);
    if (target && owners.get(target) === m.sender) closed.add(target);
  }
  return closed;
}

export interface ChoiceTally {
  counts: Map<string, number>;
  voters: Map<string, string[]>;
  others: Array<{ sender: string; text: string }>;
  mine: string | null;
  mineText: string | null;
  total: number;
}

type Pick = { key?: string; text?: string; at: number };

export function tallyChoices(
  rows: ReadonlyArray<{ sender: string; choice?: Choice; sentAt: number; unsent?: boolean }>,
  self: string | null,
): Map<string, ChoiceTally> {
  const latest = new Map<string, Map<string, Pick>>();
  for (const row of rows) {
    if (!row.choice || row.unsent) continue;
    const bySender = latest.get(row.choice.questionId) ?? new Map<string, Pick>();
    const prev = bySender.get(row.sender);
    if (!prev || prev.at <= row.sentAt) bySender.set(row.sender, { key: row.choice.key, text: row.choice.text, at: row.sentAt });
    latest.set(row.choice.questionId, bySender);
  }
  const out = new Map<string, ChoiceTally>();
  for (const [question, bySender] of latest) {
    const counts = new Map<string, number>();
    const voters = new Map<string, string[]>();
    const others: Array<{ sender: string; text: string }> = [];
    for (const [sender, pick] of bySender) {
      if (pick.key) {
        counts.set(pick.key, (counts.get(pick.key) ?? 0) + 1);
        voters.set(pick.key, [...(voters.get(pick.key) ?? []), sender]);
      } else if (pick.text) others.push({ sender, text: pick.text });
    }
    const mine = self ? bySender.get(self) : undefined;
    out.set(question, { counts, voters, others, mine: mine?.key ?? null, mineText: mine?.text ?? null, total: bySender.size });
  }
  return out;
}
