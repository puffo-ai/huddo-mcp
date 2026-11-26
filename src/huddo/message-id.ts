const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** A room or message id that is safe to put in a path. No imports, so Pages Functions can use it too. */
export const validId = (value: unknown): value is string => typeof value === "string" && ID_RE.test(value);
