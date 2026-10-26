import {
  choiceContent,
  cleanOptions,
  MAX_ANSWER_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_OPTION_CHARS,
  MAX_OPTIONS,
  MIN_OPTIONS,
  textAnswerContent,
  type ChoiceOption,
  type OptionInput,
} from "../src/huddo/choices";
import { cleanFields, formResponseContent, missingRequired, MAX_FIELDS, type FormField } from "../src/huddo/forms";
import { UserError } from "./text-args";

export const OPTION_PARAM = {
  type: "array",
  items: {
    anyOf: [
      { type: "string" },
      {
        type: "object",
        properties: {
          key: { type: "string", description: "Stable id for this option (letters, digits, - or _); default o1, o2, ..." },
          label: { type: "string", description: "Button text, up to 80 characters" },
          description: { type: "string", description: "Longer hint shown on hover, up to 200 characters. Optional" },
        },
        required: ["label"],
      },
    ],
  },
  description:
    "2-8 answers shown as buttons under the message: labels, or {key, label, description}. A tap posts a reply with that label, quoting this message, marked [chose <key> of msg_...]. Optional",
};

export const FORM_PARAM = {
  type: "array",
  items: {
    type: "object",
    properties: {
      key: { type: "string", description: "Field id in the answer (letters, digits, - or _); default f1, f2, ..." },
      label: { type: "string", description: "Field label, up to 80 characters" },
      type: { type: "string", enum: ["text", "textarea", "choice"], description: "text (one line, default), textarea (several lines) or choice (pick one of options)" },
      options: { type: "array", items: { type: "string" }, description: "2-8 choices, for type choice only" },
      required: { type: "boolean", description: "Submit stays off until it is filled. Default false" },
      placeholder: { type: "string", description: "Hint shown in an empty field. Optional" },
    },
    required: ["label"],
  },
  description:
    "1-8 fields shown as a form under the message, with Submit and Skip. Each answer is a reply quoting this message, marked [form answer to msg_...: key=value; ...] or [skipped form msg_...]. Optional",
};

export function richContent(text: string | undefined, options: OptionInput[] | undefined, form: unknown): Record<string, unknown> | null {
  if (typeof form === "string") {
    try {
      form = JSON.parse(form);
    } catch {
      throw new UserError("--form must be a JSON array of fields");
    }
  }
  if (options?.length && form !== undefined) throw new UserError("send either options or a form, not both");
  if (form !== undefined) {
    const fields = cleanFields(form);
    if (!fields) {
      throw new UserError(
        `a form needs 1 to ${MAX_FIELDS} fields with distinct keys, a label of at most ${MAX_OPTION_CHARS} characters, type text, textarea or choice (choice needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options)`,
      );
    }
    if (!text?.trim()) throw new UserError("a form needs a message: give the text too");
    return { form: { fields } };
  }
  if (!options?.length) return null;
  const cleaned = cleanOptions(options);
  if (!cleaned) {
    throw new UserError(
      `options need ${MIN_OPTIONS} to ${MAX_OPTIONS} different labels of at most ${MAX_OPTION_CHARS} characters (descriptions up to ${MAX_DESCRIPTION_CHARS}; keys letters, digits, - or _)`,
    );
  }
  if (!text?.trim()) throw new UserError("options need a question: give the message text too");
  return { options: cleaned };
}

export interface AnswerInput {
  option?: string;
  text?: string;
  fields?: Record<string, string>;
  skip?: boolean;
}

export const ANSWER_PARAMS = {
  option: { type: "string", description: "Key (o1, o2, ...) or label of the option to pick" },
  text: { type: "string", description: "Your own answer instead of an option, up to 500 characters" },
  fields: {
    type: "object",
    additionalProperties: { type: "string" },
    description: 'Form answers by field key, e.g. {"name": "Ada", "size": "M"}; a choice field takes one of its options',
  },
  skip: { type: "boolean", description: "Decline a form instead of filling it" },
};

