import { isAppTarget } from "./app-links";

export const APP_NOTE_CONTENT_TYPE = "huddo/app-note/v1";
export const APP_NOTE_MAX_CHARS = 280;

export interface AppNoteContent {
  text: string;
  app: { id: string; name: string };
  link?: string;
}

export function isAppNoteContent(content: unknown): content is AppNoteContent {
  const c = content as Partial<AppNoteContent> | null;
  return Boolean(
    c &&
      typeof c === "object" &&
      typeof c.text === "string" &&
      c.app &&
      typeof c.app === "object" &&
      typeof c.app.id === "string" &&
      typeof c.app.name === "string",
  );
}

export function appNoteContent(text: string, app: { id: string; name: string }, link?: string | null): AppNoteContent {
  const content: AppNoteContent = { text: text.trim().slice(0, APP_NOTE_MAX_CHARS), app: { id: app.id, name: app.name } };
  if (isAppTarget(link)) content.link = link;
  return content;
}
