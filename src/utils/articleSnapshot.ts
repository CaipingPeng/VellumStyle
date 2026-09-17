import {render} from "../markdown/parser.ts";
import {toProxyHtml} from "./imageProxy.ts";
import {typesetMath} from "../markdown/mathjax.ts";
import {renderMermaidCharts} from "../markdown/mermaid.ts";

export interface ArticleSource {content: string; css: string}

/** 内容和样式由调用方同步捕获；异步排版期间切换文档不会改变此快照。 */
export async function renderArticleSnapshot(source: ArticleSource) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:720px;pointer-events:none";
  const shadow = host.attachShadow({mode: "open"});
  const style = document.createElement("style");
  style.textContent = source.css;
  const box = document.createElement("div");
  const article = document.createElement("section");
  article.id = "article";
  article.innerHTML = toProxyHtml(render(source.content));
  box.append(article);
  shadow.append(style, box);
  document.body.append(host);
  try {
    if (article.innerHTML.includes("$")) await typesetMath(article);
    if (article.querySelector("[data-mermaid-source]")) await renderMermaidCharts(article);
    return {box, css: source.css, cleanup: () => host.remove()};
  } catch (error) { host.remove(); throw error; }
}
