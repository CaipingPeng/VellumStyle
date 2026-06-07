import {useEffect, useMemo} from "react";
import {render} from "../../markdown/parser.ts";
import {scopeCss} from "./scopeCss.ts";
import {SAMPLE_MARKDOWN} from "./sampleContent.ts";

interface Props {
  themeId: string; // 用于生成唯一 scope class
  css: string; // 主题 CSS（model 编译产出，自包含全部样式）
}

// 所有缩略图共用 index.html 中的 <style id="theme-thumbnails">，按 scope class 聚合各自的 CSS。
// 不能在运行时 document.createElement("style")：Tauri 打包后 CSP 会给 index.html 里的
// <style> 注入 nonce，一旦 style-src 出现 nonce，浏览器就忽略 'unsafe-inline'，
// 运行时新建的无 nonce <style> 会被静默拦截（dev 下 Vite 不改写 CSP 所以看起来正常）。
const THUMB_STYLE_ID = "theme-thumbnails";
const thumbBlocks = new Map<string, string>();

function flushThumbStyles() {
  const tag = document.getElementById(THUMB_STYLE_ID);
  if (tag) tag.innerHTML = Array.from(thumbBlocks.values()).join("\n");
}

// 缩略图：把主题 CSS scope 到本卡唯一 class，写入共享 <style>，
// 渲染固定示例 HTML，再用 transform: scale 缩成「缩小版正文」。
export default function ThemeThumbnail({themeId, css}: Props) {
  // scope class 必须是合法 CSS 标识符：非字母数字转 '-'。
  const scopeClass = useMemo(() => "tp-" + themeId.replace(/[^a-zA-Z0-9_-]/g, "-"), [themeId]);
  const html = useMemo(() => render(SAMPLE_MARKDOWN), []);
  const scoped = useMemo(() => scopeCss(css, scopeClass), [css, scopeClass]);

  useEffect(() => {
    thumbBlocks.set(scopeClass, scoped);
    flushThumbStyles();
    return () => {
      thumbBlocks.delete(scopeClass);
      flushThumbStyles();
    };
  }, [scopeClass, scoped]);

  return (
    <div
      style={{
        width: "100%",
        height: 140,
        overflow: "hidden",
        background: "#fff",
        border: "1px solid #f0f0f0",
        borderRadius: 4,
        position: "relative",
      }}
    >
      <div
        className={scopeClass}
        style={{
          // 内容放大到卡片宽度的 1/scale，再 scale 缩回，使缩放后正好填满卡片宽度（不溢出裁切）。
          width: "238%",
          transform: "scale(0.42)",
          transformOrigin: "top left",
          padding: 12,
        }}
        dangerouslySetInnerHTML={{__html: html}}
      />
    </div>
  );
}
