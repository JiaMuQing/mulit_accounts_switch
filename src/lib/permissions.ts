/** 将源转为 optional_host_permissions 用的模式，如 https://github.com/* */
export function originToPattern(origin: string): string {
  return `${origin.replace(/\/$/, "")}/*`;
}

/**
 * 弹窗必须在点击手势链内请求 host 权限。
 * 若在 service worker 里经 sendMessage + await 再调用 permissions.request，
 * Chrome 会报「必须在用户手势期间调用」。
 */
export function getActiveHttpTabUrlFromGesture(callback: (url: string | null) => void): void {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      callback(null);
      return;
    }
    const tab = tabs[0];
    const u = tab?.url;
    if (!u || !u.startsWith("http")) {
      callback(null);
      return;
    }
    callback(u);
  });
}

/** 与 ensureOriginPermission 相同，但仅用回调，以便留在用户手势调用栈上 */
export function ensureOriginPermissionFromGesture(
  pageUrl: string,
  callback: (granted: boolean) => void,
): void {
  const origin = new URL(pageUrl).origin;
  const origins = [originToPattern(origin)];
  chrome.permissions.contains({ origins }, (has) => {
    if (chrome.runtime.lastError) {
      callback(false);
      return;
    }
    if (has) {
      callback(true);
      return;
    }
    chrome.permissions.request({ origins }, (granted) => {
      if (chrome.runtime.lastError) {
        callback(false);
        return;
      }
      callback(!!granted);
    });
  });
}

export async function ensureOriginPermission(pageUrl: string): Promise<boolean> {
  const origin = new URL(pageUrl).origin;
  const origins = [originToPattern(origin)];
  const has = await chrome.permissions.contains({ origins });
  if (has) return true;
  return chrome.permissions.request({ origins });
}

export async function hasOriginPermission(pageUrl: string): Promise<boolean> {
  const origin = new URL(pageUrl).origin;
  return chrome.permissions.contains({ origins: [originToPattern(origin)] });
}
