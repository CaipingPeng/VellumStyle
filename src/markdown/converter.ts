import juice from "juice";
import {ARTICLE_BOX_ID} from "../articleRoot.ts";
import {STYLE_IDS} from "../utils/style.ts";
import {fromProxyHtml} from "../utils/imageProxy.ts";
import {inlineMermaidSvgElementStylesForWechat} from "./mermaidExport.ts";

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

export function stripPreviewEditClasses(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const overlay of Array.from(doc.querySelectorAll(".vs-image-resize-overlay"))) {
    overlay.remove();
  }
  for (const element of Array.from(doc.querySelectorAll("[data-vs-image-index]"))) {
    element.removeAttribute("data-vs-image-index");
  }
  for (const element of Array.from(doc.querySelectorAll("[class]"))) {
    const classes = (element.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((cls) => cls && cls !== "preview-edit-hover" && cls !== "preview-edit-selected");
    if (classes.length > 0) {
      element.setAttribute("class", classes.join(" "));
    } else {
      element.removeAttribute("class");
    }
  }
  return doc.body.innerHTML;
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
export function solveHtml(): string {
  const box = document.getElementById(ARTICLE_BOX_ID);
  if (!box) {
    return "";
  }
  const articleRoot = box.children[0];
  if (articleRoot) {
    for (const item of Array.from(articleRoot.children)) {
      item.setAttribute("data-tool", "vellumstyle");
    }
  }

  const exportBox = cloneBoxWithWechatSafeMermaid(box);
  let html = exportBox.innerHTML;
  // 预览里 mmbiz 图走了代理 src，复制前还原成原始 mmbiz 链（微信域名下正常显示）
  html = fromProxyHtml(html);
  // 剥离同步滚动用的 data-line，避免污染粘贴到微信的 HTML
  html = html.replace(/\s*data-line="\d+"/g, "");
  // 剥离预览点击编辑用的临时 class，避免污染粘贴到微信的 HTML
  html = stripPreviewEditClasses(html);
  html = normalizeMathJaxForWechat(html);

  // 复制使用预览同一份样式：文章主题 + 当前代码主题已在预览层合并注入。
  const allCss = readStyle(STYLE_IDS.markdown);

  try {
    const inlined = juice.inlineContent(html, allCss, {
      inlinePseudoElements: true,
      preserveImportant: true,
    });
    return normalizeLinksForWechat(inlined);
  } catch (e) {
    console.error("CSS 内联失败，请检查 CSS 是否正确", e);
    return "";
  }
}

export function solveDraftHtml(): string {
  return normalizeDraftLists(solveHtml());
}

export function normalizeDraftLists(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const li of Array.from(doc.querySelectorAll("li"))) {
    if (!hasMeaningfulListContent(li)) {
      li.remove();
    }
  }

  for (const list of Array.from(doc.querySelectorAll("ul, ol"))) {
    const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
    list.innerHTML = items.map((item) => item.outerHTML.trim()).join("");
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
