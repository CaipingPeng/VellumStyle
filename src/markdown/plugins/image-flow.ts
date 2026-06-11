import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

// 横屏滑动图片：<![a](x),![b](y),![c](z)> 渲染为可左右滑动的图片组。
interface ImageFlowOptions {
  limitless: boolean;
  limit: number;
}

const defaultOptions: ImageFlowOptions = {
  limitless: false,
  limit: 10,
};

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
    const open = `<section class="imageflow-layer1"><section class="imageflow-layer2">`;
    const close = `</section></section><p class="imageflow-caption"><<< 左右滑动见更多 >>></p>`;
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
      wrapped += `<section class="imageflow-layer3"><img alt="${alt}" src="${src}" class="imageflow-img" /></section>`;
    }
    return open + wrapped + close;
  };

  md.block.ruler.before("paragraph", "imageFlow", tokenize);
}

function stateSafeLink(md: MarkdownIt, rawSrc: string): string {
  const src = md.normalizeLink(rawSrc);
  return md.validateLink(src) ? md.utils.escapeHtml(src) : "";
}
