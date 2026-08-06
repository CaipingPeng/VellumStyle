// src/components/Publish/PublishDialog.tsx
import { useCallback, useEffect as useEffect2, useLayoutEffect, useRef, useState } from "react";

// src/store/index.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

// css-raw-stub:./builtin/default.css?raw
var default_default = "";

// src/articleRoot.ts
var ARTICLE_ROOT_ID = "article";
var ARTICLE_ROOT_SELECTOR = `#${ARTICLE_ROOT_ID}`;
var ARTICLE_BOX_ID = "article-box";
var LEGACY_ARTICLE_ROOT_SELECTORS = ["#nice", "#wechat-article"];

// src/components/Theme/scopeCss.ts
var ARTICLE_ROOT_SELECTORS = [ARTICLE_ROOT_SELECTOR, ...LEGACY_ARTICLE_ROOT_SELECTORS];
function stripArticleRootSelector(selector) {
  for (const rootSelector of ARTICLE_ROOT_SELECTORS) {
    if (selector === rootSelector) return "";
    if (selector.startsWith(rootSelector) && !/[-_a-zA-Z0-9]/.test(selector[rootSelector.length] ?? "")) {
      return selector.slice(rootSelector.length);
    }
  }
  return null;
}
function scopeSelector(sel, scopeSelectorPrefix) {
  const s = sel.trim();
  if (!s) return s;
  const suffix = stripArticleRootSelector(s);
  if (suffix != null) return `${scopeSelectorPrefix}${suffix}`;
  return `${scopeSelectorPrefix} ${s}`;
}
function scopeSelectorList(selectorList, scopeSelectorPrefix) {
  return selectorList.split(",").map((sel) => scopeSelector(sel, scopeSelectorPrefix)).join(", ");
}
function scopeCssTo(css, scopeSelectorPrefix) {
  const noComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  const n = noComment.length;
  while (i < n) {
    const braceOpen = noComment.indexOf("{", i);
    if (braceOpen === -1) {
      break;
    }
    const prelude = noComment.slice(i, braceOpen).trim();
    if (prelude.startsWith("@")) {
      const blockEnd2 = matchBrace(noComment, braceOpen);
      const inner = noComment.slice(braceOpen + 1, blockEnd2);
      const atName = prelude.match(/^@([a-zA-Z-]+)/)?.[1].toLowerCase();
      if (atName === "media" || atName === "supports") {
        out += `${prelude} { ${scopeCssTo(inner, scopeSelectorPrefix)} }
`;
      } else {
        out += `${prelude} {${inner}}
`;
      }
      i = blockEnd2 + 1;
      continue;
    }
    const blockEnd = matchBrace(noComment, braceOpen);
    const body = noComment.slice(braceOpen + 1, blockEnd).trim();
    out += `${scopeSelectorList(prelude, scopeSelectorPrefix)} {${body ? ` ${body} ` : ""}}
`;
    i = blockEnd + 1;
  }
  return out;
}
function matchBrace(str, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < str.length; k++) {
    if (str[k] === "{") depth++;
    else if (str[k] === "}") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return str.length - 1;
}

// src/themes/index.ts
var BUILTIN_NAMES = {
  default: "\u9ED8\u8BA4",
  "everforest-light": "Everforest Light",
  "eyes-green": "Eyes Green",
  happysimple: "Happy Simple",
  "konayuki-light": "Konayuki Light",
  "latex-typora": "LaTeX Typora",
  "morandi-garden": "Morandi Garden",
  "notion-style-light-enhanced": "Notion Style Enhanced",
  "see-yue": "See Yue \u671B\u6708",
  "typora-mo": "Typora Mo",
  "typora-spring": "Typora Spring",
  "typora-yuan-shan": "Typora Yuan Shan \u8FDC\u5C71",
  "mdnice-1": "\u6A59\u5FC3",
  "mdnice-3": "\u59F9\u7D2B",
  "mdnice-4": "\u5AE9\u9752",
  "mdnice-5": "\u7EFF\u610F",
  "mdnice-6": "\u7EA2\u7EEF",
  "mdnice-8": "\u84DD\u83B9",
  "mdnice-10": "\u5170\u9752",
  "mdnice-11": "\u5C71\u5439",
  "mdnice-12": "\u524D\u7AEF\u4E4B\u5DC5\u540C\u6B3E",
  "mdnice-13": "\u6781\u5BA2\u9ED1",
  "mdnice-15": "\u8537\u8587\u7D2B",
  "mdnice-16": "\u840C\u7EFF",
  "mdnice-17": "\u5168\u6808\u84DD",
  "mdnice-18": "\u6781\u7B80\u9ED1",
  "mdnice-19": "\u6A59\u84DD\u98CE",
  "mdnice-33": "Pornhub\u9EC4",
  "mdnice-35": "\u51DD\u591C\u7D2B",
  "mdnice-42": "\u840C\u7C89",
  "mdnice-44": "Obsidian",
  "mdnice-45": "\u7075\u52A8\u84DD",
  "mdnice-48": "\u8349\u539F\u7EFF",
  "mdnice-51": "\u79D1\u6280\u84DD",
  "mdnice-62": "WeFormat",
  "mdnice-63": "\u7B80",
  "mdnice-1348": "\u96C1\u6816\u6E56",
  "mdnice-1377": "\u5947\u70B9",
  "mdnice-1653": "\u9524\u5B50\u4FBF\u7B7E\u4E3B\u9898\u7B2C2\u7248",
  "mdnice-3050": "\u4E18\u6BD4\u7279\u5FD9",
  "mdnice-3060": "\u91CD\u5F71",
  "mdnice-11773": "\u67E0\u6AAC\u9EC4"
};
var defaultTheme = {
  id: "default",
  name: BUILTIN_NAMES.default,
  css: scopeCssTo(default_default, ARTICLE_ROOT_SELECTOR)
};
var builtinThemes = [defaultTheme];
var defaultMarkdownTheme = defaultTheme;

// src/utils/documents.ts
import { invoke } from "@tauri-apps/api/core";

// src/utils/tauriEnv.ts
function isTauriRuntime(target = globalThis) {
  if (!target || typeof target !== "object") {
    return false;
  }
  const maybe = target;
  return typeof maybe.__TAURI_INTERNALS__?.invoke === "function";
}

// src/utils/documentThemes.ts
var DOCUMENT_THEME_MAP_FILE = ".vellumstyle-theme-map.json";
function resolveAvailableThemeId(themes, requestedThemeId, fallbackThemeId) {
  return themes.some((theme) => theme.id === requestedThemeId) ? requestedThemeId : fallbackThemeId;
}
function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
function sanitizeDocumentThemeMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result = {};
  for (const [rawPath, rawThemeId] of Object.entries(raw)) {
    if (typeof rawThemeId !== "string" || !rawThemeId.trim()) {
      continue;
    }
    const path = normalizePath(rawPath.trim());
    if (!path || path.split("/").some((part) => part === "." || part === "..")) {
      continue;
    }
    result[path] = rawThemeId.trim();
  }
  return result;
}
function parseDocumentThemeMap(text) {
  if (!text.trim()) {
    return {};
  }
  try {
    return sanitizeDocumentThemeMap(JSON.parse(text));
  } catch {
    return {};
  }
}
function setDocumentTheme(map, path, themeId) {
  if (!path) {
    return { ...map };
  }
  return { ...map, [normalizePath(path)]: themeId };
}
function remapDocumentThemes(map, fromPath, toPath) {
  const from = normalizePath(fromPath);
  const to = normalizePath(toPath);
  if (!from || !to || from === to) {
    return { ...map };
  }
  const result = {};
  for (const [path, themeId] of Object.entries(map)) {
    if (path === from || path.startsWith(`${from}/`)) {
      result[`${to}${path.slice(from.length)}`] = themeId;
    } else {
      result[path] = themeId;
    }
  }
  return result;
}
function removeDocumentThemes(map, path) {
  const target = normalizePath(path);
  if (!target) {
    return { ...map };
  }
  return Object.fromEntries(
    Object.entries(map).filter(([entryPath]) => entryPath !== target && !entryPath.startsWith(`${target}/`))
  );
}

// src/utils/documents.ts
function normalize(node) {
  return {
    name: node.name,
    path: node.path,
    isDir: node.is_dir,
    children: node.children.map(normalize)
  };
}
var WEB_SAMPLE_PATH = "\u793A\u4F8B.md";
var WEB_SAMPLE_CONTENT = `# \u6587\u6F9C\u6392\u7248

\u6B22\u8FCE\u4F7F\u7528\uFF01\u5DE6\u4FA7\u7F16\u8F91 **Markdown**\uFF0C\u53F3\u4FA7\u5B9E\u65F6\u9884\u89C8\uFF0C\u70B9\u53F3\u4E0A\u89D2\u300C\u590D\u5236\u5230\u5FAE\u4FE1\u300D\u5373\u53EF\u7C98\u8D34\u5230\u516C\u4F17\u53F7\u7F16\u8F91\u5668\u3002

## \u6587\u672C\u6837\u5F0F

\u652F\u6301**\u52A0\u7C97**\u3001*\u659C\u4F53*\u3001~~\u5220\u9664\u7EBF~~\u3001\`\u884C\u5185\u4EE3\u7801\`\uFF0C\u4EE5\u53CA[\u94FE\u63A5](https://example.com)\u3002

## \u5217\u8868

- \u7B2C\u4E00\u9879
- \u7B2C\u4E8C\u9879
  - \u5D4C\u5957\u9879
`;
var webFiles = /* @__PURE__ */ new Map([[WEB_SAMPLE_PATH, WEB_SAMPLE_CONTENT]]);
var webDirs = /* @__PURE__ */ new Set();
function basename(path) {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
function dirname(path) {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}
function buildWebTree() {
  const root = [];
  const dirs = /* @__PURE__ */ new Map();
  dirs.set("", root);
  const sortedDirs = Array.from(webDirs).sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const path of sortedDirs) {
    const parent = dirname(path);
    const node = { name: basename(path), path, isDir: true, children: [] };
    if (!dirs.has(parent)) dirs.set(parent, []);
    dirs.get(parent).push(node);
    dirs.set(path, node.children);
  }
  const sortedFiles = Array.from(webFiles.keys()).filter((path) => /\.md$/i.test(path)).sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const path of sortedFiles) {
    const parent = dirname(path);
    const node = { name: basename(path), path, isDir: false, children: [] };
    if (!dirs.has(parent)) dirs.set(parent, []);
    dirs.get(parent).push(node);
  }
  return root;
}
async function listDocuments() {
  if (!isTauriRuntime()) {
    return buildWebTree();
  }
  const raw = await invoke("list_documents");
  return raw.map(normalize);
}
function readDocument(path) {
  if (!isTauriRuntime()) {
    return Promise.resolve(webFiles.get(path) ?? "");
  }
  return invoke("read_document", { path });
}
function writeDocument(path, text) {
  if (!isTauriRuntime()) {
    webFiles.set(path, text);
    return Promise.resolve();
  }
  return invoke("write_document", { path, text });
}
async function readDocumentThemeMap() {
  if (!isTauriRuntime()) {
    const text = webFiles.get(DOCUMENT_THEME_MAP_FILE);
    return {
      exists: text !== void 0,
      map: parseDocumentThemeMap(text ?? "")
    };
  }
  try {
    const text = await readDocument(DOCUMENT_THEME_MAP_FILE);
    return { exists: true, map: parseDocumentThemeMap(text) };
  } catch {
    return { exists: false, map: {} };
  }
}
function writeDocumentThemeMap(map) {
  return writeDocument(DOCUMENT_THEME_MAP_FILE, `${JSON.stringify(map, null, 2)}
`);
}

// src/utils/autosave.ts
function createDebouncedSaver(save, delayMs, events = {}) {
  let timer = null;
  let pending = null;
  let flushRequested = false;
  let drainPromise = null;
  async function drain() {
    while (flushRequested && pending !== null) {
      flushRequested = false;
      const text = pending;
      pending = null;
      events.onFlushStart?.(text);
      try {
        await save(text);
        events.onFlushSuccess?.(text);
      } catch (error) {
        events.onFlushError?.(error);
        throw error;
      }
    }
  }
  function startDrain() {
    if (!drainPromise) {
      drainPromise = drain().finally(() => {
        drainPromise = null;
        if (flushRequested && pending !== null) {
          void startDrain().catch(() => void 0);
        }
      });
    }
    return drainPromise;
  }
  return {
    schedule(text) {
      pending = text;
      events.onScheduled?.();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flushRequested = true;
        void startDrain().catch(() => void 0);
      }, delayMs);
    },
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending === null) {
        await drainPromise;
        return;
      }
      flushRequested = true;
      await startDrain();
    }
  };
}

// src/utils/cloudSync.ts
import { invoke as invoke2 } from "@tauri-apps/api/core";
async function runCloudSync() {
  if (!isTauriRuntime()) {
    return {
      enabled: false,
      syncedAt: null,
      uploaded: 0,
      downloaded: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: 0,
      message: "Web \u8C03\u8BD5\u6A21\u5F0F\u672A\u542F\u7528\u6587\u4EF6\u540C\u6B65"
    };
  }
  return invoke2("sync_documents");
}

// src/components/Toast/toast.ts
var items = [];
var nextId = 1;
var listeners = /* @__PURE__ */ new Set();
function emit() {
  for (const l of listeners) l([...items]);
}
var toast = {
  show(message, type = "info", duration = 2500) {
    const id = nextId++;
    items = [...items, { id, message, type }];
    emit();
    window.setTimeout(() => {
      items = items.filter((it) => it.id !== id);
      emit();
    }, duration);
  },
  subscribe(l) {
    listeners.add(l);
    l([...items]);
    return () => {
      listeners.delete(l);
    };
  }
};

