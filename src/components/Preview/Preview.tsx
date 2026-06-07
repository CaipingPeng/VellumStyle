import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {render} from "../../markdown/parser.ts";
import {useStore, getThemeById} from "../../store/index.ts";
import {replaceStyle, STYLE_IDS} from "../../utils/style.ts";
import {toProxyHtml} from "../../utils/imageProxy.ts";
import {modelIdFromElement} from "../StylePanel/elementMap.ts";

interface Props {
  content: string;
  markdownThemeId: string;
}

export interface PreviewHandle {
  // 预览滚动容器（外层 overflow:auto 的 div），供同步滚动监听
  getScroller: () => HTMLElement | null;
}

const RENDER_THROTTLE_MS = 100;

// 实时预览：注入主题层样式 + 渲染 HTML 到 #nice，自适应占满预览区宽度。
// 点击预览元素 → 识别 model id → 打开样式面板。
const Preview = forwardRef<PreviewHandle, Props>(
  ({content, markdownThemeId}, ref) => {
    const [html, setHtml] = useState("");
    const timer = useRef<number | undefined>(undefined);
    const scrollRef = useRef<HTMLDivElement>(null);
    const themes = useStore((s) => s.themes);
    const setSelectedModel = useStore((s) => s.setSelectedModel);

    useImperativeHandle(ref, () => ({
      getScroller: () => scrollRef.current,
    }));

    // 主题层：model 编译出的 css 自包含全部样式。basic 层已废弃，不再注入。
    // code 层置空，避免与复制管线（converter 拼接）冲突。
    useEffect(() => {
      const css = getThemeById(themes, markdownThemeId).css;
      replaceStyle(STYLE_IDS.markdown, css);
      replaceStyle(STYLE_IDS.code, "");
    }, [markdownThemeId, themes]);

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

    // 点击预览元素 → 识别 model id → 打开面板
    function onClick(e: React.MouseEvent) {
      const target = e.target as Element;
      const id = modelIdFromElement(target);
      if (id) setSelectedModel(id);
    }

    return (
      <div ref={scrollRef} style={{height: "100%", overflowY: "auto", background: "#fff"}}>
        <div
          id="nice-rich-text-box"
          style={{padding: "24px 32px", minHeight: "100%"}}
          onClick={onClick}
        >
          <section id="nice" dangerouslySetInnerHTML={{__html: html}} />
        </div>
      </div>
    );
  },
);

Preview.displayName = "Preview";

export default Preview;
