import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {render} from "../../markdown/parser.ts";
import {basic, getMarkdownCss, getCodeCss} from "../../themes/index.ts";
import {replaceStyle, STYLE_IDS} from "../../utils/style.ts";
import {toProxyHtml} from "../../utils/imageProxy.ts";

interface Props {
  content: string;
  markdownThemeId: string;
}

export interface PreviewHandle {
  // 预览滚动容器（外层 overflow:auto 的 div），供同步滚动监听
  getScroller: () => HTMLElement | null;
}

const RENDER_THROTTLE_MS = 100;

// 实时预览：注入四层样式 + 渲染 HTML 到 #nice，自适应占满预览区宽度。
const Preview = forwardRef<PreviewHandle, Props>(
  ({content, markdownThemeId}, ref) => {
    const [html, setHtml] = useState("");
    const timer = useRef<number | undefined>(undefined);
    const scrollRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      getScroller: () => scrollRef.current,
    }));

    // 基础层只注入一次
    useEffect(() => {
      replaceStyle(STYLE_IDS.basic, basic);
    }, []);

    // 主题层 + 代码层随主题切换（代码高亮跟随当前 markdown 主题）
    useEffect(() => {
      replaceStyle(STYLE_IDS.markdown, getMarkdownCss(markdownThemeId));
      replaceStyle(STYLE_IDS.code, getCodeCss(markdownThemeId));
    }, [markdownThemeId]);

    // 内容渲染，100ms 节流
    useEffect(() => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        // mmbiz 图片走代理显示（绕防盗链），复制时由 converter 还原成原链
        setHtml(toProxyHtml(render(content)));
      }, RENDER_THROTTLE_MS);
      return () => {
        if (timer.current) {
          window.clearTimeout(timer.current);
        }
      };
    }, [content]);

    return (
      <div ref={scrollRef} style={{height: "100%", overflowY: "auto", background: "#fff"}}>
        <div id="nice-rich-text-box" style={{padding: "24px 32px", minHeight: "100%"}}>
          <section id="nice" dangerouslySetInnerHTML={{__html: html}} />
        </div>
      </div>
    );
  },
);

Preview.displayName = "Preview";

export default Preview;
