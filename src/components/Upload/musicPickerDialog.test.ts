import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("音乐搜索弹窗接入后台接口并以官方组件插入", async () => {
  const source = await readFile(new URL("./MusicPickerDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /searchMusic/);
  assert.match(source, /getMusicInfo/);
  assert.match(source, /waitBackendCommand/);
  assert.match(source, /toProxyImageUrl/);
  assert.match(source, /mp-common-clmusic/);
  assert.match(source, /music_name/);
  assert.match(source, /listenid/);
  assert.match(source, /search_resp/);
  assert.match(source, /music_info_list/);
  assert.match(source, /albumurl/);
  assert.match(source, /music_source/);
  assert.match(source, /music_play_url/);
  assert.match(source, /data-vs-music-url/);
  assert.match(source, /插入音乐/);
  assert.match(source, /输入歌名或歌手/);
});
