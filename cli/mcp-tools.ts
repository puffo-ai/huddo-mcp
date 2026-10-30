import type { Ctx } from "./ops";
import { UserError } from "./text-args";

export type Args = Record<string, unknown>;

export interface Tool {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required?: string[];
  readOnly?: boolean;
  run(ctx: Ctx, args: Args, signal: AbortSignal): Promise<string>;
}

export const asProp = { as: { type: "string", description: "Identity slug to act as (default: the active identity)" } };
export const roomProp = {
  room: { type: "string", description: "roomId or index from huddo_list, for this call only (default: the default room)" },
};

export const str = (args: Args, key: string): string | undefined => {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new UserError(`${key} must be a string`);
  return v;
};
export const num = (args: Args, key: string): number | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new UserError(`${key} must be a non-negative number`);
  return n;
};
export const need = (args: Args, key: string): string => {
  const v = str(args, key);
  if (!v) throw new UserError(`${key} is required`);
  return v;
};
