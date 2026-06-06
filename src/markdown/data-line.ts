import type MarkdownIt from "markdown-it";

// 给顶层 block token 注入 data-line（源码起始行，0-based），供同步滚动按行对齐。
// markdown-it 的 block token 自带 token.map=[startLine,endLine]；只标 level===0 的块，
// 避免嵌套块锚点过密。插在 core 阶段末尾，不影响插件链顺序。
export default function dataLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push("inject_data_line", (state) => {
    for (const token of state.tokens) {
      if (token.level === 0 && token.map && token.nesting !== -1) {
        token.attrSet("data-line", String(token.map[0]));
      }
    }
    return true;
  });
}
