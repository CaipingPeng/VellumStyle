// 引擎级代码高亮兜底配色（github 亮色）。
// highlight.js 只给 token 打 class（.hljs-keyword 等），不上色；颜色须由 CSS 提供。
// 这份兜底用裸 .hljs-* 选择器（特异性极低），保证任何主题都有基础高亮，
// 而主题自带的 #nice pre.custom .hljs-keyword（特异性更高）能正常覆盖它。
// 注意：刻意不写 .hljs{background} —— 那会给深色主题刷白底。

// token 配色：照抄 highlight.js github.css 的语义 token 颜色（全语言共用同一套 class）。
const TOKEN_CSS = `
.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}
.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}
.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:#005cc5}
.hljs-regexp,.hljs-string,.hljs-meta .hljs-string{color:#032f62}
.hljs-built_in,.hljs-symbol{color:#e36209}
.hljs-comment,.hljs-code,.hljs-formula{color:#6a737d}
.hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo{color:#22863a}
.hljs-subst{color:#24292e}
.hljs-section{color:#005cc5;font-weight:bold}
.hljs-bullet{color:#735c0f}
.hljs-emphasis{color:#24292e;font-style:italic}
.hljs-strong{color:#24292e;font-weight:bold}
.hljs-addition{color:#22863a;background-color:#f0fff4}
.hljs-deletion{color:#b31d28;background-color:#ffeef0}`;

// 块包裹兜底：很多主题连 pre.custom 的块样式都没有或很弱。
// 特异性 (0,1,1)/(0,2,0) 均低于主题的 #nice pre.custom，主题可覆盖。
const BLOCK_CSS = `
pre.custom{margin:16px 0;padding:16px;border-radius:8px;background:#f6f8fa;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:pre;word-wrap:normal}
pre.custom code.hljs{display:block;background:transparent;color:#24292e;font-family:Menlo,Monaco,Consolas,"Courier New",monospace;font-size:14px;line-height:1.5}`;

export const CODE_FALLBACK_CSS = TOKEN_CSS + "\n" + BLOCK_CSS;
