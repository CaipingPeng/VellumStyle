import {syntaxTree} from "@codemirror/language";
import {EditorSelection, type EditorState, type TransactionSpec} from "@codemirror/state";
import type {EditorView} from "@codemirror/view";
import {
  insertCodeBlock,
  insertLink,
  toggleLineSyntax,
  wrapSelection,
  type EditResult,
  type LineSyntax,
} from "./editing.ts";
import type {SyntaxAction} from "./syntaxActions.ts";

interface InlineActionConfig {
  node: string;
  mark: string;
  before: string;
  after: string;
  placeholder: string;
}

interface InlineSyntaxRange {
  from: number;
  to: number;
  openFrom: number;
  openTo: number;
  closeFrom: number;
  closeTo: number;
}

const lineSyntaxByAction: Partial<Record<SyntaxAction, LineSyntax>> = {
  heading1: {type: "heading", level: 1},
  heading2: {type: "heading", level: 2},
  heading3: {type: "heading", level: 3},
  heading4: {type: "heading", level: 4},
  orderedList: {type: "orderedList"},
  unorderedList: {type: "unorderedList"},
  blockquote: {type: "blockquote"},
};

const inlineActions: Partial<Record<SyntaxAction, InlineActionConfig>> = {
  bold: {node: "StrongEmphasis", mark: "EmphasisMark", before: "**", after: "**", placeholder: "加粗文本"},
  italic: {node: "Emphasis", mark: "EmphasisMark", before: "*", after: "*", placeholder: "斜体文本"},
  strikethrough: {
    node: "Strikethrough",
    mark: "StrikethroughMark",
    before: "~~",
    after: "~~",
    placeholder: "删除文本",
  },
  inlineCode: {node: "InlineCode", mark: "CodeMark", before: "`", after: "`", placeholder: "代码"},
};

function findInlineSyntaxRange(
  state: EditorState,
  nodeName: string,
  markName: string,
): InlineSyntaxRange | null {
  const selection = state.selection.main;
  const positions = selection.empty ? [selection.head] : [selection.from];
  const candidates: InlineSyntaxRange[] = [];

  for (const position of positions) {
    for (const side of [-1, 1] as const) {
      const startNode = syntaxTree(state).resolveInner(position, side);
      let node: typeof startNode | null = startNode;
      while (node) {
        if (node.name === nodeName && node.from <= selection.from && node.to >= selection.to) {
          const marks: Array<{from: number; to: number}> = [];
          for (let child = node.firstChild; child; child = child.nextSibling) {
            if (child.name === markName) marks.push({from: child.from, to: child.to});
          }
          if (marks.length >= 2) {
            const open = marks[0];
            const close = marks[marks.length - 1];
            candidates.push({
              from: node.from,
              to: node.to,
              openFrom: open.from,
              openTo: open.to,
              closeFrom: close.from,
              closeTo: close.to,
            });
          }
        }
        node = node.parent;
      }
    }
  }

  candidates.sort((a, b) => (a.to - a.from) - (b.to - b.from));
  return candidates[0] ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface FencedCodeRange {
  from: number;
  to: number;
  openFrom: number;
  closeFrom: number;
}

function findFencedCodeRange(state: EditorState): FencedCodeRange | null {
  const selection = state.selection.main;
  const candidates: FencedCodeRange[] = [];

  for (const side of [-1, 1] as const) {
    const startNode = syntaxTree(state).resolveInner(selection.from, side);
    let node: typeof startNode | null = startNode;
    while (node) {
      if (node.name === "FencedCode" && node.from <= selection.from && node.to >= selection.to) {
        const marks: Array<{from: number; to: number}> = [];
        for (let child = node.firstChild; child; child = child.nextSibling) {
          if (child.name === "CodeMark") marks.push({from: child.from, to: child.to});
        }
        if (marks.length === 2) {
          candidates.push({
            from: node.from,
            to: node.to,
            openFrom: marks[0].from,
            closeFrom: marks[1].from,
          });
        }
      }
      node = node.parent;
    }
  }

  const unique = candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.from === candidate.from && other.to === candidate.to) === index,
  );
  return unique.length === 1 ? unique[0] : null;
}

function transactionFromEditResult(
  state: EditorState,
  result: EditResult,
  from: number,
  to: number,
  preserveDirection: boolean,
): TransactionSpec {
  const forward = state.selection.main.anchor <= state.selection.main.head;
  return {
    changes: {from, to, insert: result.insert},
    selection: EditorSelection.single(
      preserveDirection && !forward ? result.selTo : result.selFrom,
      preserveDirection && !forward ? result.selFrom : result.selTo,
    ),
    userEvent: "input.format",
    scrollIntoView: true,
  };
}

