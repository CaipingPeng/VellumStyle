import {ARTICLE_BOX_ID} from "../articleRoot.ts";
import {STYLE_IDS} from "../utils/style.ts";
import {fromProxyHtml} from "../utils/imageProxy.ts";
import {inlineMermaidSvgElementStylesForWechat} from "./mermaidExport.ts";

// juice（含 cheerio/parse5 等约 560KB）只在复制/发布/导出时才需要，
// 改为按需加载，避免整条链常驻主包。type-only 导入无运行时开销。
import type juice from "juice";

let juicePromise: Promise<typeof juice> | null = null;
function loadJuice(): Promise<typeof juice> {
  juicePromise ??= import("juice").then((module) => module.default);
  return juicePromise;
}

const DISPLAY_MATH_STYLE =
  "display:block;text-align:center;margin:1em 0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch";
const LINK_LEAF_STYLE_PROPS = new Set([
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness",
]);

function readStyle(id: string): string {
  const el = document.getElementById(id);
  return el ? el.innerText : "";
}

function upsertAttribute(attrs: string, name: string, update: (value: string | null) => string): string {
  const re = new RegExp(`\\s${name}=(['"])([\\s\\S]*?)\\1`);
  const match = attrs.match(re);
  if (!match) {
    return `${attrs} ${name}="${update(null)}"`;
  }
  return attrs.replace(re, ` ${name}="${update(match[2])}"`);
}

function appendClass(attrs: string, className: string): string {
  return upsertAttribute(attrs, "class", (value) => {
    const classes = (value ?? "").split(/\s+/).filter(Boolean);
    if (!classes.includes(className)) {
      classes.push(className);
    }
    return classes.join(" ");
  });
}

function appendStyle(attrs: string, style: string): string {
  return upsertAttribute(attrs, "style", (value) => {
    const current = value?.trim();
    return current ? `${current.replace(/;?\s*$/, ";")}${style}` : style;
  });
}

function linkLeafStyle(style: string): string {
  return style
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const name = part.split(":", 1)[0]?.trim().toLowerCase();
      return LINK_LEAF_STYLE_PROPS.has(name);
    })
    .join("; ");
}

export function normalizeMathJaxForWechat(html: string): string {
  return html
    .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/g, "")
    .replace(/class="mjx-solid"/g, 'fill="none" stroke-width="70"')
    .replace(/<mjx-container\b([^>]*)>([\s\S]*?)<\/mjx-container>/g, (_match, attrs: string, body: string) => {
      if (/\sdisplay=(['"])true\1/.test(attrs)) {
        const nextAttrs = appendStyle(appendClass(attrs, "block-equation"), DISPLAY_MATH_STYLE);
        return `<section${nextAttrs}>${body}</section>`;
      }
      return `<span${attrs}>${body}</span>`;
    })
    .replace(/\s<span class="inline/g, '&nbsp;<span class="inline')
    .replace(/svg><\/span>\s/g, "svg></span>&nbsp;");
}

export function normalizeLinksForWechat(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = link.getAttribute("href")?.trim();
    if (!href) {
      continue;
    }
    const text = link.textContent?.trim();
    if (!text || link.querySelector("img,svg,video")) {
      continue;
    }

    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("data-linktype", "2");
    link.setAttribute("data-itemshowtype", "0");
    link.setAttribute("linktype", "text");
    link.setAttribute("textvalue", text);
    if (!link.classList.contains("normal_text_link")) {
      link.classList.add("normal_text_link");
    }
    if (isWechatArticleUrl(href)) {
      link.classList.add("mp_article_text_link");
      link.setAttribute("hasload", "1");
      link.removeAttribute("tab");
    } else if (isHttpUrl(href)) {
      link.setAttribute("tab", "outerlink");
    }
    if (link.parentElement?.getAttribute("leaf") !== "") {
      const leaf = doc.createElement("span");
      leaf.setAttribute("leaf", "");
      const linkStyle = link.getAttribute("style");
      if (linkStyle) {
        const leafStyle = linkLeafStyle(linkStyle);
        if (leafStyle) {
          leaf.setAttribute("style", leafStyle);
        }
      }
      link.replaceWith(leaf);
      leaf.appendChild(link);
    }
  }
  return doc.body.innerHTML;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isWechatArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === "mp.weixin.qq.com" && parsed.pathname.replace(/\/+$/, "") === "/s";
  } catch {
    return false;
  }
}

