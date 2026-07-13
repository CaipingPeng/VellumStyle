// mmbiz 图片防盗链：预览时把 src 改写走 Tauri wximg 自定义协议（Rust 带微信 Referer 拉图），
// 复制到微信前再还原成原始 mmbiz 链（微信域名下原链正常，无需代理）。
//
// 协议 URL 形式按平台不同：Windows WebView2 用 http://<scheme>.localhost/，
// macOS/Linux 用 <scheme>://localhost/。统一探测一次。
const isWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
const PROXY_PREFIX = isWindows
  ? "http://wximg.localhost/?url="
  : "wximg://localhost/?url=";

// 匹配 src="http(s)://mmbiz.qpic.cn/..." 或 mmbiz.qlogo.cn，单/双引号都覆盖。
// 微信 uploadimg 返回的是 http 链接，需兼容 http/https。
const MMBIZ_SRC = /(<img\b[^>]*\bsrc=)(["'])(https?:\/\/mmbiz\.(?:qpic|qlogo)\.cn\/[^"']*)\2/gi;

export function toProxyImageUrl(url: string): string {
  return `${PROXY_PREFIX}${encodeURIComponent(url)}`;
}

// 预览用：把 mmbiz 图片 src 改写成代理 URL。只作用于渲染出的 HTML 字符串。
export function toProxyHtml(html: string): string {
  return html.replace(MMBIZ_SRC, (_m, pre, quote, url) => {
    return `${pre}${quote}${toProxyImageUrl(url)}${quote}`;
  });
}

// 复制用：把代理 URL 还原成原始 mmbiz 链，保证复制到微信的是干净原链。
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PROXY_SRC = new RegExp(
  `(<img\\b[^>]*\\bsrc=)(["'])${escapeRe(PROXY_PREFIX)}([^"']*)\\2`,
  "gi",
);

export function fromProxyHtml(html: string): string {
  return html.replace(PROXY_SRC, (_m, pre, quote, encoded) => {
    return `${pre}${quote}${decodeURIComponent(encoded)}${quote}`;
  });
}

const RESTORABLE_PROXY_PREFIXES = [
  "http://wximg.localhost/?url=",
  "wximg://localhost/?url=",
] as const;

export function fromProxyImageUrl(source: string): string {
  const prefix = RESTORABLE_PROXY_PREFIXES.find((candidate) => source.startsWith(candidate));
  if (!prefix) return source;

  try {
    return decodeURIComponent(source.slice(prefix.length));
  } catch {
    return source;
  }
}
