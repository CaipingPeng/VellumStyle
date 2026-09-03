import {useEffect, useRef, useState, type RefObject} from "react";
import {ChevronDown, ChevronRight} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";
import Menu from "../ui/Menu.tsx";
import {toast} from "../Toast/toast.ts";
import type {MarkdownEditorHandle} from "./MarkdownEditor.tsx";
import {findFormulaForSelection, wrapFormula, type FormulaRange} from "../../markdown/formulaEditing.ts";
import {FORMULA_PRESET_GROUPS} from "../../markdown/formulaPresets.ts";
import {typesetMath} from "../../markdown/mathjax.ts";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
  onClose: () => void;
}

function initialFormula(editor: MarkdownEditorHandle | null): FormulaRange | null {
  const snapshot = editor?.getDocumentSnapshot();
  return snapshot ? findFormulaForSelection(snapshot.text, snapshot.from, snapshot.to) : null;
}

export default function FormulaEditorDialog({editorRef, onClose}: Props) {
  const original = useRef(initialFormula(editorRef.current));
  const [latex, setLatex] = useState(original.current?.latex ?? "");
  const [displayMode, setDisplayMode] = useState(original.current?.displayMode ?? false);
  const [groupIndex, setGroupIndex] = useState(0);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const shortcutGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    const timer = window.setTimeout(() => {
      root.textContent = latex.trim() ? wrapFormula(latex, displayMode) : "请输入 LaTeX 公式";
      if (latex.trim()) void typesetMath(root).catch(() => {
        root.textContent = "公式预览失败，请检查语法";
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [displayMode, latex]);

  useEffect(() => {
    const root = shortcutGridRef.current;
    if (!presetMenuOpen || !root) return;
    void typesetMath(root).catch((error) => {
      console.error("快捷公式预览失败：", error);
    });
  }, [groupIndex, presetMenuOpen]);

  const insertSnippet = (snippet: string) => {
    setPresetMenuOpen(false);
    const input = inputRef.current;
    if (!input) {
      setLatex((value) => value + snippet);
      return;
    }
    const start = input.selectionStart;
    const end = input.selectionEnd;
    setLatex((value) => value.slice(0, start) + snippet + value.slice(end));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const save = () => {
    const editor = editorRef.current;
    if (!editor || !latex.trim()) {
      toast.show("请输入公式内容。", "error");
      return;
    }
    const wrapped = wrapFormula(latex, displayMode);
    const range = original.current;
    if (range) {
      if (!editor.replaceRange(range.from, range.to, wrapped, range.source)) {
        toast.show("原公式或选区已发生变化，请关闭窗口后重新编辑。", "error");
        return;
      }
    } else {
      editor.insertAtCursor(wrapped);
    }
    onClose();
  };

  return (
    <Dialog
      open
      title={original.current ? "编辑公式" : "插入公式"}
      onClose={onClose}
      width={980}
      contentPadding={false}
      initialFocusRef={inputRef}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>{original.current ? "更新公式" : "插入公式"}</Button></>}
    >
      <div className="flex h-[min(520px,calc(86vh-100px))] min-h-[380px] flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-2">
          <section className="flex min-h-0 flex-col gap-2 border-r border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-text">LaTeX 编辑</span>
              <div className="flex items-center gap-2">
                <Menu
                  open={presetMenuOpen}
                  onClose={() => setPresetMenuOpen(false)}
                  align="start"
                  minWidth={680}
                  trigger={(
                    <Button
                      type="button"
                      variant="toolbar"
                      aria-haspopup="menu"
                      aria-expanded={presetMenuOpen}
                      onClick={() => setPresetMenuOpen((open) => !open)}
                      className="h-7 px-2 text-xs"
                    >
                      符号与公式
                      <ChevronDown size={13} className={`transition-transform ${presetMenuOpen ? "rotate-180" : ""}`} />
                    </Button>
                  )}
                >
                  <div className="flex h-[min(480px,calc(100vh-120px))]" role="menu" aria-label="公式预设">
                    <div className="w-60 shrink-0 overflow-y-auto border-r border-border bg-bg py-1">
                      {FORMULA_PRESET_GROUPS.map((group, index) => (
                        <button
                          key={group.id}
                          type="button"
                          role="menuitem"
                          aria-haspopup="menu"
                          aria-expanded={groupIndex === index}
                          onMouseEnter={() => setGroupIndex(index)}
                          onFocus={() => setGroupIndex(index)}
                          onClick={() => setGroupIndex(index)}
                          className={`flex h-8 w-full items-center justify-between gap-3 border-0 px-3 text-left text-xs outline-none transition-colors ${groupIndex === index ? "bg-accent-subtle text-accent" : "bg-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text"}`}
                        >
                          <span className="truncate">{group.label}</span>
                          <ChevronRight size={14} className="shrink-0" />
                        </button>
                      ))}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col bg-bg-secondary" role="menu" aria-label={FORMULA_PRESET_GROUPS[groupIndex].label}>
                      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
                        <span className="truncate text-xs font-medium text-text">{FORMULA_PRESET_GROUPS[groupIndex].label}</span>
                        <span className="shrink-0 text-xs text-text-muted">{FORMULA_PRESET_GROUPS[groupIndex].items.length} 项</span>
                      </div>
                      <div ref={shortcutGridRef} className="grid min-h-0 flex-1 grid-cols-5 content-start gap-1.5 overflow-y-auto p-2">
                        {FORMULA_PRESET_GROUPS[groupIndex].items.map((snippet) => (
                          <button
                            key={snippet}
                            type="button"
                            role="menuitem"
                            title={snippet}
                            onClick={() => insertSnippet(snippet)}
                            className="flex min-h-10 items-center justify-center overflow-hidden rounded-sm border border-border bg-bg px-2 text-sm text-text-secondary outline-none hover:border-accent hover:bg-accent-subtle focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                          >
                            <span>{`\\(${snippet}\\)`}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Menu>
                <div className="flex overflow-hidden rounded-sm border border-border">
                  <button type="button" onClick={() => setDisplayMode(false)} className={`h-7 border-0 px-3 text-xs ${!displayMode ? "bg-accent text-white" : "bg-bg text-text-muted"}`}>行内</button>
                  <button type="button" onClick={() => setDisplayMode(true)} className={`h-7 border-0 px-3 text-xs ${displayMode ? "bg-accent text-white" : "bg-bg text-text-muted"}`}>块级</button>
                </div>
              </div>
            </div>
            <textarea
              ref={inputRef}
              value={latex}
              onChange={(event) => {
                setLatex(event.target.value);
                if (event.target.value.includes("\n")) setDisplayMode(true);
              }}
              spellCheck={false}
              placeholder={"例如：\\frac{a}{b}"}
              className="box-border min-h-0 flex-1 resize-none rounded-sm border border-border bg-bg-secondary p-3 font-mono text-sm leading-6 text-text outline-none focus:border-accent focus:ring-2 focus:ring-[color:var(--ring)]"
            />
          </section>
          <section className="flex min-h-0 flex-col gap-2 p-4">
            <span className="text-sm font-medium text-text">实时预览</span>
            <div ref={previewRef} className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-sm border border-border bg-bg-secondary p-5 text-center text-sm text-text-muted" />
          </section>
        </div>
      </div>
    </Dialog>
  );
}
