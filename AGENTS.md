# AGENTS.md

## 构建命令

```bash
npm install
npm run build      # 输出到 dist/
npm run dev        # 开发模式（监听文件变化）
npm run typecheck  # TypeScript 类型检查
```

## 加载扩展

`npm run build` 完成后，在 `chrome://extensions` 开启「开发者模式」，点击「加载已解压的扩展程序」，选择 `dist/` 目录。

## i18n 规则

修改 UI 文案时，必须**同时**编辑 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`。构建时会将 `_locales/` 复制到 `dist/_locales/`。

## 账号 / 后台 API（正式路径）

从仓库根目录复制 `.env.example` 为 `.env`，设置：

- `VITE_API_BASE_URL` — my_admin 根 URL（无尾斜杠），如 `http://127.0.0.1:8787`
- `VITE_EXTENSION_PRODUCT_KEY` — 须与数据库 `products.product_key` 一致；下单、查权益、设备绑定都会传给 API

构建后首次请求 API 时浏览器会请求对应源的 `optional` host 权限。

## 项目结构

- `src/background/` - Service Worker 入口
- `src/lib/` - 核心逻辑（Cookie 处理、账号 API、限额）
- `src/popup/` - 弹出页 UI
- `src/options/` - 选项页 UI

入口由 `vite.config.ts` 定义：`popup.html`、`options.html`、`src/background/index.ts`。