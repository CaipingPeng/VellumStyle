import {test} from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";

test("浏览器端 sanitizer 不依赖 Node 取向的 sanitize-html 包", async () => {
  const packageJson = await import("../../package.json", {with: {type: "json"}});
  const dependencies: Record<string, string | undefined> = packageJson.default.dependencies ?? {};
  const devDependencies: Record<string, string | undefined> = packageJson.default.devDependencies ?? {};

  assert.equal(dependencies["sanitize-html"], undefined);
  assert.equal(devDependencies["@types/sanitize-html"], undefined);
  assert.ok(dependencies.dompurify);
  assert.match(dependencies.dompurify, /^\^?\d+\.\d+\.\d+/);
});

test("sanitizer 放行 QQ 音乐卡片并保留官方属性", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {url: "https://localhost/"});
  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {value: dom.window.document, configurable: true});
  Object.defineProperty(globalThis, "Node", {value: dom.window.Node, configurable: true});
  Object.defineProperty(globalThis, "Element", {value: dom.window.Element, configurable: true});
  Object.defineProperty(globalThis, "HTMLElement", {value: dom.window.HTMLElement, configurable: true});

  const {sanitizeRenderedHtml} = await import("./sanitize.ts");
  const html = sanitizeRenderedHtml(
    '<p><mp-common-clmusic class="res_iframe clmusic_iframe" music_name="壁上观" albumurl="https://wx.y.gtimg.cn/music/photo_new/a.jpg" singer="鞠婧祎" count="0" is_vip="1" duration="221000" music_source="1" listenid="78332210375265471" data-vs-music-url="https://mp.weixin.qq.com/mm3rd/redirect?context=x"></mp-common-clmusic></p>',
  );

  assert.match(html, /<mp-common-clmusic /);
  assert.match(html, /music_name="壁上观"/);
  assert.match(html, /listenid="78332210375265471"/);
  assert.match(html, /albumurl="https:\/\/wx\.y\.gtimg\.cn\/music\/photo_new\/a\.jpg"/);
  assert.match(html, /data-vs-music-url="https:\/\/mp\.weixin\.qq\.com\/mm3rd\/redirect\?context=x"/);
});

test("sanitizer 放行视频号卡片并保留官方属性", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {url: "https://localhost/"});
  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {value: dom.window.document, configurable: true});
  Object.defineProperty(globalThis, "Node", {value: dom.window.Node, configurable: true});
  Object.defineProperty(globalThis, "Element", {value: dom.window.Element, configurable: true});
  Object.defineProperty(globalThis, "HTMLElement", {value: dom.window.HTMLElement, configurable: true});

  const {sanitizeRenderedHtml} = await import("./sanitize.ts");
  const html = sanitizeRenderedHtml(
    '<section class="channels_iframe_wrp custom_select_card_wrp wxw_wechannel_card_not_horizontal" nodeleaf=""><mp-common-videosnap class="js_uneditable custom_select_card channels_iframe videosnap_video_iframe" data-url="https://findermp.video.qq.com/a.jpg" data-username="v2_xxx@finder" data-nickname="中国军号" data-nonceid="123" data-authiconurl="https://dldir1v6.qq.com/a.png" data-width="1920" data-height="1440" data-type="video" data-id="export/abc" draggable="true"></mp-common-videosnap></section>',
  );

  assert.match(html, /<section class="channels_iframe_wrp custom_select_card_wrp wxw_wechannel_card_not_horizontal" nodeleaf=""/);
  assert.match(html, /<mp-common-videosnap /);
  assert.match(html, /data-nickname="中国军号"/);
  assert.match(html, /data-id="export\/abc"/);
  assert.match(html, /data-url="https:\/\/findermp\.video\.qq\.com\/a\.jpg"/);
  assert.match(html, /draggable="true"/);
});
