import assert from "node:assert/strict";
import {test} from "node:test";
import {JSDOM} from "jsdom";
import MarkdownIt from "markdown-it";
import * as imageProxyModule from "./imageProxy.ts";

const imageProxy = imageProxyModule as typeof imageProxyModule & {
  fromProxyImageUrl?: (source: string) => string;
};

function restore(source: string): string {
  assert.equal(
    typeof imageProxy.fromProxyImageUrl,
    "function",
    "fromProxyImageUrl must be exported",
  );
  return imageProxy.fromProxyImageUrl(source);
}

test("restores a Windows wximg proxy URL", () => {
  const original = "https://mmbiz.qpic.cn/mmbiz_png/example/0?wx_fmt=png&from=appmsg";
  const proxied = `http://wximg.localhost/?url=${encodeURIComponent(original)}`;

  assert.equal(restore(proxied), original);
});

test("restores a non-Windows wximg proxy URL", () => {
  const original = "http://mmbiz.qlogo.cn/sz_mmbiz_jpg/example/0?wx_fmt=jpeg";
  const proxied = `wximg://localhost/?url=${encodeURIComponent(original)}`;

  assert.equal(restore(proxied), original);
});

test("leaves malformed proxy percent encoding unchanged", () => {
  const malformed = "http://wximg.localhost/?url=https%3A%2F%2Fmmbiz.qpic.cn%2Fbad%E0%A4%A";

  assert.equal(restore(malformed), malformed);
});

test("leaves an ordinary image URL unchanged", () => {
  const ordinary = "https://example.com/images/photo.png?size=large";

  assert.equal(restore(ordinary), ordinary);
});

test("roundtrips a rendered WeChat URL through proxy HTML and DOM attributes", () => {
  const original =
    "https://mmbiz.qpic.cn/mmbiz_png/example/0?wx_fmt=png&from=appmsg&token=%26amp%3B&mode=dark";
  const rendered = new MarkdownIt().render(`![preview](${original})`);
  assert.match(rendered, /&amp;from=appmsg&amp;token=/);

  const decodingDom = new JSDOM("");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: decodingDom.window.document,
  });
  try {
    const proxiedHtml = imageProxy.toProxyHtml(rendered);
    const dom = new JSDOM(proxiedHtml);
    const image = dom.window.document.querySelector("img");
    assert.ok(image);

    const observedSources = [
      image.getAttribute("src"),
      image.src,
      image.currentSrc || image.src,
    ];
    for (const source of observedSources) {
      assert.ok(source);
      assert.equal(restore(source), original);
    }
  } finally {
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  }
});

test("decodes legal HTML entities once at the proxy boundary", () => {
  const decodingDom = new JSDOM("");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: decodingDom.window.document,
  });
  try {
    const html =
      '<img src="https://mmbiz.qpic.cn/a.png?one=1&#38;two=2&#x26;three=3&amp;four=4&equals;ok&token=%26amp%3B">';
    const proxied = imageProxy.toProxyHtml(html);
    const source = new JSDOM(proxied).window.document.querySelector("img")?.src;
    assert.ok(source);
    assert.equal(
      restore(source),
      "https://mmbiz.qpic.cn/a.png?one=1&two=2&three=3&four=4=ok&token=%26amp%3B",
    );
  } finally {
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  }
});
