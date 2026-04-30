import enCatalog from "../../_locales/en/messages.json";
import zhCNCatalog from "../../_locales/zh_CN/messages.json";
import type { UiLanguagePreference } from "./types";

type RawMessageEntry = { message: string; placeholders?: Record<string, { content: string }> };

const CATALOGS: Record<"en" | "zh_CN", Record<string, RawMessageEntry>> = {
  en: enCatalog as Record<string, RawMessageEntry>,
  zh_CN: zhCNCatalog as Record<string, RawMessageEntry>,
};

let resolvedPackLocale: "en" | "zh_CN" = "en";

function resolvePackLocale(pref: UiLanguagePreference): "en" | "zh_CN" {
  if (pref === "en") return "en";
  if (pref === "zh_CN") return "zh_CN";
  const ui = chrome.i18n.getUILanguage().toLowerCase();
  if (ui.startsWith("zh")) return "zh_CN";
  return "en";
}

export function setActiveLocalePreference(pref: UiLanguagePreference): void {
  resolvedPackLocale = resolvePackLocale(pref);
}

export function getActivePackLocale(): "en" | "zh_CN" {
  return resolvedPackLocale;
}

/** 从 storage 读取 uiLanguage（顶层键）并应用打包的文案表 */
export async function syncI18nLocale(): Promise<void> {
  const raw = await chrome.storage.local.get("uiLanguage");
  const v = raw.uiLanguage;
  const pref: UiLanguagePreference =
    v === "en" || v === "zh_CN" || v === "auto" ? v : "auto";
  setActiveLocalePreference(pref);
}

function applySubstitutions(message: string, substitutions?: string | string[]): string {
  if (substitutions === undefined) return message;
  const arr = Array.isArray(substitutions) ? substitutions : [substitutions];
  return message.replace(/\$(\d+)/g, (_, d) => {
    const i = parseInt(d, 10) - 1;
    return i >= 0 && i < arr.length ? arr[i]! : "";
  });
}

function getBundledMessage(messageName: string, substitutions?: string | string[]): string {
  const entry = CATALOGS[resolvedPackLocale][messageName];
  if (!entry?.message) return "";
  return applySubstitutions(entry.message, substitutions);
}

/** 从打包的 _locales 取文案（尊重 uiLanguage 偏好） */
export function t(messageName: string, substitutions?: string | string[]): string {
  const bundled = getBundledMessage(messageName, substitutions);
  if (bundled) return bundled;
  const fallback = chrome.i18n.getMessage(messageName, substitutions);
  return fallback || messageName;
}

/** 在子节点上应用 data-i18n、data-i18n-placeholder、data-i18n-title */
export function applyDataI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = t(key);
  });
  root
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]")
    .forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (key) el.placeholder = t(key);
    });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key) el.title = t(key);
  });
}

export function setDocumentLang(): void {
  document.documentElement.lang = resolvedPackLocale === "zh_CN" ? "zh-CN" : "en";
}
