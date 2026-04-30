import type { CookieSnapshot } from "./types";

/** 构造 chrome.cookies.remove/get 用的请求 URL（与官方示例一致） */
export function cookieToRequestUrl(c: CookieSnapshot | chrome.cookies.Cookie): string {
  const protocol = c.secure ? "https:" : "http:";
  const rawDomain = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
  return `${protocol}//${rawDomain}${c.path}`;
}

type CookieWithPartition = chrome.cookies.Cookie & { partitionKey?: unknown };

export function snapshotFromChromeCookie(c: chrome.cookies.Cookie): CookieSnapshot {
  const ext = c as CookieWithPartition;
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    expirationDate: c.expirationDate,
    storeId: c.storeId,
    partitionKey: ext.partitionKey,
  };
}

/** 抓取当前扩展对该页 URL 可见的全部 Cookie */
export async function captureCookiesForUrl(pageUrl: string): Promise<CookieSnapshot[]> {
  const list = await chrome.cookies.getAll({ url: pageUrl });
  return list.map(snapshotFromChromeCookie);
}

/** 删除扩展在该 URL 作用域下能看到的所有 Cookie */
export async function clearCookiesForUrl(pageUrl: string): Promise<{ removed: number; errors: string[] }> {
  const list = await chrome.cookies.getAll({ url: pageUrl });
  const errors: string[] = [];
  let removed = 0;
  for (const c of list) {
    const snap = snapshotFromChromeCookie(c);
    const ext = c as CookieWithPartition;
    const details: chrome.cookies.Details = {
      url: cookieToRequestUrl(snap),
      name: c.name,
      storeId: c.storeId,
    };
    if (ext.partitionKey) {
      (details as chrome.cookies.Details & { partitionKey?: unknown }).partitionKey = ext.partitionKey;
    }
    try {
      const ok = await chrome.cookies.remove(details);
      if (ok) removed += 1;
      else errors.push(`remove failed: ${c.name} @ ${c.domain}`);
    } catch (e) {
      errors.push(`remove error ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { removed, errors };
}

/** 按快照恢复 Cookie */
export async function restoreCookies(
  snapshots: CookieSnapshot[]
): Promise<{ set: number; errors: string[] }> {
  const errors: string[] = [];
  let set = 0;
  for (const s of snapshots) {
    const url = cookieToRequestUrl(s);
    const details: chrome.cookies.SetDetails = {
      url,
      name: s.name,
      value: s.value,
      domain: s.domain,
      path: s.path,
      secure: s.secure,
      httpOnly: s.httpOnly,
      sameSite: s.sameSite,
      expirationDate: s.expirationDate,
      storeId: s.storeId,
    };
    if (s.partitionKey) {
      (details as chrome.cookies.SetDetails & { partitionKey?: unknown }).partitionKey = s.partitionKey;
    }
    try {
      await chrome.cookies.set(details);
      set += 1;
    } catch (e) {
      errors.push(`set ${s.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { set, errors };
}

export function hostnameFromUrl(urlStr: string): string {
  const u = new URL(urlStr);
  return u.hostname;
}
