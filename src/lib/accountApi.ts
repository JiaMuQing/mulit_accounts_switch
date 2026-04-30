import { getActivePackLocale } from "./i18n";
import { ensureOriginPermission } from "./permissions";

/** 后台 API 成功响应包络 */
export type ApiSuccess<T> = {
  ok: true;
  message_zh_cn: string;
  message_en: string;
  data: T;
};

/** 后台 API 错误响应包络 */
export type ApiFail = {
  ok: false;
  message_zh_cn: string;
  message_en: string;
  data: { code: string };
};

/** 构建时环境变量 VITE_API_BASE_URL，去掉尾部斜杠 */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string" || !raw.trim()) {
    return "";
  }
  return raw.replace(/\/+$/, "");
}

/** 与后台商品 product_key 一致，来自 VITE_EXTENSION_PRODUCT_KEY */
export function getExtensionProductKey(): string {
  const k = import.meta.env.VITE_EXTENSION_PRODUCT_KEY;
  return typeof k === "string" ? k.trim() : "";
}

/** 确保已授予 API 根域名对应的 host 权限 */
export async function ensureApiHostAccess(): Promise<boolean> {
  const base = getApiBase();
  if (!base) {
    return false;
  }
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return false;
  }
  return ensureOriginPermission(`${origin}/`);
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(res.statusText || "Invalid JSON");
  }
}

/**
 * 调用 my_admin JSON API；自动带 Bearer、omit cookie。
 * init.accessToken 有值时设置 Authorization。
 */
export async function apiRequestJson<T>(
  path: string,
  init: RequestInit & { accessToken?: string | null },
): Promise<T> {
  const base = getApiBase();
  if (!base) {
    throw new Error("VITE_API_BASE_URL is not set");
  }
  const permitted = await ensureApiHostAccess();
  if (!permitted) {
    throw new Error("Host permission for the API URL was denied");
  }

  const headers = new Headers(init.headers ?? {});
  const method = (init.method ?? "GET").toUpperCase();
  if (
    !headers.has("Content-Type") &&
    method !== "GET" &&
    method !== "HEAD" &&
    init.body !== undefined
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  const url = path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "omit",
  });

  const body = await parseJson(res);
  const env = body as ApiSuccess<T> | ApiFail;
  if (!env || typeof env !== "object" || !("ok" in env)) {
    throw new Error("Unexpected API response");
  }
  if (!env.ok) {
    const locale = getActivePackLocale();
    const primary = locale === "zh_CN" ? env.message_zh_cn : env.message_en;
    const msg = primary || env.message_en || env.message_zh_cn || env.data?.code || "Request failed";
    throw new Error(msg);
  }
  return env.data as T;
}
