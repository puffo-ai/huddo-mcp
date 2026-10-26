import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { enUS, zhCN } from "./resources";

export const APP_LANGUAGES = ["en-US", "zh-CN"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "puffo.language.v1";

function isAppLanguage(value: string | null): value is AppLanguage {
  return value !== null && APP_LANGUAGES.includes(value as AppLanguage);
}

export function storedLanguage(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): AppLanguage {
  if (!storage) return "en-US";
  try {
    const value = storage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(value) ? value : "en-US";
  } catch {
    return "en-US";
  }
}

void i18n.use(initReactI18next).init({
  lng: storedLanguage(),
  fallbackLng: "en-US",
  supportedLngs: APP_LANGUAGES,
  defaultNS: "common",
  interpolation: { escapeValue: false },
  resources: {
    "en-US": enUS,
    "zh-CN": zhCN,
  },
});

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
  }
  await i18n.changeLanguage(language);
}

export function applyDocumentLanguage(language: AppLanguage): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dir = "ltr";
}

applyDocumentLanguage(storedLanguage());
i18n.on("languageChanged", (language) => {
  if (isAppLanguage(language)) applyDocumentLanguage(language);
});

export { i18n };
