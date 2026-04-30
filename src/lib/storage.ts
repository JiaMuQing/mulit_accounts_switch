import { DEFAULT_STORAGE, type ExtensionStorage } from "./types";

/** 扩展持久化区域 */
const AREA = chrome.storage.local;

export async function loadStorage(): Promise<ExtensionStorage> {
  const raw = await AREA.get(null);
  if (!raw || typeof raw !== "object") {
    return structuredClone(DEFAULT_STORAGE);
  }
  return mergeWithDefaults(raw as Partial<ExtensionStorage>);
}

/** 与 DEFAULT_STORAGE 合并，补全 deviceId、account、entitlement 等 */
function mergeWithDefaults(partial: Partial<ExtensionStorage>): ExtensionStorage {
  const base = structuredClone(DEFAULT_STORAGE);
  if (Array.isArray(partial.groups)) base.groups = partial.groups;
  if (Array.isArray(partial.profiles)) base.profiles = partial.profiles;
  if (partial.license && typeof partial.license === "object") {
    base.license = { ...base.license, ...partial.license };
  }
  if (typeof partial.deviceId === "string" && partial.deviceId.length > 0) {
    base.deviceId = partial.deviceId;
  } else if (!base.deviceId) {
    base.deviceId = crypto.randomUUID();
  }
  if (partial.account && typeof partial.account === "object") {
    base.account = { ...base.account, ...partial.account };
  }
  if (partial.entitlement && typeof partial.entitlement === "object") {
    base.entitlement = { ...base.entitlement, ...partial.entitlement };
  }
  if (Array.isArray(partial.grantedOrigins)) base.grantedOrigins = partial.grantedOrigins;
  if (partial.uiLanguage === "auto" || partial.uiLanguage === "en" || partial.uiLanguage === "zh_CN") {
    base.uiLanguage = partial.uiLanguage;
  }
  return base;
}

export async function saveStorage(data: ExtensionStorage): Promise<void> {
  await AREA.set(data as Record<string, unknown>);
}

export async function patchStorage(
  patch: Partial<ExtensionStorage>
): Promise<ExtensionStorage> {
  const cur = await loadStorage();
  const next: ExtensionStorage = {
    ...cur,
    ...patch,
    license: patch.license ? { ...cur.license, ...patch.license } : cur.license,
    account: patch.account ? { ...cur.account, ...patch.account } : cur.account,
    entitlement: patch.entitlement ? { ...cur.entitlement, ...patch.entitlement } : cur.entitlement,
  };
  await saveStorage(next);
  return next;
}