// src/markdown/generatedHljsThemesCore.ts
var GENERATED_HLJS_THEMES_CORE = [
  {
    "id": "vs2015",
    "name": "VS2015",
    "group": "Highlight.js",
    "sourcePath": "vs2015.css",
    "css": "pre code.hljs {\n  display: block;\n  overflow-x: auto;\n  padding: 1em\n}\ncode.hljs {\n  padding: 3px 5px\n}\n/*\n * Visual Studio 2015 dark style\n * Author: Nicolas LLOBERA <nllobera@gmail.com>\n */\n.hljs {\n  background: #1E1E1E;\n  color: #DCDCDC\n}\n.hljs-keyword,\n.hljs-literal,\n.hljs-symbol,\n.hljs-name {\n  color: #569CD6\n}\n.hljs-link {\n  color: #569CD6;\n  text-decoration: underline\n}\n.hljs-built_in,\n.hljs-type {\n  color: #4EC9B0\n}\n.hljs-number,\n.hljs-class {\n  color: #B8D7A3\n}\n.hljs-string,\n.hljs-meta .hljs-string {\n  color: #D69D85\n}\n.hljs-regexp,\n.hljs-template-tag {\n  color: #9A5334\n}\n.hljs-subst,\n.hljs-function,\n.hljs-title,\n.hljs-params,\n.hljs-formula {\n  color: #DCDCDC\n}\n.hljs-comment,\n.hljs-quote {\n  color: #57A64A;\n  font-style: italic\n}\n.hljs-doctag {\n  color: #608B4E\n}\n.hljs-meta,\n.hljs-meta .hljs-keyword,\n.hljs-tag {\n  color: #9B9B9B\n}\n.hljs-variable,\n.hljs-template-variable {\n  color: #BD63C5\n}\n.hljs-attr,\n.hljs-attribute {\n  color: #9CDCFE\n}\n.hljs-section {\n  color: gold\n}\n.hljs-emphasis {\n  font-style: italic\n}\n.hljs-strong {\n  font-weight: bold\n}\n/*.hljs-code {\n  font-family:'Monospace';\n}*/\n.hljs-bullet,\n.hljs-selector-tag,\n.hljs-selector-id,\n.hljs-selector-class,\n.hljs-selector-attr,\n.hljs-selector-pseudo {\n  color: #D7BA7D\n}\n.hljs-addition {\n  background-color: #144212;\n  display: inline-block;\n  width: 100%\n}\n.hljs-deletion {\n  background-color: #600;\n  display: inline-block;\n  width: 100%\n}"
  },
  {
    "id": "atom-one-dark",
    "name": "Atom One Dark",
    "group": "Highlight.js",
    "sourcePath": "atom-one-dark.css",
    "css": "pre code.hljs {\n  display: block;\n  overflow-x: auto;\n  padding: 1em\n}\ncode.hljs {\n  padding: 3px 5px\n}\n/*\n\nAtom One Dark by Daniel Gamage\nOriginal One Dark Syntax theme from https://github.com/atom/one-dark-syntax\n\nbase:    #282c34\nmono-1:  #abb2bf\nmono-2:  #818896\nmono-3:  #5c6370\nhue-1:   #56b6c2\nhue-2:   #61aeee\nhue-3:   #c678dd\nhue-4:   #98c379\nhue-5:   #e06c75\nhue-5-2: #be5046\nhue-6:   #d19a66\nhue-6-2: #e6c07b\n\n*/\n.hljs {\n  color: #abb2bf;\n  background: #282c34\n}\n.hljs-comment,\n.hljs-quote {\n  color: #5c6370;\n  font-style: italic\n}\n.hljs-doctag,\n.hljs-keyword,\n.hljs-formula {\n  color: #c678dd\n}\n.hljs-section,\n.hljs-name,\n.hljs-selector-tag,\n.hljs-deletion,\n.hljs-subst {\n  color: #e06c75\n}\n.hljs-literal {\n  color: #56b6c2\n}\n.hljs-string,\n.hljs-regexp,\n.hljs-addition,\n.hljs-attribute,\n.hljs-meta .hljs-string {\n  color: #98c379\n}\n.hljs-attr,\n.hljs-variable,\n.hljs-template-variable,\n.hljs-type,\n.hljs-selector-class,\n.hljs-selector-attr,\n.hljs-selector-pseudo,\n.hljs-number {\n  color: #d19a66\n}\n.hljs-symbol,\n.hljs-bullet,\n.hljs-link,\n.hljs-meta,\n.hljs-selector-id,\n.hljs-title {\n  color: #61aeee\n}\n.hljs-built_in,\n.hljs-title.class_,\n.hljs-class .hljs-title {\n  color: #e6c07b\n}\n.hljs-emphasis {\n  font-style: italic\n}\n.hljs-strong {\n  font-weight: bold\n}\n.hljs-link {\n  text-decoration: underline\n}"
  },
  {
    "id": "atom-one-light",
    "name": "Atom One Light",
    "group": "Highlight.js",
    "sourcePath": "atom-one-light.css",
    "css": "pre code.hljs {\n  display: block;\n  overflow-x: auto;\n  padding: 1em\n}\ncode.hljs {\n  padding: 3px 5px\n}\n/*\n\nAtom One Light by Daniel Gamage\nOriginal One Light Syntax theme from https://github.com/atom/one-light-syntax\n\nbase:    #fafafa\nmono-1:  #383a42\nmono-2:  #686b77\nmono-3:  #a0a1a7\nhue-1:   #0184bb\nhue-2:   #4078f2\nhue-3:   #a626a4\nhue-4:   #50a14f\nhue-5:   #e45649\nhue-5-2: #c91243\nhue-6:   #986801\nhue-6-2: #c18401\n\n*/\n.hljs {\n  color: #383a42;\n  background: #fafafa\n}\n.hljs-comment,\n.hljs-quote {\n  color: #a0a1a7;\n  font-style: italic\n}\n.hljs-doctag,\n.hljs-keyword,\n.hljs-formula {\n  color: #a626a4\n}\n.hljs-section,\n.hljs-name,\n.hljs-selector-tag,\n.hljs-deletion,\n.hljs-subst {\n  color: #e45649\n}\n.hljs-literal {\n  color: #0184bb\n}\n.hljs-string,\n.hljs-regexp,\n.hljs-addition,\n.hljs-attribute,\n.hljs-meta .hljs-string {\n  color: #50a14f\n}\n.hljs-attr,\n.hljs-variable,\n.hljs-template-variable,\n.hljs-type,\n.hljs-selector-class,\n.hljs-selector-attr,\n.hljs-selector-pseudo,\n.hljs-number {\n  color: #986801\n}\n.hljs-symbol,\n.hljs-bullet,\n.hljs-link,\n.hljs-meta,\n.hljs-selector-id,\n.hljs-title {\n  color: #4078f2\n}\n.hljs-built_in,\n.hljs-title.class_,\n.hljs-class .hljs-title {\n  color: #c18401\n}\n.hljs-emphasis {\n  font-style: italic\n}\n.hljs-strong {\n  font-weight: bold\n}\n.hljs-link {\n  text-decoration: underline\n}"
  },
  {
    "id": "github-dark",
    "name": "GitHub Dark",
    "group": "Highlight.js",
    "sourcePath": "github-dark.css",
    "css": "pre code.hljs {\n  display: block;\n  overflow-x: auto;\n  padding: 1em\n}\ncode.hljs {\n  padding: 3px 5px\n}\n/*!\n  Theme: GitHub Dark\n  Description: Dark theme as seen on github.com\n  Author: github.com\n  Maintainer: @Hirse\n  Updated: 2021-05-15\n\n  Outdated base version: https://github.com/primer/github-syntax-dark\n  Current colors taken from GitHub's CSS\n*/\n.hljs {\n  color: #c9d1d9;\n  background: #0d1117\n}\n.hljs-doctag,\n.hljs-keyword,\n.hljs-meta .hljs-keyword,\n.hljs-template-tag,\n.hljs-template-variable,\n.hljs-type,\n.hljs-variable.language_ {\n  /* prettylights-syntax-keyword */\n  color: #ff7b72\n}\n.hljs-title,\n.hljs-title.class_,\n.hljs-title.class_.inherited__,\n.hljs-title.function_ {\n  /* prettylights-syntax-entity */\n  color: #d2a8ff\n}\n.hljs-attr,\n.hljs-attribute,\n.hljs-literal,\n.hljs-meta,\n.hljs-number,\n.hljs-operator,\n.hljs-variable,\n.hljs-selector-attr,\n.hljs-selector-class,\n.hljs-selector-id {\n  /* prettylights-syntax-constant */\n  color: #79c0ff\n}\n.hljs-regexp,\n.hljs-string,\n.hljs-meta .hljs-string {\n  /* prettylights-syntax-string */\n  color: #a5d6ff\n}\n.hljs-built_in,\n.hljs-symbol {\n  /* prettylights-syntax-variable */\n  color: #ffa657\n}\n.hljs-comment,\n.hljs-code,\n.hljs-formula {\n  /* prettylights-syntax-comment */\n  color: #8b949e\n}\n.hljs-name,\n.hljs-quote,\n.hljs-selector-tag,\n.hljs-selector-pseudo {\n  /* prettylights-syntax-entity-tag */\n  color: #7ee787\n}\n.hljs-subst {\n  /* prettylights-syntax-storage-modifier-import */\n  color: #c9d1d9\n}\n.hljs-section {\n  /* prettylights-syntax-markup-heading */\n  color: #1f6feb;\n  font-weight: bold\n}\n.hljs-bullet {\n  /* prettylights-syntax-markup-list */\n  color: #f2cc60\n}\n.hljs-emphasis {\n  /* prettylights-syntax-markup-italic */\n  color: #c9d1d9;\n  font-style: italic\n}\n.hljs-strong {\n  /* prettylights-syntax-markup-bold */\n  color: #c9d1d9;\n  font-weight: bold\n}\n.hljs-addition {\n  /* prettylights-syntax-markup-inserted */\n  color: #aff5b4;\n  background-color: #033a16\n}\n.hljs-deletion {\n  /* prettylights-syntax-markup-deleted */\n  color: #ffdcd7;\n  background-color: #67060c\n}\n.hljs-char.escape_,\n.hljs-link,\n.hljs-params,\n.hljs-property,\n.hljs-punctuation,\n.hljs-tag {\n  /* purposely ignored */\n  \n}"
  },
  {
    "id": "github",
    "name": "GitHub Light",
    "group": "Highlight.js",
    "sourcePath": "github.css",
    "css": "pre code.hljs {\n  display: block;\n  overflow-x: auto;\n  padding: 1em\n}\ncode.hljs {\n  padding: 3px 5px\n}\n/*!\n  Theme: GitHub\n  Description: Light theme as seen on github.com\n  Author: github.com\n  Maintainer: @Hirse\n  Updated: 2021-05-15\n\n  Outdated base version: https://github.com/primer/github-syntax-light\n  Current colors taken from GitHub's CSS\n*/\n.hljs {\n  color: #24292e;\n  background: #ffffff\n}\n.hljs-doctag,\n.hljs-keyword,\n.hljs-meta .hljs-keyword,\n.hljs-template-tag,\n.hljs-template-variable,\n.hljs-type,\n.hljs-variable.language_ {\n  /* prettylights-syntax-keyword */\n  color: #d73a49\n}\n.hljs-title,\n.hljs-title.class_,\n.hljs-title.class_.inherited__,\n.hljs-title.function_ {\n  /* prettylights-syntax-entity */\n  color: #6f42c1\n}\n.hljs-attr,\n.hljs-attribute,\n.hljs-literal,\n.hljs-meta,\n.hljs-number,\n.hljs-operator,\n.hljs-variable,\n.hljs-selector-attr,\n.hljs-selector-class,\n.hljs-selector-id {\n  /* prettylights-syntax-constant */\n  color: #005cc5\n}\n.hljs-regexp,\n.hljs-string,\n.hljs-meta .hljs-string {\n  /* prettylights-syntax-string */\n  color: #032f62\n}\n.hljs-built_in,\n.hljs-symbol {\n  /* prettylights-syntax-variable */\n  color: #e36209\n}\n.hljs-comment,\n.hljs-code,\n.hljs-formula {\n  /* prettylights-syntax-comment */\n  color: #6a737d\n}\n.hljs-name,\n.hljs-quote,\n.hljs-selector-tag,\n.hljs-selector-pseudo {\n  /* prettylights-syntax-entity-tag */\n  color: #22863a\n}\n.hljs-subst {\n  /* prettylights-syntax-storage-modifier-import */\n  color: #24292e\n}\n.hljs-section {\n  /* prettylights-syntax-markup-heading */\n  color: #005cc5;\n  font-weight: bold\n}\n.hljs-bullet {\n  /* prettylights-syntax-markup-list */\n  color: #735c0f\n}\n.hljs-emphasis {\n  /* prettylights-syntax-markup-italic */\n  color: #24292e;\n  font-style: italic\n}\n.hljs-strong {\n  /* prettylights-syntax-markup-bold */\n  color: #24292e;\n  font-weight: bold\n}\n.hljs-addition {\n  /* prettylights-syntax-markup-inserted */\n  color: #22863a;\n  background-color: #f0fff4\n}\n.hljs-deletion {\n  /* prettylights-syntax-markup-deleted */\n  color: #b31d28;\n  background-color: #ffeef0\n}\n.hljs-char.escape_,\n.hljs-link,\n.hljs-params,\n.hljs-property,\n.hljs-punctuation,\n.hljs-tag {\n  /* purposely ignored */\n  \n}"
  },
  {
    "id": "monokai-sublime",
    "name": "Monokai Sublime",
    "group": "Highlight.js",
    "sourcePath": "monokai-sublime.css",
    "css": "pre code.hljs {\n  display: block;\n  overflow-x: auto;\n  padding: 1em\n}\ncode.hljs {\n  padding: 3px 5px\n}\n/*\n\nMonokai Sublime style. Derived from Monokai by noformnocontent http://nn.mit-license.org/\n\n*/\n.hljs {\n  background: #23241f;\n  color: #f8f8f2\n}\n.hljs-tag,\n.hljs-subst {\n  color: #f8f8f2\n}\n.hljs-strong,\n.hljs-emphasis {\n  color: #a8a8a2\n}\n.hljs-bullet,\n.hljs-quote,\n.hljs-number,\n.hljs-regexp,\n.hljs-literal,\n.hljs-link {\n  color: #ae81ff\n}\n.hljs-code,\n.hljs-title,\n.hljs-section,\n.hljs-selector-class {\n  color: #a6e22e\n}\n.hljs-strong {\n  font-weight: bold\n}\n.hljs-emphasis {\n  font-style: italic\n}\n.hljs-keyword,\n.hljs-selector-tag,\n.hljs-name,\n.hljs-attr {\n  color: #f92672\n}\n.hljs-symbol,\n.hljs-attribute {\n  color: #66d9ef\n}\n.hljs-params,\n.hljs-title.class_,\n.hljs-class .hljs-title {\n  color: #f8f8f2\n}\n.hljs-string,\n.hljs-type,\n.hljs-built_in,\n.hljs-selector-id,\n.hljs-selector-attr,\n.hljs-selector-pseudo,\n.hljs-addition,\n.hljs-variable,\n.hljs-template-variable {\n  color: #e6db74\n}\n.hljs-comment,\n.hljs-deletion,\n.hljs-meta {\n  color: #75715e\n}"
  },
  {
    "id": "night-owl",
    "name": "Night Owl",
    "group": "Highlight.js",
    "sourcePath": "night-owl.css",
    "css": `pre code.hljs {
  display: block;
  overflow-x: auto;
  padding: 1em
}
code.hljs {
  padding: 3px 5px
}
/*

Night Owl for highlight.js (c) Carl Baxter <carl@cbax.tech>

An adaptation of Sarah Drasner's Night Owl VS Code Theme
https://github.com/sdras/night-owl-vscode-theme

Copyright (c) 2018 Sarah Drasner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
.hljs {
  background: #011627;
  color: #d6deeb
}
/* General Purpose */
.hljs-keyword {
  color: #c792ea;
  font-style: italic
}
.hljs-built_in {
  color: #addb67;
  font-style: italic
}
.hljs-type {
  color: #82aaff
}
.hljs-literal {
  color: #ff5874
}
.hljs-number {
  color: #F78C6C
}
.hljs-regexp {
  color: #5ca7e4
}
.hljs-string {
  color: #ecc48d
}
.hljs-subst {
  color: #d3423e
}
.hljs-symbol {
  color: #82aaff
}
.hljs-class {
  color: #ffcb8b
}
.hljs-function {
  color: #82AAFF
}
.hljs-title {
  color: #DCDCAA;
  font-style: italic
}
.hljs-params {
  color: #7fdbca
}
/* Meta */
.hljs-comment {
  color: #637777;
  font-style: italic
}
.hljs-doctag {
  color: #7fdbca
}
.hljs-meta {
  color: #82aaff
}
.hljs-meta .hljs-keyword {
  color: #82aaff
}
.hljs-meta .hljs-string {
  color: #ecc48d
}
/* Tags, attributes, config */
.hljs-section {
  color: #82b1ff
}
.hljs-tag,
.hljs-name {
  color: #7fdbca
}
.hljs-attr {
  color: #7fdbca
}
.hljs-attribute {
  color: #80cbc4
}
.hljs-variable {
  color: #addb67
}
/* Markup */
.hljs-bullet {
  color: #d9f5dd
}
.hljs-code {
  color: #80CBC4
}
.hljs-emphasis {
  color: #c792ea;
  font-style: italic
}
.hljs-strong {
  color: #addb67;
  font-weight: bold
}
.hljs-formula {
  color: #c792ea
}
.hljs-link {
  color: #ff869a
}
.hljs-quote {
  color: #697098;
  font-style: italic
}
/* CSS */
.hljs-selector-tag {
  color: #ff6363
}
.hljs-selector-id {
  color: #fad430
}
.hljs-selector-class {
  color: #addb67;
  font-style: italic
}
.hljs-selector-attr,
.hljs-selector-pseudo {
  color: #c792ea;
  font-style: italic
}
/* Templates */
.hljs-template-tag {
  color: #c792ea
}
.hljs-template-variable {
  color: #addb67
}
/* diff */
.hljs-addition {
  color: #addb67ff;
  font-style: italic
}
.hljs-deletion {
  color: #EF535090;
  font-style: italic
}`
  },
  {
    "id": "xcode",
    "name": "Xcode",
    "group": "Highlight.js",
    "sourcePath": "xcode.css",
    "css": "pre code.hljs {\n  display: block;\n  overflow-x: auto;\n  padding: 1em\n}\ncode.hljs {\n  padding: 3px 5px\n}\n/*\n\nXCode style (c) Angel Garcia <angelgarcia.mail@gmail.com>\n\n*/\n.hljs {\n  background: #fff;\n  color: black\n}\n/* Gray DOCTYPE selectors like WebKit */\n.xml .hljs-meta {\n  color: #c0c0c0\n}\n.hljs-comment,\n.hljs-quote {\n  color: #007400\n}\n.hljs-tag,\n.hljs-attribute,\n.hljs-keyword,\n.hljs-selector-tag,\n.hljs-literal,\n.hljs-name {\n  color: #aa0d91\n}\n.hljs-variable,\n.hljs-template-variable {\n  color: #3F6E74\n}\n.hljs-code,\n.hljs-string,\n.hljs-meta .hljs-string {\n  color: #c41a16\n}\n.hljs-regexp,\n.hljs-link {\n  color: #0E0EFF\n}\n.hljs-title,\n.hljs-symbol,\n.hljs-bullet,\n.hljs-number {\n  color: #1c00cf\n}\n.hljs-section,\n.hljs-meta {\n  color: #643820\n}\n.hljs-title.class_,\n.hljs-class .hljs-title,\n.hljs-type,\n.hljs-built_in,\n.hljs-params {\n  color: #5c2699\n}\n.hljs-attr {\n  color: #836C28\n}\n.hljs-subst {\n  color: #000\n}\n.hljs-formula {\n  background-color: #eee;\n  font-style: italic\n}\n.hljs-addition {\n  background-color: #baeeba\n}\n.hljs-deletion {\n  background-color: #ffc8bd\n}\n.hljs-selector-id,\n.hljs-selector-class {\n  color: #9b703f\n}\n.hljs-doctag,\n.hljs-strong {\n  font-weight: bold\n}\n.hljs-emphasis {\n  font-style: italic\n}"
  }
];

