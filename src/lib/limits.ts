import type { ExtensionStorage } from "./types";

/** 免费版：最多可保存的账号配置（profile）数量；付费版不限制 */
export const FREE_MAX_PROFILES = 5;

export function isPro(storage: ExtensionStorage): boolean {
  if (storage.entitlement.fetchedAt != null) {
    return storage.entitlement.isPro;
  }
  return storage.license.tier === "pro";
}

export function canCreateProfile(storage: ExtensionStorage): boolean {
  if (isPro(storage)) return true;
  return storage.profiles.length < FREE_MAX_PROFILES;
}
