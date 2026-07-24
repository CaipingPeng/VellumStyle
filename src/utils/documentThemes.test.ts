import assert from "node:assert/strict";
import {test} from "node:test";
import {
  parseDocumentThemeMap,
  remapDocumentThemes,
  removeDocumentThemes,
  resolveAvailableThemeId,
  sanitizeDocumentThemeMap,
  setDocumentTheme,
} from "./documentThemes.ts";

test("document theme map sanitizes malformed entries and path separators", () => {
  assert.deepEqual(
    sanitizeDocumentThemeMap({
      "文章\\正文.md": "ink",
      "../outside.md": "bad",
      empty: "",
      array: [],
      count: 1,
    }),
    {"文章/正文.md": "ink"},
  );
  assert.deepEqual(parseDocumentThemeMap("not json"), {});
});

test("document theme map updates one article without changing other articles", () => {
  const original = {"a.md": "ink", "b.md": "paper"};
  assert.deepEqual(setDocumentTheme(original, "a.md", "forest"), {
    "a.md": "forest",
    "b.md": "paper",
  });
  assert.deepEqual(original, {"a.md": "ink", "b.md": "paper"});
});

test("document theme map follows file and folder renames", () => {
  assert.deepEqual(
    remapDocumentThemes(
      {"notes/a.md": "ink", "notes/sub/b.md": "paper", "other.md": "plain"},
      "notes",
      "archive",
    ),
    {"archive/a.md": "ink", "archive/sub/b.md": "paper", "other.md": "plain"},
  );
});

test("document theme map removes a document subtree", () => {
  assert.deepEqual(
    removeDocumentThemes({"notes/a.md": "ink", "notes/sub/b.md": "paper", "other.md": "plain"}, "notes"),
    {"other.md": "plain"},
  );
});

test("missing device-only theme falls back without overwriting the synced selection", () => {
  const map = {"a.md": "device-only-theme"};

  assert.equal(
    resolveAvailableThemeId([{id: "default"}], map["a.md"], "default"),
    "default",
  );
  assert.equal(map["a.md"], "device-only-theme");
  assert.equal(
    resolveAvailableThemeId(
      [{id: "default"}, {id: "device-only-theme"}],
      map["a.md"],
      "default",
    ),
    "device-only-theme",
  );
});
