import { MAX_ANSWER_CHARS, MAX_OPTION_CHARS, MAX_OPTIONS, MIN_OPTIONS } from "./choices";

export const MAX_FIELDS = 8;
export const FIELD_TYPES = ["text", "textarea", "choice"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export interface FormResponse {
  questionId: string;
  values?: Record<string, string>;
  skipped?: boolean;
}

const KEY = /^[A-Za-z0-9_-]{1,32}$/;

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const squash = (value: string) => value.replace(/\s+/g, " ").trim();

function cleanField(raw: unknown, index: number): FormField | null {
  const item = record(raw);
  if (!item || typeof item.label !== "string") return null;
  const label = squash(item.label);
  const key = item.key === undefined ? `f${index + 1}` : item.key;
  const type = item.type === undefined ? (item.options === undefined ? "text" : "choice") : item.type;
  if (!label || label.length > MAX_OPTION_CHARS || typeof key !== "string" || !KEY.test(key)) return null;
  if (!FIELD_TYPES.includes(type as FieldType)) return null;
  const field: FormField = { key, label, type: type as FieldType };
  if (field.type === "choice") {
    const options = item.options;
    if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return null;
    const cleaned = options.map((o) => (typeof o === "string" ? squash(o) : ""));
    if (cleaned.some((o) => !o || o.length > MAX_OPTION_CHARS) || new Set(cleaned).size !== cleaned.length) return null;
    field.options = cleaned;
  } else if (item.options !== undefined) return null;
  if (item.required !== undefined) {
    if (typeof item.required !== "boolean") return null;
    if (item.required) field.required = true;
  }
  if (item.placeholder !== undefined) {
    if (typeof item.placeholder !== "string" || item.placeholder.length > MAX_OPTION_CHARS) return null;
    if (item.placeholder.trim()) field.placeholder = squash(item.placeholder);
  }
  return field;
}

export function cleanFields(raw: unknown): FormField[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_FIELDS) return null;
  const out: FormField[] = [];
  for (const [i, value] of raw.entries()) {
    const field = cleanField(value, i);
    if (!field || out.some((f) => f.key === field.key)) return null;
    out.push(field);
  }
  return out;
}

export function formOf(content: unknown): FormField[] | null {
  return cleanFields(record(record(content)?.form)?.fields);
}

export function formContent(text: string, fields: FormField[]) {
  return { text, attachments: [], form: { fields } };
}

export function formResponseOf(content: unknown): FormResponse | null {
  const response = record(record(content)?.form_response);
  if (!response || typeof response.question_id !== "string" || !response.question_id) return null;
  if (response.skipped === true) return { questionId: response.question_id, skipped: true };
  const values = record(response.values);
  if (!values) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!KEY.test(key) || typeof value !== "string" || value.length > MAX_ANSWER_CHARS) return null;
    out[key] = value;
  }
  return { questionId: response.question_id, values: out };
}

export function missingRequired(fields: FormField[], values: Record<string, string>): FormField[] {
  return fields.filter((f) => f.required && !values[f.key]?.trim());
}

export function formResponseContent(questionId: string, fields: FormField[], values: Record<string, string> | null) {
  if (!values) return { text: "Skipped the form", attachments: [], form_response: { question_id: questionId, skipped: true } };
  const kept: Record<string, string> = {};
  const lines: string[] = [];
  for (const field of fields) {
    const value = (values[field.key] ?? "").trim().slice(0, MAX_ANSWER_CHARS);
    if (!value) continue;
    kept[field.key] = value;
    lines.push(`${field.label}: ${value}`);
  }
  return { text: lines.join("\n") || "Submitted the form", attachments: [], form_response: { question_id: questionId, values: kept } };
}

export function latestResponses(
  rows: ReadonlyArray<{ sender: string; formResponse?: FormResponse; sentAt: number; unsent?: boolean }>,
  self: string | null,
): Map<string, { mine: FormResponse | null; count: number }> {
  const latest = new Map<string, Map<string, { response: FormResponse; at: number }>>();
  for (const row of rows) {
    if (!row.formResponse || row.unsent) continue;
    const bySender = latest.get(row.formResponse.questionId) ?? new Map<string, { response: FormResponse; at: number }>();
    const prev = bySender.get(row.sender);
    if (!prev || prev.at <= row.sentAt) bySender.set(row.sender, { response: row.formResponse, at: row.sentAt });
    latest.set(row.formResponse.questionId, bySender);
  }
  const out = new Map<string, { mine: FormResponse | null; count: number }>();
  for (const [question, bySender] of latest) {
    const count = [...bySender.values()].filter((v) => !v.response.skipped).length;
    out.set(question, { mine: (self && bySender.get(self)?.response) || null, count });
  }
  return out;
}
