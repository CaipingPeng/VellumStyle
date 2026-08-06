import {test} from "node:test";
import assert from "node:assert/strict";
import {render} from "./parser.ts";

test("链接脚注编号和内容保持同一行内结构", () => {
  const html = render('这是一个带脚注的[术语](这里是脚注的解释内容 "术语")。');

  assert.match(html, /<span id="fn1" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">\[1\] <\/span>术语: <em>这里是脚注的解释内容<\/em><\/span>/);
  assert.doesNotMatch(html, /<span id="fn1" class="footnote-item"[^>]*>[\s\S]*<p>/);
});

test("标准 Markdown 脚注定义渲染到脚注区", () => {
  const html = render("正文内容[^注1]\n\n[^注1]: 这是脚注内容");

  assert.match(html, /正文内容<sup class="footnote-ref">\[1\]<\/sup>/);
  assert.match(html, /<span id="fn1" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">\[1\] <\/span>这是脚注内容<\/span>/);
  assert.doesNotMatch(html, /\^注1/);
  assert.doesNotMatch(html, /\[\^注1\]:/);
});

test("图片后紧跟脚注引用时仍渲染图片图注", () => {
  const html = render("![图2：长图注](http://example.com/a.png)\n[^note]\n\n[^note]: 图片来源");

  assert.match(html, /<figure data-line="0"><img src="http:\/\/example\.com\/a\.png" alt="" data-vs-image-index="0"><figcaption>图2：长图注<sup class="footnote-ref">\[1\]<\/sup><\/figcaption><\/figure>/);
  assert.doesNotMatch(html, /<p data-line="0"><img/);
  assert.match(html, /<span id="fn1" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">\[1\] <\/span>图片来源<\/span>/);
});

test("Markdown 图片渲染时带稳定图片序号用于预览反向回写", () => {
  const html = render("![](https://example.com/a.png)\n\n![](https://example.com/b.png =120x60)");

  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="" data-vs-image-index="0"/);
  assert.match(html, /<img src="https:\/\/example\.com\/b\.png" alt="" width="120" height="60" data-vs-image-index="1"/);
});

test("百分比图片宽度不写入固定高度，窄视图下保持等比例缩放", () => {
  const html = render("![](https://example.com/a.png =40%x)");

  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="" width="40%" data-vs-image-index="0"/);
  assert.doesNotMatch(html, /\sheight=/);
});

test("普通 Markdown 链接渲染为脚注引用而不是外链", () => {
  const html = render("项目地址仍然是：[CaipingPeng/VellumStyle](https://github.com/CaipingPeng/VellumStyle)。");

  assert.doesNotMatch(html, /<a\b[^>]*href=/);
  assert.match(html, /项目地址仍然是：<span class="footnote-word">⌈CaipingPeng\/VellumStyle⌋<\/span><sup class="footnote-ref">\[1\]<\/sup>。/);
  assert.match(html, /<span id="fn1" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">\[1\] <\/span>https:\/\/github\.com\/CaipingPeng\/VellumStyle<\/span>/);
});

test("带 title 的 Markdown 链接也使用同一套取整符号脚注样式", () => {
  const html = render('这是一个带脚注的[术语](这里是脚注的解释内容 "术语")。');

  assert.match(html, /这是一个带脚注的<span class="footnote-word">⌈术语⌋<\/span><sup class="footnote-ref">\[1\]<\/sup>。/);
  assert.match(html, /<span id="fn1" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">\[1\] <\/span>术语: <em>这里是脚注的解释内容<\/em><\/span>/);
});

test("素材库视频 iframe 保留 src/data-src/mpvid/cover 供预览与发布", () => {
  const html = render(
    '<iframe class="video_iframe rich_pages" data-vidtype="2" data-mpvid="wxv_2628424322221359104" data-cover="http://mmbiz.qpic.cn/mmbiz_jpg/example/0?wx_fmt=jpeg" allowfullscreen frameborder="0" data-w="1920" data-ratio="1.7777777777777777" height="325" width="578" data-src="https://mp.weixin.qq.com/mp/readtemplate?t=pages/video_player_tmpl&amp;action=mpvideo&amp;auto=0&amp;vid=wxv_2628424322221359104" src="https://mp.weixin.qq.com/mp/readtemplate?t=pages/video_player_tmpl&amp;action=mpvideo&amp;auto=0&amp;vid=wxv_2628424322221359104"></iframe>',
  );

  assert.match(html, /<iframe /);
  assert.match(html, /data-mpvid="wxv_2628424322221359104"/);
  assert.match(html, /data-cover="http:\/\/mmbiz\.qpic\.cn\/mmbiz_jpg\/example\/0\?wx_fmt=jpeg"/);
  assert.match(html, /data-src="https:\/\/mp\.weixin\.qq\.com\/mp\/readtemplate\?t=pages\/video_player_tmpl&amp;action=mpvideo&amp;auto=0&amp;vid=wxv_2628424322221359104"/);
  assert.match(html, /src="https:\/\/mp\.weixin\.qq\.com\/mp\/readtemplate/);
});

test("iframe 放行后 script 仍然被剥离", () => {
  const html = render('<iframe src="https://mp.weixin.qq.com/"></iframe><script>window.x=1</script>');

  assert.match(html, /<iframe src="https:\/\/mp\.weixin\.qq\.com\/"><\/iframe>/);
  assert.doesNotMatch(html, /<script/);
});

test("素材库音频 mpvoice 标签与标识属性在渲染后保留", () => {
  const html = render(
    '<mpvoice class="js_editor_audio audio_iframe js_uneditable" src="/cgi-bin/readtemplate?t=tmpl/audio_tmpl&amp;name=%E6%B5%8B%E8%AF%95%E9%9F%B3%E9%A2%91&amp;play_length=02:12" isaac2="1" low_size="257.96" source_size="258" high_size="1038.91" name="测试音频" play_length="132000" voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA=" data-pluginname="insertaudio"></mpvoice>',
  );

  assert.match(html, /<mpvoice /);
  assert.match(html, /voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA="/);
  assert.match(html, /name="测试音频"/);
  assert.match(html, /play_length="132000"/);
});

test("素材库音频 mp-common-mpaudio 组件与封面在渲染后保留", () => {
  const html = render(
    '<mp-common-mpaudio src="/cgi-bin/readtemplate?t=tmpl/audio_tmpl&amp;name=%E6%B5%8B%E8%AF%95%E9%9F%B3%E9%A2%91&amp;play_length=02:12" cover="https://wx.qlogo.cn/mmopen/example/0" author="时代编译日志" isaac2="1" low_size="257.96" source_size="258" high_size="1038.91" name="测试音频" play_length="02:12" duration="132" show-listen-later="1" data-topic_id="" data-topic_name="" voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA=" class="mp_common_widget"></mp-common-mpaudio>',
  );

  assert.match(html, /<mp-common-mpaudio /);
  assert.match(html, /cover="https:\/\/wx\.qlogo\.cn\/mmopen\/example\/0"/);
  assert.match(html, /voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA="/);
  assert.match(html, /duration="132"/);
});

test("浏览器复制的编码中文 URL 在脚注中解码为可读中文", () => {
  const html = render("[喜羊羊案](https://example.com/%E2%80%9C%E5%96%9C%E7%BE%8A%E7%BE%8A%E6%9A%B4%E5%8A%9B%E2%80%9D%E6%A1%88)");

  assert.match(html, /<span id="fn1" class="footnote-item"[^>]*><span class="footnote-num"[^>]*>\[1\] <\/span>https:\/\/example\.com\/“喜羊羊暴力”案<\/span>/);
  assert.doesNotMatch(html, /%E2%80%9C%E5%96%9C%E7%BE%8A%E7%BE%8A%E6%9A%B4%E5%8A%9B%E2%80%9D%E6%A1%88/);
});

test("手动输入的中文 URL 脚注保持可读原文", () => {
  const html = render("[喜羊羊案](https://example.com/“喜羊羊暴力”案)");

  assert.match(html, /<span id="fn1" class="footnote-item"[^>]*><span class="footnote-num"[^>]*>\[1\] <\/span>https:\/\/example\.com\/“喜羊羊暴力”案<\/span>/);
});

test("带 title 的链接脚注中 URL 同样解码为中文", () => {
  const html = render('[链接](https://example.com/%E2%80%9C%E5%96%9C%E7%BE%8A%E7%BE%8A%E6%9A%B4%E5%8A%9B%E2%80%9D%E6%A1%88 "出处")');

  assert.match(html, /出处: <em>https:\/\/example\.com\/“喜羊羊暴力”案<\/em>/);
});

test("畸形百分号编码回退原文，不中断渲染", () => {
  const html = render("[链接](https://example.com/100%乱码)");

  assert.match(html, /<span id="fn1" class="footnote-item"[^>]*><span class="footnote-num"[^>]*>\[1\] <\/span>https:\/\/example\.com\/100%乱码<\/span>/);
});

test("引用式链接的脚注 URL 同样解码为中文", () => {
  const html = render("[喜羊羊案][ref]\n\n[ref]: https://example.com/%E2%80%9C%E5%96%9C%E7%BE%8A%E7%BE%8A%E6%9A%B4%E5%8A%9B%E2%80%9D%E6%A1%88 \"出处\"");

  assert.match(html, /https:\/\/example\.com\/“喜羊羊暴力”案/);
});

test("双等号高亮语法渲染为 mark", () => {
  const html = render("这是一段==高亮==文本。");

  assert.match(html, /<p data-line="0">这是一段<mark>高亮<\/mark>文本。<\/p>/);
  assert.doesNotMatch(html, /==高亮==/);
});

test("原始 HTML 中的脚本和事件属性不会进入渲染结果", () => {
  const html = render('<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">链接</a>');

  assert.match(html, /<img src="https:\/\/example\.com\/a\.png"/);
  assert.match(html, />链接<\/a>/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /onclick/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test("image-flow 图片语法中的 alt 不会注入额外属性", () => {
  const html = render('<![封面" onerror="alert(1)](https://example.com/a.png)>');

  assert.match(html, /class="imageflow-img"/);
  assert.match(html, /alt="封面&quot; onerror=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /\sonerror=(["'])/i);
});

test("image-flow 输出 scroll-snap 内联样式且提示文案由插件直接输出", () => {
  const html = render('<![a](https://example.com/a.png),![b](https://example.com/b.png)>');

  assert.match(html, /<section class="imageflow-layer1" style="overflow:hidden">/);
  assert.match(html, /<section class="imageflow-layer2" style="display:flex;flex-wrap:nowrap;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none">/);
  assert.match(html, /<section class="imageflow-layer3" style="flex:0 0 100%;min-width:0;scroll-snap-align:center;scroll-snap-stop:always">/);
  assert.match(html, /<img[^>]*class="imageflow-img" style="display:block;max-width:100%;height:auto">/);
  assert.match(html, /<p class="imageflow-caption">&lt;&lt;&lt; 左右滑动见更多 &gt;&gt;&gt;<\/p>/);
});

test("image-flow 紧跟上一段文字（无空行）时仍渲染为横滑图组", () => {
  const html = render('段落文字\n<![a](https://example.com/a.png),![b](https://example.com/b.png)>');

  assert.match(html, /class="imageflow-layer1"/);
  assert.equal((html.match(/class="imageflow-img"/g) ?? []).length, 2);
  assert.match(html, /<p[^>]*>段落文字<\/p>/);
});

test("image-flow 位于列表项续行时仍渲染为横滑图组", () => {
  const html = render('- 配图\n<![a](https://example.com/a.png),![b](https://example.com/b.png)>');

  assert.match(html, /class="imageflow-layer1"/);
  assert.equal((html.match(/class="imageflow-img"/g) ?? []).length, 2);
});

test("mermaid 围栏代码块渲染为图表容器而不是普通代码块", () => {
  const html = render("```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```");

  assert.match(html, /<pre\b[^>]*class="mermaid"[^>]*>/);
  assert.match(html, /<pre\b[^>]*data-mermaid-source="true"[^>]*>/);
  assert.match(html, /<pre\b[^>]*data-line="0"[^>]*>/);
  assert.match(html, /graph TD\n  A\[开始\] --&gt; B\[结束\]/);
  assert.doesNotMatch(html, /class="custom"/);
  assert.doesNotMatch(html, /<code/);
});
