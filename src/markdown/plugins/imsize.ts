import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Token from "markdown-it/lib/token.mjs";

// 图片尺寸语法：![alt](url =WxH)，支持 =100x200 / =100x / =x200 / =40%x。
// 自实现，替代 markdown-it-imsize（后者依赖 Node 的 image-size，在浏览器端 require
// './types/bmp' 会导致 Vite 打包崩溃、页面空白）。
// 仅解析尺寸语法，不做本地文件尺寸探测（autofill），那是崩溃根源且我们用不到。

interface SizeResult {
  ok: boolean;
  pos: number;
  width: string;
  height: string;
}

function parseNextNumber(str: string, pos: number, max: number): {pos: number; value: string} {
  const start = pos;
  let code = str.charCodeAt(pos);
  // 数字或 %
  while ((pos < max && code >= 0x30 && code <= 0x39) || code === 0x25 /* % */) {
    code = str.charCodeAt(++pos);
  }
  return {pos, value: str.slice(start, pos)};
}

function parseImageSize(str: string, pos: number, max: number): SizeResult {
  const result: SizeResult = {ok: false, pos: 0, width: "", height: ""};
  if (pos >= max) {
    return result;
  }
  if (str.charCodeAt(pos) !== 0x3d /* = */) {
    return result;
  }
  pos++;

  // = 之后必须紧跟 x 或数字
  let code = str.charCodeAt(pos);
  if (code !== 0x78 /* x */ && (code < 0x30 || code > 0x39)) {
    return result;
  }

  const resultW = parseNextNumber(str, pos, max);
  pos = resultW.pos;

  // 宽度后必须是 x
  if (str.charCodeAt(pos) !== 0x78 /* x */) {
    return result;
  }
  pos++;

  const resultH = parseNextNumber(str, pos, max);
  pos = resultH.pos;

  result.width = resultW.value;
  result.height = resultH.value;
  result.pos = pos;
  result.ok = true;
  return result;
}

function imageWithSize(md: MarkdownIt) {
  return function (state: StateInline, silent: boolean): boolean {
    let code: number;
    let label: string | undefined;
    let pos: number;
    let res: {ok: boolean; str: string; pos: number; lines?: number};
    let ref;
    let title = "";
    let width = "";
    let height = "";
    let token: Token;
    let start: number;
    let href = "";
    const oldPos = state.pos;
    const max = state.posMax;

    if (state.src.charCodeAt(state.pos) !== 0x21 /* ! */) {
      return false;
    }
    if (state.src.charCodeAt(state.pos + 1) !== 0x5b /* [ */) {
      return false;
    }

    const labelStart = state.pos + 2;
    const labelEnd = md.helpers.parseLinkLabel(state, state.pos + 1, false);
    if (labelEnd < 0) {
      return false;
    }

    pos = labelEnd + 1;
    if (pos < max && state.src.charCodeAt(pos) === 0x28 /* ( */) {
      pos++;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) {
          break;
        }
      }
      if (pos >= max) {
        return false;
      }

      start = pos;
      res = md.helpers.parseLinkDestination(state.src, pos, state.posMax);
      if (res.ok) {
        href = state.md.normalizeLink(res.str);
        if (state.md.validateLink(href)) {
          pos = res.pos;
        } else {
          href = "";
        }
      }

      start = pos;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) {
          break;
        }
      }

      res = md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (code !== 0x20 && code !== 0x0a) {
            break;
          }
        }
      } else {
        title = "";
      }

      // 解析 =WxH（前面必须有至少一个空格）
      if (pos - 1 >= 0) {
        code = state.src.charCodeAt(pos - 1);
        if (code === 0x20) {
          const sizeRes = parseImageSize(state.src, pos, state.posMax);
          if (sizeRes.ok) {
            width = sizeRes.width;
            height = sizeRes.height;
            pos = sizeRes.pos;
            for (; pos < max; pos++) {
              code = state.src.charCodeAt(pos);
              if (code !== 0x20 && code !== 0x0a) {
                break;
              }
            }
          }
        }
      }

      if (pos >= max || state.src.charCodeAt(pos) !== 0x29 /* ) */) {
        state.pos = oldPos;
        return false;
      }
      pos++;
    } else {
      // 引用式图片
      if (typeof state.env.references === "undefined") {
        return false;
      }
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) {
          break;
        }
      }
      if (pos < max && state.src.charCodeAt(pos) === 0x5b /* [ */) {
        start = pos + 1;
        pos = md.helpers.parseLinkLabel(state, pos);
        if (pos >= 0) {
          label = state.src.slice(start, pos++);
        } else {
          pos = labelEnd + 1;
        }
      } else {
        pos = labelEnd + 1;
      }

      if (!label) {
        label = state.src.slice(labelStart, labelEnd);
      }
      ref = state.env.references[md.utils.normalizeReference(label)];
      if (!ref) {
        state.pos = oldPos;
        return false;
      }
      href = ref.href;
      title = ref.title;
    }

    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;

      const tokens: Token[] = [];
      const newState = new state.md.inline.State(
        state.src.slice(labelStart, labelEnd),
        state.md,
        state.env,
        tokens
      );
      newState.md.inline.tokenize(newState);

      token = state.push("image", "img", 0);
      const attrs: [string, string][] = [
        ["src", href],
        ["alt", ""],
      ];
      token.attrs = attrs;
      token.children = tokens;
      if (title) {
        attrs.push(["title", title]);
      }
      if (width !== "") {
        attrs.push(["width", width]);
      }
      if (height !== "") {
        attrs.push(["height", height]);
      }
    }

    state.pos = pos;
    state.posMax = max;
    return true;
  };
}

export default function imsize(md: MarkdownIt) {
  md.inline.ruler.before("emphasis", "image", imageWithSize(md));
}