// 剥离预览态的临时编辑产物：图片尺寸调整浮层与 data-vs-image-index 标记，
// 避免污染粘贴到微信/导出的 HTML。
export function stripPreviewArtifacts(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const overlay of Array.from(doc.querySelectorAll(".vs-image-resize-overlay"))) {
    overlay.remove();
  }
  for (const placeholder of Array.from(doc.querySelectorAll(".vs-video-placeholder"))) {
    placeholder.remove();
  }
  for (const placeholder of Array.from(doc.querySelectorAll(".vs-audio-placeholder"))) {
    placeholder.remove();
  }
  for (const node of Array.from(doc.querySelectorAll("mp-common-clmusic[data-vs-music-hidden]"))) {
    node.removeAttribute("data-vs-music-hidden");
    node.removeAttribute("data-vs-music-url");
  }
  for (const node of Array.from(doc.querySelectorAll("mp-common-videosnap[data-vs-videosnap-hidden]"))) {
    node.removeAttribute("data-vs-videosnap-hidden");
  }
  for (const placeholder of Array.from(doc.querySelectorAll(".vs-videosnap-placeholder"))) {
    placeholder.remove();
  }
  for (const voice of Array.from(
    doc.querySelectorAll("mpvoice[data-vs-audio-hidden], mp-common-mpaudio[data-vs-audio-hidden]"),
  )) {
    voice.removeAttribute("data-vs-audio-hidden");
  }
  for (const iframe of Array.from(doc.querySelectorAll("iframe[data-vs-video-hidden]"))) {
    iframe.removeAttribute("data-vs-video-hidden");
    const savedSrc = iframe.getAttribute("data-vs-video-src");
    if (savedSrc && !iframe.hasAttribute("src")) {
      iframe.setAttribute("src", savedSrc);
    }
    iframe.removeAttribute("data-vs-video-src");
  }
  for (const element of Array.from(doc.querySelectorAll("[data-vs-image-index]"))) {
    element.removeAttribute("data-vs-image-index");
  }
  return doc.body.innerHTML;
}

// 视频号卡片导出归一化：统一为官方草稿结构——
// <section class="channels_iframe_wrp custom_select_card_wrp[ wxw_wechannel_card_not_horizontal]" nodeleaf="">
//   <mp-common-videosnap ...> <br class="ProseMirror-trailingBreak">
// </section>
// 不带内联 style 与 data-tool（否则微信识别不到官方卡片节点会再包一层 section）；
// data-height 按卡片显示比例（竖版 3:4，横版 16:9）输出，保证草稿箱封面与预览一致。
// 早期版本固化的旧结构（带 style 的 section / 裸组件被 <p> 包裹）在此统一清洗。
export function normalizeVideosnapCardForWechat(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const widget of Array.from(doc.querySelectorAll<HTMLElement>("mp-common-videosnap"))) {
    widget.removeAttribute("data-tool");
    widget.removeAttribute("style");
    widget.removeAttribute("data-vs-videosnap-hidden");

    const width = Number(widget.getAttribute("data-width") ?? 0);
    const height = Number(widget.getAttribute("data-height") ?? 0);
    const isVertical = height > width;
    const displayHeight = isVertical
      ? Math.round((width * 4) / 3)
      : Math.round((width * 9) / 16);
    widget.setAttribute("data-height", String(displayHeight));

    const existing = widget.closest("section.channels_iframe_wrp, section.custom_select_card_wrp");
    if (existing) {
      existing.removeAttribute("style");
      existing.removeAttribute("data-tool");
      const classes = new Set(
        (existing.getAttribute("class") ?? "")
          .split(/\s+/)
          .filter(Boolean),
      );
      classes.add("channels_iframe_wrp");
      classes.add("custom_select_card_wrp");
      if (isVertical) {
        classes.add("wxw_wechannel_card_not_horizontal");
      } else {
        classes.delete("wxw_wechannel_card_not_horizontal");
      }
      existing.setAttribute("class", Array.from(classes).join(" "));
      existing.setAttribute("nodeleaf", "");
      continue;
    }

    // 裸组件（可能被 markdown 渲染器包进 <p>）：补上官方 section 包裹。
    const section = doc.createElement("section");
    section.setAttribute(
      "class",
      `channels_iframe_wrp custom_select_card_wrp${
        isVertical ? " wxw_wechannel_card_not_horizontal" : ""
      }`,
    );
    section.setAttribute("nodeleaf", "");
    const br = doc.createElement("br");
    br.setAttribute("class", "ProseMirror-trailingBreak");
    const parent = widget.parentElement;
    if (parent && parent.tagName.toLowerCase() === "p") {
      parent.replaceWith(section);
    } else {
      widget.replaceWith(section);
    }
    section.append(widget, br);
  }
  return doc.body.innerHTML;
}

// 微信草稿接口会把"仅含视频 iframe、没有真实文字/图片"的正文整段丢弃，
// 发布前据此拦截，避免用户发布出空白草稿。
export function hasNonVideoContent(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const iframe of Array.from(doc.querySelectorAll("iframe.video_iframe"))) {
    iframe.remove();
  }
  if (doc.body.querySelector("img, mpvoice, mp-common-mpaudio, mp-common-clmusic, mp-common-videosnap")) {
    return true;
  }
  const visibleText = (doc.body.textContent ?? "").replace(/\s/g, "");
  return visibleText.length > 0;
}

