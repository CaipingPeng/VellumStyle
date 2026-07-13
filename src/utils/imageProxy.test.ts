import assert from "node:assert/strict";
import {test} from "node:test";
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
