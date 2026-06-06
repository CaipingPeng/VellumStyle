import type MarkdownIt from "markdown-it";

// 微信对 <li> 直接子元素有样式限制，用 <section> 包裹列表项内容：
// <li><section>内容</section></li>
export default function listItemWrap(md: MarkdownIt) {
  md.core.ruler.push("replace-li", () => {
    md.renderer.rules.list_item_open = () => "<li><section>";
    md.renderer.rules.list_item_close = () => "</section></li>";
  });
}
