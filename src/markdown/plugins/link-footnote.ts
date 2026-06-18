import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
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
  return '<span id="fn' + id + '" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">[' + id + "] </span>";
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

function ensureFootnoteList(env: any): any[] {
  if (!env.footnotes) {
    env.footnotes = {};
  }
  if (!env.footnotes.list) {
    env.footnotes.list = [];
  }
  return env.footnotes.list;
}

function createTextToken(state: StateInline, content: string): Token {
  const token = new (state as any).Token("text", "", 0) as Token;
  token.content = content;
  return token;
}

function footnoteDef(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];

  if (start + 4 > max) {
    return false;
  }
  if (state.src.charCodeAt(start) !== 0x5b /* [ */ || state.src.charCodeAt(start + 1) !== 0x5e /* ^ */) {
    return false;
  }

  let pos = start + 2;
  for (; pos < max; pos++) {
    if (state.src.charCodeAt(pos) === 0x20 || state.src.charCodeAt(pos) === 0x0a) {
      return false;
    }
    if (state.src.charCodeAt(pos) === 0x5d /* ] */) {
      break;
    }
  }

  if (pos === start + 2) {
    return false;
  }
  if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 0x3a /* : */) {
    return false;
  }
  if (silent) {
    return true;
  }
  pos++;

  if (!state.env.footnotes) {
    state.env.footnotes = {};
  }
  if (!state.env.footnotes.refs) {
    state.env.footnotes.refs = {};
  }

  const label = state.src.slice(start + 2, pos - 2);
  state.env.footnotes.refs[":" + label] = -1;

  const openToken = new state.Token("footnote_reference_open", "", 1);
  openToken.meta = {label};
  openToken.level = state.level++;
  state.tokens.push(openToken);

  const oldBMark = state.bMarks[startLine];
  const oldTShift = state.tShift[startLine];
  const oldSCount = state.sCount[startLine];
  const oldParentType = state.parentType;
  const posAfterColon = pos;
  const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
  let offset = initial;

  while (pos < max) {
    const ch = state.src.charCodeAt(pos);
    if (isSpace(ch)) {
      offset += ch === 0x09 ? 4 - (offset % 4) : 1;
      pos++;
      continue;
    }
    break;
  }

  state.tShift[startLine] = pos - posAfterColon;
  state.sCount[startLine] = offset - initial;
  state.bMarks[startLine] = posAfterColon;
  state.blkIndent += 4;
  (state as any).parentType = "footnote";

  if (state.sCount[startLine] < state.blkIndent) {
    state.sCount[startLine] += state.blkIndent;
  }

  (state.md.block.tokenize as any)(state, startLine, endLine, true);

  state.parentType = oldParentType;
  state.blkIndent -= 4;
  state.tShift[startLine] = oldTShift;
  state.sCount[startLine] = oldSCount;
  state.bMarks[startLine] = oldBMark;

  const closeToken = new state.Token("footnote_reference_close", "", -1);
  closeToken.level = --state.level;
  state.tokens.push(closeToken);

  return true;
}

function footnoteRef(state: StateInline, silent: boolean): boolean {
  const max = state.posMax;
  const start = state.pos;

  if (start + 3 > max) {
    return false;
  }
  if (!state.env.footnotes?.refs) {
    return false;
  }
  if (state.src.charCodeAt(start) !== 0x5b /* [ */ || state.src.charCodeAt(start + 1) !== 0x5e /* ^ */) {
    return false;
  }

  let pos = start + 2;
  for (; pos < max; pos++) {
    const code = state.src.charCodeAt(pos);
    if (code === 0x20 || code === 0x0a) {
      return false;
    }
    if (code === 0x5d /* ] */) {
      break;
    }
  }

  if (pos === start + 2 || pos >= max) {
    return false;
  }
  pos++;

  const label = state.src.slice(start + 2, pos - 1);
  if (typeof state.env.footnotes.refs[":" + label] === "undefined") {
    return false;
  }

  if (!silent) {
    if (!state.env.footnotes.list) {
      state.env.footnotes.list = [];
    }

    let footnoteId: number;
    if (state.env.footnotes.refs[":" + label] < 0) {
      footnoteId = state.env.footnotes.list.length;
      state.env.footnotes.list[footnoteId] = {label, count: 0};
      state.env.footnotes.refs[":" + label] = footnoteId;
    } else {
      footnoteId = state.env.footnotes.refs[":" + label];
    }

    const footnoteSubId = state.env.footnotes.list[footnoteId].count ?? 0;
    state.env.footnotes.list[footnoteId].count = footnoteSubId + 1;

    const token = state.push("footnote_ref", "", 0);
    token.meta = {id: footnoteId, subId: footnoteSubId, label};
  }

  state.pos = pos;
  state.posMax = max;
  return true;
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
    footnoteContent = ref.href;
  }

  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;

    if (title) {
      const footnoteList = ensureFootnoteList(state.env);
      const footnoteId = footnoteList.length;
      const tokens: Token[] = [];
      // *用来让链接倾斜
      state.md.inline.parse(`${title}: *${footnoteContent}*`, state.md, state.env, tokens);

      token = state.push("footnote_word", "", 0);
      token.content = state.src.slice(labelStart, labelEnd);

      token = state.push("footnote_ref", "", 0);
      token.meta = {id: footnoteId};

      footnoteList[footnoteId] = {tokens};
    } else {
      const footnoteList = ensureFootnoteList(state.env);
      const footnoteId = footnoteList.length;
      const tokens = [createTextToken(state, footnoteContent || href)];

      token = state.push("footnote_word_open", "span", 1);
      token.attrs = [["class", "footnote-word"]];

      token = state.push("text", "", 0);
      token.content = "⌈";

      state.md.inline.tokenize(state);

      token = state.push("text", "", 0);
      token.content = "⌋";

      state.push("footnote_word_close", "span", -1);

      token = state.push("footnote_ref", "", 0);
      token.meta = {id: footnoteId};

      footnoteList[footnoteId] = {tokens};
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
      token = new state.Token("inline", "", 0);
      token.children = list[i].tokens;
      token.content = "";
      tokens.push(token);
    } else if (list[i].label) {
      tokens = refTokens[":" + list[i].label];
    } else {
      tokens = [];
    }

    if (tokens.length === 3 && tokens[0].type === "paragraph_open" && tokens[1].type === "inline" && tokens[2].type === "paragraph_close") {
      tokens = [tokens[1]];
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

  md.block.ruler.before("reference", "footnote_def", footnoteDef, {alt: ["paragraph", "reference"]});
  md.inline.ruler.before("link", "footnote_ref", footnoteRef);
  md.inline.ruler.at("link", linkFoot);
  md.core.ruler.after("inline", "footnote_tail", footnoteTail);
}
