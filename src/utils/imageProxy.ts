// mmbiz 图片防盗链：预览时把 src 改写走 Tauri wximg 自定义协议（Rust 带微信 Referer 拉图），
// 复制到微信前再还原成原始 mmbiz 链（微信域名下原链正常，无需代理）。
//
// 协议 URL 形式按平台不同：Windows WebView2 用 http://<scheme>.localhost/，
// macOS/Linux 用 <scheme>://localhost/。统一探测一次。
const isWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
const PROXY_BASE = isWindows ? "http://wximg.localhost/" : "wximg://localhost/";
// 兼容历史 URL 形态，用于识别与还原代理地址。
const RESTORABLE_PROXY_PREFIXES = [
  "http://wximg.localhost/?url=",
  "wximg://localhost/?url=",
] as const;

// 匹配 src="http(s)://mmbiz.qpic.cn/..." 或 mmbiz.qlogo.cn，单/双引号都覆盖。
// 微信 uploadimg 返回的是 http 链接，需兼容 http/https。
const MMBIZ_SRC = /(<img\b[^>]*\bsrc=)(["'])(https?:\/\/mmbiz\.(?:qpic|qlogo)\.cn\/[^"']*)\2/gi;

export function toProxyImageUrl(url: string, aesKey?: string): string {
  const params = new URLSearchParams({url});
  if (aesKey) params.set("aes", aesKey);
  return `${PROXY_BASE}?${params.toString()}`;
}

function decodeHtmlAttributeValue(value: string, quote: string): string {
  if (typeof document === "undefined" || !value.includes("&")) return value;

  const template = document.createElement("template");
  template.innerHTML = `<img data-source=${quote}${value}${quote}>`;
  return template.content.firstElementChild?.getAttribute("data-source") ?? value;
}

// 预览用：把 mmbiz 图片 src 改写成代理 URL。只作用于渲染出的 HTML 字符串。
export function toProxyHtml(html: string): string {
  return html.replace(MMBIZ_SRC, (_m, pre, quote, url) => {
    const decodedUrl = decodeHtmlAttributeValue(url, quote);
    return `${pre}${quote}${toProxyImageUrl(decodedUrl)}${quote}`;
  });
}

// 复制用：把代理 URL 还原成原始图片链（含 aes 参数的解密链路一并还原），
// 保证复制到微信的是干净原链。
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PROXY_SRC = new RegExp(
  `(<img\\b[^>]*\\bsrc=)(["'])(${RESTORABLE_PROXY_PREFIXES.map(escapeRe).join("|")})([^"']*)\\2`,
  "gi",
);

export function fromProxyHtml(html: string): string {
  return html.replace(PROXY_SRC, (_m, pre, quote, prefix, encoded) => {
    return `${pre}${quote}${fromProxyImageUrl(`${prefix}${encoded}`)}${quote}`;
  });
}

export function fromProxyImageUrl(source: string): string {
  const prefix = RESTORABLE_PROXY_PREFIXES.find((candidate) => source.startsWith(candidate));
  if (!prefix) return source;
  // url 参数是 query 第一个值，且内部 & 已被百分号编码，取首个 & 之前的内容即可。
  const encoded = source.slice(prefix.length).split("&", 1)[0];
  try {
    return decodeURIComponent(encoded);
  } catch {
    return source;
  }
}
