/** 可序列化的 Cookie 快照（chrome.cookies.Cookie 子集 + 可选字段） */
export type CookieSnapshot = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: chrome.cookies.SameSiteStatus;
  expirationDate?: number;
  storeId?: string;
  /** Chrome 分区 Cookie（CHIPS）时可能存在 */
  partitionKey?: unknown;
};

export type ProfileGroup = {
  id: string;
  name: string;
  order: number;
};

export type Profile = {
  id: string;
  name: string;
  /** `null` 表示内置「未分组」（展示文案来自 i18n `ungrouped`） */
  groupId: string | null;
  /** 入口 URL：用于作用域及切换后可选导航 */
  url: string;
  /** 规范化主机名，用于展示与筛选（不含端口） */
  hostname: string;
  cookies: CookieSnapshot[];
  updatedAt: number;
};

export type LicenseState = {
  tier: "free" | "pro";
  /** 专业版到期时间 ISO 字符串；无固定到期可为 null */
  validUntil: string | null;
  /** 上次成功校验时间（毫秒时间戳） */
  lastVerifiedAt: number | null;
};

/** 服务端账号状态（my_admin 签发的 Bearer access_token） */
export type AccountState = {
  accessToken: string | null;
  email: string | null;
};

/** 缓存的 `GET /api/v1/me/extension-entitlement` 结果 */
export type EntitlementState = {
  hasEntitlement: boolean;
  isPro: boolean;
  /** Unix 秒；null 表示无到期或无此项 */
  expiresAt: number | null;
  deviceBound: boolean;
  deviceLimitReached: boolean;
  /** 上次成功拉取时间（毫秒）；从未拉取则为 null */
  fetchedAt: number | null;
};

/** 界面语言：跟随浏览器或强制使用打包语言 */
export type UiLanguagePreference = "auto" | "en" | "zh_CN";

export type ExtensionStorage = {
  groups: ProfileGroup[];
  profiles: Profile[];
  license: LicenseState;
  /** 稳定设备标识，用于 `POST /api/v1/me/device-bind` */
  deviceId: string;
  account: AccountState;
  entitlement: EntitlementState;
  /** 用户已授予的源模式列表（如 https://example.com/*），对应 optional_host_permissions */
  grantedOrigins: string[];
  uiLanguage: UiLanguagePreference;
};

export const DEFAULT_STORAGE: ExtensionStorage = {
  groups: [],
  profiles: [],
  license: {
    tier: "free",
    validUntil: null,
    lastVerifiedAt: null,
  },
  deviceId: "",
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
  grantedOrigins: [],
  uiLanguage: "auto",
};
