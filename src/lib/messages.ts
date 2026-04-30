import type { LicenseState, Profile, ProfileGroup } from "./types";

/** 清除站点 Cookie 的返回结构 */
export type ClearSiteCookiesResult = { removed: number; errors: string[] };

export type BackgroundRequest =
  | { type: "GET_STATE" }
  | { type: "CAPTURE_CURRENT_TAB"; name: string; groupId: string | null }
  | { type: "CLEAR_SITE_COOKIES"; pageUrl: string }
  | { type: "SWITCH_PROFILE"; profileId: string; openInNewTab?: boolean }
  | { type: "DELETE_PROFILE"; profileId: string }
  | { type: "CLEAR_LICENSE" }
  | { type: "EXPORT_BACKUP" }
  | { type: "IMPORT_BACKUP"; json: string };

export type BackgroundResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export type StatePayload = {
  profiles: Profile[];
  groups: ProfileGroup[];
  license: LicenseState;
  grantedOrigins: string[];
  limits: { maxProfiles: number | null; maxGroups: number | null; isPro: boolean };
};

/** 向 background service worker 发消息并解析结果 */
async function send<T>(msg: BackgroundRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage(msg)) as BackgroundResponse & { data?: T };
  if (!res || !res.ok) {
    throw new Error(res && "error" in res ? res.error : "Unknown error");
  }
  return res.data as T;
}

export const bg = {
  getState: () => send<StatePayload>({ type: "GET_STATE" }),
  captureCurrentTab: (name: string, groupId: string | null) =>
    send<Profile>({ type: "CAPTURE_CURRENT_TAB", name, groupId }),
  clearSiteCookies: (pageUrl: string) =>
    send<ClearSiteCookiesResult>({ type: "CLEAR_SITE_COOKIES", pageUrl }),
  switchProfile: (profileId: string, openInNewTab = false) =>
    send({ type: "SWITCH_PROFILE", profileId, openInNewTab }),
  deleteProfile: (profileId: string) => send({ type: "DELETE_PROFILE", profileId }),
  clearLicense: () => send({ type: "CLEAR_LICENSE" }),
  exportBackup: () => send<string>({ type: "EXPORT_BACKUP" }),
  importBackup: (json: string) => send({ type: "IMPORT_BACKUP", json }),
};
