import type MarkdownIt from "markdown-it";

// 移除微信代码块外层的 <pre><code>（仅针对微信专属、未带 class="custom" 的情况）。
// 注意：默认渲染管线用 highlight.js 直接生成 <pre class="custom">，不会触发此处移除。
// 该插件保留备用，默认不挂载。
export default function removePre(md: MarkdownIt) {
  const oldFence = md.renderer.rules.fence;
  if (!oldFence) {
    return;
  }
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const old = oldFence(tokens, idx, options, env, slf);
    const preReg = /<pre><code[\w\s-="]*>/;
    const match = preReg.exec(old);
    if (match) {
      return old.replace(match[0], "").replace(`</code></pre>`, "");
    }
    return old;
  };
}