// src/markdown/codeThemes.ts
var DEFAULT_CODE_THEME_ID = "vs2015";
var DEFAULT_PINNED_CODE_THEME_IDS = [
  "vs2015",
  "github",
  "github-dark",
  "atom-one-dark",
  "atom-one-light",
  "monokai-sublime",
  "night-owl",
  "xcode"
];
var CODE_BLOCK_BASE_CSS = `
${ARTICLE_ROOT_SELECTOR} pre.custom {
  box-sizing: border-box;
  margin: 16px 0;
  padding: 0;
  border-radius: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: pre;
  word-wrap: normal;
}
${ARTICLE_ROOT_SELECTOR} pre.custom code.hljs {
  box-sizing: border-box;
  min-width: 100%;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 14px;
  line-height: 1.55;
  white-space: inherit;
}
${ARTICLE_ROOT_SELECTOR} pre.mermaid {
  box-sizing: border-box;
  margin: 18px 0;
  padding: 8px 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  text-align: center;
  background: transparent;
}
${ARTICLE_ROOT_SELECTOR} pre.mermaid svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
${ARTICLE_ROOT_SELECTOR} pre.mermaid.mermaid-error {
  padding: 12px;
  border: 1px solid rgba(229, 72, 77, 0.3);
  border-radius: 8px;
  color: #9f1239;
  text-align: left;
  white-space: pre-wrap;
}
`;
var FOOTNOTE_LAYOUT_BASE_CSS = `
${ARTICLE_ROOT_SELECTOR} .footnotes {
  word-break: break-word;
  overflow-wrap: break-word;
}
${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-item {
  display: block !important;
}
${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-num {
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  margin-right: 0.25em;
}
${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-item p {
  display: inline !important;
  margin: 0 !important;
  padding: 0 !important;
  flex: initial !important;
}
`;
var IMAGEFLOW_LAYOUT_BASE_CSS = `
${ARTICLE_ROOT_SELECTOR} .imageflow-layer1 {
  overflow: hidden;
  margin: 16px 0;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-layer2 {
  display: flex !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-layer3 {
  flex: 0 0 100% !important;
  min-width: 0 !important;
  scroll-snap-align: center;
  scroll-snap-stop: always;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-img {
  display: block !important;
  max-width: 100% !important;
  height: auto !important;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-caption {
  margin: 8px 0 0;
  padding: 0;
  text-align: center;
  color: rgba(136, 136, 136, 1);
  font-size: 14px;
  line-height: 1.8em;
}
`;
function scopeSelector2(selector) {
  const trimmed = selector.trim();
  if (!trimmed) return [];
  if (trimmed === ".hljs") {
    return [`${ARTICLE_ROOT_SELECTOR} pre.custom`, `${ARTICLE_ROOT_SELECTOR} pre.custom code.hljs`];
  }
  if (trimmed === "pre code.hljs" || trimmed === "code.hljs") {
    return [`${ARTICLE_ROOT_SELECTOR} pre.custom code.hljs`];
  }
  return [`${ARTICLE_ROOT_SELECTOR} pre.custom ${trimmed}`];
}
function scopeSelectorList2(selectorList) {
  return Array.from(new Set(selectorList.split(",").flatMap(scopeSelector2)));
}
function matchBrace2(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i += 1) {
    if (str[i] === "{") {
      depth += 1;
    } else if (str[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return str.length - 1;
}
function scopeHljsCss(css) {
  const noComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let i = 0;
  while (i < noComment.length) {
    const open = noComment.indexOf("{", i);
    if (open === -1) break;
    const prelude = noComment.slice(i, open).trim();
    const close = matchBrace2(noComment, open);
    const body = noComment.slice(open + 1, close).trim();
    if (!prelude || !body) {
      i = close + 1;
      continue;
    }
    if (prelude.startsWith("@")) {
      const atName = prelude.match(/^@([a-zA-Z-]+)/)?.[1].toLowerCase();
      if (atName === "media" || atName === "supports") {
        rules.push(`${prelude} { ${scopeHljsCss(body)} }`);
      } else {
        rules.push(`${prelude} { ${body} }`);
      }
      i = close + 1;
      continue;
    }
    const selectors = scopeSelectorList2(prelude);
    if (selectors.length > 0) {
      rules.push(`${selectors.join(",\n")} { ${body} }`);
    }
    i = close + 1;
  }
  return rules.join("\n");
}
function themeRank(theme) {
  if (theme.id === DEFAULT_CODE_THEME_ID) return [0, theme.name];
  return [theme.group === "Highlight.js" ? 1 : 2, theme.name];
}
function compareCodeThemes(a, b) {
  const [rankA, nameA] = themeRank(a);
  const [rankB, nameB] = themeRank(b);
  return rankA - rankB || nameA.localeCompare(nameB);
}
function buildCodeTheme(theme) {
  return { ...theme, css: scopeHljsCss(theme.css) };
}
var CODE_THEMES = GENERATED_HLJS_THEMES_CORE.map(buildCodeTheme).sort(compareCodeThemes);

// src/components/Workspace/workspaceSplitLayout.ts
var DEFAULT_WORKSPACE_SPLIT_RATIO = 0.5;
var MIN_PERSISTED_WORKSPACE_SPLIT_RATIO = 0.2;
var MAX_PERSISTED_WORKSPACE_SPLIT_RATIO = 0.8;
function sanitizeWorkspaceSplitRatio(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_PERSISTED_WORKSPACE_SPLIT_RATIO || value > MAX_PERSISTED_WORKSPACE_SPLIT_RATIO) {
    return DEFAULT_WORKSPACE_SPLIT_RATIO;
  }
  return value;
}

// src/appearance/appearanceMode.ts
var DEFAULT_APPEARANCE_MODE = "light";
function sanitizeAppearanceMode(value) {
  return value === "dark" || value === "light" ? value : DEFAULT_APPEARANCE_MODE;
}

// src/appearance/colorScheme.ts
var COLOR_SCHEMES = [
  {
    id: "violet",
    label: "\u6587\u6F9C\u7D2B",
    description: "\u9ED8\u8BA4 \xB7 \u975B\u7D2B\u6E10\u53D8",
    background: "#fbfaf7",
    gradient: "linear-gradient(135deg, #6d5ae6, #a855f7)"
  },
  {
    id: "coral",
    label: "\u73CA\u745A\u6696\u6A59",
    description: "\u6696\u8C03 \xB7 \u6D3B\u529B",
    background: "#fdf9f6",
    gradient: "linear-gradient(135deg, #f2565e, #ff9a62)"
  },
  {
    id: "mint",
    label: "\u8584\u8377\u9752\u7EFF",
    description: "\u6E05\u65B0 \xB7 \u81EA\u7136",
    background: "#f6fbf8",
    gradient: "linear-gradient(135deg, #0fa78f, #3ecf8e)"
  },
  {
    id: "ocean",
    label: "\u6D77\u5CB8\u84DD",
    description: "\u51B7\u9759 \xB7 \u4E13\u6CE8",
    background: "#f5f8fc",
    gradient: "linear-gradient(135deg, #3b82f6, #6366f1)"
  }
];
var DEFAULT_COLOR_SCHEME = "violet";
function sanitizeColorScheme(value) {
  return COLOR_SCHEMES.some((scheme) => scheme.id === value) ? value : DEFAULT_COLOR_SCHEME;
}

// src/appearance/backgroundImage.ts
import { convertFileSrc } from "@tauri-apps/api/core";
var DEFAULT_BACKGROUND_BLUR = 10;
var MAX_BACKGROUND_BLUR = 30;
var DEFAULT_STATUS_BAR_OPACITY = 0.7;
function sanitizeBackgroundImagePath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function sanitizeBackgroundBlur(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_BLUR;
  }
  return Math.min(MAX_BACKGROUND_BLUR, Math.max(0, value));
}
function sanitizeStatusBarOpacity(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_STATUS_BAR_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

// src/store/index.ts
var AUTOSAVE_DELAY_MS = 1200;
var CLOUD_SYNC_DELAY_MS = 3 * 60 * 1e3;
var syncTimer = null;
var syncDrainPromise = null;
var syncQueued = false;
var documentThemeWritePromise = Promise.resolve();
function queueDocumentThemeWrite(map) {
  const snapshot = sanitizeDocumentThemeMap(map);
  const next = documentThemeWritePromise.catch(() => void 0).then(async () => {
    await writeDocumentThemeMap(snapshot);
    useStore.setState({ documentThemeMapExists: true });
  });
  documentThemeWritePromise = next;
  return next;
}
function flushDocumentThemeWrite() {
  return documentThemeWritePromise;
}
function reportDocumentThemeWriteError(error) {
  console.error("\u4FDD\u5B58\u6587\u7AE0\u4E3B\u9898\u5931\u8D25\uFF1A", error);
  if (typeof window !== "undefined") {
    toast.show("\u6587\u7AE0\u4E3B\u9898\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u78C1\u76D8\u6743\u9650\u3002", "error");
  }
}
var saver = createDebouncedSaver(async (text) => {
  const path = useStore.getState().currentDocPath;
  if (path) await writeDocument(path, text);
}, AUTOSAVE_DELAY_MS, {
  onFlushStart: () => {
    useStore.setState({ saveStatus: "saving" });
  },
  onFlushSuccess: (text) => {
    const state = useStore.getState();
    if (state.content === text) {
      useStore.setState({ saveStatus: "saved", lastSavedAt: Date.now() });
      scheduleCloudSync();
    } else {
      useStore.setState({ saveStatus: "idle" });
    }
  },
  onFlushError: (error) => {
    console.error("\u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF1A", error);
    useStore.setState({ saveStatus: "error" });
    if (typeof window !== "undefined") {
      toast.show("\u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u78C1\u76D8\u6743\u9650\u6216\u7A0D\u540E\u91CD\u8BD5\u3002", "error");
    }
  }
});
function scheduleSave(text) {
  saver.schedule(text);
}
function flushSave() {
  return saver.flushNow();
}
function storedThemeIdForDocument(state, path) {
  if (path && state.documentThemeIds[path]) {
    return state.documentThemeIds[path];
  }
  return path ? defaultMarkdownTheme.id : state.themeMapMigrationThemeId ?? state.markdownThemeId;
}
function effectiveThemeIdForDocument(state, path) {
  return resolveAvailableThemeId(
    state.themes,
    storedThemeIdForDocument(state, path),
    defaultMarkdownTheme.id
  );
}
function documentThemeMapsEqual(left, right) {
  const leftEntries = Object.entries(left);
  return leftEntries.length === Object.keys(right).length && leftEntries.every(([path, themeId]) => right[path] === themeId);
}
async function runCloudSyncOnce() {
  useStore.setState({ syncStatus: "syncing", syncMessage: "" });
  try {
    await flushDocumentThemeWrite();
    const summary = await runCloudSync();
    if (!summary.enabled) {
      await useStore.getState().loadDocumentThemes({ persistMissing: true });
      useStore.setState({
        syncStatus: "disabled",
        syncMessage: summary.message
      });
      return;
    }
    await useStore.getState().loadDocumentThemes({ persistMissing: true });
    const hasPendingSync = syncTimer !== null || syncQueued;
    const hasConflicts = summary.conflicts > 0;
    useStore.setState({
      syncStatus: hasConflicts ? "conflict" : hasPendingSync ? "idle" : "synced",
      lastSyncedAt: summary.syncedAt ?? Date.now(),
      syncMessage: hasPendingSync && !hasConflicts ? "" : summary.message
    });
  } catch (error) {
    const message = typeof error === "string" ? error : error?.message || "\u540C\u6B65\u5931\u8D25";
    console.warn("\u6587\u4EF6\u540C\u6B65\u5931\u8D25\uFF1A", error);
    useStore.setState({ syncStatus: "error", syncMessage: message });
  }
}
function startCloudSyncDrain() {
  if (!syncDrainPromise) {
    syncDrainPromise = runCloudSyncOnce().finally(() => {
      syncDrainPromise = null;
      if (syncQueued) {
        syncQueued = false;
        void startCloudSyncDrain();
      }
    });
  }
  return syncDrainPromise;
}
function scheduleCloudSync(delayMs = CLOUD_SYNC_DELAY_MS) {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  const state = useStore.getState();
  if (state.syncStatus === "synced" || state.syncStatus === "disabled") {
    useStore.setState({ syncStatus: "idle", syncMessage: "" });
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (syncDrainPromise) {
      syncQueued = true;
      return;
    }
    void startCloudSyncDrain();
  }, delayMs);
}
function flushCloudSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (syncDrainPromise) {
    syncQueued = true;
  }
  return startCloudSyncDrain();
}
var useStore = create()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      documentThemeIds: {},
      themeMapMigrationThemeId: null,
      documentThemeMapExists: false,
      codeThemeId: DEFAULT_CODE_THEME_ID,
      // 初始为内置主题；启动后 loadAllThemes() 合并用户主题覆盖
      themes: builtinThemes,
      tree: [],
      currentDocPath: null,
      selectedPath: null,
      sidebarOpen: false,
      outlineOpen: false,
      saveStatus: "idle",
      lastSavedAt: null,
      syncStatus: "idle",
      lastSyncedAt: null,
      syncMessage: "",
      previewMode: "fluid",
      workspaceSplitRatio: DEFAULT_WORKSPACE_SPLIT_RATIO,
      appearanceMode: DEFAULT_APPEARANCE_MODE,
      colorScheme: DEFAULT_COLOR_SCHEME,
      backgroundImagePath: null,
      backgroundBlur: DEFAULT_BACKGROUND_BLUR,
      statusBarOpacity: DEFAULT_STATUS_BAR_OPACITY,
      favoriteThemeIds: [],
      pinnedCodeThemeIds: [...DEFAULT_PINNED_CODE_THEME_IDS],
      setContent: (content) => {
        set({ content, saveStatus: "idle" });
        scheduleSave(content);
      },
      setMarkdownTheme: (markdownThemeId) => {
        let nextMap = null;
        let hasDocument = false;
        set((s) => {
          hasDocument = Boolean(s.currentDocPath);
          nextMap = setDocumentTheme(s.documentThemeIds, s.currentDocPath, markdownThemeId);
          return {
            markdownThemeId,
            documentThemeIds: nextMap,
            // 启动迁移尚未落到文章时，用户主动选的新主题应替换待迁移值；
            // 普通无文档状态则不为后续新文章预设非默认主题。
            themeMapMigrationThemeId: hasDocument ? null : s.themeMapMigrationThemeId ? markdownThemeId : null
          };
        });
        if (hasDocument && nextMap) {
          void queueDocumentThemeWrite(nextMap).catch(reportDocumentThemeWriteError);
          scheduleCloudSync();
        }
      },
      loadDocumentThemes: async (options = {}) => {
        await flushDocumentThemeWrite().catch(() => void 0);
        const result = await readDocumentThemeMap();
        const state = useStore.getState();
        if (result.exists) {
          const map2 = sanitizeDocumentThemeMap(result.map);
          set({
            documentThemeIds: map2,
            documentThemeMapExists: true,
            themeMapMigrationThemeId: null,
            markdownThemeId: effectiveThemeIdForDocument(
              { ...state, documentThemeIds: map2 },
              state.currentDocPath
            )
          });
          return;
        }
        const map = state.documentThemeMapExists ? {} : state.documentThemeIds;
        const migrationThemeId = state.documentThemeMapExists ? null : state.themeMapMigrationThemeId;
        set({
          documentThemeIds: map,
          documentThemeMapExists: false,
          themeMapMigrationThemeId: migrationThemeId,
          markdownThemeId: effectiveThemeIdForDocument(
            { ...state, documentThemeIds: map, themeMapMigrationThemeId: migrationThemeId },
            state.currentDocPath
          )
        });
        if (options.persistMissing && !state.documentThemeMapExists && Object.keys(map).length > 0) {
          void queueDocumentThemeWrite(map).then(() => scheduleCloudSync()).catch(reportDocumentThemeWriteError);
        }
      },
      remapDocumentThemePaths: (fromPath, toPath) => {
        const state = useStore.getState();
        const nextMap = remapDocumentThemes(state.documentThemeIds, fromPath, toPath);
        if (documentThemeMapsEqual(state.documentThemeIds, nextMap)) return;
        set({ documentThemeIds: nextMap });
        void queueDocumentThemeWrite(nextMap).catch(reportDocumentThemeWriteError);
        scheduleCloudSync();
      },
      removeDocumentThemePaths: (path) => {
        const state = useStore.getState();
        const nextMap = removeDocumentThemes(state.documentThemeIds, path);
        if (documentThemeMapsEqual(state.documentThemeIds, nextMap)) return;
        set({ documentThemeIds: nextMap });
        void queueDocumentThemeWrite(nextMap).catch(reportDocumentThemeWriteError);
        scheduleCloudSync();
      },
      setCodeTheme: (codeThemeId) => set({ codeThemeId }),
      setThemes: (themes) => set((state) => ({
        themes,
        // documentThemeIds 保存文章真正选择的 ID；本机缺少该自定义主题时，
        // markdownThemeId 只回退为默认用于展示，不反向污染同步映射。
        markdownThemeId: effectiveThemeIdForDocument({ ...state, themes }, state.currentDocPath)
      })),
      setCurrentDocPath: (currentDocPath) => set({ currentDocPath }),
      setSelectedPath: (selectedPath) => set({ selectedPath }),
      setPreviewMode: (previewMode) => set({ previewMode }),
      setWorkspaceSplitRatio: (workspaceSplitRatio) => set({ workspaceSplitRatio: sanitizeWorkspaceSplitRatio(workspaceSplitRatio) }),
      setAppearanceMode: (appearanceMode) => set({ appearanceMode: sanitizeAppearanceMode(appearanceMode) }),
      setColorScheme: (colorScheme) => set({ colorScheme: sanitizeColorScheme(colorScheme) }),
      setBackgroundImagePath: (backgroundImagePath) => set({ backgroundImagePath: sanitizeBackgroundImagePath(backgroundImagePath) }),
      setBackgroundBlur: (backgroundBlur) => set({ backgroundBlur: sanitizeBackgroundBlur(backgroundBlur) }),
      setStatusBarOpacity: (statusBarOpacity) => set({ statusBarOpacity: sanitizeStatusBarOpacity(statusBarOpacity) }),
      toggleAppearanceMode: () => set((s) => ({ appearanceMode: s.appearanceMode === "light" ? "dark" : "light" })),
      toggleFavoriteTheme: (id) => set((s) => ({
        favoriteThemeIds: s.favoriteThemeIds.includes(id) ? s.favoriteThemeIds.filter((themeId) => themeId !== id) : [...s.favoriteThemeIds, id]
      })),
      togglePinnedCodeTheme: (id) => set((s) => ({
        pinnedCodeThemeIds: s.pinnedCodeThemeIds.includes(id) ? s.pinnedCodeThemeIds.filter((themeId) => themeId !== id) : [...s.pinnedCodeThemeIds, id]
      })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleOutline: () => set((s) => ({ outlineOpen: !s.outlineOpen })),
      loadTree: async () => {
        const tree = await listDocuments();
        set({ tree });
      },
      openDocument: async (path) => {
        await flushSave();
        await flushDocumentThemeWrite().catch(() => void 0);
        const text = await readDocument(path);
        const state = useStore.getState();
        let map = state.documentThemeIds;
        let migrationThemeId = state.themeMapMigrationThemeId;
        let storedThemeId = map[path];
        if (!storedThemeId && migrationThemeId) {
          storedThemeId = migrationThemeId;
          map = setDocumentTheme(map, path, storedThemeId);
          migrationThemeId = null;
          if (state.documentThemeMapExists) {
            void queueDocumentThemeWrite(map).catch(reportDocumentThemeWriteError);
          }
          scheduleCloudSync();
        }
        storedThemeId ??= defaultMarkdownTheme.id;
        set({
          currentDocPath: path,
          selectedPath: path,
          content: text,
          markdownThemeId: resolveAvailableThemeId(
            state.themes,
            storedThemeId,
            defaultMarkdownTheme.id
          ),
          documentThemeIds: map,
          themeMapMigrationThemeId: migrationThemeId,
          saveStatus: "saved",
          lastSavedAt: Date.now()
        });
      },
      runSyncNow: async () => {
        await flushSave();
        await flushCloudSync();
      }
    }),
    {
      name: "vellumstyle",
      // themes 是运行期扫描结果，不持久化；content 改由文件持久化，只记住打开哪篇。
      // documentThemeIds 同时写入本地状态作为启动缓存，真正的跨设备真相源是
      // documents/.vellumstyle-theme-map.json。
      partialize: (s) => ({
        currentDocPath: s.currentDocPath,
        markdownThemeId: s.markdownThemeId,
        documentThemeIds: s.documentThemeIds,
        themeMapMigrationThemeId: s.themeMapMigrationThemeId,
        documentThemeMapExists: s.documentThemeMapExists,
        codeThemeId: s.codeThemeId,
        previewMode: s.previewMode,
        workspaceSplitRatio: s.workspaceSplitRatio,
        appearanceMode: s.appearanceMode,
        colorScheme: s.colorScheme,
        backgroundImagePath: s.backgroundImagePath,
        backgroundBlur: s.backgroundBlur,
        statusBarOpacity: s.statusBarOpacity,
        favoriteThemeIds: s.favoriteThemeIds,
        pinnedCodeThemeIds: s.pinnedCodeThemeIds
      }),
      merge: (persisted, current) => {
        const saved = persisted;
        const hasDocumentThemeMap = Boolean(
          saved && Object.prototype.hasOwnProperty.call(saved, "documentThemeIds")
        );
        let documentThemeIds = sanitizeDocumentThemeMap(saved?.documentThemeIds);
        let themeMapMigrationThemeId = typeof saved?.themeMapMigrationThemeId === "string" ? saved.themeMapMigrationThemeId.trim() || null : null;
        if (!themeMapMigrationThemeId && saved?.themeMapMigrationPending) {
          const pendingId = typeof saved.markdownThemeId === "string" ? saved.markdownThemeId.trim() : "";
          themeMapMigrationThemeId = pendingId || null;
        }
        if (!hasDocumentThemeMap) {
          const legacyThemeId = typeof saved?.markdownThemeId === "string" ? saved.markdownThemeId : "";
          if (saved?.currentDocPath && legacyThemeId) {
            documentThemeIds = setDocumentTheme({}, saved.currentDocPath, legacyThemeId);
            themeMapMigrationThemeId = null;
          } else {
            themeMapMigrationThemeId = legacyThemeId && legacyThemeId !== defaultMarkdownTheme.id ? legacyThemeId : null;
          }
        }
        return {
          ...current,
          ...saved,
          documentThemeIds,
          themeMapMigrationThemeId,
          documentThemeMapExists: Boolean(saved?.documentThemeMapExists),
          workspaceSplitRatio: sanitizeWorkspaceSplitRatio(saved?.workspaceSplitRatio),
          appearanceMode: sanitizeAppearanceMode(saved?.appearanceMode),
          colorScheme: sanitizeColorScheme(saved?.colorScheme),
          backgroundImagePath: sanitizeBackgroundImagePath(saved?.backgroundImagePath),
          backgroundBlur: sanitizeBackgroundBlur(saved?.backgroundBlur),
          statusBarOpacity: sanitizeStatusBarOpacity(saved?.statusBarOpacity)
        };
      }
    }
  )
);

