import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";

// 链接转脚注：[text](url "title") 中带 title 的链接转为脚注（微信不支持外链跳转）。
// 移植自 mdnice markdown-it-linkfoot。

/* eslint-disable @typescript-eslint/no-explicit-any */

function renderFootnoteAnchorName(tokens: Token[], idx: number, _o: any, env: any): string {
  const n = Number(tokens[idx].meta.id + 1).toString();
  let prefix = "";
  if (typeof env.docId === "string") {
    prefix = "-" + env.docId + "-";
  }
  return prefix + n;
}

function renderFootnoteCaption(tokens: Token[], idx: number): string {
  let n = Number(tokens[idx].meta.id + 1).toString();
  if (tokens[idx].meta.subId > 0) {
    n += ":" + tokens[idx].meta.subId;
  }
  return "[" + n + "]";
}

function renderFootnoteWord(tokens: Token[], idx: number): string {
  return '<span class="footnote-word">' + tokens[idx].content + "</span>";
}

function renderFootnoteRef(tokens: Token[], idx: number, options: any, env: any, slf: any): string {
  const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf);
  return '<sup class="footnote-ref">' + caption + "</sup>";
}

function renderFootnoteBlockOpen(): string {
  return '<h3 class="footnotes-sep"></h3>\n<section class="footnotes">\n';
}

function renderFootnoteBlockClose(): string {
  return "</section>\n";
}

function renderFootnoteOpen(tokens: Token[], idx: number, options: any, env: any, slf: any): string {
  let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
  if (tokens[idx].meta.subId > 0) {
    id += ":" + tokens[idx].meta.subId;
  }
  return '<span id="fn' + id + '" class="footnote-item"><span class="footnote-num">[' + id + "] </span>";
}

function renderFootnoteClose(): string {
  return "</span>\n";
}

function isSpace(code: number): boolean {
  return code === 0x09 || code === 0x20;
}

function normalizeReference(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function linkFoot(state: StateInline, silent: boolean): boolean {
  let code: number;
  let label: string | undefined;
  let pos: number;
  let res: any;
  let ref: any;
  let title: string;
  let token: Token;
  let href = "";
  let start = state.pos;
  let footnoteContent = "";
  let parseReference = true;
  const oldPos = state.pos;
  const max = state.posMax;

  if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) {
    return false;
  }

  const labelStart = state.pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
  if (labelEnd < 0) {
    return false;
  }

  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 0x28 /* ( */) {
    parseReference = false;
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0a) {
        break;
      }
    }
    if (pos >= max) {
      return false;
    }

    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      footnoteContent = res.str;
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = "";
      }
    }

    start = pos;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0a) {
        break;
      }
    }

    res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!isSpace(code) && code !== 0x0a) {
          break;
        }
      }
    } else {
      title = "";
    }

    if (pos >= max || state.src.charCodeAt(pos) !== 0x29 /* ) */) {
      parseReference = true;
    }
    pos++;
  } else {
    title = "";
  }

  if (parseReference) {
    if (typeof state.env.references === "undefined") {
      return false;
    }
    if (pos < max && state.src.charCodeAt(pos) === 0x5b /* [ */) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }

    if (!label) {
      label = state.src.slice(labelStart, labelEnd);
    }

    ref = state.env.references[normalizeReference(label)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }

  if (!silent) {
    if (title) {
      state.pos = labelStart;
      state.posMax = labelEnd;

      if (!state.env.footnotes) {
        state.env.footnotes = {};
      }
      if (!state.env.footnotes.list) {
        state.env.footnotes.list = [];
      }

      const footnoteId = state.env.footnotes.list.length;
      const tokens: Token[] = [];
      // *用来让链接倾斜
      state.md.inline.parse(`${title}: *${footnoteContent}*`, state.md, state.env, tokens);

      token = state.push("footnote_word", "", 0);
      token.content = state.src.slice(labelStart, labelEnd);

      token = state.push("footnote_ref", "", 0);
      token.meta = {id: footnoteId};

      state.env.footnotes.list[footnoteId] = {tokens};
    } else {
      state.pos = labelStart;
      state.posMax = labelEnd;

      token = state.push("link_open", "a", 1);
      token.attrs = [["href", href]];

      state.md.inline.tokenize(state);

      token = state.push("link_close", "a", -1);
    }
  }

  state.pos = pos;
  state.posMax = max;
  return true;
}

function footnoteTail(state: StateCore) {
  let lastParagraph: Token | null;
  let list: any[];
  let token: Token;
  let tokens: Token[];
  let current: Token[] = [];
  let currentLabel: string | undefined;
  let insideRef = false;
  const refTokens: Record<string, Token[]> = {};

  if (!state.env.footnotes) {
    return;
  }

  state.tokens = state.tokens.filter((tok) => {
    if (tok.type === "footnote_reference_open") {
      insideRef = true;
      current = [];
      currentLabel = tok.meta.label;
      return false;
    }
    if (tok.type === "footnote_reference_close") {
      insideRef = false;
      refTokens[":" + currentLabel] = current;
      return false;
    }
    if (insideRef) {
      current.push(tok);
    }
    return !insideRef;
  });

  if (!state.env.footnotes.list) {
    return;
  }
  list = state.env.footnotes.list;

  token = new state.Token("footnote_block_open", "", 1);
  state.tokens.push(token);

  for (let i = 0; i < list.length; i++) {
    token = new state.Token("footnote_open", "", 1);
    token.meta = {id: i, label: list[i].label};
    state.tokens.push(token);

    if (list[i].tokens) {
      tokens = [];
      token = new state.Token("paragraph_open", "p", 1);
      token.block = true;
      tokens.push(token);

      token = new state.Token("inline", "", 0);
      token.children = list[i].tokens;
      token.content = "";
      tokens.push(token);

      token = new state.Token("paragraph_close", "p", -1);
      token.block = true;
      tokens.push(token);
    } else if (list[i].label) {
      tokens = refTokens[":" + list[i].label];
    } else {
      tokens = [];
    }

    state.tokens = state.tokens.concat(tokens);
    if (state.tokens[state.tokens.length - 1].type === "paragraph_close") {
      lastParagraph = state.tokens.pop()!;
    } else {
      lastParagraph = null;
    }
    if (lastParagraph) {
      state.tokens.push(lastParagraph);
    }

    token = new state.Token("footnote_close", "", -1);
    state.tokens.push(token);
  }

  token = new state.Token("footnote_block_close", "", -1);
  state.tokens.push(token);
}

export default function linkFootnote(md: MarkdownIt) {
  md.renderer.rules.footnote_ref = renderFootnoteRef as any;
  md.renderer.rules.footnote_word = renderFootnoteWord as any;
  md.renderer.rules.footnote_block_open = renderFootnoteBlockOpen as any;
  md.renderer.rules.footnote_block_close = renderFootnoteBlockClose as any;
  md.renderer.rules.footnote_open = renderFootnoteOpen as any;
  md.renderer.rules.footnote_close = renderFootnoteClose as any;
  md.renderer.rules.footnote_caption = renderFootnoteCaption as any;
  md.renderer.rules.footnote_anchor_name = renderFootnoteAnchorName as any;

  md.inline.ruler.at("link", linkFoot);
  md.core.ruler.after("inline", "footnote_tail", footnoteTail);
}
