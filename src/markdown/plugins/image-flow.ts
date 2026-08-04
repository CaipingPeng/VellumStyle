import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

// 横屏滑动图片：<![a](x),![b](y),![c](z)> 渲染为可左右滑动的图片组。
// 滑动结构（flex + scroll-snap）以内联样式输出，保证任何主题下都呈现逐页翻动的轮播感；
// 提示文案由插件直接输出，与主题完全解耦（微信导出时真实文本可保留，伪元素内容会被丢弃）。
interface ImageFlowOptions {
  limitless: boolean;
  limit: number;
}

const defaultOptions: ImageFlowOptions = {
  limitless: false,
  limit: 10,
};

// 结构样式内联在元素上，不依赖主题 CSS（微信导出时 juice 会保留已有内联样式）。
const LAYER1_STYLE = "overflow:hidden";
const LAYER2_STYLE =
  "display:flex;flex-wrap:nowrap;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none";
// min-width:0 避免 flex 子项被图片原始宽度撑开（默认 min-width:auto 会按内容取最小宽度）。
const LAYER3_STYLE =
  "flex:0 0 100%;min-width:0;scroll-snap-align:center;scroll-snap-stop:always";
const FLOW_IMG_STYLE = "display:block;max-width:100%;height:auto";
const FLOW_CAPTION_TEXT = "<<< 左右滑动见更多 >>>";

const IMAGE_FLOW_LINE_RE = /^<((!\[[^[\]]*\]\([^()]+\)(,?\s*(?=>)|,\s*(?!>)))+)>/;

// 解析一行是否为合法的横滑语法；不是则返回 null。
function matchImageFlowLine(state: StateBlock, line: number): string[] | null {
  const srcLine = state.src.slice(state.bMarks[line], state.eMarks[line]);
  if (srcLine.charCodeAt(0) !== 0x3c /* < */) {
    return null;
  }
  const match = IMAGE_FLOW_LINE_RE.exec(srcLine);
  if (!match) {
    return null;
  }
  return match[1].match(/\[[^\]]*\]\([^)]+\)/g) ?? null;
}

export default function imageFlow(md: MarkdownIt, opt?: Partial<ImageFlowOptions>) {
  const options = {...defaultOptions, ...opt};

  const tokenize = (state: StateBlock, start: number): boolean => {
    const images = matchImageFlowLine(state, start);
    if (!images || (!options.limitless && images.length > options.limit)) {
      return false;
    }
    const token = state.push("imageFlow", "", 0);
    token.meta = images;
    token.block = true;
    state.line++;
    return true;
  };

  // markdown-it 的段落规则会把紧跟其后的非空行当段落续行直接吞掉，
  // 导致「上一段文字后直接写横滑语法」时 imageFlow 规则根本没机会执行。
  // 这里把横滑语法注册为 paragraph 的终止条件：遇到合法横滑行就提前结束段落，
  // 下一轮块规则会由上面的 imageFlow 把该行渲染成横滑图组。
  md.block.ruler.after("paragraph", "imageFlowParagraphTerminator", (state, startLine, endLine) => {
    if (startLine >= endLine) {
      return false;
    }
    const images = matchImageFlowLine(state, startLine);
    return Boolean(images && (options.limitless || images.length <= options.limit));
  }, {alt: ["paragraph"]});

  md.renderer.rules.imageFlow = (tokens, idx) => {
    const open = `<section class="imageflow-layer1" style="${LAYER1_STYLE}"><section class="imageflow-layer2" style="${LAYER2_STYLE}">`;
    const close = `</section></section><p class="imageflow-caption">${md.utils.escapeHtml(FLOW_CAPTION_TEXT)}</p>`;
    const contents: string[] = tokens[idx].meta;
    let wrapped = "";
    for (const content of contents) {
      const altMatch = content.match(/\[([^[\]]*)\]/);
      const srcMatch = content.match(/[^[]*\(([^()]*)\)[^\]]*/);
      const alt = md.utils.escapeHtml(altMatch ? altMatch[1] : "");
      const rawSrc = srcMatch ? srcMatch[1].trim() : "";
      const src = stateSafeLink(md, rawSrc);
      if (!src) {
        continue;
      }
      wrapped += `<section class="imageflow-layer3" style="${LAYER3_STYLE}"><img alt="${alt}" src="${src}" class="imageflow-img" style="${FLOW_IMG_STYLE}" /></section>`;
    }
    return open + wrapped + close;
  };

  md.block.ruler.before("paragraph", "imageFlow", tokenize);
}

function stateSafeLink(md: MarkdownIt, rawSrc: string): string {
  const src = md.normalizeLink(rawSrc);
  return md.validateLink(src) ? md.utils.escapeHtml(src) : "";
}
