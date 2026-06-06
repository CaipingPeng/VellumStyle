import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

// Tauri 桌面端：自定义协议加载需相对资源路径（base: "./"）。
// 不再用 /api proxy —— 后端逻辑已迁到 Rust（upload_image command + wximg 协议）。
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
});