// src/markdown/converter.ts
import juice from "juice";

// src/utils/style.ts
var STYLE_IDS = {
  markdown: "markdown-theme"
};

// src/utils/imageProxy.ts
var isWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
var PROXY_PREFIX = isWindows ? "http://wximg.localhost/?url=" : "wximg://localhost/?url=";
function toProxyImageUrl(url) {
  return `${PROXY_PREFIX}${encodeURIComponent(url)}`;
}
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var PROXY_SRC = new RegExp(
  `(<img\\b[^>]*\\bsrc=)(["'])${escapeRe(PROXY_PREFIX)}([^"']*)\\2`,
  "gi"
);
function fromProxyHtml(html) {
  return html.replace(PROXY_SRC, (_m, pre, quote, encoded) => {
    return `${pre}${quote}${decodeURIComponent(encoded)}${quote}`;
  });
}

// src/markdown/mermaidExport.ts
var SVG_PRESENTATION_ATTRS = [
  ["fill", "fill"],
  ["stroke", "stroke"],
  ["strokeWidth", "stroke-width"],
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["fontWeight", "font-weight"],
  ["fontStyle", "font-style"],
  ["textAnchor", "text-anchor"],
  ["opacity", "opacity"]
];
var SVG_NS = "http://www.w3.org/2000/svg";
var MERMAID_DEFAULTS = {
  nodeFill: "#ECECFF",
  nodeStroke: "#9370DB",
  textFill: "#333333",
  lineStroke: "#333333",
  edgeLabelFill: "#ffffff",
  fontFamily: "trebuchet ms, verdana, arial, sans-serif",
  fontSize: "16px"
};
function defaultStyleReader(element) {
  const style = window.getComputedStyle(element);
  return {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAnchor: style.textAnchor,
    opacity: style.opacity
  };
}
function hasUsefulValue(value) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "normal" && normalized !== "auto";
}
function isTransparent(value) {
  return value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "rgba(0,0,0,0)";
}
function classListContains(element, className) {
  return element.classList?.contains(className) ?? false;
}
function mermaidFallbackStyle(element) {
  const tag = element.tagName.toLowerCase();
  if (classListContains(element, "flowchart-link")) {
    return { fill: "none", stroke: MERMAID_DEFAULTS.lineStroke, strokeWidth: "2px" };
  }
  if (classListContains(element, "arrowMarkerPath")) {
    return { fill: MERMAID_DEFAULTS.lineStroke, stroke: MERMAID_DEFAULTS.lineStroke };
  }
  if (classListContains(element, "background") && element.closest(".edgeLabels")) {
    return { fill: MERMAID_DEFAULTS.edgeLabelFill, stroke: "none" };
  }
  if (classListContains(element, "label-container") && element.closest(".node")) {
    return { fill: MERMAID_DEFAULTS.nodeFill, stroke: MERMAID_DEFAULTS.nodeStroke };
  }
  if (tag === "text" || tag === "tspan") {
    return {
      fill: MERMAID_DEFAULTS.textFill,
      color: MERMAID_DEFAULTS.textFill,
      fontFamily: MERMAID_DEFAULTS.fontFamily,
      fontSize: MERMAID_DEFAULTS.fontSize
    };
  }
  return {};
}
function mergeWithFallback(element, snapshot) {
  const fallback = mermaidFallbackStyle(element);
  return {
    ...fallback,
    ...Object.fromEntries(Object.entries(snapshot).filter(([, value]) => hasUsefulValue(value)))
  };
}
function applyPresentationAttributes(element, snapshot) {
  const merged = mergeWithFallback(element, snapshot);
  for (const [key, attr] of SVG_PRESENTATION_ATTRS) {
    const value = merged[key];
    if (!hasUsefulValue(value)) continue;
    if ((attr === "fill" || attr === "stroke") && isTransparent(value.trim().toLowerCase())) continue;
    element.setAttribute(attr, value);
  }
  if (!element.getAttribute("fill") && hasUsefulValue(merged.color)) {
    element.setAttribute("fill", merged.color);
  }
}
function appendStyle(element, style) {
  const current = element.getAttribute("style")?.trim();
  element.setAttribute("style", current ? `${current.replace(/;?\s*$/, ";")}${style}` : style);
}
function splitForeignObjectText(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text ? [text] : [];
  }
  if (!(node instanceof Element)) {
    return [];
  }
  const tag = node.tagName.toLowerCase();
  if (tag === "br") {
    return [""];
  }
  const lines = [];
  let current = "";
  for (const child of Array.from(node.childNodes)) {
    const childLines = splitForeignObjectText(child);
    for (const line of childLines) {
      if (line === "") {
        if (current.trim()) {
          lines.push(current.trim());
          current = "";
        }
        continue;
      }
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current.trim()) {
    lines.push(current.trim());
  }
  return lines;
}
function linesFromForeignObject(foreignObject) {
  const lines = Array.from(foreignObject.childNodes).flatMap((child) => splitForeignObjectText(child));
  return lines.map((line) => line.trim()).filter(Boolean);
}
function numericAttr(element, name) {
  const value = element.getAttribute(name);
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function replaceForeignObjectWithText(foreignObject) {
  const width = numericAttr(foreignObject, "width");
  const height = numericAttr(foreignObject, "height");
  const x = numericAttr(foreignObject, "x") + width / 2;
  const y = numericAttr(foreignObject, "y") + height / 2;
  const lines = linesFromForeignObject(foreignObject);
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("class", "nodeLabel");
  text.setAttribute("data-mermaid-converted-label", "true");
  for (const [index, line] of lines.entries()) {
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", String(x));
    tspan.setAttribute("text-anchor", "middle");
    tspan.setAttribute("data-mermaid-converted-label", "true");
    if (index === 0) {
      const offset = lines.length > 1 ? `${-0.6 * (lines.length - 1)}em` : "0";
      tspan.setAttribute("dy", offset);
    } else {
      tspan.setAttribute("dy", "1.2em");
    }
    tspan.textContent = line;
    text.appendChild(tspan);
  }
  foreignObject.replaceWith(text);
  return text;
}
function replaceForeignObjectsWithSvgText(svg) {
  for (const foreignObject of Array.from(svg.querySelectorAll("foreignObject"))) {
    replaceForeignObjectWithText(foreignObject);
  }
}
function removeEmptyStyleAttribute(element) {
  const style = element.getAttribute("style");
  if (style !== null && style.replace(/[;\s]/g, "") === "") {
    element.removeAttribute("style");
  }
}
function preserveConvertedLabelLayout(element) {
  if (element.getAttribute("data-mermaid-converted-label") !== "true") {
    return;
  }
  element.setAttribute("text-anchor", "middle");
  if (element.tagName.toLowerCase() === "text") {
    element.setAttribute("dominant-baseline", "middle");
  }
  element.removeAttribute("data-mermaid-converted-label");
}
function inlineMermaidSvgElementStylesForWechat(svg, readStyle2 = defaultStyleReader) {
  replaceForeignObjectsWithSvgText(svg);
  const elements = svg.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text,tspan");
  const entries = Array.from(elements).map((element) => ({
    element,
    snapshot: readStyle2(element)
  }));
  svg.querySelectorAll("style").forEach((style) => style.remove());
  appendStyle(svg, "max-width: 100%;height: auto;");
  for (const { element, snapshot } of entries) {
    removeEmptyStyleAttribute(element);
    applyPresentationAttributes(element, snapshot);
    preserveConvertedLabelLayout(element);
  }
}

// src/markdown/converter.ts
var DISPLAY_MATH_STYLE = "display:block;text-align:center;margin:1em 0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch";
var LINK_LEAF_STYLE_PROPS = /* @__PURE__ */ new Set([
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness"
]);
function readStyle(id) {
  const el = document.getElementById(id);
  return el ? el.innerText : "";
}
function upsertAttribute(attrs, name, update) {
  const re = new RegExp(`\\s${name}=(['"])([\\s\\S]*?)\\1`);
  const match = attrs.match(re);
  if (!match) {
    return `${attrs} ${name}="${update(null)}"`;
  }
  return attrs.replace(re, ` ${name}="${update(match[2])}"`);
}
function appendClass(attrs, className) {
  return upsertAttribute(attrs, "class", (value) => {
    const classes = (value ?? "").split(/\s+/).filter(Boolean);
    if (!classes.includes(className)) {
      classes.push(className);
    }
    return classes.join(" ");
  });
}
function appendStyle2(attrs, style) {
  return upsertAttribute(attrs, "style", (value) => {
    const current = value?.trim();
    return current ? `${current.replace(/;?\s*$/, ";")}${style}` : style;
  });
}
function linkLeafStyle(style) {
  return style.split(";").map((part) => part.trim()).filter(Boolean).filter((part) => {
    const name = part.split(":", 1)[0]?.trim().toLowerCase();
    return LINK_LEAF_STYLE_PROPS.has(name);
  }).join("; ");
}
function normalizeMathJaxForWechat(html) {
  return html.replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/g, "").replace(/class="mjx-solid"/g, 'fill="none" stroke-width="70"').replace(/<mjx-container\b([^>]*)>([\s\S]*?)<\/mjx-container>/g, (_match, attrs, body) => {
    if (/\sdisplay=(['"])true\1/.test(attrs)) {
      const nextAttrs = appendStyle2(appendClass(attrs, "block-equation"), DISPLAY_MATH_STYLE);
      return `<section${nextAttrs}>${body}</section>`;
    }
    return `<span${attrs}>${body}</span>`;
  }).replace(/\s<span class="inline/g, '&nbsp;<span class="inline').replace(/svg><\/span>\s/g, "svg></span>&nbsp;");
}
function normalizeLinksForWechat(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const link of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href")?.trim();
    if (!href) {
      continue;
    }
    const text = link.textContent?.trim();
    if (!text || link.querySelector("img,svg,video")) {
      continue;
    }
    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("data-linktype", "2");
    link.setAttribute("data-itemshowtype", "0");
    link.setAttribute("linktype", "text");
    link.setAttribute("textvalue", text);
    if (!link.classList.contains("normal_text_link")) {
      link.classList.add("normal_text_link");
    }
    if (isWechatArticleUrl(href)) {
      link.classList.add("mp_article_text_link");
      link.setAttribute("hasload", "1");
      link.removeAttribute("tab");
    } else if (isHttpUrl(href)) {
      link.setAttribute("tab", "outerlink");
    }
    if (link.parentElement?.getAttribute("leaf") !== "") {
      const leaf = doc.createElement("span");
      leaf.setAttribute("leaf", "");
      const linkStyle = link.getAttribute("style");
      if (linkStyle) {
        const leafStyle = linkLeafStyle(linkStyle);
        if (leafStyle) {
          leaf.setAttribute("style", leafStyle);
        }
      }
      link.replaceWith(leaf);
      leaf.appendChild(link);
    }
  }
  return doc.body.innerHTML;
}
function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function isWechatArticleUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === "mp.weixin.qq.com" && parsed.pathname.replace(/\/+$/, "") === "/s";
  } catch {
    return false;
  }
}
function stripPreviewArtifacts(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const overlay of Array.from(doc.querySelectorAll(".vs-image-resize-overlay"))) {
    overlay.remove();
  }
  for (const placeholder of Array.from(doc.querySelectorAll(".vs-video-placeholder"))) {
    placeholder.remove();
  }
  for (const placeholder of Array.from(doc.querySelectorAll(".vs-audio-placeholder"))) {
    placeholder.remove();
  }
  for (const voice of Array.from(
    doc.querySelectorAll("mpvoice[data-vs-audio-hidden], mp-common-mpaudio[data-vs-audio-hidden]")
  )) {
    voice.removeAttribute("data-vs-audio-hidden");
  }
  for (const iframe of Array.from(doc.querySelectorAll("iframe[data-vs-video-hidden]"))) {
    iframe.removeAttribute("data-vs-video-hidden");
    const savedSrc = iframe.getAttribute("data-vs-video-src");
    if (savedSrc && !iframe.hasAttribute("src")) {
      iframe.setAttribute("src", savedSrc);
    }
    iframe.removeAttribute("data-vs-video-src");
  }
  for (const element of Array.from(doc.querySelectorAll("[data-vs-image-index]"))) {
    element.removeAttribute("data-vs-image-index");
  }
  return doc.body.innerHTML;
}
function hasNonVideoContent(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const iframe of Array.from(doc.querySelectorAll("iframe.video_iframe"))) {
    iframe.remove();
  }
  if (doc.body.querySelector("img, mpvoice, mp-common-mpaudio")) {
    return true;
  }
  const visibleText = (doc.body.textContent ?? "").replace(/\s/g, "");
  return visibleText.length > 0;
}
function cloneBoxWithWechatSafeMermaid(box) {
  const clone = box.cloneNode(true);
  const sourceSvgs = Array.from(box.querySelectorAll("pre.mermaid svg"));
  const cloneSvgs = Array.from(clone.querySelectorAll("pre.mermaid svg"));
  cloneSvgs.forEach((svg, index) => {
    const sourceSvg = sourceSvgs[index];
    inlineMermaidSvgElementStylesForWechat(svg, sourceSvg ? (element) => {
      const path = elementPathWithinSvg(svg, element);
      const sourceElement = path ? elementAtPath(sourceSvg, path) : null;
      const target = sourceElement ?? element;
      const style = window.getComputedStyle(target);
      return {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textAnchor: style.textAnchor,
        opacity: style.opacity
      };
    } : void 0);
  });
  return clone;
}
function elementPathWithinSvg(svg, element) {
  const path = [];
  let current = element;
  while (current && current !== svg) {
    const parent = current.parentElement;
    if (!parent) return null;
    path.unshift(Array.from(parent.children).indexOf(current));
    current = parent;
  }
  return current === svg ? path : null;
}
function elementAtPath(root, path) {
  let current = root;
  for (const index of path) {
    const next = current.children.item(index);
    if (!next) return null;
    current = next;
  }
  return current;
}
function solveHtml() {
  const box = document.getElementById(ARTICLE_BOX_ID);
  if (!box) {
    return "";
  }
  const articleRoot = box.children[0];
  if (articleRoot) {
    for (const item of Array.from(articleRoot.children)) {
      if (item.tagName.toLowerCase() === "iframe") continue;
      item.setAttribute("data-tool", "vellumstyle");
    }
  }
  const exportBox = cloneBoxWithWechatSafeMermaid(box);
  let html = exportBox.innerHTML;
  html = fromProxyHtml(html);
  html = html.replace(/\s*data-line="\d+"/g, "");
  html = stripPreviewArtifacts(html);
  html = normalizeMathJaxForWechat(html);
  const allCss = readStyle(STYLE_IDS.markdown);
  try {
    const inlined = juice.inlineContent(html, allCss, {
      inlinePseudoElements: true,
      preserveImportant: true
    });
    return normalizeLinksForWechat(inlined);
  } catch (e) {
    console.error("CSS \u5185\u8054\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 CSS \u662F\u5426\u6B63\u786E", e);
    return "";
  }
}
function solveDraftHtml() {
  return normalizeDraftLists(solveHtml());
}
function normalizeDraftLists(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const li of Array.from(doc.querySelectorAll("li"))) {
    if (!hasMeaningfulListContent(li)) {
      li.remove();
    }
  }
  for (const list of Array.from(doc.querySelectorAll("ul, ol"))) {
    for (const child of Array.from(list.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE || child.tagName.toLowerCase() !== "li") {
        list.removeChild(child);
      }
    }
  }
  return doc.body.innerHTML;
}
function hasMeaningfulListContent(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.textContent?.trim());
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  const element = node;
  const tag = element.tagName.toLowerCase();
  if (tag === "br") {
    return false;
  }
  if (["img", "svg", "video", "table"].includes(tag)) {
    return true;
  }
  return Array.from(element.childNodes).some(hasMeaningfulListContent);
}