function createCodeBlockTransaction(state: EditorState): TransactionSpec {
  const selection = state.selection.main;
  const fenced = findFencedCodeRange(state);
  if (!fenced) {
    const result = insertCodeBlock(state.doc.toString(), selection.from, selection.to);
    return transactionFromEditResult(state, result, selection.from, selection.to, true);
  }

  const openLine = state.doc.lineAt(fenced.openFrom);
  const closeLine = state.doc.lineAt(fenced.closeFrom);
  const contentFrom = Math.min(openLine.to + 1, fenced.to);
  let contentTo = closeLine.from;
  if (contentTo > contentFrom && state.doc.sliceString(contentTo - 1, contentTo) === "\n") {
    contentTo -= 1;
  }
  const content = state.doc.sliceString(contentFrom, contentTo);
  const mapPosition = (position: number) => fenced.from + clamp(position, contentFrom, contentTo) - contentFrom;
  return {
    changes: {from: fenced.from, to: fenced.to, insert: content},
    selection: EditorSelection.single(
      mapPosition(selection.anchor),
      mapPosition(selection.head),
    ),
    userEvent: "input.format",
    scrollIntoView: true,
  };
}

function createLinkTransaction(state: EditorState): TransactionSpec {
  const selection = state.selection.main;
  const result = insertLink(state.doc.toString(), selection.from, selection.to);
  return transactionFromEditResult(state, result, selection.from, selection.to, false);
}

function createHorizontalRuleTransaction(state: EditorState): TransactionSpec {
  const selection = state.selection.main;
  const insert = "\n---\n";
  return {
    changes: {from: selection.from, to: selection.to, insert},
    selection: EditorSelection.cursor(selection.from + insert.length),
    userEvent: "input.format",
    scrollIntoView: true,
  };
}

function createInlineTransaction(
  state: EditorState,
  config: InlineActionConfig,
): TransactionSpec {
  const selection = state.selection.main;
  const existing = findInlineSyntaxRange(state, config.node, config.mark);

  if (existing) {
    const changes = [
      {from: existing.openFrom, to: existing.openTo},
      {from: existing.closeFrom, to: existing.closeTo},
    ];
    const changeSet = state.changes(changes);
    const mapInside = (position: number) => changeSet.mapPos(
      clamp(position, existing.openTo, existing.closeFrom),
      position === existing.closeFrom ? -1 : 1,
    );
    return {
      changes: changeSet,
      selection: EditorSelection.single(mapInside(selection.anchor), mapInside(selection.head)),
      userEvent: "input.format",
      scrollIntoView: true,
    };
  }

  const result = wrapSelection(
    state.doc.toString(),
    selection.from,
    selection.to,
    config.before,
    config.after,
    config.placeholder,
  );
  const forward = selection.anchor <= selection.head;
  return {
    changes: {from: selection.from, to: selection.to, insert: result.insert},
    selection: EditorSelection.single(
      forward ? result.selFrom : result.selTo,
      forward ? result.selTo : result.selFrom,
    ),
    userEvent: "input.format",
    scrollIntoView: true,
  };
}

function createLineTransaction(state: EditorState, syntax: LineSyntax): TransactionSpec | null {
  const selection = state.selection.main;
  const changes = toggleLineSyntax(
    state.doc.toString(),
    selection.anchor,
    selection.head,
    syntax,
  );
  if (changes.length === 0) return null;

  const changeSet = state.changes(changes);
  const mapSelectionPosition = (position: number) => {
    if (selection.empty) return changeSet.mapPos(position, 1);
    return changeSet.mapPos(position, position === selection.from ? 1 : -1);
  };
  return {
    changes: changeSet,
    selection: EditorSelection.single(
      mapSelectionPosition(selection.anchor),
      mapSelectionPosition(selection.head),
    ),
    userEvent: "input.format",
    scrollIntoView: true,
  };
}

export function createSyntaxActionTransaction(
  state: EditorState,
  action: SyntaxAction,
): TransactionSpec | null {
  const inline = inlineActions[action];
  if (inline) return createInlineTransaction(state, inline);
  const lineSyntax = lineSyntaxByAction[action];
  if (lineSyntax) return createLineTransaction(state, lineSyntax);
  if (action === "codeBlock") return createCodeBlockTransaction(state);
  if (action === "link") return createLinkTransaction(state);
  if (action === "horizontalRule") return createHorizontalRuleTransaction(state);
  return null;
}

export function runSyntaxAction(view: EditorView, action: SyntaxAction): boolean {
  if (view.state.readOnly) return false;
  const spec = createSyntaxActionTransaction(view.state, action);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
