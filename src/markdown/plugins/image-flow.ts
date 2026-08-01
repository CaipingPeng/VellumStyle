import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

// 横屏滑动图片：<![a](x),![b](y),![c](z)> 渲染为可左右滑动的图片组。
// 滑动结构（flex + scroll-snap）以内联样式输出，保证任何主题下都呈现逐页翻动的轮播感；
// 提示文案由主题 .imageflow-caption::before 提供，避免与插件输出重复。
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
const LAYER3_STYLE = "flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always";

export default function imageFlow(md: MarkdownIt, opt?: Partial<ImageFlowOptions>) {
  const options = {...defaultOptions, ...opt};

  const tokenize = (state: StateBlock, start: number): boolean => {
    const matchReg = /^<((!\[[^[\]]*\]\([^()]+\)(,?\s*(?=>)|,\s*(?!>)))+)>/;
    const srcLine = state.src.slice(state.bMarks[start], state.eMarks[start]);

    if (srcLine.charCodeAt(0) !== 0x3c /* < */) {
      return false;
    }
    const match = matchReg.exec(srcLine);
    if (!match) {
      return false;
    }

    const images = match[1].match(/\[[^\]]*\]\([^)]+\)/g);
    if (!images) {
      return false;
    }
    if (!options.limitless && images.length <= options.limit) {
      const token = state.push("imageFlow", "", 0);
      token.meta = images;
      token.block = true;
      state.line++;
      return true;
    }
    return false;
  };

  md.renderer.rules.imageFlow = (tokens, idx) => {
    const open = `<section class="imageflow-layer1" style="${LAYER1_STYLE}"><section class="imageflow-layer2" style="${LAYER2_STYLE}">`;
    const close = `</section></section><p class="imageflow-caption"></p>`;
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
      wrapped += `<section class="imageflow-layer3" style="${LAYER3_STYLE}"><img alt="${alt}" src="${src}" class="imageflow-img" /></section>`;
    }
    return open + wrapped + close;
  };

  md.block.ruler.before("paragraph", "imageFlow", tokenize);
}

function stateSafeLink(md: MarkdownIt, rawSrc: string): string {
  const src = md.normalizeLink(rawSrc);
  return md.validateLink(src) ? md.utils.escapeHtml(src) : "";
}