// src/markdown/mathjax.ts
function waitForMathJaxIdle() {
  return globalThis.__PUBLISH_TEST_MATHJAX_IDLE__ ?? Promise.resolve();
}

// src/utils/publish.ts
import { invoke as invoke4 } from "@tauri-apps/api/core";

// src/utils/upload.ts
import { invoke as invoke3 } from "@tauri-apps/api/core";

// src/utils/imageUploadTasks.ts
import { listen } from "@tauri-apps/api/event";
var listeners2 = /* @__PURE__ */ new Set();
var tasks = [];
var fallbackId = 0;
var FINISHED_RETENTION_MS = 6e4;
function emit2() {
  for (const listener of listeners2) listener();
}
function replaceTask(id, update) {
  let changed = false;
  tasks = tasks.map((task) => {
    if (task.id !== id) return task;
    changed = true;
    return update(task);
  });
  if (changed) emit2();
}
function newTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `image-upload-${Date.now()}-${fallbackId}`;
}
function trimHistory(items2) {
  const active = items2.filter((task) => task.status === "active");
  const finished = items2.filter((task) => task.status !== "active").slice(0, 50);
  return [...active, ...finished].sort((a, b) => b.startedAt - a.startedAt);
}
var imageUploadTasks = {
  start(filename, category, context = {}) {
    const id = newTaskId();
    const now = Date.now();
    tasks = trimHistory([
      {
        id,
        filename: filename || "\u56FE\u7247",
        category,
        documentPath: context.documentPath || void 0,
        documentTitle: context.documentTitle,
        phase: "reading",
        status: "active",
        startedAt: now,
        updatedAt: now
      },
      ...tasks
    ]);
    emit2();
    return id;
  },
  progress(event) {
    replaceTask(event.taskId, (task) => ({
      ...task,
      filename: event.filename || task.filename,
      phase: event.phase,
      originalSize: event.originalSize ?? task.originalSize,
      outputSize: event.outputSize ?? task.outputSize,
      updatedAt: Date.now()
    }));
  },
  complete(id) {
    const now = Date.now();
    let changed = false;
    tasks = tasks.map((task) => {
      if (task.id === id) {
        changed = true;
        return {
          ...task,
          phase: "completed",
          status: "success",
          updatedAt: now,
          expiresAt: now + FINISHED_RETENTION_MS
        };
      }
      if (task.status === "success") {
        return { ...task, expiresAt: now + FINISHED_RETENTION_MS };
      }
      return task;
    });
    tasks = trimHistory(tasks);
    if (changed) emit2();
  },
  fail(id, error) {
    const message = typeof error === "string" ? error : error?.message || "\u56FE\u7247\u4E0A\u4F20\u5931\u8D25";
    const now = Date.now();
    let changed = false;
    tasks = tasks.map((task) => {
      if (task.id === id) {
        changed = true;
        return {
          ...task,
          phase: "failed",
          status: "error",
          error: message,
          updatedAt: now,
          expiresAt: void 0
        };
      }
      if (task.status === "success") {
        return { ...task, expiresAt: now + FINISHED_RETENTION_MS };
      }
      return task;
    });
    tasks = trimHistory(tasks);
    if (changed) emit2();
  },
  clearFinished() {
    tasks = tasks.filter((task) => task.status === "active");
    emit2();
  },
  remapDocumentPaths(fromPath, toPath) {
    let changed = false;
    tasks = tasks.map((task) => {
      if (!task.documentPath) return task;
      const nextPath = task.documentPath === fromPath ? toPath : task.documentPath.startsWith(`${fromPath}/`) ? `${toPath}${task.documentPath.slice(fromPath.length)}` : null;
      if (nextPath === null) return task;
      changed = true;
      return { ...task, documentPath: nextPath, documentTitle: nextPath.split("/").pop() };
    });
    if (changed) emit2();
  },
  pruneExpired(now = Date.now()) {
    if (tasks.some((task) => task.status === "active")) return;
    const next = tasks.filter((task) => task.expiresAt === void 0 || task.expiresAt > now);
    if (next.length === tasks.length) return;
    tasks = next;
    emit2();
  },
  getSnapshot() {
    return tasks;
  },
  subscribe(listener) {
    listeners2.add(listener);
    return () => listeners2.delete(listener);
  }
};

// src/utils/upload.ts
var MAX_IMAGE_SOURCE_SIZE = 50 * 1024 * 1024;