export function answerArgs(a: Record<string, unknown>): AnswerInput {
  const out: AnswerInput = {};
  for (const key of ["option", "text"] as const) {
    if (a[key] === undefined) continue;
    if (typeof a[key] !== "string") throw new UserError(`${key} must be a string`);
    out[key] = a[key] as string;
  }
  if (a.fields !== undefined) {
    const fields = a.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.values(fields).some((v) => typeof v !== "string")) {
      throw new UserError("fields must be an object of field key to text");
    }
    out.fields = fields as Record<string, string>;
  }
  if (a.skip !== undefined) out.skip = a.skip === true;
  return out;
}

export function answerFlags(flags: { option?: string[]; text?: string; field?: string[]; skip?: boolean }): AnswerInput {
  if ((flags.option?.length ?? 0) > 1) throw new UserError("answer takes one --option");
  let fields: Record<string, string> | undefined;
  for (const pair of flags.field ?? []) {
    const at = pair.indexOf("=");
    if (at < 1) throw new UserError(`--field needs key=value, got "${pair}"`);
    fields = { ...fields, [pair.slice(0, at).trim()]: pair.slice(at + 1) };
  }
  return { option: flags.option?.[0], text: flags.text, fields, skip: flags.skip };
}

const list = (items: string[]) => items.join(", ");

function optionAnswer(id: string, options: ChoiceOption[], input: AnswerInput) {
  if (input.fields || input.skip) throw new UserError("that message has options: answer with --option or --text");
  if (input.option !== undefined && input.text !== undefined) throw new UserError("give --option or --text, not both");
  if (input.option !== undefined) {
    const wanted = input.option.trim().toLowerCase();
    const option = options.find((o) => o.key.toLowerCase() === wanted || o.label.toLowerCase() === wanted);
    if (!option) throw new UserError(`no option "${input.option}": pick one of ${list(options.map((o) => `${o.key}) ${o.label}`))}`);
    return choiceContent(option, id);
  }
  const text = input.text?.trim() ?? "";
  if (!text) throw new UserError("answer needs --option KEY or --text TEXT");
  if (text.length > MAX_ANSWER_CHARS) throw new UserError(`an answer is at most ${MAX_ANSWER_CHARS} characters`);
  return textAnswerContent(text, id);
}

function formAnswer(id: string, form: FormField[], input: AnswerInput) {
  if (input.option !== undefined || input.text !== undefined) throw new UserError("that message is a form: answer with --field key=value or --skip");
  if (input.skip) {
    if (input.fields) throw new UserError("give --field or --skip, not both");
    return formResponseContent(id, form, null);
  }
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input.fields ?? {})) {
    const field = form.find((f) => f.key === key);
    if (!field) throw new UserError(`no field "${key}": the fields are ${list(form.map((f) => f.key))}`);
    const value = raw.trim();
    if (value.length > MAX_ANSWER_CHARS) throw new UserError(`${key} is longer than ${MAX_ANSWER_CHARS} characters`);
    const pick = field.options?.find((o) => o.toLowerCase() === value.toLowerCase());
    if (field.options && value && !pick) throw new UserError(`${key} must be one of ${list(field.options)}`);
    values[key] = pick ?? value;
  }
  const missing = missingRequired(form, values);
  if (missing.length) throw new UserError(`missing required field: ${list(missing.map((f) => f.key))}`);
  return formResponseContent(id, form, values);
}

type AnswerRow = { id: string; sender: string; options?: ChoiceOption[]; form?: FormField[]; closes?: string };

export function answerContent(rows: AnswerRow[], id: string, input: AnswerInput) {
  const target = rows.find((r) => r.id === id);
  if (!target) throw new UserError("that message isn't among the last 200 in the room");
  if (rows.some((r) => r.closes === id && r.sender === target.sender)) throw new UserError("that question is closed");
  if (target.options) return optionAnswer(target.id, target.options, input);
  if (target.form) return formAnswer(target.id, target.form, input);
  throw new UserError("that message has no options or form to answer");
}
