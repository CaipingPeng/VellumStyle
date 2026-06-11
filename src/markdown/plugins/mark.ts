import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";

function isEscaped(src: string, pos: number): boolean {
  let count = 0;
  for (let i = pos - 1; i >= 0 && src.charCodeAt(i) === 0x5c /* \ */; i--) {
    count++;
  }
  return count % 2 === 1;
}

function findClose(src: string, start: number): number {
  let pos = start;
  while ((pos = src.indexOf("==", pos)) !== -1) {
    if (!isEscaped(src, pos)) {
      return pos;
    }
    pos += 2;
  }
  return -1;
}

function mark(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;

  if (start + 3 >= max) {
    return false;
  }
  if (state.src.charCodeAt(start) !== 0x3d /* = */ || state.src.charCodeAt(start + 1) !== 0x3d /* = */) {
    return false;
  }

  const contentStart = start + 2;
  const close = findClose(state.src, contentStart);
  if (close === -1 || close === contentStart || close >= max) {
    return false;
  }

  if (!silent) {
    state.pos = contentStart;
    state.posMax = close;

    const tokenOpen = state.push("mark_open", "mark", 1);
    tokenOpen.markup = "==";

    state.md.inline.tokenize(state);

    const tokenClose = state.push("mark_close", "mark", -1);
    tokenClose.markup = "==";
  }

  state.pos = close + 2;
  state.posMax = max;
  return true;
}

export default function markdownItMark(md: MarkdownIt) {
  md.inline.ruler.after("backticks", "mark", mark);
}
