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
  onResizeImage?: (imageIndex: number, size: {width: string}) => void;
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

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface ImageResizeOverlay {
  image: HTMLImageElement;
  imageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
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
  ({content, markdownThemeId, onResizeImage}, ref) => {
    const [html, setHtml] = useState("");
    const [imageOverlay, setImageOverlay] = useState<ImageResizeOverlay | null>(null);
    const timer = useRef<number | undefined>(undefined);
    const scrollRef = useRef<HTMLDivElement>(null);
    const articleBoxRef = useRef<HTMLDivElement>(null);
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
        setImageOverlay(null);
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

    function imageResizeOverlayFor(image: HTMLImageElement): ImageResizeOverlay | null {
      const box = articleBoxRef.current;
      const index = Number(image.getAttribute("data-vs-image-index"));
      if (!box || !Number.isInteger(index)) {
        return null;
      }
      const imageRect = image.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      if (imageRect.width <= 0 || imageRect.height <= 0) {
        return null;
      }
      return {
        image,
        imageIndex: index,
        left: imageRect.left - boxRect.left,
        top: imageRect.top - boxRect.top,
        width: imageRect.width,
        height: imageRect.height,
      };
    }

    function imageContainerWidth(image: HTMLImageElement): number {
      const rootWidth = document.getElementById(ARTICLE_ROOT_ID)?.getBoundingClientRect().width ?? 0;
      if (rootWidth > 0) {
        return rootWidth;
      }
      const parentWidth = image.parentElement?.getBoundingClientRect().width ?? 0;
      return parentWidth > 0 ? parentWidth : image.getBoundingClientRect().width;
    }

    useEffect(() => {
      const image = imageOverlay?.image;
      if (!image) {
        return;
      }

      let raf = 0;
      let timer = 0;
      const refresh = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (!document.body.contains(image)) {
            setImageOverlay(null);
            return;
          }
          setImageOverlay(imageResizeOverlayFor(image));
        });
      };

      const observer = new ResizeObserver(refresh);
      if (articleBoxRef.current) {
        observer.observe(articleBoxRef.current);
      }
      observer.observe(image);
      scrollRef.current?.addEventListener("scroll", refresh, {passive: true});
      timer = window.setTimeout(refresh, 190);
      refresh();

      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        observer.disconnect();
        scrollRef.current?.removeEventListener("scroll", refresh);
      };
      // Rebind only when the selected image element changes; overlay coordinates update inside refresh.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageOverlay?.image]);

    function selectResizableImage(target: Element): boolean {
      if (target.closest(".vs-image-resize-overlay")) {
        return Boolean(imageOverlay);
      }
      const image = target.closest("img[data-vs-image-index]") as HTMLImageElement | null;
      if (!image) {
        setImageOverlay(null);
        return false;
      }
      const overlay = imageResizeOverlayFor(image);
      setImageOverlay(overlay);
      return Boolean(overlay);
    }

    function startImageResize(handle: ResizeHandle, event: React.PointerEvent<HTMLElement>) {
      if (!imageOverlay || !onResizeImage) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const image = imageOverlay.image;
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = imageOverlay.width;
      const startHeight = imageOverlay.height;
      const aspect = startHeight / Math.max(startWidth, 1);
      const containerWidth = imageContainerWidth(image);
      const maxWidth = Math.max(32, containerWidth);
      let nextWidth = startWidth;
      let nextHeight = startHeight;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 捕获失败时仍依赖 document 级监听兜底。
      }

      const resize = (clientX: number, clientY: number) => {
        const dx = clientX - startX;
        const dy = clientY - startY;
        const horizontalDelta = handle.endsWith("e") ? dx : -dx;
        const verticalDelta = handle.startsWith("s") ? dy / aspect : -dy / aspect;
        const delta = Math.abs(horizontalDelta) > Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;
        nextWidth = Math.min(Math.max(Math.round(startWidth + delta), 32), maxWidth);
        nextHeight = Math.max(1, Math.round(nextWidth * aspect));
        image.style.width = `${nextWidth}px`;
        image.style.height = `${nextHeight}px`;
        const overlay = imageResizeOverlayFor(image);
        if (overlay) {
          setImageOverlay(overlay);
        }
      };

      const onMove = (ev: PointerEvent) => resize(ev.clientX, ev.clientY);
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        const percent = Math.min(Math.max(Math.round((nextWidth / Math.max(imageContainerWidth(image), 1)) * 100), 1), 100);
        onResizeImage(imageOverlay.imageIndex, {width: `${percent}%`});
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    }

    function onMouseMove(e: React.MouseEvent) {
      const target = e.target as Element;
      const match = findEditableElement(target);
      replaceClass(hoverEl, match?.element ?? null, "preview-edit-hover");
      selectResizableImage(target);
    }

    function onMouseLeave() {
      replaceClass(hoverEl, null, "preview-edit-hover");
      setImageOverlay(null);
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
          ref={articleBoxRef}
          id={ARTICLE_BOX_ID}
          className="vs-theme-fade"
          style={{
            position: "relative",
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
          {imageOverlay && (
            <ImageResizeHandles
              overlay={imageOverlay}
              onPointerDown={startImageResize}
            />
          )}
        </div>
      </div>
    );
  },
);

function ImageResizeHandles({
  overlay,
  onPointerDown,
}: {
  overlay: ImageResizeOverlay;
  onPointerDown: (handle: ResizeHandle, event: React.PointerEvent<HTMLElement>) => void;
}) {
  function handleFromPointer(event: React.PointerEvent<HTMLElement>): ResizeHandle | null {
    const targetHandle = (event.target as HTMLElement).dataset.resizeHandle as ResizeHandle | undefined;
    if (targetHandle) {
      return targetHandle;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const corners: Array<{handle: ResizeHandle; x: number; y: number}> = [
      {handle: "nw", x: 0, y: 0},
      {handle: "ne", x: rect.width, y: 0},
      {handle: "sw", x: 0, y: rect.height},
      {handle: "se", x: rect.width, y: rect.height},
    ];
    const nearest = corners
      .map((corner) => ({...corner, distance: Math.hypot(x - corner.x, y - corner.y)}))
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest.distance <= 28 ? nearest.handle : null;
  }

  return (
    <div
      className="vs-image-resize-overlay"
      style={{
        left: overlay.left,
        top: overlay.top,
        width: overlay.width,
        height: overlay.height,
      }}
      aria-hidden="true"
      onPointerDown={(event) => {
        const handle = handleFromPointer(event);
        if (handle) {
          onPointerDown(handle, event);
        }
      }}
    >
      {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((handle) => (
        <button
          key={handle}
          type="button"
          data-resize-handle={handle}
          className={`vs-image-resize-handle vs-image-resize-handle-${handle}`}
          tabIndex={-1}
        />
      ))}
    </div>
  );
}

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
