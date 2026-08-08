import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdownLang from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

// 常用语言白名单：highlight.js 全量约 190 种语言，全部打包会让
// vendor-highlight 接近 1 MB。这里只注册高频语言，未注册语言回退纯文本。
const COMMON_LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown: markdownLang,
  php,
  powershell,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
} as const;
for (const [name, language] of Object.entries(COMMON_LANGUAGES)) {
  hljs.registerLanguage(name, language);
}

// npm 第三方插件（无官方类型，按需 any）
// @ts-expect-error 无类型声明
import markdownItDeflist from "markdown-it-deflist";
// @ts-expect-error 无类型声明
import markdownItImplicitFigures from "markdown-it-implicit-figures";
// @ts-expect-error 无类型声明
import markdownItTableOfContents from "markdown-it-table-of-contents";
// @ts-expect-error 无类型声明
import markdownItRuby from "markdown-it-ruby";

// 自定义插件（已迁移为 TS）
import headingSpan from "./plugins/heading-span.ts";
import tableContainer from "./plugins/table-container.ts";
import math from "./plugins/math.ts";
import markdownItMark from "./plugins/mark.ts";
import linkFootnote from "./plugins/link-footnote.ts";
import listItemWrap from "./plugins/list-item-wrap.ts";
import imageFlow from "./plugins/image-flow.ts";
import multiQuote from "./plugins/multi-quote.ts";
import imsize from "./plugins/imsize.ts";
import dataLine from "./data-line.ts";
import {sanitizeRenderedHtml} from "./sanitize.ts";

// 代码高亮：输出 <pre class="custom">，并把换行/空格转成 <br/> 和 &nbsp;，
// 这样粘贴到微信编辑器后排版不丢失（微信会吞掉普通空格和换行）。
function highlight(str: string, lang: string): string {
  let language = lang;
  if (!language) {
    language = "bash";
  }
  if (language && hljs.getLanguage(language)) {
    try {
      const formatted = hljs
        .highlight(str, {language, ignoreIllegals: true})
        .value.replace(/\n/g, "<br/>")
        .replace(/\s/g, "&nbsp;")
        .replace(/span&nbsp;/g, "span ");
      return '<pre class="custom"><code class="hljs">' + formatted + "</code></pre>";
    } catch (e) {
      console.error(e);
    }
  }
  return '<pre class="custom"><code class="hljs">' + parser.utils.escapeHtml(str) + "</code></pre>";
}

export const parser: MarkdownIt = new MarkdownIt({
  html: true,
  highlight,
});

const defaultFenceRenderer = parser.renderer.rules.fence;
parser.renderer.rules.fence = (tokens, idx, options, _env, slf) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0].toLowerCase();
  if (lang !== "mermaid") {
    return defaultFenceRenderer?.(tokens, idx, options, _env, slf) ?? slf.renderToken(tokens, idx, options);
  }

  token.attrSet("class", "mermaid");
  token.attrSet("data-mermaid-source", "true");
  return `<pre${slf.renderAttrs(token)}>${parser.utils.escapeHtml(token.content.replace(/\n$/, ""))}</pre>\n`;
};

// 插件链顺序与 mdnice 保持一致（顺序影响 token 处理结果）
parser
  .use(headingSpan) // 1. 标题 span 装饰
  .use(tableContainer) // 2. 表格容器
  .use(math) // 3. 数学公式
  .use(markdownItMark) // 4. ==高亮== 转 <mark>
  .use(linkFootnote) // 5. 链接转脚注
  .use(markdownItTableOfContents, {
    transformLink: () => "",
    includeLevel: [2, 3],
    markerPattern: /^\[toc\]/im,
  }) // 6. TOC（二、三级标题）
  .use(markdownItRuby) // 7. 注音 {文字|拼音}
  .use(markdownItImplicitFigures, {figcaption: true}) // 8. 图注
  .use(markdownItDeflist) // 9. 定义列表
  .use(listItemWrap) // 10. li 内 section 包裹
  .use(imageFlow) // 11. 横屏图片滑动
  .use(multiQuote) // 12. 多级引用 class
  .use(imsize); // 13. 图片尺寸 ![](url =100x200)（自实现，无 Node 依赖）

parser.use(dataLine); // 14. 顶层块注入 data-line（同步滚动用）

export function render(markdown: string): string {
  return sanitizeRenderedHtml(
    normalizeHtmlImages(normalizeImageFootnoteFigures(parser.render(markdown))),
  );
}

// 独立成段的原始 <img>（html_block 输出）补成 figure/figcaption，与
// markdown-it-implicit-figures 对 ![](url) 的处理保持一致（图注、居中布局依赖该结构）。
// 同时为所有非横滑图片按文档顺序统一补 data-vs-image-index，保证拖拽缩放
// 对 <img> 源同样可用（imsize 插件只为 ![](url) 注入该标记）。
export function normalizeHtmlImages(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const image of Array.from(doc.body.querySelectorAll("img"))) {
    if (image.parentElement !== doc.body) {
      continue;
    }
    if (image.closest(".imageflow-layer1") || image.closest("figure")) {
      continue;
    }

    const figure = doc.createElement("figure");
    const line = image.getAttribute("data-line");
    if (line !== null) {
      figure.setAttribute("data-line", line);
      image.removeAttribute("data-line");
    }

    const alt = image.getAttribute("alt")?.trim() ?? "";
    image.replaceWith(figure);
    figure.appendChild(image);
    if (alt) {
      image.setAttribute("alt", "");
      const figcaption = doc.createElement("figcaption");
      figcaption.textContent = alt;
      figure.appendChild(figcaption);
    }
  }

  let index = 0;
  for (const image of Array.from(doc.body.querySelectorAll("img"))) {
    if (image.closest(".imageflow-layer1")) {
      continue;
    }
    image.setAttribute("data-vs-image-index", String(index++));
  }

  return doc.body.innerHTML;
}

export function normalizeImageFootnoteFigures(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const paragraph of Array.from(doc.querySelectorAll("p"))) {
    const meaningfulNodes = Array.from(paragraph.childNodes).filter((node) => {
      return node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim());
    });
    if (meaningfulNodes.length < 2) {
      continue;
    }

    const [imageNode, ...captionRefs] = meaningfulNodes;
    if (!isElementTag(imageNode, "img") || !captionRefs.every((node) => isFootnoteRef(node))) {
      continue;
    }

    const image = imageNode as HTMLImageElement;
    const caption = image.getAttribute("alt")?.trim();
    if (!caption) {
      continue;
    }

    const figure = doc.createElement("figure");
    for (const attr of Array.from(paragraph.attributes)) {
      figure.setAttribute(attr.name, attr.value);
    }

    const nextImage = image.cloneNode(true) as HTMLImageElement;
    nextImage.setAttribute("alt", "");
    const figcaption = doc.createElement("figcaption");
    figcaption.textContent = caption;
    for (const ref of captionRefs) {
      figcaption.appendChild(ref.cloneNode(true));
    }

    figure.appendChild(nextImage);
    figure.appendChild(figcaption);
    paragraph.replaceWith(figure);
  }
  return doc.body.innerHTML;
}

function isElementTag(node: Node, tagName: string): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === tagName;
}

function isFootnoteRef(node: Node): boolean {
  return isElementTag(node, "sup") && (node as Element).classList.contains("footnote-ref");
}
