import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from "react";
import {FileText} from "lucide-react";
import {render} from "../../markdown/parser.ts";
import {useStore, getThemeById} from "../../store/index.ts";
import {replaceStyle, STYLE_IDS} from "../../utils/style.ts";
import {toProxyHtml, toProxyImageUrl} from "../../utils/imageProxy.ts";
import {typesetMath} from "../../markdown/mathjax.ts";
import {renderMermaidCharts, reuseRenderedMermaidCharts} from "../../markdown/mermaid.ts";
import {getPreviewMode} from "./previewModes.ts";
import {buildMarkdownCss, subscribeCodeThemes} from "../../markdown/codeThemes.ts";
import {articleRootBackgroundIsSolid} from "../../themes/articleRootBackground.ts";
import {ARTICLE_BOX_ID, ARTICLE_ROOT_ID} from "../../articleRoot.ts";
import PreviewImageContextMenu from "./PreviewImageContextMenu.tsx";
import {resolvePreviewImage, type PreviewImageMenuTarget} from "./previewImageContextMenu.ts";
import {copyPreviewImage, savePreviewImageAs} from "../../utils/previewImageActions.ts";
import {toast} from "../Toast/toast.ts";
import {loadVideoMediaId} from "../../utils/publish.ts";
import {playPreviewVideo, toggleVoicePlayback} from "./previewPlayback.ts";

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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as {message?: unknown}).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  try {
    return String(error) || "未知错误";
  } catch {
    return "未知错误";
  }
}

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
  widthPercent: number;
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
    const [codeThemesVersion, setCodeThemesVersion] = useState(0);
    const [imageOverlay, setImageOverlay] = useState<ImageResizeOverlay | null>(null);
    const [imageMenuTarget, setImageMenuTarget] = useState<PreviewImageMenuTarget | null>(null);
    const imageMenuAnchor = useRef<HTMLImageElement | null>(null);
    const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null);
    const timer = useRef<number | undefined>(undefined);
    const scrollRef = useRef<HTMLDivElement>(null);
    const articleBoxRef = useRef<HTMLDivElement>(null);
    const themes = useStore((s) => s.themes);
    const codeThemeId = useStore((s) => s.codeThemeId);
    const previewMode = useStore((s) => s.previewMode);
    const mode = getPreviewMode(previewMode);
    // 主题未给文章设实色背景时，预览垫白色兜底（不影响导出成品），
    // 避免透明文章直接透出预览舞台底色，与微信发布的白底不一致。
    const needsNeutralArticleBg = useMemo(
      () => !articleRootBackgroundIsSolid(getThemeById(themes, markdownThemeId).css),
      [markdownThemeId, themes],
    );

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
    // codeThemesVersion 变化表示全量代码主题已加载（当前选中主题可能非常驻主题），需重注入。
    useEffect(() => {
      const css = getThemeById(themes, markdownThemeId).css;
      replaceStyle(STYLE_IDS.markdown, buildMarkdownCss(css, codeThemeId));
    }, [codeThemeId, codeThemesVersion, markdownThemeId, themes]);

    useEffect(() => subscribeCodeThemes(() => setCodeThemesVersion((version) => version + 1)), []);

    // 内容渲染，100ms 节流
    useEffect(() => {
      setImageMenuTarget(null);
      imageMenuAnchor.current = null;
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        // mmbiz 图片走代理显示（绕防盗链），复制时由 converter 还原成原链
        const root = document.getElementById(ARTICLE_ROOT_ID);
        const renderedHtml = toProxyHtml(render(content));
        setHtml(reuseRenderedMermaidCharts(renderedHtml, root));
        setImageOverlay(null);
        setResizingHandle(null);
      }, RENDER_THROTTLE_MS);
      return () => {
        if (timer.current) {
          window.clearTimeout(timer.current);
        }
      };
    }, [content]);

    useEffect(() => {
      const root = document.getElementById(ARTICLE_ROOT_ID);
      root?.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
        image.tabIndex = 0;
        image.setAttribute("aria-haspopup", "menu");
        const hasAccessibleName = Boolean(
          image.getAttribute("alt")?.trim() || image.getAttribute("aria-label")?.trim(),
        );
        if (!hasAccessibleName) {
          image.setAttribute("aria-label", "预览图片");
        }
        // 微表情固定 20×20 官方尺寸：微信表情是内联小图，个别主题
        // （尤其用户自定义主题）可能用 !important 干扰行内声明，
        // 这里用 JS 设置最高优先级的 inline important 强制兜底，
        // 保证软件内预览与微信草稿箱一致。
        if (
          image.classList.contains("rich_pages") &&
          image.classList.contains("wxw-img") &&
          image.getAttribute("data-w") === "20"
        ) {
          // 行内嵌入：主题/自定义样式的 `#article img { display: block }`
          // 会把表情挤到独立一行，必须一并强制回行内。
          image.style.setProperty("display", "inline-block", "important");
          image.style.setProperty("vertical-align", "middle", "important");
          image.style.setProperty("width", "20px", "important");
          image.style.setProperty("height", "20px", "important");
        }
      });
    }, [html]);

    // 素材库视频在本地预览不播放：隐藏真实 iframe（readtemplate 播放页在 WebView 里
    // 渲染为黑块），改用封面 + 播放按钮占位；iframe 节点保留在 DOM，导出时由
    // stripPreviewArtifacts 还原为完整播放标签。
    useEffect(() => {
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root) return;
      for (const iframe of Array.from(root.querySelectorAll<HTMLIFrameElement>("iframe.video_iframe"))) {
        if (iframe.dataset.vsVideoHidden === "true") continue;
        iframe.dataset.vsVideoHidden = "true";
        const playerSrc = iframe.getAttribute("src") ?? "";
        if (playerSrc) {
          // 本地预览不加载微信播放页（WebView 渲染为黑块），导出时由
          // stripPreviewArtifacts 从 data-vs-video-src 恢复 src。
          iframe.dataset.vsVideoSrc = playerSrc;
          iframe.removeAttribute("src");
        }
        const cover = iframe.getAttribute("data-cover") ?? "";
        const vid = iframe.getAttribute("data-mpvid") ?? "";
        const mediaId = vid ? loadVideoMediaId(vid) ?? "" : "";
        const placeholder = document.createElement("div");
        placeholder.className = "vs-video-placeholder";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", "素材库视频：点击播放本地预览");
        if (cover) {
          placeholder.style.backgroundImage = `url("${toProxyImageUrl(cover)}")`;
        }
        const play = document.createElement("span");
        play.className = "vs-video-placeholder-play";
        play.setAttribute("aria-hidden", "true");
        const hint = document.createElement("span");
        hint.className = "vs-video-placeholder-hint";
        hint.textContent = mediaId
          ? "点击播放本地预览 · 发布后显示官方播放器"
          : "本地预览不播放 · 发布后显示播放器";
        placeholder.append(play, hint);
        if (mediaId) {
          play.setAttribute("role", "button");
          play.setAttribute("aria-label", "播放素材库视频");
          play.style.cursor = "pointer";
          play.addEventListener("click", (event) => {
            event.stopPropagation();
            void playPreviewVideo(placeholder, mediaId);
          });
        }
        iframe.insertAdjacentElement("afterend", placeholder);
      }
    }, [html]);

    // 素材库音频在本地预览不播放：自定义音频元素在 WebView 里渲染为空，
    // 改为标题 + 时长 + 播放按钮样式的占位卡片；节点保留在 DOM，导出时由
    // stripPreviewArtifacts 清理占位并还原。
    useEffect(() => {
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root) return;
      for (const voice of Array.from(root.querySelectorAll<HTMLElement>("mp-common-mpaudio, mpvoice.js_editor_audio"))) {
        if (voice.dataset.vsAudioHidden === "true") continue;
        voice.dataset.vsAudioHidden = "true";
        const name = voice.getAttribute("name") ?? "音频";
        const playLength = voice.getAttribute("play_length") ?? "";
        const author = voice.getAttribute("author") ?? "";
        const cover = voice.getAttribute("cover") ?? "";
        const placeholder = document.createElement("div");
        placeholder.className = "vs-audio-placeholder";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", `素材库音频：${name}`);
        const info = document.createElement("span");
        info.className = "vs-audio-placeholder-info";
        const coverEl = document.createElement("span");
        coverEl.className = "vs-audio-placeholder-cover";
        if (cover) {
          coverEl.style.backgroundImage = `url("${toProxyImageUrl(cover)}")`;
        }
        const main = document.createElement("span");
        main.className = "vs-audio-placeholder-main";
        const title = document.createElement("strong");
        title.className = "vs-audio-placeholder-title";
        title.textContent = name;
        main.append(title);
        if (author) {
          const authorEl = document.createElement("span");
          authorEl.className = "vs-audio-placeholder-author";
          authorEl.textContent = author;
          main.append(authorEl);
        }
        info.append(coverEl, main);
        const timeRow = document.createElement("span");
        timeRow.className = "vs-audio-placeholder-time";
        const durationEl = document.createElement("span");
        durationEl.className = "vs-audio-placeholder-duration";
        durationEl.textContent = formatVoiceDurationLabel(playLength);
        const play = document.createElement("span");
        play.className = "vs-audio-placeholder-play";
        play.setAttribute("aria-hidden", "true");
        timeRow.append(durationEl, play);
        placeholder.append(info, timeRow);
        const fileid = voice.getAttribute("voice_encode_fileid") ?? "";
        if (fileid) {
          play.setAttribute("role", "button");
          play.setAttribute("aria-label", `播放音频：${name}`);
          play.style.cursor = "pointer";
          const playerUrl = `https://res.wx.qq.com/voice/getvoice?mediaid=${encodeURIComponent(fileid)}`;
          play.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleVoicePlayback(placeholder, play, durationEl, playerUrl, durationEl.textContent ?? "");
          });
        }
        voice.insertAdjacentElement("afterend", placeholder);
      }
    }, [html]);

    // QQ 音乐卡片在本地预览不渲染（mp-common-clmusic 为微信自定义组件），
    // 改为官方卡片样式的占位（封面带 QQ 音乐 logo + 歌名/歌手 + 播放按钮 + 时长）；
    // 节点保留在 DOM，导出时由 stripPreviewArtifacts 清理占位并还原官方组件。
    useEffect(() => {
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root) return;
      for (const node of Array.from(root.querySelectorAll<HTMLElement>("mp-common-clmusic"))) {
        if (node.dataset.vsMusicHidden === "true") continue;
        node.dataset.vsMusicHidden = "true";
        const title = node.getAttribute("music_name") ?? "音乐";
        const author = node.getAttribute("singer") ?? "";
        const cover = node.getAttribute("albumurl") ?? "";
        const playUrl = node.getAttribute("data-vs-music-url") ?? "";
        const vip = node.getAttribute("is_vip") === "1";
        const duration = Number(node.getAttribute("duration") ?? 0);
        const placeholder = document.createElement("div");
        placeholder.className = "vs-audio-placeholder vs-music-placeholder";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", `QQ 音乐：${title}`);
        const row = document.createElement("span");
        row.className = "vs-music-row";
        const coverEl = document.createElement("span");
        coverEl.className = "vs-audio-placeholder-cover";
        if (cover) {
          coverEl.style.backgroundImage = `url("${toProxyImageUrl(cover)}")`;
        }
        const qqLogo = document.createElement("i");
        qqLogo.className = "vs-music-qq-logo";
        qqLogo.setAttribute("aria-hidden", "true");
        coverEl.append(qqLogo);
        const main = document.createElement("span");
        main.className = "vs-audio-placeholder-main";
        const titleEl = document.createElement("strong");
        titleEl.className = "vs-audio-placeholder-title";
        titleEl.textContent = title;
        if (vip) {
          const vipEl = document.createElement("b");
          vipEl.className = "vs-music-vip";
          vipEl.textContent = "VIP";
          titleEl.append(" ", vipEl);
        }
        main.append(titleEl);
        if (author) {
          const authorEl = document.createElement("span");
          authorEl.className = "vs-audio-placeholder-author";
          authorEl.textContent = author;
          main.append(authorEl);
        }
        row.append(coverEl, main);
        const idleLabel = formatVoiceDurationLabel(String(duration));
        const durationEl = document.createElement("span");
        durationEl.className = "vs-audio-placeholder-duration";
        durationEl.textContent = idleLabel;
        // 官方卡片不显示时长文字；元素仅用于播放时的进度回写，保持隐藏。
        durationEl.style.display = "none";
        const play = document.createElement("span");
        play.className = "vs-music-play";
        play.setAttribute("aria-hidden", "true");
        if (playUrl) {
          play.setAttribute("role", "button");
          play.setAttribute("aria-label", `播放音乐：${title}`);
          play.style.cursor = "pointer";
          play.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleVoicePlayback(placeholder, play, durationEl, playUrl, idleLabel);
          });
          row.append(play);
        }
        placeholder.append(row);
        node.insertAdjacentElement("afterend", placeholder);
      }
    }, [html]);

    // 视频号视频卡片在本地预览不渲染（mp-common-videosnap 为微信自定义组件），
    // 改为封面 + 播放按钮 + 账号名的占位卡片；节点保留在 DOM，导出时由
    // stripPreviewArtifacts 清理占位并还原官方组件。
    useEffect(() => {
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root) return;
      for (const node of Array.from(root.querySelectorAll<HTMLElement>("mp-common-videosnap"))) {
        if (node.dataset.vsVideosnapHidden === "true") continue;
        node.dataset.vsVideosnapHidden = "true";
        const cover = node.getAttribute("data-url") ?? "";
        const nickname = node.getAttribute("data-nickname") ?? "视频号";
        const authIcon = node.getAttribute("data-authiconurl") ?? "";
        const width = Number(node.getAttribute("data-width") ?? 0);
        const height = Number(node.getAttribute("data-height") ?? 0);
        // 封面按官方卡片显示比例裁剪（竖版 3:4、横版 16:9），与草稿箱卡片一致——
        // 若按视频原生比例（如 9:16）显示，预览裁剪范围会和草稿箱对不上。
        const isVertical = height > width;
        const coverRatio = isVertical ? 133.33 : 56.25;
        const placeholder = document.createElement("div");
        placeholder.className = "vs-videosnap-placeholder";
        placeholder.style.maxWidth = isVertical ? "254px" : "575px";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", `视频号视频：${nickname}`);
        const coverEl = document.createElement("span");
        coverEl.className = "vs-videosnap-cover";
        coverEl.style.paddingBottom = `${coverRatio}%`;
        if (cover) {
          coverEl.style.backgroundImage = `url("${toProxyImageUrl(cover)}")`;
        }
        const play = document.createElement("span");
        play.className = "vs-videosnap-play";
        play.setAttribute("aria-hidden", "true");
        coverEl.append(play);
        const foot = document.createElement("span");
        foot.className = "vs-videosnap-foot";
        const logo = document.createElement("span");
        logo.className = "vs-videosnap-logo";
        logo.setAttribute("aria-hidden", "true");
        foot.append(logo);
        const nameEl = document.createElement("span");
        nameEl.className = "vs-videosnap-nickname";
        nameEl.textContent = nickname;
        foot.append(nameEl);
        if (authIcon) {
          const authEl = document.createElement("span");
          authEl.className = "vs-videosnap-auth";
          authEl.style.backgroundImage = `url("${toProxyImageUrl(authIcon)}")`;
          foot.append(authEl);
        }
        placeholder.append(coverEl, foot);
        node.insertAdjacentElement("afterend", placeholder);
      }
    }, [html]);

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
      const hasExplicitWidth = image.hasAttribute("width") || image.style.width.trim().length > 0;
      const widthPercent = hasExplicitWidth
        ? Math.min(
            Math.max(Math.round((imageRect.width / Math.max(imageContainerWidth(image), 1)) * 100), 1),
            100,
          )
        : 100;
      return {
        image,
        imageIndex: index,
        left: imageRect.left - boxRect.left,
        top: imageRect.top - boxRect.top,
        width: imageRect.width,
        height: imageRect.height,
        widthPercent,
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
        setResizingHandle(null);
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
      setResizingHandle(handle);

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
        setResizingHandle(null);
        const percent = Math.min(Math.max(Math.round((nextWidth / Math.max(imageContainerWidth(image), 1)) * 100), 1), 100);
        onResizeImage(imageOverlay.imageIndex, {width: `${percent}%`});
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    }

    function onMouseMove(e: React.MouseEvent) {
      selectResizableImage(e.target as Element);
    }

    function onMouseLeave() {
      if (!resizingHandle) {
        setImageOverlay(null);
      }
    }

    function openImageMenu(image: HTMLImageElement, x: number, y: number) {
      imageMenuAnchor.current = image;
      setImageMenuTarget({
        source: image.currentSrc || image.src,
        x,
        y,
      });
    }

    function closeImageMenu() {
      const image = imageMenuAnchor.current;
      imageMenuAnchor.current = null;
      setImageMenuTarget(null);
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (image?.isConnected && root?.contains(image)) {
        image.focus({preventScroll: true});
      }
    }

    function onContextMenu(event: React.MouseEvent) {
      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root) return;
      const image = resolvePreviewImage(event.target, root, imageOverlay?.image);
      if (!image) return;

      event.preventDefault();
      openImageMenu(image, event.clientX, event.clientY);
    }

    function onKeyDown(event: React.KeyboardEvent) {
      const opensContextMenu = event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
      if (!opensContextMenu) return;

      const root = document.getElementById(ARTICLE_ROOT_ID);
      if (!root) return;
      const image = resolvePreviewImage(event.target, root);
      if (!image) return;

      event.preventDefault();
      const rect = image.getBoundingClientRect();
      openImageMenu(
        image,
        rect.left + Math.min(Math.max(rect.width, 0), 16),
        rect.top + Math.min(Math.max(rect.height, 0), 16),
      );
    }

    async function copyImage(source: string) {
      closeImageMenu();
      try {
        await copyPreviewImage(source);
        toast.show("图片已复制");
      } catch (error) {
        toast.show(`图片复制失败：${errorMessage(error)}`, "error");
      }
    }

    async function saveImage(source: string) {
      closeImageMenu();
      try {
        const result = await savePreviewImageAs(source);
        if (result.status === "saved") {
          toast.show("图片已保存");
        }
      } catch (error) {
        toast.show(`图片保存失败：${errorMessage(error)}`, "error");
      }
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
            minHeight: "100%",
            // 不再用白色画布垫底，文章直接铺在预览区上；
            // 中间层已取消，边界层次由最内层文章的描边与投影承担。
            background: "transparent",
            opacity: themeSwitching ? 0.55 : 1,
          }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
        >
          {content.trim() ? (
            html ? (
              <section
                id={ARTICLE_ROOT_ID}
                className={needsNeutralArticleBg ? "vs-preview-article vs-article-neutral-bg" : "vs-preview-article"}
                dangerouslySetInnerHTML={{__html: html}}
              />
            ) : (
              <PreviewSkeleton />
            )
          ) : (
            <PreviewEmptyState />
          )}
          {imageOverlay && (
            <ImageResizeHandles
              overlay={imageOverlay}
              resizingHandle={resizingHandle}
              onPointerDown={startImageResize}
            />
          )}
        </div>
        {imageMenuTarget && (
          <PreviewImageContextMenu
            target={imageMenuTarget}
            onCopy={copyImage}
            onSave={saveImage}
            onClose={closeImageMenu}
          />
        )}
      </div>
    );
  },
);

