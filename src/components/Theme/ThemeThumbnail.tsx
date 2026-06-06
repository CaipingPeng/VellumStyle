import {useEffect, useMemo} from "react";
import {render} from "../../markdown/parser.ts";
import {basic} from "../../themes/index.ts";
import {scopeCss} from "./scopeCss.ts";
import {SAMPLE_MARKDOWN} from "./sampleContent.ts";

interface Props {
  themeId: string; // 用于生成唯一 scope class
  css: string; // 主题 CSS（自包含 markdown + hljs）
}

// 缩略图：把 basic + 主题 CSS 都 scope 到本卡唯一 class，注入局部 <style>，
// 渲染固定示例 HTML，再用 transform: scale 缩成「缩小版正文」。
export default function ThemeThumbnail({themeId, css}: Props) {
  // scope class 必须是合法 CSS 标识符：非字母数字转 '-'。
  const scopeClass = useMemo(() => "tp-" + themeId.replace(/[^a-zA-Z0-9_-]/g, "-"), [themeId]);
  const html = useMemo(() => render(SAMPLE_MARKDOWN), []);
  const scoped = useMemo(
    () => scopeCss(basic, scopeClass) + "\n" + scopeCss(css, scopeClass),
    [css, scopeClass],
  );

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = scoped;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [scoped]);

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
          width: 600,
          transform: "scale(0.42)",
          transformOrigin: "top left",
          padding: 12,
        }}
        dangerouslySetInnerHTML={{__html: html}}
      />
    </div>
  );
}
