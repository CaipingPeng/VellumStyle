import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {render} from "../../markdown/parser.ts";
import {useStore, getThemeById} from "../../store/index.ts";
import {replaceStyle, STYLE_IDS} from "../../utils/style.ts";
import {toProxyHtml} from "../../utils/imageProxy.ts";
import {typesetMath} from "../../markdown/mathjax.ts";
import {modelIdFromElement, SELECTOR_PRIORITY} from "../StylePanel/elementMap.ts";
import {getPreviewMode} from "./previewModes.ts";
import {buildMarkdownCss} from "../../markdown/codeThemes.ts";

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
    const hoverEl = useRef<Element | null>(null);
    const selectedEl = useRef<Element | null>(null);
    const themes = useStore((s) => s.themes);
    const codeThemeId = useStore((s) => s.codeThemeId);
    const previewMode = useStore((s) => s.previewMode);
    const selectedModelId = useStore((s) => s.selectedModelId);
    const setSelectedModel = useStore((s) => s.setSelectedModel);
    const mode = getPreviewMode(previewMode);

    useImperativeHandle(ref, () => ({
      getScroller: () => scrollRef.current,
    }));

    // 主题层：文章主题在前，独立代码主题在后，保证所有文章主题默认共享同一套代码高亮。
    useEffect(() => {
      const css = getThemeById(themes, markdownThemeId).css;
      replaceStyle(STYLE_IDS.markdown, buildMarkdownCss(css, codeThemeId));
    }, [codeThemeId, markdownThemeId, themes]);

    // 内容渲染，100ms 节流
    useEffect(() => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        // mmbiz 图片走代理显示（绕防盗链），复制时由 converter 还原成原链
        setHtml(toProxyHtml(render(content)));
        hoverEl.current = null;
        selectedEl.current = null;
      }, RENDER_THROTTLE_MS);
      return () => {
        if (timer.current) {
          window.clearTimeout(timer.current);
        }
      };
    }, [content]);

    useEffect(() => {
      const root = document.getElementById("nice");
      if (!root || !html.includes("$")) {
        return;
      }
      void typesetMath(root).catch((error) => {
        console.error("MathJax 排版失败", error);
      });
    }, [html]);

    useEffect(() => {
      if (!selectedModelId && selectedEl.current) {
        selectedEl.current.classList.remove("preview-edit-selected");
        selectedEl.current = null;
      }
    }, [selectedModelId]);

    function findEditableElement(target: Element): {element: Element; modelId: string} | null {
      const root = document.getElementById("nice");
      if (!root) return null;
      for (const entry of SELECTOR_PRIORITY) {
        const element = target.closest(entry.selector);
        if (element && root.contains(element)) {
          return {element, modelId: entry.modelId};
        }
      }
      return null;
    }

    function replaceClass(ref: React.MutableRefObject<Element | null>, element: Element | null, className: string) {
      if (ref.current && ref.current !== element) {
        ref.current.classList.remove(className);
      }
      ref.current = element;
      if (element) {
        element.classList.add(className);
      }
    }

    function onMouseMove(e: React.MouseEvent) {
      const target = e.target as Element;
      const match = findEditableElement(target);
      replaceClass(hoverEl, match?.element ?? null, "preview-edit-hover");
    }

    function onMouseLeave() {
      replaceClass(hoverEl, null, "preview-edit-hover");
    }

    // 点击预览元素 → 识别 model id → 打开面板并保留选中高亮
    function onClick(e: React.MouseEvent) {
      const target = e.target as Element;
      const match = findEditableElement(target);
      const id = match?.modelId ?? modelIdFromElement(target);
      if (id) {
        setSelectedModel(id);
      }
      replaceClass(selectedEl, match?.element ?? null, "preview-edit-selected");
    }

    return (
      <div
        ref={scrollRef}
        className="editor-preview-scrollbar"
        style={{height: "100%", overflow: "auto", background: mode.width ? "var(--bg-secondary)" : "#fff"}}
      >
        <div
          id="nice-rich-text-box"
          style={{
            boxSizing: "border-box",
            width: mode.width ? `${mode.width}px` : "100%",
            maxWidth: "100%",
            margin: mode.width ? "0 auto" : undefined,
            padding: "24px 32px",
            minHeight: "100%",
            background: "#fff",
          }}
          onClick={onClick}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        >
          <section id="nice" dangerouslySetInnerHTML={{__html: html}} />
        </div>
      </div>
    );
  },
);

Preview.displayName = "Preview";

export default Preview;