function ImageResizeHandles({
  overlay,
  resizingHandle,
  onPointerDown,
}: {
  overlay: ImageResizeOverlay;
  resizingHandle: ResizeHandle | null;
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
      className={`vs-image-resize-overlay${resizingHandle ? " is-resizing" : ""}`}
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
      <div className="vs-image-resize-size-badge">
        <span>{overlay.widthPercent}%</span>
        <span className="vs-image-resize-size-badge-divider" />
        <span>保持比例</span>
      </div>
      {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((handle) => (
        <button
          key={handle}
          type="button"
          data-resize-handle={handle}
          className={`vs-image-resize-handle vs-image-resize-handle-${handle}${resizingHandle === handle ? " is-active" : ""}`}
          tabIndex={-1}
        />
      ))}
    </div>
  );
}

// 官方静态显示中文时长，只到分钟："2分钟"、"5分钟"。
function formatVoiceDurationLabel(playLength: string): string {
  const value = playLength.trim();
  if (!value) return "";
  if (!/^\d+$/.test(value)) return value;
  const totalSeconds = Math.round(Number(value) / 1000);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}分钟`;
}

// 首屏/切文档瞬间文章尚未渲染时的骨架占位
function PreviewSkeleton() {
  return (
    <div aria-hidden="true" style={{padding: "24px 32px"}}>
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

// 空文档占位：区别于加载骨架，提示用户开始写作。
function PreviewEmptyState() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-bg-tertiary text-text-muted">
        <FileText size={24} strokeWidth={1.6} />
      </div>
      <div>
        <p className="text-sm font-medium text-[#6b6b76]">开始写作</p>
        <p className="mx-auto mt-1 max-w-[280px] text-xs leading-relaxed text-[#9b9ba6]">
          在左侧输入 Markdown 内容，这里会实时渲染公众号文章的排版效果
        </p>
      </div>
    </div>
  );
}

Preview.displayName = "Preview";

export default Preview;