// src/utils/markdownMediaScanner.ts
import MarkdownIt from "markdown-it";
var VIDEO_EXT = /\.(?:mp4|mov|m4v|webm|avi|mkv)(?:[?#].*)?$/i;
var MARKDOWN_IMAGE_RE = /!\[([^\]\\]*(?:\\.[^\]\\]*)*)\]\(([^)\n]+)\)/g;
var MARKDOWN_LINK_RE = /(?<!!)\[([^\]\\]*(?:\\.[^\]\\]*)*)\]\(([^)\n]+)\)/g;
var OBSIDIAN_EMBED_RE = /!\[\[([^\]\n]+)\]\]/g;
var markdownIt = new MarkdownIt({ html: true });
function scanMarkdownMedia(markdown) {
  const ignoredRanges = findIgnoredCodeRanges(markdown);
  const refs = [];
  refs.push(...scanMarkdownImages(markdown));
  refs.push(...scanHtmlMedia(markdown));
  refs.push(...scanObsidianEmbeds(markdown));
  refs.push(...scanMarkdownVideoLinks(markdown));
  return dedupeRefs(refs).filter((ref) => !ignoredRanges.some((range) => overlapsRange(ref, range))).sort((a, b) => a.start - b.start);
}
function findIgnoredCodeRanges(markdown) {
  const tokens = markdownIt.parse(markdown, {});
  const lineStarts = findLineStarts(markdown);
  const ranges = [];
  for (const token of tokens) {
    if (!token.map) continue;
    const tokenRange = sourceRangeFromLineMap(token.map, lineStarts, markdown.length);
    if (token.type === "fence" || token.type === "code_block") {
      ranges.push(tokenRange);
      continue;
    }
    const source = markdown.slice(tokenRange.start, tokenRange.end);
    if (token.type === "html_block") {
      const htmlCodeRanges = findHtmlCodeRanges(source);
      if (/^\s*<pre\b/i.test(token.content)) {
        const blockPreStart = findHtmlTags(source).find((tag) => tag.name === "pre" && !tag.closing)?.start;
        const closedBlockPre = htmlCodeRanges.find((range) => range.start === blockPreStart);
        if (!closedBlockPre) ranges.push(tokenRange);
      }
      ranges.push(...shiftRanges(htmlCodeRanges, tokenRange.start));
      continue;
    }
    if (token.type === "inline") {
      ranges.push(...shiftRanges(findInlineCodeRanges(source), tokenRange.start));
      ranges.push(...shiftRanges(findHtmlCodeRanges(source), tokenRange.start));
    }
  }
  return mergeRanges(ranges);
}
function shiftRanges(ranges, offset) {
  return ranges.map((range) => ({ start: offset + range.start, end: offset + range.end }));
}
function findHtmlTags(source) {
  const tagPattern = /<\/?([A-Za-z][A-Za-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  return [...source.matchAll(tagPattern)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    name: match[1].toLowerCase(),
    closing: match[0].startsWith("</"),
    source: match[0]
  }));
}
function findHtmlCodeRanges(source) {
  const openTags = /* @__PURE__ */ new Map();
  const ranges = [];
  for (const htmlTag of findHtmlTags(source)) {
    if (htmlTag.name !== "code" && htmlTag.name !== "pre") continue;
    if (isEscapedAt(source, htmlTag.start)) continue;
    const stack = openTags.get(htmlTag.name) ?? [];
    if (!htmlTag.closing) {
      stack.push(htmlTag);
      openTags.set(htmlTag.name, stack);
      continue;
    }
    const opener = stack.pop();
    if (opener) ranges.push({ start: opener.start, end: htmlTag.end });
  }
  return ranges;
}
function findLineStarts(markdown) {
  const starts = [0];
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] === "\n") starts.push(i + 1);
  }
  return starts;
}
function sourceRangeFromLineMap(map, lineStarts, sourceLength) {
  return {
    start: lineStarts[map[0]] ?? sourceLength,
    end: lineStarts[map[1]] ?? sourceLength
  };
}
function findInlineCodeRanges(markdown) {
  const runs = [];
  const runIndicesByLength = /* @__PURE__ */ new Map();
  const htmlTags = findHtmlTags(markdown);
  let htmlTagIndex = 0;
  let offset = 0;
  while (offset < markdown.length) {
    while (htmlTags[htmlTagIndex]?.end <= offset) htmlTagIndex++;
    const htmlTag = htmlTags[htmlTagIndex];
    if (htmlTag && htmlTag.start <= offset) {
      offset = htmlTag.end;
      continue;
    }
    if (markdown[offset] !== "`") {
      offset++;
      continue;
    }
    const start = offset;
    while (offset < markdown.length && markdown[offset] === "`") offset++;
    const run = { start, end: offset, length: offset - start, escaped: isEscapedAt(markdown, start) };
    runs.push(run);
    const indices = runIndicesByLength.get(run.length) ?? [];
    indices.push(runs.length - 1);
    runIndicesByLength.set(run.length, indices);
  }
  const ranges = [];
  for (let i = 0; i < runs.length; ) {
    const run = runs[i];
    const openerLength = run.length - (run.escaped ? 1 : 0);
    if (openerLength === 0) {
      i++;
      continue;
    }
    const closerIndex = findNextRunIndex(runIndicesByLength.get(openerLength), i);
    if (closerIndex === void 0) {
      i++;
      continue;
    }
    ranges.push({ start: run.end - openerLength, end: runs[closerIndex].end });
    i = closerIndex + 1;
  }
  return ranges;
}
function findNextRunIndex(indices, currentIndex) {
  if (!indices) return void 0;
  let low = 0;
  let high = indices.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (indices[middle] <= currentIndex) low = middle + 1;
    else high = middle;
  }
  return indices[low];
}
function isEscapedAt(source, offset) {
  let backslashCount = 0;
  for (let i = offset - 1; i >= 0 && source[i] === "\\"; i--) backslashCount++;
  return backslashCount % 2 === 1;
}
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
function overlapsRange(ref, range) {
  return ref.start < range.end && range.start < ref.end;
}
function classifyMediaSource(url) {
  const value = url.trim();
  if (!value) return "empty";
  if (value.startsWith("#")) return "anchor";
  if (/^data:/i.test(value)) return "data";
  if (/^blob:/i.test(value)) return "blob";
  if (/^(https?):\/\//i.test(value)) return "remote";
  if (/^\/\//.test(value)) return "remote";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return "unsupported";
  return "local";
}
function isVideoUrl(url) {
  return VIDEO_EXT.test(stripUrlDecorations(url));
}
function scanMarkdownImages(markdown) {
  const refs = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const rawInner = match[2];
    const parsed = parseMarkdownDestination(rawInner);
    if (!parsed) continue;
    const matchStart = match.index ?? 0;
    const innerStart = matchStart + match[0].indexOf(rawInner);
    refs.push({
      start: innerStart + parsed.urlStart,
      end: innerStart + parsed.urlEnd,
      originalUrl: parsed.url,
      mediaType: isVideoUrl(parsed.url) ? "video" : "image",
      sourceType: classifyMediaSource(parsed.url),
      syntax: "markdown-image",
      replacementMode: "url"
    });
  }
  return refs;
}
function scanMarkdownVideoLinks(markdown) {
  const refs = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const rawInner = match[2];
    const parsed = parseMarkdownDestination(rawInner);
    if (!parsed || !isVideoUrl(parsed.url)) continue;
    const matchStart = match.index ?? 0;
    const innerStart = matchStart + match[0].indexOf(rawInner);
    refs.push({
      start: innerStart + parsed.urlStart,
      end: innerStart + parsed.urlEnd,
      originalUrl: parsed.url,
      mediaType: "video",
      sourceType: classifyMediaSource(parsed.url),
      syntax: "markdown-link",
      replacementMode: "url"
    });
  }
  return refs;
}
function scanHtmlMedia(markdown) {
  const refs = [];
  for (const htmlTag of findHtmlTags(markdown)) {
    if (htmlTag.closing || !["img", "video", "source"].includes(htmlTag.name)) continue;
    const src = htmlAttributeInfo(htmlTag.source, "src");
    if (!src) continue;
    const urlStart = htmlTag.start + src.start;
    const isImage = htmlTag.name === "img";
    refs.push({
      start: isImage ? htmlTag.start : urlStart,
      end: isImage ? htmlTag.end : urlStart + src.value.length,
      originalUrl: src.value,
      mediaType: isImage ? "image" : "video",
      sourceType: classifyMediaSource(src.value),
      syntax: isImage ? "html-img" : htmlTag.name === "video" ? "html-video" : "html-source",
      replacementMode: isImage ? "token" : "url",
      htmlImageMeta: isImage ? parseHtmlImageMeta(htmlTag.source) : void 0
    });
  }
  return refs;
}
function parseHtmlImageMeta(tag) {
  const alt = htmlAttribute(tag, "alt") ?? "";
  const width = htmlAttribute(tag, "width");
  const height = htmlAttribute(tag, "height");
  if (width !== void 0 || height !== void 0) {
    return { alt, width, height };
  }
  const style = htmlAttribute(tag, "style") ?? "";
  const zoom = /(?:^|;)\s*zoom\s*:\s*([^;]+)/i.exec(style)?.[1].trim();
  return { alt, width: zoom || void 0 };
}
function htmlAttributeInfo(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return void 0;
  const value = match[1] ?? match[2] ?? match[3] ?? "";
  const quote = match[1] !== void 0 ? '"' : match[2] !== void 0 ? "'" : void 0;
  const relativeStart = quote ? match[0].indexOf(quote) + 1 : match[0].lastIndexOf(value);
  return { value, start: match.index + relativeStart };
}
function htmlAttribute(tag, name) {
  return htmlAttributeInfo(tag, name)?.value;
}
function scanObsidianEmbeds(markdown) {
  const refs = [];
  for (const match of markdown.matchAll(OBSIDIAN_EMBED_RE)) {
    const body = match[1].trim();
    const meta = parseObsidianBody(body);
    const target = meta.target;
    if (!target) continue;
    refs.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      originalUrl: target,
      mediaType: isVideoUrl(target) ? "video" : "image",
      sourceType: classifyMediaSource(target),
      syntax: "obsidian-embed",
      replacementMode: "token",
      obsidianMeta: meta
    });
  }
  return refs;
}
function parseMarkdownDestination(value) {
  let i = 0;
  while (i < value.length && /\s/.test(value[i])) i++;
  if (i >= value.length) return null;
  if (value[i] === "<") {
    const close = value.indexOf(">", i + 1);
    if (close === -1) return null;
    return { url: value.slice(i + 1, close), urlStart: i + 1, urlEnd: close };
  }
  const start = i;
  const mediaUrlEnd = findMediaPathEnd(value, start);
  if (mediaUrlEnd) {
    const url2 = value.slice(start, mediaUrlEnd).trim();
    return { url: url2, urlStart: start, urlEnd: start + url2.length };
  }
  let inQuote = null;
  while (i < value.length) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== "\\") {
      inQuote = inQuote === ch ? null : inQuote ?? ch;
    }
    if (!inQuote && /\s/.test(ch)) break;
    i++;
  }
  const url = value.slice(start, i).trim();
  if (!url) return null;
  return { url, urlStart: start, urlEnd: start + url.length };
}
function findMediaPathEnd(value, start) {
  const rest = value.slice(start);
  const match = rest.match(/^.+?\.(?:jpe?g|png|gif|mp4|mov|m4v|webm|avi|mkv)(?:[?#][^\s]*)?/i);
  if (!match) return null;
  return start + match[0].length;
}
function parseObsidianBody(body) {
  const [targetPart, ...rest] = body.split("|");
  const target = targetPart.trim();
  const hint = rest.join("|").trim();
  const size = parseObsidianSize(hint);
  return {
    target,
    alt: size ? "" : hint,
    size
  };
}
function parseObsidianSize(hint) {
  if (/^\d+$/.test(hint)) return `${hint}x`;
  if (/^\d+x\d+$/.test(hint)) return hint;
  if (/^\d+x$/.test(hint)) return hint;
  if (/^x\d+$/.test(hint)) return hint;
  return void 0;
}
function dedupeRefs(refs) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const ref of refs) {
    const key = `${ref.start}:${ref.end}:${ref.syntax}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
function stripUrlDecorations(url) {
  return url.split(/[?#]/)[0];
}

// src/utils/publishSettings.ts
var PUBLISH_SETTINGS_STORAGE_KEY = "vellumstyle.publishSettings";
var DEFAULT_PUBLISH_SETTINGS = {
  author: "",
  needOpenComment: 0,
  onlyFansCanComment: 0
};
function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
function isCommentFlag(value) {
  return value === 0 || value === 1;
}
function loadPublishSettings(storage = getBrowserStorage()) {
  if (!storage) return DEFAULT_PUBLISH_SETTINGS;
  try {
    const raw = storage.getItem(PUBLISH_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_PUBLISH_SETTINGS;
    const parsed = JSON.parse(raw);
    if (typeof parsed.author !== "string" || !isCommentFlag(parsed.needOpenComment) || !isCommentFlag(parsed.onlyFansCanComment)) {
      return DEFAULT_PUBLISH_SETTINGS;
    }
    return {
      author: parsed.author,
      needOpenComment: parsed.needOpenComment,
      onlyFansCanComment: parsed.onlyFansCanComment
    };
  } catch {
    return DEFAULT_PUBLISH_SETTINGS;
  }
}
function savePublishSettings(settings, storage = getBrowserStorage()) {
  if (!storage) return;
  try {
    storage.setItem(
      PUBLISH_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        author: settings.author,
        needOpenComment: settings.needOpenComment,
        onlyFansCanComment: settings.onlyFansCanComment
      })
    );
  } catch {
  }
}

// src/utils/publish.ts
var MMBIZ_HOSTS = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];
function findUnuploadedImages(markdown) {
  const diagnostics = [];
  const lineStarts = findLineStarts2(markdown);
  for (const ref of scanMarkdownMedia(markdown)) {
    if (ref.mediaType !== "image") continue;
    const reason = unuploadedImageReason(ref);
    if (!reason) continue;
    const position = sourcePosition(lineStarts, ref.start);
    diagnostics.push({
      url: ref.originalUrl,
      ...position,
      sourceType: ref.sourceType,
      syntax: ref.syntax,
      reason
    });
  }
  return diagnostics;
}
async function uploadThumb(file, context = {}) {
  if (file.size > MAX_IMAGE_SOURCE_SIZE) {
    throw new Error("\u539F\u59CB\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC7 50MB");
  }
  const taskId = imageUploadTasks.start(file.name || "thumb", "\u5C01\u9762\u56FE\u7247", context);
  try {
    const buf = await file.arrayBuffer();
    const mediaId = await invoke4("upload_thumb", new Uint8Array(buf), {
      headers: {
        "x-vellum-filename": encodeURIComponent(file.name || "thumb"),
        "x-vellum-mime": file.type,
        "x-vellum-task-id": taskId
      }
    });
    imageUploadTasks.complete(taskId);
    return mediaId;
  } catch (error) {
    imageUploadTasks.fail(taskId, error);
    throw error;
  }
}
function listImageMaterials(offset, count) {
  return invoke4("list_image_materials", { offset, count });
}
function getVideoPlayUrl(mediaId) {
  return invoke4("get_video_play_url", { mediaId });
}
function addDraft(title, content, thumbMediaId, settings = DEFAULT_PUBLISH_SETTINGS) {
  return invoke4("add_draft", {
    title,
    content,
    thumbMediaId,
    author: settings.author,
    needOpenComment: settings.needOpenComment,
    onlyFansCanComment: settings.onlyFansCanComment
  });
}
function normalizeRemoteImageUrl(url) {
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}
function parseRemoteImageUrl(url) {
  const normalized = normalizeRemoteImageUrl(url);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}
function unuploadedImageReason(ref) {
  switch (ref.sourceType) {
    case "local":
      return "local";
    case "remote": {
      const parsed = parseRemoteImageUrl(ref.originalUrl);
      if (!parsed) return "unsupported";
      return MMBIZ_HOSTS.includes(parsed.hostname.toLowerCase()) ? null : "external";
    }
    case "data":
    case "blob":
      return "temporary";
    case "anchor":
    case "empty":
    case "unsupported":
      return "unsupported";
  }
}
function findLineStarts2(markdown) {
  const lineStarts = [0];
  for (let index = 0; index < markdown.length; index++) {
    if (markdown[index] === "\n") lineStarts.push(index + 1);
  }
  return lineStarts;
}
function sourcePosition(lineStarts, start) {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= start) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: start - lineStarts[low] + 1 };
}

// src/components/Preview/previewPlayback.ts
var playingVoiceAudio = null;
var playingVoicePlaceholder = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "play",
    (event) => {
      const target = event.target;
      console.log(
        "[\u9884\u89C8\u64AD\u653E\u8BCA\u65AD] play \u89E6\u53D1:",
        target?.className || target?.tagName || "unknown",
        "at",
        (/* @__PURE__ */ new Date()).toISOString()
      );
    },
    true
  );
}
function errorMessage(error) {
  return typeof error === "string" ? error : error?.message || "\u672A\u77E5\u9519\u8BEF";
}
async function playPreviewVideo(placeholder, mediaId) {
  let src;
  try {
    src = await getVideoPlayUrl(mediaId);
  } catch (error) {
    toast.show(`\u89C6\u9891\u52A0\u8F7D\u5931\u8D25\uFF1A${errorMessage(error)}`, "error");
    return;
  }
  placeholder.dataset.vsMediaId = mediaId;
  const video = document.createElement("video");
  video.src = src;
  video.controls = true;
  video.autoplay = true;
  video.className = "vs-video-placeholder-player";
  video.setAttribute("playsinline", "");
  placeholder.replaceChildren(video);
}
function restoreVideoPlaceholder(placeholder) {
  const mediaId = placeholder.dataset.vsMediaId ?? "";
  const play = document.createElement("span");
  play.className = "vs-video-placeholder-play";
  play.setAttribute("aria-hidden", "true");
  const hint = document.createElement("span");
  hint.className = "vs-video-placeholder-hint";
  hint.textContent = mediaId ? "\u70B9\u51FB\u64AD\u653E\u672C\u5730\u9884\u89C8 \xB7 \u53D1\u5E03\u540E\u663E\u793A\u5B98\u65B9\u64AD\u653E\u5668" : "\u672C\u5730\u9884\u89C8\u4E0D\u64AD\u653E \xB7 \u53D1\u5E03\u540E\u663E\u793A\u64AD\u653E\u5668";
  placeholder.replaceChildren(play, hint);
  if (mediaId) {
    play.setAttribute("role", "button");
    play.setAttribute("aria-label", "\u64AD\u653E\u7D20\u6750\u5E93\u89C6\u9891");
    play.style.cursor = "pointer";
    play.addEventListener("click", (event) => {
      event.stopPropagation();
      void playPreviewVideo(placeholder, mediaId);
    });
  }
}
function stopLocalMediaPlayback() {
  playingVoiceAudio?.pause();
  playingVoiceAudio?.removeAttribute("src");
  playingVoiceAudio = null;
  playingVoicePlaceholder = null;
  for (const video of Array.from(document.querySelectorAll(".vs-video-placeholder-player"))) {
    const placeholder = video.parentElement;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (placeholder && placeholder.classList.contains("vs-video-placeholder")) {
      restoreVideoPlaceholder(placeholder);
    }
  }
}

// src/components/Publish/PublishDialog.tsx
import { FileText, Globe2, ImageIcon, Library, Loader2 as Loader22, MessageCircle, MessageCircleOff, RefreshCw, UploadCloud, UserRound, Users } from "lucide-react";

// src/components/ui/Dialog.tsx
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

// src/utils/motion.ts
var MOTION_DURATION_FAST = 0.13;
var MOTION_SPRING_POP = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.9
};

// src/components/ui/Dialog.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Dialog({
  open,
  title,
  onClose,
  closeOnOverlay = true,
  closeDisabled = false,
  width = 440,
  children,
  footer,
  headerActions,
  contentPadding = true
}) {
  return createPortal(
    /* @__PURE__ */ jsx(AnimatePresence, { children: open && /* @__PURE__ */ jsx(
      motion.div,
      {
        className: "fixed inset-0 z-[2000] flex items-center justify-center",
        style: { background: "rgba(20,20,30,0.4)" },
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: MOTION_DURATION_FAST },
        onClick: closeOnOverlay && !closeDisabled ? onClose : void 0,
        children: /* @__PURE__ */ jsxs(
          motion.div,
          {
            className: "flex max-h-[86vh] flex-col overflow-hidden rounded bg-bg shadow-md",
            style: { width, maxWidth: "90vw" },
            initial: { opacity: 0, scale: 0.96, y: 8 },
            animate: { opacity: 1, scale: 1, y: 0 },
            exit: { opacity: 0, scale: 0.96, y: 8 },
            transition: MOTION_SPRING_POP,
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxs("div", { "data-dialog-header": true, className: "flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-1.5 text-sm font-semibold text-text", children: [
                /* @__PURE__ */ jsx("span", { className: "min-w-0", children: title }),
                /* @__PURE__ */ jsxs("div", { className: "flex flex-none items-center gap-2", children: [
                  headerActions,
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: onClose,
                      disabled: closeDisabled,
                      "aria-disabled": closeDisabled || void 0,
                      title: "\u5173\u95ED",
                      className: "inline-flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast outline-none hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-text-muted",
                      children: /* @__PURE__ */ jsx(X, { size: 16 })
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { className: `min-h-0 flex-1 ${contentPadding ? "overflow-y-auto p-4" : "overflow-hidden"}`, children }),
              footer && /* @__PURE__ */ jsx("div", { className: "flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3", children: footer })
            ]
          }
        )
      }
    ) }),
    document.body
  );
}

// src/components/ui/Button.tsx
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var base = "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-[13px] font-medium leading-none cursor-pointer transition-all duration-fast ease-smooth outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] active:scale-[0.97] disabled:cursor-default disabled:opacity-60";
var variants = {
  primary: "vs-btn-accent text-white border-0",
  secondary: "border border-transparent bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text",
  ghost: "bg-transparent text-text border-0 hover:bg-bg-tertiary",
  toolbar: "bg-bg-secondary text-text-secondary border-0 hover:bg-bg-tertiary hover:text-text"
};
var stateTone = {
  loading: "cursor-progress",
  success: "bg-success text-white border-0 hover:bg-success",
  error: "bg-danger text-white border-0 hover:bg-danger"
};
function Button({
  variant = "secondary",
  state = "idle",
  loadingText,
  successText,
  errorText,
  className = "",
  disabled,
  children,
  ...rest
}) {
  const tone = state !== "idle" ? stateTone[state] : variants[variant];
  const isDisabled = disabled || state === "loading";
  let content = children;
  if (state === "loading") {
    content = /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2(Loader2, { size: 14, className: "animate-spin" }),
      loadingText ?? children
    ] });
  } else if (state === "success") {
    content = /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2(Check, { size: 14, className: "vs-pop" }),
      successText ?? children
    ] });
  } else if (state === "error") {
    content = /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2(AlertCircle, { size: 14 }),
      errorText ?? children
    ] });
  }
  return /* @__PURE__ */ jsx2(
    "button",
    {
      className: `${base} ${tone} ${state === "error" ? "vs-shake" : ""} ${className}`,
      disabled: isDisabled,
      ...rest,
      children: content
    }
  );
}

// src/components/Publish/UnuploadedImagesWarning.tsx
import { useEffect, useId } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var reasonLabels = {
  local: "\u672C\u5730\u56FE\u7247",
  external: "\u5916\u90E8\u56FE\u7247",
  temporary: "\u4E34\u65F6\u56FE\u7247",
  unsupported: "\u4E0D\u652F\u6301\u7684\u56FE\u7247\u5730\u5740"
};
function UnuploadedImagesWarning({ items: items2, busy, onBack, onContinue, backButtonRef }) {
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onBack]);
  return /* @__PURE__ */ jsxs3("section", { role: "region", "aria-labelledby": titleId, "aria-describedby": descriptionId, className: "flex min-h-0 flex-col", children: [
    /* @__PURE__ */ jsxs3("div", { className: "border-b border-border px-5 py-4", children: [
      /* @__PURE__ */ jsx3("h2", { id: titleId, className: "text-base font-semibold text-danger", children: "\u53D1\u73B0\u672A\u4E0A\u4F20\u7684\u56FE\u7247" }),
      /* @__PURE__ */ jsx3("p", { id: descriptionId, className: "mt-1.5 text-sm leading-6 text-text-secondary", children: "\u4EE5\u4E0B\u56FE\u7247\u5C1A\u672A\u4E0A\u4F20\u5230\u5FAE\u4FE1\u7D20\u6750\u5E93\uFF0C\u4ECD\u7136\u53D1\u5E03\u540E\u53EF\u80FD\u65E0\u6CD5\u5728\u5FAE\u4FE1\u6587\u7AE0\u4E2D\u6B63\u5E38\u663E\u793A\u3002\u8BF7\u8FD4\u56DE\u68C0\u67E5\u5E76\u4E0A\u4F20\uFF0C\u6216\u786E\u8BA4\u98CE\u9669\u540E\u7EE7\u7EED\u3002" })
    ] }),
    /* @__PURE__ */ jsx3("ul", { className: "min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4", children: items2.map((item, index) => {
      const displayedUrl = item.url || "\uFF08\u7A7A\u5730\u5740\uFF09";
      return /* @__PURE__ */ jsxs3("li", { className: "rounded-sm border border-border bg-bg-secondary p-3", children: [
        /* @__PURE__ */ jsxs3("div", { className: "text-[13px] font-medium text-text", children: [
          "\u7B2C ",
          item.line,
          " \u884C \xB7 ",
          reasonLabels[item.reason]
        ] }),
        /* @__PURE__ */ jsx3("code", { title: item.url || void 0, className: "mt-1 block select-text break-all whitespace-pre-wrap text-xs leading-5 text-text-secondary", children: displayedUrl })
      ] }, `${item.line}-${item.column}-${index}`);
    }) }),
    /* @__PURE__ */ jsxs3("div", { className: "flex justify-end gap-2 border-t border-border px-5 py-3", children: [
      /* @__PURE__ */ jsx3("button", { ref: backButtonRef, type: "button", disabled: busy, onClick: onBack, className: "inline-flex h-8 items-center justify-center rounded-sm bg-bg-secondary px-3 text-[13px] font-medium text-text-secondary hover:bg-bg-tertiary focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60", children: "\u8FD4\u56DE\u68C0\u67E5" }),
      /* @__PURE__ */ jsx3(Button, { type: "button", disabled: busy, onClick: onContinue, className: "bg-danger text-white border-0 hover:bg-danger", children: "\u4ECD\u7136\u53D1\u5E03" })
    ] })
  ] });
}

// src/components/Publish/PublishDialog.tsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var MATERIAL_PAGE_SIZE = 20;
var PUBLISH_TRIGGER_ID = "publish-dialog-submit";
var titleInputShellClass = "group box-border flex h-11 items-center gap-2 rounded-lg border-2 border-solid border-[#b8baca] bg-bg-secondary px-3.5 text-text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_8px_22px_rgba(20,20,30,0.045)] transition-all duration-fast ease-smooth hover:border-[#9ea2b8] hover:bg-bg focus-within:border-[rgba(94,106,210,0.5)] focus-within:bg-bg focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_0_0_3px_rgba(94,106,210,0.10),0_10px_24px_rgba(20,20,30,0.06)]";
var titleInputClass = "h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-[inherit] text-[15px] text-text outline-none placeholder:text-text-muted";
var segmentedButtonClass = (active) => `inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold outline-none transition-all duration-fast ease-smooth focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${active ? "border-[rgba(94,106,210,0.42)] bg-bg text-accent shadow-[0_8px_18px_rgba(94,106,210,0.12)]" : "border-transparent bg-transparent text-text-secondary hover:bg-bg hover:text-text"}`;
function revokePreview(url) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
function mergeMaterialItems(existing, incoming) {
  const seen = new Set(existing.map((item) => item.mediaId));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.mediaId)) continue;
    seen.add(item.mediaId);
    merged.push(item);
  }
  return merged;
}
function formatMaterialTime(value) {
  if (!value) return "\u672A\u77E5\u65F6\u95F4";
  return new Date(value * 1e3).toLocaleDateString("zh-CN");
}
function PublishDialog({ open, onClose, onNeedSettings }) {
  const currentDocPath = useStore((s) => s.currentDocPath);
  const defaultTitle = currentDocPath ? currentDocPath.split("/").pop().replace(/\.md$/, "") : "\u672A\u547D\u540D";
  const [title, setTitle] = useState(defaultTitle);
  const [author, setAuthor] = useState("");
  const [needOpenComment, setNeedOpenComment] = useState(0);
  const [onlyFansCanComment, setOnlyFansCanComment] = useState(0);
  const [thumbId, setThumbId] = useState(null);
  const [thumbPreview, setThumbPreview] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [materialItems, setMaterialItems] = useState([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialLoaded, setMaterialLoaded] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [pubResult, setPubResult] = useState("none");
  const [imageWarning, setImageWarning] = useState(null);
  const fileRef = useRef(null);
  const leftPanelRef = useRef(null);
  const previewRef = useRef(null);
  const materialLoadingRef = useRef(false);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const nextOperationIdRef = useRef(0);
  const nextThumbUploadIdRef = useRef(0);
  const publishingRef = useRef(null);
  const terminalTimeoutRef = useRef(null);
  const warningBackButtonRef = useRef(null);
  const restorePublishFocusRef = useRef(false);
  const [materialPanelHeight, setMaterialPanelHeight] = useState(null);
  const commentsEnabled = needOpenComment === 1;
  previewRef.current = thumbPreview;
  const clearTerminalTimeout = useCallback(() => {
    if (terminalTimeoutRef.current === null) return;
    window.clearTimeout(terminalTimeoutRef.current);
    terminalTimeoutRef.current = null;
  }, []);
  const loadMaterialLibrary = useCallback(async (offset = 0) => {
    if (materialLoadingRef.current) return;
    materialLoadingRef.current = true;
    setMaterialLoading(true);
    setMaterialError(null);
    try {
      const page = await listImageMaterials(offset, MATERIAL_PAGE_SIZE);
      setMaterialTotal(page.totalCount);
      setMaterialItems((prev) => offset === 0 ? page.items : mergeMaterialItems(prev, page.items));
    } catch (e) {
      const msg = String(e);
      setMaterialError(msg);
      if (msg.includes("NOT_CONFIGURED")) {
        toast.show("\u5C1A\u672A\u914D\u7F6E\u5FAE\u4FE1\u56FE\u5E8A\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199", "error");
        onNeedSettings();
      } else {
        toast.show(`\u7D20\u6750\u5E93\u8BFB\u53D6\u5931\u8D25\uFF1A${msg}`, "error");
      }
    } finally {
      setMaterialLoaded(true);
      materialLoadingRef.current = false;
      setMaterialLoading(false);
    }
  }, [onNeedSettings]);
  useEffect2(() => {
    clearTerminalTimeout();
    sessionRef.current += 1;
    nextThumbUploadIdRef.current += 1;
    if (!open) {
      restorePublishFocusRef.current = false;
      setImageWarning(null);
      return;
    }
    const publishSettings = loadPublishSettings();
    setTitle(defaultTitle);
    setAuthor(publishSettings.author);
    setNeedOpenComment(publishSettings.needOpenComment);
    setOnlyFansCanComment(publishSettings.needOpenComment === 1 ? publishSettings.onlyFansCanComment : 0);
    setThumbId(null);
    setSelectedMaterialId(null);
    setMaterialItems([]);
    setMaterialTotal(0);
    setMaterialLoaded(false);
    materialLoadingRef.current = false;
    setMaterialLoading(false);
    setMaterialError(null);
    setThumbPreview((prev) => {
      revokePreview(prev);
      return null;
    });
    setBusy(publishingRef.current !== null);
    setThumbUploading(false);
    setPubResult("none");
    restorePublishFocusRef.current = false;
    setImageWarning(null);
    if (fileRef.current) fileRef.current.value = "";
    void loadMaterialLibrary(0);
  }, [open, defaultTitle, clearTerminalTimeout]);
  useLayoutEffect(() => {
    if (!open) return;
    if (imageWarning) {
      warningBackButtonRef.current?.focus();
      return;
    }
    if (restorePublishFocusRef.current) {
      restorePublishFocusRef.current = false;
      document.getElementById(PUBLISH_TRIGGER_ID)?.focus();
    }
  }, [imageWarning, open]);
  useEffect2(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      nextThumbUploadIdRef.current += 1;
      clearTerminalTimeout();
      revokePreview(previewRef.current);
    };
  }, [clearTerminalTimeout]);
  useLayoutEffect(() => {
    if (!open || typeof window.matchMedia !== "function") {
      setMaterialPanelHeight(null);
      return;
    }
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    let frame = 0;
    const updateMaterialPanelHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!mediaQuery.matches || !leftPanelRef.current) {
          setMaterialPanelHeight(null);
          return;
        }
        const nextHeight = Math.max(360, Math.ceil(leftPanelRef.current.getBoundingClientRect().height));
        setMaterialPanelHeight((prev) => prev === nextHeight ? prev : nextHeight);
      });
    };
    updateMaterialPanelHeight();
    const settleTimer = window.setTimeout(updateMaterialPanelHeight, 180);
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(updateMaterialPanelHeight) : null;
    if (resizeObserver) {
      if (leftPanelRef.current) resizeObserver.observe(leftPanelRef.current);
    }
    window.addEventListener("resize", updateMaterialPanelHeight);
    mediaQuery.addEventListener("change", updateMaterialPanelHeight);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateMaterialPanelHeight);
      mediaQuery.removeEventListener("change", updateMaterialPanelHeight);
    };
  }, [open]);
  const pickThumb = async (file) => {
    const operation = { id: ++nextThumbUploadIdRef.current, session: sessionRef.current };
    const isCurrentOperation = () => mountedRef.current && sessionRef.current === operation.session && nextThumbUploadIdRef.current === operation.id;
    setThumbUploading(true);
    try {
      const id = await uploadThumb(file, {
        documentPath: currentDocPath,
        documentTitle: defaultTitle
      });
      if (!isCurrentOperation()) return;
      setThumbId(id);
      setSelectedMaterialId(null);
      setThumbPreview((prev) => {
        revokePreview(prev);
        return URL.createObjectURL(file);
      });
    } catch (e) {
      if (isCurrentOperation()) handleThumbError(e);
    } finally {
      if (isCurrentOperation()) setThumbUploading(false);
    }
  };
  const pickMaterialThumb = (item) => {
    if (busy || thumbUploading) return;
    setThumbId(item.mediaId);
    setSelectedMaterialId(item.mediaId);
    setThumbPreview((prev) => {
      revokePreview(prev);
      return toProxyImageUrl(item.url);
    });
    toast.show("\u5DF2\u9009\u62E9\u7D20\u6750\u5E93\u56FE\u7247\u4F5C\u4E3A\u5C01\u9762", "info");
  };
  const handleThumbError = (error) => {
    const msg = String(error);
    if (msg.includes("NOT_CONFIGURED")) {
      toast.show("\u5C1A\u672A\u914D\u7F6E\u5FAE\u4FE1\u56FE\u5E8A\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199", "error");
      onNeedSettings();
    } else {
      toast.show(`\u5C01\u9762\u4E0A\u4F20\u5931\u8D25\uFF1A${msg}`, "error");
    }
  };
  const clearImageWarning = (restorePublishFocus = false) => {
    restorePublishFocusRef.current = restorePublishFocus;
    setImageWarning(null);
  };
  const handleClose = () => {
    clearTerminalTimeout();
    restorePublishFocusRef.current = false;
    setImageWarning(null);
    onClose();
  };
  const executePublish = async () => {
    if (!title.trim()) {
      toast.show("\u8BF7\u586B\u5199\u6807\u9898", "error");
      return;
    }
    if (!thumbId) {
      toast.show("\u8BF7\u9009\u62E9\u5C01\u9762\u56FE", "error");
      return;
    }
    if (publishingRef.current) return;
    clearTerminalTimeout();
    const operation = { id: ++nextOperationIdRef.current, session: sessionRef.current };
    publishingRef.current = operation;
    const isCurrentSession = () => mountedRef.current && sessionRef.current === operation.session;
    const isCurrentOperationGeneration = () => isCurrentSession() && nextOperationIdRef.current === operation.id;
    setBusy(true);
    setPubResult("none");
    try {
      await waitForMathJaxIdle();
      if (!isCurrentSession()) return;
      stopLocalMediaPlayback();
      const beforePaused = Array.from(
        document.querySelectorAll(".vs-video-placeholder-player")
      ).map((video) => video.paused);
      console.log("[\u53D1\u5E03\u8BCA\u65AD] \u5E8F\u5217\u5316\u524D\u9884\u89C8 video paused \u72B6\u6001:", beforePaused);
      const html = solveDraftHtml();
      const afterPaused = Array.from(
        document.querySelectorAll(".vs-video-placeholder-player")
      ).map((video) => video.paused);
      console.log("[\u53D1\u5E03\u8BCA\u65AD] \u5E8F\u5217\u5316\u540E\u9884\u89C8 video paused \u72B6\u6001:", afterPaused);
      if (!html.trim()) {
        toast.show("\u6B63\u6587\u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u53D1\u5E03", "error");
        return;
      }
      if (!hasNonVideoContent(html)) {
        toast.show(
          "\u5FAE\u4FE1\u8349\u7A3F\u63A5\u53E3\u4E0D\u652F\u6301\u4EC5\u542B\u89C6\u9891\u7684\u6587\u7AE0\uFF0C\u89C6\u9891\u4F1A\u88AB\u5FAE\u4FE1\u4E22\u5F03\u3002\u8BF7\u5148\u5728\u6587\u4E2D\u6DFB\u52A0\u6587\u5B57\u6216\u56FE\u7247\uFF0C\u518D\u53D1\u5E03\u3002",
          "error",
          5e3
        );
        return;
      }
      const publishSettings = {
        author: author.trim(),
        needOpenComment,
        onlyFansCanComment: commentsEnabled ? onlyFansCanComment : 0
      };
      savePublishSettings(publishSettings);
      await addDraft(title.trim(), html, thumbId, publishSettings);
      if (!isCurrentSession()) return;
      restorePublishFocusRef.current = false;
      setImageWarning(null);
      setPubResult("ok");
      const successTimeout = window.setTimeout(() => {
        if (terminalTimeoutRef.current !== successTimeout || !isCurrentOperationGeneration()) return;
        terminalTimeoutRef.current = null;
        toast.show("\u5DF2\u53D1\u5230\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1\uFF0C\u8BF7\u5728\u540E\u53F0\u786E\u8BA4\u6392\u7248\u540E\u53D1\u9001", "info", 4e3);
        handleClose();
      }, 900);
      terminalTimeoutRef.current = successTimeout;
    } catch (e) {
      if (!isCurrentSession()) return;
      restorePublishFocusRef.current = false;
      setImageWarning(null);
      setPubResult("fail");
      toast.show(`\u53D1\u5E03\u5931\u8D25\uFF1A${String(e)}`, "error");
      const failureTimeout = window.setTimeout(() => {
        if (terminalTimeoutRef.current !== failureTimeout || !isCurrentOperationGeneration()) return;
        terminalTimeoutRef.current = null;
        setPubResult("none");
      }, 2e3);
      terminalTimeoutRef.current = failureTimeout;
    } finally {
      if (publishingRef.current?.id === operation.id) {
        publishingRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  };
  const requestPublish = () => {
    if (thumbUploading) return;
    const contentSnapshot = useStore.getState().content;
    const diagnostics = findUnuploadedImages(contentSnapshot);
    if (diagnostics.length > 0) {
      setImageWarning({ contentSnapshot, diagnostics });
      return;
    }
    void executePublish();
  };
  const continuePublish = () => {
    if (!imageWarning || publishingRef.current !== null) return;
    const latestContent = useStore.getState().content;
    if (latestContent !== imageWarning.contentSnapshot) {
      const diagnostics = findUnuploadedImages(latestContent);
      if (diagnostics.length > 0) {
        setImageWarning({ contentSnapshot: latestContent, diagnostics });
      } else {
        clearImageWarning(true);
      }
      return;
    }
    void executePublish();
  };
  const publishState = pubResult === "ok" ? "success" : pubResult === "fail" ? "error" : busy ? "loading" : "idle";
  const openThumbPicker = () => {
    if (busy || thumbUploading) return;
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  };
  return /* @__PURE__ */ jsx4(Fragment2, { children: /* @__PURE__ */ jsx4(
    Dialog,
    {
      open,
      title: imageWarning ? "\u672A\u4E0A\u4F20\u56FE\u7247\u68C0\u67E5" : "\u53D1\u5E03\u5230\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1",
      onClose: handleClose,
      closeOnOverlay: false,
      closeDisabled: busy,
      width: "min(86vw,1040px)",
      footer: imageWarning ? void 0 : /* @__PURE__ */ jsxs4(Fragment2, { children: [
        /* @__PURE__ */ jsx4(Button, { type: "button", variant: "secondary", disabled: busy, onClick: handleClose, children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx4(
          Button,
          {
            id: PUBLISH_TRIGGER_ID,
            type: "button",
            variant: "primary",
            state: publishState,
            disabled: pubResult === "ok" || !thumbId || thumbUploading,
            loadingText: "\u53D1\u5E03\u4E2D\u2026",
            successText: "\u5DF2\u53D1\u5E03",
            errorText: "\u53D1\u5E03\u5931\u8D25",
            onClick: requestPublish,
            children: "\u53D1\u5E03\u5230\u8349\u7A3F\u7BB1"
          }
        )
      ] }),
      children: imageWarning ? /* @__PURE__ */ jsx4(
        UnuploadedImagesWarning,
        {
          items: imageWarning.diagnostics,
          busy,
          onBack: () => clearImageWarning(true),
          onContinue: continuePublish,
          backButtonRef: warningBackButtonRef
        }
      ) : /* @__PURE__ */ jsxs4("div", { className: "grid min-h-0 items-start gap-5 lg:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.05fr)]", children: [
        /* @__PURE__ */ jsxs4(
          "div",
          {
            ref: leftPanelRef,
            className: "flex min-w-0 flex-col gap-4 rounded border border-border bg-[linear-gradient(180deg,#fff_0%,#fbfbfd_100%)] p-4 shadow-sm",
            children: [
              /* @__PURE__ */ jsxs4("div", { children: [
                /* @__PURE__ */ jsx4("label", { htmlFor: "publish-title", className: "mb-2 block text-[13px] font-medium text-text-secondary", children: "\u6587\u7AE0\u6807\u9898" }),
                /* @__PURE__ */ jsxs4("div", { className: titleInputShellClass, children: [
                  /* @__PURE__ */ jsx4(FileText, { size: 16, className: "flex-none transition-colors duration-fast group-focus-within:text-accent" }),
                  /* @__PURE__ */ jsx4(
                    "input",
                    {
                      id: "publish-title",
                      value: title,
                      onChange: (e) => setTitle(e.target.value),
                      className: titleInputClass,
                      placeholder: "\u8F93\u5165\u516C\u4F17\u53F7\u6587\u7AE0\u6807\u9898"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs4("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxs4("div", { children: [
                  /* @__PURE__ */ jsx4("label", { htmlFor: "publish-author", className: "mb-2 block text-[13px] font-medium text-text-secondary", children: "\u4F5C\u8005" }),
                  /* @__PURE__ */ jsxs4("div", { className: titleInputShellClass, children: [
                    /* @__PURE__ */ jsx4(UserRound, { size: 16, className: "flex-none transition-colors duration-fast group-focus-within:text-accent" }),
                    /* @__PURE__ */ jsx4(
                      "input",
                      {
                        id: "publish-author",
                        value: author,
                        onChange: (e) => setAuthor(e.target.value),
                        className: titleInputClass,
                        placeholder: "\u53EF\u7559\u7A7A"
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "grid gap-3 sm:grid-cols-2", children: [
                  /* @__PURE__ */ jsxs4("fieldset", { className: "m-0 min-w-0 border-0 p-0", children: [
                    /* @__PURE__ */ jsx4("legend", { className: "mb-2 block text-[13px] font-medium text-text-secondary", children: "\u8BC4\u8BBA" }),
                    /* @__PURE__ */ jsxs4("div", { className: "flex rounded-lg border border-border bg-bg-secondary p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]", children: [
                      /* @__PURE__ */ jsxs4(
                        "button",
                        {
                          type: "button",
                          "aria-pressed": needOpenComment === 0,
                          onClick: () => {
                            setNeedOpenComment(0);
                            setOnlyFansCanComment(0);
                          },
                          className: segmentedButtonClass(needOpenComment === 0),
                          children: [
                            /* @__PURE__ */ jsx4(MessageCircleOff, { size: 15 }),
                            "\u5173\u95ED"
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxs4(
                        "button",
                        {
                          type: "button",
                          "aria-pressed": needOpenComment === 1,
                          onClick: () => setNeedOpenComment(1),
                          className: segmentedButtonClass(needOpenComment === 1),
                          children: [
                            /* @__PURE__ */ jsx4(MessageCircle, { size: 15 }),
                            "\u6253\u5F00"
                          ]
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs4("fieldset", { className: "m-0 min-w-0 border-0 p-0", children: [
                    /* @__PURE__ */ jsx4("legend", { className: "mb-2 block text-[13px] font-medium text-text-secondary", children: "\u8BC4\u8BBA\u8303\u56F4" }),
                    /* @__PURE__ */ jsxs4(
                      "div",
                      {
                        className: `flex rounded-lg border border-border bg-bg-secondary p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-opacity duration-fast ${commentsEnabled ? "opacity-100" : "opacity-55"}`,
                        children: [
                          /* @__PURE__ */ jsxs4(
                            "button",
                            {
                              type: "button",
                              "aria-pressed": onlyFansCanComment === 0,
                              disabled: !commentsEnabled,
                              onClick: () => setOnlyFansCanComment(0),
                              className: `${segmentedButtonClass(onlyFansCanComment === 0)} disabled:cursor-default`,
                              children: [
                                /* @__PURE__ */ jsx4(Globe2, { size: 15 }),
                                "\u6240\u6709\u4EBA"
                              ]
                            }
                          ),
                          /* @__PURE__ */ jsxs4(
                            "button",
                            {
                              type: "button",
                              "aria-pressed": onlyFansCanComment === 1,
                              disabled: !commentsEnabled,
                              onClick: () => setOnlyFansCanComment(1),
                              className: `${segmentedButtonClass(onlyFansCanComment === 1)} disabled:cursor-default`,
                              children: [
                                /* @__PURE__ */ jsx4(Users, { size: 15 }),
                                "\u7C89\u4E1D"
                              ]
                            }
                          )
                        ]
                      }
                    )
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs4("div", { className: "flex flex-col", children: [
                /* @__PURE__ */ jsxs4("div", { className: "mb-2 flex items-end justify-between gap-3", children: [
                  /* @__PURE__ */ jsxs4("div", { children: [
                    /* @__PURE__ */ jsx4("label", { htmlFor: "publish-thumb", className: "block text-[13px] font-medium text-text", children: "\u5C01\u9762\u56FE" }),
                    /* @__PURE__ */ jsx4("div", { className: "mt-1 text-xs text-text-muted", children: "\u5EFA\u8BAE\u4F7F\u75282.35:1\u7684\u6E05\u6670\u6A2A\u56FE\uFF1B\u70B9\u51FB\u5C01\u9762\u53EF\u4ECE\u672C\u5730\u4E0A\u4F20" })
                  ] }),
                  thumbPreview && /* @__PURE__ */ jsx4("span", { className: "text-xs font-medium text-accent", children: "\u5DF2\u9009\u62E9" })
                ] }),
                /* @__PURE__ */ jsx4(
                  "input",
                  {
                    id: "publish-thumb",
                    ref: fileRef,
                    type: "file",
                    accept: "image/jpeg,image/png,image/gif",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      if (f) void pickThumb(f);
                    }
                  }
                ),
                /* @__PURE__ */ jsx4("div", { className: "rounded-[10px] p-[2px]", children: /* @__PURE__ */ jsx4(
                  "button",
                  {
                    type: "button",
                    onClick: openThumbPicker,
                    disabled: busy || thumbUploading,
                    "aria-label": thumbUploading ? "\u5C01\u9762\u56FE\u4E0A\u4F20\u4E2D" : thumbPreview ? "\u66F4\u6362\u5C01\u9762\u56FE" : "\u4E0A\u4F20\u5C01\u9762\u56FE",
                    "aria-busy": thumbUploading,
                    className: `group relative flex aspect-[2.35/1] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-bg-secondary text-left outline-none transition-all duration-fast ease-smooth focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60 ${thumbPreview ? "border border-border" : "border border-dashed border-border-strong hover:border-[rgba(94,106,210,0.5)] hover:bg-accent-subtle"}`,
                    children: thumbUploading ? /* @__PURE__ */ jsxs4("div", { role: "status", className: "flex flex-col items-center px-6 text-center text-accent", children: [
                      /* @__PURE__ */ jsx4(Loader22, { size: 26, className: "animate-spin" }),
                      /* @__PURE__ */ jsx4("div", { className: "mt-2 text-sm font-semibold", children: "\u5C01\u9762\u5904\u7406\u5E76\u4E0A\u4F20\u4E2D\u2026" })
                    ] }) : thumbPreview ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
                      /* @__PURE__ */ jsx4("img", { src: thumbPreview, alt: "\u5DF2\u9009\u62E9\u7684\u5C01\u9762\u56FE\u9884\u89C8", className: "absolute inset-0 h-full w-full object-cover" }),
                      /* @__PURE__ */ jsxs4("span", { className: "absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-bg/95 px-2.5 text-[12px] font-medium text-text shadow-sm transition-colors group-hover:bg-bg", children: [
                        /* @__PURE__ */ jsx4(UploadCloud, { size: 14 }),
                        "\u66F4\u6362"
                      ] })
                    ] }) : /* @__PURE__ */ jsxs4("div", { className: "flex flex-col items-center px-6 text-center", children: [
                      /* @__PURE__ */ jsx4("span", { className: "inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent transition-transform duration-fast group-hover:scale-105", children: /* @__PURE__ */ jsx4(ImageIcon, { size: 22 }) }),
                      /* @__PURE__ */ jsx4("div", { className: "mt-3 text-sm font-semibold text-text", children: "\u70B9\u51FB\u4E0A\u4F20\u5C01\u9762\u56FE" }),
                      /* @__PURE__ */ jsx4("div", { className: "mt-1 text-xs leading-5 text-text-secondary", children: "\u7528\u4E00\u5F20\u6A2A\u5411\u56FE\u7247\u4F5C\u4E3A\u8349\u7A3F\u7BB1\u5C01\u9762" })
                    ] })
                  }
                ) })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxs4(
          "div",
          {
            className: "box-border flex min-h-0 min-w-0 flex-col overflow-hidden rounded border border-border bg-[linear-gradient(180deg,#fff_0%,#fbfbfd_100%)] p-4 shadow-sm",
            style: { height: materialPanelHeight ? `${materialPanelHeight}px` : void 0 },
            children: [
              /* @__PURE__ */ jsxs4("div", { className: "mb-3 flex flex-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
                /* @__PURE__ */ jsxs4("div", { className: "flex flex-col gap-0.5", children: [
                  /* @__PURE__ */ jsxs4("h3", { className: "flex items-center gap-1.5 text-[14px] font-semibold text-text", children: [
                    /* @__PURE__ */ jsx4(Library, { size: 16 }),
                    "\u7D20\u6750\u5E93\u9009\u62E9"
                  ] }),
                  /* @__PURE__ */ jsx4("span", { className: "text-xs text-text-muted", children: "\u5DF2\u4E0A\u4F20\u7684\u6B63\u6587\u56FE\u7247\u548C\u5386\u53F2\u5C01\u9762\u90FD\u5728\u8FD9\u91CC\uFF0C\u70B9\u51FB\u5373\u53EF\u9009\u62E9" })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx4("span", { className: "text-xs text-text-muted", children: materialLoaded ? `${materialItems.length}/${materialTotal || materialItems.length} \u5F20` : "\u52A0\u8F7D\u4E2D\u2026" }),
                  /* @__PURE__ */ jsx4(
                    "button",
                    {
                      type: "button",
                      title: "\u5237\u65B0\u7D20\u6750\u5E93",
                      "aria-label": "\u5237\u65B0\u7D20\u6750\u5E93",
                      disabled: busy || thumbUploading || materialLoading,
                      onClick: () => void loadMaterialLibrary(0),
                      className: "inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-bg-secondary text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50",
                      children: /* @__PURE__ */ jsx4(RefreshCw, { size: 14, className: materialLoading ? "animate-spin" : "" })
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsx4("div", { className: "min-h-0 flex-1", children: materialLoading && materialItems.length === 0 ? /* @__PURE__ */ jsx4(
                "div",
                {
                  className: "grid h-full auto-rows-max grid-cols-2 gap-2 overflow-hidden py-[5px] pl-[4px] pr-2 xl:grid-cols-3",
                  "aria-label": "\u7D20\u6750\u5E93\u52A0\u8F7D\u4E2D",
                  children: Array.from({ length: 6 }).map((_, index) => /* @__PURE__ */ jsx4(
                    "div",
                    {
                      className: "aspect-[2.35/1] animate-pulse box-border overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary p-2",
                      children: /* @__PURE__ */ jsx4("div", { className: "h-full rounded bg-[linear-gradient(90deg,rgba(148,163,184,0.10),rgba(148,163,184,0.22),rgba(148,163,184,0.10))]" })
                    },
                    index
                  ))
                }
              ) : materialError && materialItems.length === 0 ? /* @__PURE__ */ jsxs4("div", { className: "rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary", children: [
                /* @__PURE__ */ jsx4("div", { className: "font-medium text-text", children: "\u7D20\u6750\u5E93\u8BFB\u53D6\u5931\u8D25" }),
                /* @__PURE__ */ jsx4("div", { className: "mt-1 break-words", children: materialError.includes("NOT_CONFIGURED") ? "\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u5FAE\u4FE1\u7D20\u6750\u4E0A\u4F20\u51ED\u8BC1\u3002" : materialError }),
                /* @__PURE__ */ jsx4(
                  Button,
                  {
                    type: "button",
                    variant: "secondary",
                    className: "mt-3",
                    disabled: materialLoading,
                    onClick: () => void loadMaterialLibrary(0),
                    children: "\u91CD\u8BD5"
                  }
                )
              ] }) : materialItems.length > 0 ? /* @__PURE__ */ jsxs4("div", { className: "flex h-full flex-col", children: [
                /* @__PURE__ */ jsx4("div", { className: "min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin] py-[5px] pl-[4px] pr-2", children: /* @__PURE__ */ jsx4("div", { className: "grid auto-rows-max grid-cols-2 gap-2 content-start xl:grid-cols-3", children: materialItems.map((item, index) => {
                  const selected = selectedMaterialId === item.mediaId;
                  return /* @__PURE__ */ jsxs4(
                    "button",
                    {
                      type: "button",
                      disabled: busy || thumbUploading,
                      onClick: () => pickMaterialThumb(item),
                      className: `group relative block aspect-[2.35/1] w-full box-border appearance-none overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary p-0 outline-none transition-[border-color,background-color,transform] duration-slow ease-bounce focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60 ${selected ? "border-accent/70" : "hover:-translate-y-1 hover:bg-bg"}`,
                      "aria-label": `\u9009\u62E9\u7D20\u6750\u5E93\u7B2C ${index + 1} \u5F20\u56FE\u7247\u4F5C\u4E3A\u5C01\u9762\uFF1A${item.name}`,
                      children: [
                        /* @__PURE__ */ jsx4(
                          "img",
                          {
                            src: toProxyImageUrl(item.url),
                            alt: `\u7D20\u6750\u5E93\u5019\u9009\u5C01\u9762\uFF1A${item.name}`,
                            className: "block h-full w-full object-cover transition-transform duration-fast group-hover:scale-105"
                          }
                        ),
                        /* @__PURE__ */ jsxs4("span", { className: "absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-[11px] leading-4 text-white/90 opacity-0 transition-opacity group-hover:opacity-100", children: [
                          /* @__PURE__ */ jsx4("span", { className: "block truncate", children: item.name }),
                          /* @__PURE__ */ jsx4("span", { className: "block text-white/70", children: formatMaterialTime(item.updateTime) })
                        ] }),
                        selected && /* @__PURE__ */ jsx4("span", { className: "absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white", children: "\u5DF2\u9009" })
                      ]
                    },
                    item.mediaId
                  );
                }) }) }),
                /* @__PURE__ */ jsxs4("div", { className: "mt-3 flex flex-none items-center justify-between gap-3", children: [
                  /* @__PURE__ */ jsx4("span", { className: "text-xs text-text-muted", children: materialTotal > 0 ? `\u5171 ${materialTotal} \u5F20\u56FE\u7247\u7D20\u6750` : "\u5DF2\u663E\u793A\u7D20\u6750\u5E93\u56FE\u7247" }),
                  materialItems.length < materialTotal && /* @__PURE__ */ jsx4(
                    Button,
                    {
                      type: "button",
                      variant: "secondary",
                      disabled: busy || thumbUploading || materialLoading,
                      onClick: () => void loadMaterialLibrary(materialItems.length),
                      children: materialLoading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u52A0\u8F7D\u66F4\u591A"
                    }
                  )
                ] })
              ] }) : /* @__PURE__ */ jsx4("div", { className: "rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary", children: "\u7D20\u6750\u5E93\u6682\u65E0\u56FE\u7247\u7D20\u6750\u3002\u4E0A\u4F20\u8FC7\u7684\u6B63\u6587\u56FE\u7247\u4F1A\u8FDB\u5165\u8FD9\u91CC\uFF0C\u540E\u7EED\u53D1\u5E03\u540C\u7CFB\u5217\u6587\u7AE0\u65F6\u53EF\u4EE5\u76F4\u63A5\u590D\u7528\u3002" }) })
            ]
          }
        )
      ] })
    }
  ) });
}
export {
  PublishDialog,
  toast,
  useStore
};
