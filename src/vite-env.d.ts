// 引入 Vite 客户端类型（勿删，供 import.meta.env 类型检查）
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_EXTENSION_PRODUCT_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
