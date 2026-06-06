import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";

// 给表格套一层容器，便于在窄屏下横向滚动：
// <section class="table-container"><table>...</table></section>
function addTableContainer(state: StateCore) {
  const out: typeof state.tokens = [];
  for (const cur of state.tokens) {
    if (cur.type === "table_open") {
      const start = new state.Token("html_inline", "", 0);
      start.content = `<section class="table-container">`;
      out.push(start, cur);
    } else if (cur.type === "table_close") {
      const close = new state.Token("html_inline", "", 0);
      close.content = `</section>`;
      out.push(cur, close);
    } else {
      out.push(cur);
    }
  }
  state.tokens = out;
}

export default function tableContainer(md: MarkdownIt) {
  md.core.ruler.push("table-container", addTableContainer);
}
