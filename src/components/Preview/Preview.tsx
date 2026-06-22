import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {render} from "../../markdown/parser.ts";
import {useStore, getThemeById} from "../../store/index.ts";
import {replaceStyle, STYLE_IDS} from "../../utils/style.ts";
import {toProxyHtml} from "../../utils/imageProxy.ts";
import {typesetMath} from "../../markdown/mathjax.ts";
import {renderMermaidCharts, reuseRenderedMermaidCharts} from "../../markdown/mermaid.ts";
import {modelIdFromElement, SELECTOR_PRIORITY} from "../StylePanel/elementMap.ts";
import {getPreviewMode} from "./previewModes.ts";
import {buildMarkdownCss} from "../../markdown/codeThemes.ts";
import {ARTICLE_BOX_ID, ARTICLE_ROOT_ID} from "../../articleRoot.ts";

interface Props {
  content: string;
  markdownThemeId: string;
}

export interface PreviewHandle {
  // 预览滚动容器（外层 overflow:auto 的 div），供同步滚动监听
  getScroller: () => HTMLElement | null;
  // 按源码行号滚到预览中最接近的 data-line 锚点。
  scrollToLine: (line: number) => void;
  // 当前预览视口顶部附近的标题源码行号。
  getActiveHeadingLine: () => number | null;
}

const RENDER_THROTTLE_MS = 100;
const HEADING_ANCHOR_SELECTOR = "h1[data-line], h2[data-line], h3[data-line], h4[data-line], h5[data-line], h6[data-line]";
const ACTIVE_HEADING_OFFSET_PX = 32;

interface LineAnchor {
  element: HTMLElement;
  line: number;
  top: number;
}

function lineAnchors(scroller: HTMLElement, selector: string): LineAnchor[] {
  const anchors: LineAnchor[] = [];
  for (const element of scroller.querySelectorAll<HTMLElement>(selector)) {
    const line = Number(element.getAttribute("data-line"));
    if (!Number.isNaN(line)) {
      anchors.push({element, line, top: element.offsetTop});
    }
  }
  anchors.sort((a, b) => a.line - b.line);
  return anchors;
}

function targetAnchorForLine(anchors: LineAnchor[], line: number): HTMLElement | null {
  let fallback: HTMLElement | null = null;
  for (const anchor of anchors) {
    if (anchor.line >= line) {
      return anchor.element;
    }
    fallback = anchor.element;
  }
  return fallback;
}

function activeHeadingLine(scroller: HTMLElement): number | null {
  const anchors = lineAnchors(scroller, HEADING_ANCHOR_SELECTOR).sort((a, b) => a.top - b.top);
  if (anchors.length === 0) {
    return null;
  }
  const threshold = scroller.scrollTop + ACTIVE_HEADING_OFFSET_PX;
  let active = anchors[0];
  for (const anchor of anchors) {
    if (anchor.top <= threshold) {
      active = anchor;
    } else {
      break;
    }
  }
  return active.line;
}

// 实时预览：注入主题层样式 + 渲染 HTML 到文章根容器，自适应占满预览区宽度。
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

    // 主题切换时文章容器短暂淡入淡出，避免 CSS 整体替换的突兀感（首次进入不触发）
    const [themeSwitching, setThemeSwitching] = useState(false);
    const skipFirstTheme = useRef(true);
    useEffect(() => {
      if (skipFirstTheme.current) {
        skipFirstTheme.current = false;
        return;
      }
      setThemeSwitching(true);
      const t = window.setTimeout(() => setThemeSwitching(false), 160);
      return () => window.clearTimeout(t);
    }, [markdownThemeId]);

    useImperativeHandle(ref, () => ({
      getScroller: () => scrollRef.current,
      scrollToLine: (line) => {
        const scroller = scrollRef.current;
        if (!scroller) {
          return;
        }
        const target = targetAnchorForLine(lineAnchors(scroller, "[data-line]"), line);
        if (target) {
          scroller.scrollTop = target.offsetTop;
        }
      },
      getActiveHeadingLine: () => {
        const scroller = scrollRef.current;
        return scroller ? activeHeadingLine(scroller) : null;
      },
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
        const root = document.getElementById(ARTICLE_ROOT_ID);
        const renderedHtml = toProxyHtml(render(content));
        setHtml(reuseRenderedMermaidCharts(renderedHtml, root));
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
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root || !html.includes("$")) {
        return;
      }
      void typesetMath(root).catch((error) => {
        console.error("MathJax 排版失败", error);
      });
    }, [html]);

    useEffect(() => {
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root || !html.includes("data-mermaid-source")) {
        return;
      }
      void renderMermaidCharts(root).catch((error) => {
        console.error("Mermaid 图表渲染失败", error);
      });
    }, [html]);

    useEffect(() => {
      if (!selectedModelId && selectedEl.current) {
        selectedEl.current.classList.remove("preview-edit-selected");
        selectedEl.current = null;
      }
    }, [selectedModelId]);

    function findEditableElement(target: Element): {element: Element; modelId: string} | null {
      const root = document.getElementById(ARTICLE_ROOT_ID);
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
          id={ARTICLE_BOX_ID}
          className="vs-theme-fade"
          style={{
            boxSizing: "border-box",
            width: mode.width ? `${mode.width}px` : "100%",
            maxWidth: "100%",
            margin: mode.width ? "0 auto" : undefined,
            padding: "24px 32px",
            minHeight: "100%",
            background: "#fff",
            opacity: themeSwitching ? 0.55 : 1,
          }}
          onClick={onClick}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        >
          {html ? (
            <section id={ARTICLE_ROOT_ID} dangerouslySetInnerHTML={{__html: html}} />
          ) : (
            <PreviewSkeleton />
          )}
        </div>
      </div>
    );
  },
);

// 首屏/切文档瞬间文章尚未渲染时的骨架占位
function PreviewSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="vs-skel" style={{height: 26, width: "58%", marginBottom: 20}} />
      <div className="vs-skel" style={{height: 14, marginBottom: 10}} />
      <div className="vs-skel" style={{height: 14, marginBottom: 10}} />
      <div className="vs-skel" style={{height: 14, width: "82%", marginBottom: 26}} />
      <div className="vs-skel" style={{height: 18, width: "38%", marginBottom: 16}} />
      <div className="vs-skel" style={{height: 14, marginBottom: 10}} />
      <div className="vs-skel" style={{height: 14, width: "70%"}} />
    </div>
  );
}

Preview.displayName = "Preview";

export default Preview;
