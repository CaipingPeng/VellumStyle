import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {test} from "node:test";

// 防回归网：CSP 一旦收紧（去掉 https:/http: 通配），任何静态引用、
// 未走 wximg 代理的外部图片在生产包都会裂图（dev 模式无 CSP 看不出问题）。
// 规则：
//  1. img-src 允许 https: 与 http: 通配时直接放行（当前策略）；
//  2. 否则收集代码中所有静态图片 URL（<img src="..."> / url: "..." /
//     url("...") / src={"..."}），要求其 host 必须命中 img-src 的精确来源。

function collectSourceFiles(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function extractStaticImageUrls(source: string): string[] {
  const urls: string[] = [];
  const patterns: RegExp[] = [
    // src="..." / src: "..." / url: "..." / url("...")
    /(?:src|url)\s*(?:[:=]|\(\s*)["'](https?:\/\/[^"']+)["']/g,
    // src={"..."}（JSX 表达式里的字符串字面量）
    /src=\{["'](https?:\/\/[^"']+)["']\}/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      urls.push(match[1]);
    }
  }
  return urls;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function parseImgSrc(csp: string): string[] {
  const match = /img-src\s+([^;]+)/.exec(csp);
  if (!match) return [];
  return match[1].trim().split(/\s+/);
}

function sourceAllowsHost(source: string, host: string): boolean {
  if (source === "https:" || source === "http:") return true;
  if (source.startsWith("//")) return source.slice(2).split(":")[0] === host;
  if (/^https?:\/\//.test(source)) {
    // 忽略端口（如 http://wximg.localhost:443）
    return source.replace(/^https?:\/\//, "").split(":")[0] === host;
  }
  return false;
}

const conf = JSON.parse(
  readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
);
const csp: string = conf.app?.security?.csp ?? "";
const imgSrc = parseImgSrc(csp);

test("img-src 指令存在且包含来源", () => {
  assert.ok(imgSrc.length > 0, `img-src 应为空: ${csp}`);
});

test("静态外部图片 URL 均被 img-src 允许（收紧 CSP 时的回归网）", () => {
  const allowsAnyHttp = imgSrc.includes("https:") && imgSrc.includes("http:");
  if (allowsAnyHttp) return;

  const offenders: string[] = [];
  for (const file of collectSourceFiles(join(process.cwd(), "src"), [])) {
    const source = readFileSync(file, "utf8");
    for (const url of extractStaticImageUrls(source)) {
      const allowed = imgSrc.some((entry) => sourceAllowsHost(entry, hostOf(url)));
      if (!allowed) offenders.push(`${file}: ${url}`);
    }
  }
  assert.deepEqual(offenders, [], "存在被 CSP img-src 拦截的静态图片引用");
});
