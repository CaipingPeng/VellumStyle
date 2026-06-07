import juice from "juice";
import {STYLE_IDS} from "../utils/style.ts";
import {fromProxyHtml} from "../utils/imageProxy.ts";

const BOX_ID = "nice-rich-text-box";

function readStyle(id: string): string {
  const el = document.getElementById(id);
  return el ? el.innerText : "";
}

// 生成微信兼容的最终 HTML：
// 1. 给预览区每个顶层子元素加 data-tool 水印
// 2. MathJax 节点后处理（行内/块级公式转换、防吞空格）
// 3. juice 把所有 CSS 内联进 style 属性（微信只认 inline style）
export function solveHtml(): string {
  const box = document.getElementById(BOX_ID);
  if (!box) {
    return "";
  }
  const nice = box.children[0];
  if (nice) {
    for (const item of Array.from(nice.children)) {
      item.setAttribute("data-tool", "wechat-md-editor");
    }
  }

  let html = box.innerHTML;
  // 预览里 mmbiz 图走了代理 src，复制前还原成原始 mmbiz 链（微信域名下正常显示）
  html = fromProxyHtml(html);
  // 剥离同步滚动用的 data-line，避免污染粘贴到微信的 HTML
  html = html.replace(/\s*data-line="\d+"/g, "");
  html = html.replace(/<mjx-container (class="inline.+?)<\/mjx-container>/g, "<span $1</span>");
  html = html.replace(/\s<span class="inline/g, '&nbsp;<span class="inline');
  html = html.replace(/svg><\/span>\s/g, "svg></span>&nbsp;");
  html = html.replace(/mjx-container/g, "section");
  html = html.replace(/class="mjx-solid"/g, 'fill="none" stroke-width="70"');
  html = html.replace(/<mjx-assistive-mml.+?<\/mjx-assistive-mml>/g, "");

  const allCss =
    readStyle(STYLE_IDS.markdown) +
    readStyle(STYLE_IDS.code) +
    readStyle(STYLE_IDS.font);

  try {
    return juice.inlineContent(html, allCss, {
      inlinePseudoElements: true,
      preserveImportant: true,
    });
  } catch (e) {
    console.error("CSS 内联失败，请检查 CSS 是否正确", e);
    return "";
  }
}
