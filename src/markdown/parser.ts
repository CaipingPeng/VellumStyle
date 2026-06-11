import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

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
  return parser.render(markdown);
}
