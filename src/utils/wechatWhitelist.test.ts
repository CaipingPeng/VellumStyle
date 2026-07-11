import assert from "node:assert/strict";
import {test} from "node:test";
import {buildWechatWhitelistUrl} from "./wechatWhitelist.ts";

test("buildWechatWhitelistUrl inserts and encodes the saved AppID", () => {
  assert.equal(
    buildWechatWhitelistUrl(" wxc3170c8cc5f7db61 "),
    "https://developers.weixin.qq.com/console/product/mp/wxc3170c8cc5f7db61?tab1=basicInfo",
  );
});

test("buildWechatWhitelistUrl rejects an empty AppID", () => {
  assert.throws(() => buildWechatWhitelistUrl("  "), /请先在公众号配置中填写并保存 AppID/);
});
