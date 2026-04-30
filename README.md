# 多账号切换 / Multi-Account Switch（Cookie 配置）

基于 Chromium（Manifest V3）的扩展：按站点**保存 Cookie 快照**，支持自定义**名称**与**分组**；切换时清除该 URL 作用域下的 Cookie 并**恢复**已保存集合。**免费版**限制可保存的账号（profile）数量；**专业版**通过连接 **my_admin** 用户 API（登录 → 支付 → 设备绑定 → 服务端权益）解锁。

## 构建

```bash
npm install
npm run build
```

在 `chrome://extensions` 中开启「开发者模式」，选择「加载已解压的扩展程序」，指向 **`dist/`** 目录。

构建前复制 `.env.example` 为 `.env`，填写 `VITE_API_BASE_URL` 与 `VITE_EXTENSION_PRODUCT_KEY`（与数据库 `products.product_key` 一致）。详见 [`AGENTS.md`](AGENTS.md)。

## 多语言（i18n）

界面语言跟随 Chrome（`default_locale` 为 `en`，简体中文见 [`_locales/zh_CN/messages.json`](_locales/zh_CN/messages.json)）。新增或修改文案时，请同时编辑 `_locales/en/messages.json` 与 `zh_CN` 中对应键，然后重新构建，保证 **`dist/_locales/`** 与源码一致。

## 免费版与付费版额度

在 `src/lib/limits.ts` 中配置 `FREE_MAX_PROFILES`，免费版默认为 **5** 个账号（profile）；付费版不限制数量。当 `storage.entitlement.isPro`（来自 `GET /api/me/extension-entitlement`）为真，或历史数据中 `storage.license.tier === "pro"` 时视为专业版。

## 权限说明

- **cookies**、**storage**、**tabs**：核心能力（读写 Cookie、本地存储、读取/跳转标签页）。
- **optional_host_permissions** `*://*/*`：在保存/切换某站点时请求，或在选项页中「请求访问所有网址」时申请；请求后台 API 时也会申请 API 源权限。

## 隐私

详见 [docs/PRIVACY.md](docs/PRIVACY.md)。Cookie 与备份默认**仅保存在本机**；仅当用户主动导出文件时才会产生外泄风险，需自行保管导出文件。
