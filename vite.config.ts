import { defineConfig } from "vite";

export default defineConfig({
  // 同时兼容 GitHub Pages 仓库子路径和后续 WebView 打包。
  base: "./",
});