function cloneBoxWithWechatSafeMermaid(box: HTMLElement): HTMLElement {
  const clone = box.cloneNode(true) as HTMLElement;
  const sourceSvgs = Array.from(box.querySelectorAll<SVGElement>("pre.mermaid svg"));
  const cloneSvgs = Array.from(clone.querySelectorAll<SVGElement>("pre.mermaid svg"));
  cloneSvgs.forEach((svg, index) => {
    const sourceSvg = sourceSvgs[index];
    inlineMermaidSvgElementStylesForWechat(svg, sourceSvg ? (element) => {
      const path = elementPathWithinSvg(svg, element);
      const sourceElement = path ? elementAtPath(sourceSvg, path) : null;
      const target = sourceElement ?? element;
      const style = window.getComputedStyle(target);
      return {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textAnchor: style.textAnchor,
        opacity: style.opacity,
      };
    } : undefined);
  });
  return clone;
}

function elementPathWithinSvg(svg: SVGElement, element: Element): number[] | null {
  const path: number[] = [];
  let current: Element | null = element;
  while (current && current !== svg) {
    const parent: Element | null = current.parentElement;
    if (!parent) return null;
    path.unshift(Array.from(parent.children).indexOf(current));
    current = parent;
  }
  return current === svg ? path : null;
}

function elementAtPath(root: Element, path: number[]): Element | null {
  let current: Element = root;
  for (const index of path) {
    const next = current.children.item(index);
    if (!next) return null;
    current = next;
  }
  return current;
}

// 生成微信兼容的最终 HTML：
// 1. 给预览区每个顶层子元素加 data-tool 水印
// 2. MathJax 节点后处理（行内/块级公式转换、防吞空格）
// 3. juice 把所有 CSS 内联进 style 属性（微信只认 inline style）
export async function solveHtml(): Promise<string> {
  const box = document.getElementById(ARTICLE_BOX_ID);
  if (!box) {
    return "";
  }
  const articleRoot = box.children[0];
  if (articleRoot) {
    for (const item of Array.from(articleRoot.children)) {
      // iframe 不能带 data-tool 水印：微信 draft/add 会把带该属性的视频 iframe
      // 整段丢弃，导致发布后视频位置空白。
      if (item.tagName.toLowerCase() === "iframe") continue;
      // 视频号卡片同样不能带 data-tool：微信草稿箱识别不到官方卡片结构时，
      // 会为 widget 重建官方节点，导致选中态边框/淡绿膜与卡片尺寸不匹配。
      if (item.tagName.toLowerCase() === "mp-common-videosnap") continue;
      if (item.querySelector("mp-common-videosnap")) continue;
      item.setAttribute("data-tool", "vellumstyle");
    }
  }

  const exportBox = cloneBoxWithWechatSafeMermaid(box);
  let html = exportBox.innerHTML;
  // 预览里 mmbiz 图走了代理 src，复制前还原成原始 mmbiz 链（微信域名下正常显示）
  html = fromProxyHtml(html);
  // 剥离同步滚动用的 data-line，避免污染粘贴到微信的 HTML
  html = html.replace(/\s*data-line="\d+"/g, "");
  html = stripPreviewArtifacts(html);
  html = normalizeVideosnapCardForWechat(html);
  html = normalizeMathJaxForWechat(html);

  // 复制使用预览同一份样式：文章主题 + 当前代码主题已在预览层合并注入。
  const allCss = readStyle(STYLE_IDS.markdown);

  try {
    const inlined = (await loadJuice()).inlineContent(html, allCss, {
      inlinePseudoElements: true,
      preserveImportant: true,
    });
    return normalizeLinksForWechat(inlined);
  } catch (e) {
    console.error("CSS 内联失败，请检查 CSS 是否正确", e);
    return "";
  }
}

export async function solveDraftHtml(): Promise<string> {
  return normalizeDraftLists(await solveHtml());
}

export function normalizeDraftLists(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const li of Array.from(doc.querySelectorAll("li"))) {
    if (!hasMeaningfulListContent(li)) {
      li.remove();
    }
  }

  for (const list of Array.from(doc.querySelectorAll("ul, ol"))) {
    for (const child of Array.from(list.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE || (child as Element).tagName.toLowerCase() !== "li") {
        list.removeChild(child);
      }
    }
  }

  return doc.body.innerHTML;
}

function hasMeaningfulListContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.textContent?.trim());
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === "br") {
    return false;
  }
  if (["img", "svg", "video", "table"].includes(tag)) {
    return true;
  }
  return Array.from(element.childNodes).some(hasMeaningfulListContent);
}
