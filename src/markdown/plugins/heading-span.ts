import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";

// 在标题 inline 内容前后插入装饰 span：
// <h2><span class="prefix"></span><span class="content">标题</span><span class="suffix"></span></h2>
function addHeadingSpan(state: StateCore) {
  for (let i = 0; i < state.tokens.length - 1; i++) {
    if (state.tokens[i].type !== "heading_open" || state.tokens[i + 1].type !== "inline") {
      continue;
    }
    const inline = state.tokens[i + 1];
    if (!inline.content || !inline.children) {
      continue;
    }

    const pre = new state.Token("html_inline", "", 0);
    pre.content = `<span class="prefix"></span><span class="content">`;
    inline.children.unshift(pre);

    const post = new state.Token("html_inline", "", 0);
    post.content = `</span><span class="suffix"></span>`;
    inline.children.push(post);

    i += 2;
  }
}

export default function headingSpan(md: MarkdownIt) {
  md.core.ruler.push("heading_span", addHeadingSpan);
}
