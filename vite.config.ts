import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import type {LoggingFunction, RollupLog} from "rollup";

const MATHJAX_ES5_COMPONENT = /node_modules[/\\]mathjax[/\\]es5[/\\]tex-svg\.js$/;
const NODE_MODULES = /[/\\]node_modules[/\\]/;

function isExpectedMathJaxEvalWarning(warning: RollupLog) {
  return warning.code === "EVAL" && typeof warning.id === "string" && MATHJAX_ES5_COMPONENT.test(warning.id);
}

function manualChunks(id: string) {
  if (!NODE_MODULES.test(id)) {
    return undefined;
  }

  const normalized = id.replace(/\\/g, "/");
  if (normalized.includes("/mathjax/")) return "vendor-mathjax";
  if (normalized.includes("/highlight.js/")) return "vendor-highlight";
  if (
    normalized.includes("/@codemirror/") ||
    normalized.includes("/@lezer/") ||
    normalized.includes("/codemirror/") ||
    normalized.includes("/@uiw/react-codemirror/")
  ) {
    return "vendor-editor";
  }
  if (
    normalized.includes("/markdown-it") ||
    normalized.includes("/entities/") ||
    normalized.includes("/linkify-it/") ||
    normalized.includes("/mdurl/") ||
    normalized.includes("/uc.micro/")
  ) {
    return "vendor-markdown";
  }
  if (
    normalized.includes("/react/") ||
    normalized.includes("/react-dom/") ||
    normalized.includes("/scheduler/") ||
    normalized.includes("/framer-motion/") ||
    normalized.includes("/zustand/")
  ) {
    return "vendor-react";
  }
  return undefined;
}

// Tauri 桌面端：自定义协议加载需相对资源路径（base: "./"）。
// 不再用 /api proxy —— 后端逻辑已迁到 Rust（upload_image command + wximg 协议）。
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    // 使用不常见的固定端口，避免与其他前端项目的默认端口冲突。
    port: 41737,
    strictPort: true,
  },
  build: {
    // MathJax 按需加载块约 2 MB，这是公式排版能力的预期成本；超过该值仍继续提醒。
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        manualChunks,
      },
      onwarn(warning: RollupLog, defaultHandler: LoggingFunction) {
        if (isExpectedMathJaxEvalWarning(warning)) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
});
