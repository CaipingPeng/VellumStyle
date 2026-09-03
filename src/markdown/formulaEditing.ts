export interface FormulaInput {
  latex: string;
  displayMode: boolean;
}

export interface FormulaRange extends FormulaInput {
  from: number;
  to: number;
  source: string;
}

export function unwrapFormula(text: string): FormulaInput {
  let current = text.trim();
  let displayMode = false;
  let changed = true;
  while (changed) {
    changed = false;
    if (current.startsWith("$$") && current.endsWith("$$") && current.length > 4) {
      current = current.slice(2, -2).trim();
      displayMode = true;
      changed = true;
    } else if (current.startsWith("\\[") && current.endsWith("\\]")) {
      current = current.slice(2, -2).trim();
      displayMode = true;
      changed = true;
    } else if (current.startsWith("\\(") && current.endsWith("\\)")) {
      current = current.slice(2, -2).trim();
      displayMode = false;
      changed = true;
    } else if (current.startsWith("$") && current.endsWith("$") && current.length > 2) {
      current = current.slice(1, -1).trim();
      displayMode = false;
      changed = true;
    }
  }
  return {latex: current, displayMode};
}

export function wrapFormula(latex: string, displayMode: boolean): string {
  const content = latex.trim();
  if (!content) return "";
  return displayMode ? `$$\n${content}\n$$` : `$${content}$`;
}

function formulaRanges(documentText: string): FormulaRange[] {
  const ranges: FormulaRange[] = [];
  const addMatches = (pattern: RegExp, displayMode: boolean) => {
    for (const match of documentText.matchAll(pattern)) {
      const from = match.index;
      const source = match[0];
      const to = from + source.length;
      if (ranges.some((range) => from >= range.from && to <= range.to)) continue;
      ranges.push({...unwrapFormula(source), displayMode, from, to, source});
    }
  };
  addMatches(/\$\$[\s\S]*?\$\$/g, true);
  addMatches(/\\\[[\s\S]*?\\\]/g, true);
  addMatches(/\\\([^\n]*?\\\)/g, false);
  // 起止美元符都不能紧邻另一个美元符，避免从 $$ 块公式的一半开始产生幽灵行内公式。
  addMatches(/(?<![$\\])\$(?!\$)(?:\\.|[^$\n])+?(?<!\\)\$(?!\$)/g, false);
  return ranges.sort((left, right) => left.from - right.from);
}

export function findFormulaForSelection(
  documentText: string,
  from: number,
  to: number,
): FormulaRange | null {
  if (from !== to) {
    const source = documentText.slice(from, to);
    return {...unwrapFormula(source), from, to, source};
  }
  return formulaRanges(documentText).find((range) => from >= range.from && from <= range.to) ?? null;
}
