/**
 * MV3 Service Worker：处理 popup/options 消息、Cookie 快照与恢复、CLEAR_LICENSE（含退出账号与权益缓存）等
 */
import {
  captureCookiesForUrl,
  clearCookiesForUrl,
  hostnameFromUrl,
  restoreCookies,
} from "../lib/cookies";
import { FREE_MAX_PROFILES, canCreateProfile, isPro } from "../lib/limits";
import { ensureOriginPermission, hasOriginPermission, originToPattern } from "../lib/permissions";
import { loadStorage, patchStorage, saveStorage } from "../lib/storage";
import type { BackgroundRequest, StatePayload } from "../lib/messages";
import type { ExtensionStorage, Profile } from "../lib/types";
import { syncI18nLocale, t } from "../lib/i18n";

function ok<T>(data?: T): { ok: true; data?: T } {
  return data !== undefined ? { ok: true, data } : { ok: true };
}

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

async function getActiveTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url) return null;
  if (!tab.url.startsWith("http")) {
    return null;
  }
  return tab.url;
}

function rememberOrigin(storage: ExtensionStorage, pageUrl: string): ExtensionStorage {
  const pattern = originToPattern(new URL(pageUrl).origin);
  if (storage.grantedOrigins.includes(pattern)) return storage;
  return { ...storage, grantedOrigins: [...storage.grantedOrigins, pattern] };
}

async function handle(req: BackgroundRequest): Promise<{ ok: true; data?: unknown } | { ok: false; error: string }> {
  try {
    await syncI18nLocale();
    switch (req.type) {
      case "GET_STATE": {
        const s = await loadStorage();
        const payload: StatePayload = {
          profiles: s.profiles,
          groups: s.groups,
          license: s.license,
          grantedOrigins: s.grantedOrigins,
          limits: {
            isPro: isPro(s),
            maxProfiles: isPro(s) ? null : FREE_MAX_PROFILES,
            maxGroups: null,
          },
        };
        return ok(payload);
      }

      case "CAPTURE_CURRENT_TAB": {
        const tabUrl = await getActiveTabUrl();
        if (!tabUrl) {
          return fail(t("errNoHttpTab"));
        }
        const granted = await ensureOriginPermission(tabUrl);
        if (!granted) {
          return fail(t("errHostDeniedSave"));
        }

        let storage = await loadStorage();
        if (!canCreateProfile(storage)) {
          return fail(t("errProfileLimit", [String(FREE_MAX_PROFILES)]));
        }

        const cookies = await captureCookiesForUrl(tabUrl);
        const profile: Profile = {
          id: crypto.randomUUID(),
          name: req.name.trim() || t("unnamed"),
          groupId: req.groupId,
          url: tabUrl,
          hostname: hostnameFromUrl(tabUrl),
          cookies,
          updatedAt: Date.now(),
        };

        storage = rememberOrigin(storage, tabUrl);
        storage = { ...storage, profiles: [...storage.profiles, profile] };
        await saveStorage(storage);
        return ok(profile);
      }

      case "CLEAR_SITE_COOKIES": {
        const pageUrl = req.pageUrl;
        if (!pageUrl.startsWith("http")) {
          return fail(t("errNoHttpTab"));
        }
        const allowed = await hasOriginPermission(pageUrl);
        if (!allowed) {
          return fail(t("errHostDeniedSave"));
        }
        const { removed, errors } = await clearCookiesForUrl(pageUrl);
        return ok({ removed, errors });
      }

      case "SWITCH_PROFILE": {
        const storage = await loadStorage();
        const profile = storage.profiles.find((p) => p.id === req.profileId);
        if (!profile) {
          return fail(t("errProfileNotFound"));
        }

        const granted = await ensureOriginPermission(profile.url);
        if (!granted) {
          return fail(t("errHostDeniedSwitch"));
        }

        let next = rememberOrigin(storage, profile.url);
        await saveStorage(next);

        const cleared = await clearCookiesForUrl(profile.url);
        const restored = await restoreCookies(profile.cookies);

        if (req.openInNewTab) {
          await chrome.tabs.create({ url: profile.url });
        } else {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab?.id && tab.url?.startsWith("http")) {
            await chrome.tabs.update(tab.id, { url: profile.url });
          } else {
            await chrome.tabs.create({ url: profile.url });
          }
        }

        return ok({
          cleared,
          restored,
        });
      }

      case "DELETE_PROFILE": {
        const storage = await loadStorage();
        const profiles = storage.profiles.filter((p) => p.id !== req.profileId);
        await saveStorage({ ...storage, profiles });
        return ok();
      }

      case "CLEAR_LICENSE": {
        await patchStorage({
          license: {
            tier: "free",
            validUntil: null,
            lastVerifiedAt: null,
          },
          account: {
            accessToken: null,
            email: null,
          },
          entitlement: {
            hasEntitlement: false,
            isPro: false,
            expiresAt: null,
            deviceBound: false,
            deviceLimitReached: false,
            fetchedAt: null,
          },
        });
        return ok();
      }

      case "EXPORT_BACKUP": {
        const s = await loadStorage();
        const blob = {
          v: 1,
          exportedAt: new Date().toISOString(),
          groups: s.groups,
          profiles: s.profiles,
        };
        return ok(JSON.stringify(blob, null, 2));
      }

      case "IMPORT_BACKUP": {
        let parsed: unknown;
        try {
          parsed = JSON.parse(req.json);
        } catch {
          return fail(t("errInvalidJson"));
        }
        if (!parsed || typeof parsed !== "object") return fail(t("errInvalidBackup"));
        const o = parsed as Record<string, unknown>;
        if (o.v !== 1 || !Array.isArray(o.groups) || !Array.isArray(o.profiles)) {
          return fail(t("errUnsupportedBackup"));
        }
        const storage = await loadStorage();
        await saveStorage({
          ...storage,
          groups: o.groups as ExtensionStorage["groups"],
          profiles: o.profiles as ExtensionStorage["profiles"],
        });
        return ok();
      }

      default:
        return fail(t("errUnknownMessage"));
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((e) => sendResponse(fail(e instanceof Error ? e.message : String(e))));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  // 确保写入默认结构（含 deviceId 等 merge 逻辑）
  void loadStorage().then(async (s) => {
    if (!s.groups.length && !s.profiles.length) {
      await saveStorage(s);
    }
  });
});
