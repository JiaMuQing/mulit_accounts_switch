import { defineConfig } from "vite";
import { resolve } from "node:path";
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

// Chrome 扩展：多入口构建，closeBundle 时复制 manifest、图标、_locales 并写入版本号
export default defineConfig({
  base: "./",
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        popup: resolve(__dirname, "popup.html"),
        options: resolve(__dirname, "options.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  plugins: [
    {
      name: "copy-manifest-and-assets",
      closeBundle() {
        const dist = resolve(__dirname, "dist");
        copyFileSync(resolve(__dirname, "manifest.json"), resolve(dist, "manifest.json"));
        const iconsSrc = resolve(__dirname, "icons");
        if (existsSync(iconsSrc)) {
          const iconsDest = resolve(dist, "icons");
          mkdirSync(iconsDest, { recursive: true });
          for (const n of ["icon16.png", "icon48.png", "icon128.png"]) {
            const p = resolve(iconsSrc, n);
            if (existsSync(p)) copyFileSync(p, resolve(iconsDest, n));
          }
        }
        const localesSrc = resolve(__dirname, "_locales");
        if (existsSync(localesSrc)) {
          const localesDest = resolve(dist, "_locales");
          cpSync(localesSrc, localesDest, { recursive: true });
        }
        const manPath = resolve(dist, "manifest.json");
        let man = readFileSync(manPath, "utf8");
        man = man.replace("__VERSION__", JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")).version);
        writeFileSync(manPath, man);
      },
    },
  ],
});
