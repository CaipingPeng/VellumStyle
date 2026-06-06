import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";

// 给嵌套引用的最外层 blockquote 加 class="multiquote-N"（N=嵌套深度），
// 主题据此为不同层级引用着色。
function addQuoteClass(state: StateCore) {
  let count = 0;
  let outer: (typeof state.tokens)[number] | undefined;
  for (const cur of state.tokens) {
    if (cur.type === "blockquote_open") {
      if (count === 0) {
        outer = cur;
      }
      count++;
      continue;
    }
    if (count > 0 && outer) {
      outer.attrs = [["class", "multiquote-" + count]];
      count = 0;
    }
  }
}

export default function multiQuote(md: MarkdownIt) {
  md.core.ruler.push("blockquote-class", addQuoteClass);
}
