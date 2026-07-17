import {syntaxTree} from "@codemirror/language";
import {EditorSelection, type EditorState, type TransactionSpec} from "@codemirror/state";
import type {EditorView} from "@codemirror/view";
import {wrapSelection} from "./editing.ts";
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
      let node = syntaxTree(state).resolveInner(position, side);
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

export function createSyntaxActionTransaction(
  state: EditorState,
  action: SyntaxAction,
): TransactionSpec | null {
  const inline = inlineActions[action];
  return inline ? createInlineTransaction(state, inline) : null;
}

export function runSyntaxAction(view: EditorView, action: SyntaxAction): boolean {
  if (view.state.readOnly) return false;
  const spec = createSyntaxActionTransaction(view.state, action);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
