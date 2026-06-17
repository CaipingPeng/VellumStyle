import test from "node:test";
import assert from "node:assert/strict";
import {SECONDARY_ACTIONS} from "./toolbarActions.ts";

test("右侧主工具栏次级动作不包含上传图片", () => {
  assert.deepEqual(SECONDARY_ACTIONS, ["import", "export", "theme", "settings"]);
});
