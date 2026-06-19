import {forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef} from "react";
import {useCodeMirror} from "@uiw/react-codemirror";
import {markdown, markdownLanguage} from "@codemirror/lang-markdown";
import {languages} from "@codemirror/language-data";
import {EditorView} from "@codemirror/view";
import {undo, redo} from "@codemirror/commands";
import {
  wrapSelection as wrapSel,
  insertLink as insLink,
  prefixLines as prefixLn,
  insertCodeBlock as insCode,
  shouldReplaceEditorDoc,
  shouldQueueExternalValueDuringComposition,
  shouldHandleDirectTextInput,
  shouldRecoverCompositionTextInput,
  getFallbackChineseSymbolFromKey,
  getSelectionAfterRecoveredTextInput,
} from "./editing.ts";
import {getCodeMirrorCspNonce} from "../../utils/cspNonce.ts";

export interface MarkdownEditorHandle {
  // 在当前光标处插入文本（替换选区）。供工具栏上传按钮调用。
  insertAtCursor: (text: string) => void;
  // 行内包裹：有选区包裹，无选区插占位符并选中。
  wrapSelection: (before: string, after: string, placeholder: string) => void;
  // 插入链接：选区当文字，选中 url 占位。
  insertLink: () => void;
  // 行级前缀：选区涉及的每行行首加 prefix。
  prefixLines: (prefix: string) => void;
  // 插入代码块围栏：有选区进围栏，无选区光标落中间空行。
  insertCodeBlock: () => void;
  // 撤销/重做（CodeMirror history）。
  undo: () => void;
  redo: () => void;
  // 编辑器滚动容器（.cm-scroller），供同步滚动监听
  getScroller: () => HTMLElement | null;
  // 顶部可视行号（0-based，与渲染 data-line 同基准）
  getTopLine: () => number;
  // 滚动编辑器使指定行（0-based）出现在视口顶部
  scrollToLine: (line: number) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  // 粘贴图片时触发；返回的 Promise 完成后编辑器无需额外处理（插入由回调内部完成）。
  onPasteImage?: (file: File) => void;
}

// Markdown 编辑器：CodeMirror 6，自动换行、无行号，支持光标插入与粘贴图片。
const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  ({value, onChange, onPasteImage}, ref) => {
    const viewRef = useRef<EditorView | null>(null);
    const cspNonce = useMemo(() => getCodeMirrorCspNonce(), []);
    const composingRef = useRef(false);
    const compositionSettlingRef = useRef(false);
    const compositionEndFrameRef = useRef(0);
    const suppressChangeRef = useRef(false);
    const latestPropValueRef = useRef(value);
    const lastEmittedValueRef = useRef<string | null>(null);
    const pendingExternalValueRef = useRef<string | null>(null);
    const compositionStartValueRef = useRef<string | null>(null);
    const compositionStartDocRef = useRef<string | null>(null);
    const compositionStartSelectionRef = useRef<{from: number; to: number} | null>(null);
    const lastDirectTextInputAtRef = useRef(0);
    const fallbackInsertionsRef = useRef<Array<{symbol: string; insertedAt: number}>>([]);
    const keyFallbackFrameRef = useRef(0);
    const onChangeRef = useRef(onChange);

    latestPropValueRef.current = value;
    onChangeRef.current = onChange;

    const syncEditorWithValue = useCallback((incomingValue: string, externalUpdate = true) => {
      const view = viewRef.current;
      if (!view) {
        return false;
      }
      const currentDoc = view.state.doc.toString();
      if (!shouldReplaceEditorDoc({
        currentDoc,
        incomingValue,
        composing: composingRef.current,
        compositionSettling: compositionSettlingRef.current,
        externalUpdate,
        lastEmittedValue: lastEmittedValueRef.current,
        latestKnownValue: latestPropValueRef.current,
      })) {
        return true;
      }
      suppressChangeRef.current = true;
      try {
        view.dispatch({
          changes: {from: 0, to: currentDoc.length, insert: incomingValue},
        });
      } finally {
        suppressChangeRef.current = false;
      }
      return true;
    }, []);

    const emitCurrentEditorDoc = useCallback(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const currentDoc = view.state.doc.toString();
      if (currentDoc === lastEmittedValueRef.current || currentDoc === latestPropValueRef.current) {
        return;
      }
      lastEmittedValueRef.current = currentDoc;
      onChangeRef.current(currentDoc);
    }, []);

    const handleChange = useCallback((nextValue: string) => {
      if (suppressChangeRef.current) {
        return;
      }
      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      },
      wrapSelection: (before, after, placeholder) => {
        const view = viewRef.current;
        if (!view) return;
        const {from, to} = view.state.selection.main;
        const doc = view.state.doc.toString();
        const r = wrapSel(doc, from, to, before, after, placeholder);
        view.dispatch({
          changes: {from, to, insert: r.insert},
          selection: {anchor: r.selFrom, head: r.selTo},
        });
        view.focus();
      },
      insertLink: () => {
        const view = viewRef.current;
        if (!view) return;
        const {from, to} = view.state.selection.main;
        const doc = view.state.doc.toString();
        const r = insLink(doc, from, to);
        view.dispatch({
          changes: {from, to, insert: r.insert},
          selection: {anchor: r.selFrom, head: r.selTo},
        });
        view.focus();
      },
      prefixLines: (prefix) => {
        const view = viewRef.current;
        if (!view) return;
        const {from, to} = view.state.selection.main;
        const doc = view.state.doc.toString();
        const r = prefixLn(doc, from, to, prefix);
        view.dispatch({
          changes: {from: r.replaceFrom, to: r.replaceTo, insert: r.insert},
          selection: {anchor: r.selFrom, head: r.selTo},
        });
        view.focus();
      },
      insertCodeBlock: () => {
        const view = viewRef.current;
        if (!view) return;
        const {from, to} = view.state.selection.main;
        const doc = view.state.doc.toString();
        const r = insCode(doc, from, to);
        view.dispatch({
          changes: {from, to, insert: r.insert},
          selection: {anchor: r.selFrom, head: r.selTo},
        });
        view.focus();
      },
      undo: () => {
        const view = viewRef.current;
        if (!view) return;
        undo(view);
        view.focus();
      },
      redo: () => {
        const view = viewRef.current;
        if (!view) return;
        redo(view);
        view.focus();
      },
      getScroller: () => viewRef.current?.scrollDOM ?? null,
      getTopLine: () => {
        const view = viewRef.current;
        if (!view) {
          return 0;
        }
        // 视口顶部像素对应的块行号（CodeMirror 行 1-based，转 0-based 与 data-line 对齐）
        const top = view.scrollDOM.scrollTop;
        const blockInfo = view.lineBlockAtHeight(top);
        return view.state.doc.lineAt(blockInfo.from).number - 1;
      },
      scrollToLine: (line) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        const docLine = Math.min(Math.max(line + 1, 1), view.state.doc.lines);
        const pos = view.state.doc.line(docLine).from;
        view.dispatch({effects: EditorView.scrollIntoView(pos, {y: "start"})});
      },
    }));

    const extensions = useMemo(
      () => [
        ...(cspNonce ? [EditorView.cspNonce.of(cspNonce)] : []),
        markdown({base: markdownLanguage, codeLanguages: languages}),
        EditorView.lineWrapping,
        // 聚焦时不加任何边框；让内容区撑满高度，使空白区域点击也能定位光标。
        EditorView.theme({
          "&.cm-focused": {outline: "none"},
          ".cm-content": {minHeight: "100%"},
        }),
        EditorView.domEventHandlers({
          beforeinput(event) {
            const now = performance.now();
            lastDirectTextInputAtRef.current = now;
            fallbackInsertionsRef.current = fallbackInsertionsRef.current.filter((item) => now - item.insertedAt < 1500);
            const fallbackIndex = fallbackInsertionsRef.current.findIndex((item) => item.symbol === event.data);
            if (fallbackIndex !== -1) {
              fallbackInsertionsRef.current.splice(fallbackIndex, 1);
              event.preventDefault();
              return true;
            }
            if (!shouldHandleDirectTextInput({data: event.data, inputType: event.inputType})) {
              return false;
            }
            const view = viewRef.current;
            if (!view) {
              return false;
            }
            event.preventDefault();
            view.dispatch(view.state.replaceSelection(event.data ?? ""));
            return true;
          },
          keyup(event) {
            const symbol = getFallbackChineseSymbolFromKey({
              key: event.key,
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              metaKey: event.metaKey,
            });
            const view = viewRef.current;
            if (!symbol || !view) {
              return false;
            }
            const eventAt = performance.now();
            if (eventAt - lastDirectTextInputAtRef.current < 120) {
              return false;
            }
            const startDoc = view.state.doc.toString();
            const {from, to} = view.state.selection.main;
            if (keyFallbackFrameRef.current) {
              cancelAnimationFrame(keyFallbackFrameRef.current);
            }
            keyFallbackFrameRef.current = requestAnimationFrame(() => {
              keyFallbackFrameRef.current = 0;
              const currentView = viewRef.current;
              if (!currentView || lastDirectTextInputAtRef.current >= eventAt || currentView.state.doc.toString() !== startDoc) {
                return;
              }
              currentView.dispatch({
                changes: {from, to, insert: symbol},
                selection: {anchor: getSelectionAfterRecoveredTextInput({from, text: symbol})},
              });
              fallbackInsertionsRef.current.push({symbol, insertedAt: performance.now()});
            });
            return false;
          },
          compositionstart() {
            if (compositionEndFrameRef.current) {
              cancelAnimationFrame(compositionEndFrameRef.current);
              compositionEndFrameRef.current = 0;
            }
            const view = viewRef.current;
            const selection = view?.state.selection.main;
            composingRef.current = true;
            compositionSettlingRef.current = false;
            compositionStartValueRef.current = latestPropValueRef.current;
            compositionStartDocRef.current = view?.state.doc.toString() ?? null;
            compositionStartSelectionRef.current = selection ? {from: selection.from, to: selection.to} : null;
            return false;
          },
          compositionend(event) {
            const compositionData = event.data;
            compositionSettlingRef.current = true;
            compositionEndFrameRef.current = requestAnimationFrame(() => {
              compositionEndFrameRef.current = 0;
              const view = viewRef.current;
              if (view && shouldRecoverCompositionTextInput({
                data: compositionData,
                startDoc: compositionStartDocRef.current,
                currentDoc: view.state.doc.toString(),
              })) {
                const selection = compositionStartSelectionRef.current;
                const from = selection?.from ?? view.state.selection.main.from;
                const to = selection?.to ?? view.state.selection.main.to;
                view.dispatch({
                  changes: {from, to, insert: compositionData},
                  selection: {anchor: getSelectionAfterRecoveredTextInput({from, text: compositionData})},
                });
              }
              emitCurrentEditorDoc();
              composingRef.current = false;
              compositionSettlingRef.current = false;
              compositionStartValueRef.current = null;
              compositionStartDocRef.current = null;
              compositionStartSelectionRef.current = null;
              const pendingExternalValue = pendingExternalValueRef.current;
              if (pendingExternalValue !== null) {
                pendingExternalValueRef.current = null;
                syncEditorWithValue(pendingExternalValue, true);
              }
            });
            return false;
          },
          paste(event) {
            if (!onPasteImage) {
              return false;
            }
            const items = event.clipboardData?.items;
            if (!items) {
              return false;
            }
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                  event.preventDefault();
                  onPasteImage(file);
                  return true;
                }
              }
            }
            return false;
          },
        }),
      ],
      [cspNonce, emitCurrentEditorDoc, onPasteImage, syncEditorWithValue],
    );

    const {view, setContainer} = useCodeMirror({
      value: undefined,
      height: "100%",
      extensions,
      onChange: handleChange,
      basicSetup: {
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: true,
      },
    });

    viewRef.current = view ?? null;

    useEffect(() => {
      latestPropValueRef.current = value;
      let raf = 0;
      const sync = () => {
        if (!viewRef.current) {
          raf = requestAnimationFrame(sync);
          return;
        }
        if (composingRef.current || compositionSettlingRef.current) {
          const currentDoc = viewRef.current.state.doc.toString();
          if (shouldQueueExternalValueDuringComposition({
            currentDoc,
            incomingValue: value,
            compositionStartValue: compositionStartValueRef.current,
            lastEmittedValue: lastEmittedValueRef.current,
          })) {
            pendingExternalValueRef.current = value;
          }
          return;
        }
        syncEditorWithValue(value, true);
      };
      sync();
      return () => cancelAnimationFrame(raf);
    }, [syncEditorWithValue, value, view]);

    useEffect(() => {
      return () => {
        if (compositionEndFrameRef.current) {
          cancelAnimationFrame(compositionEndFrameRef.current);
        }
        if (keyFallbackFrameRef.current) {
          cancelAnimationFrame(keyFallbackFrameRef.current);
        }
      };
    }, []);

    const setEditorContainer = useCallback((element: HTMLDivElement | null) => {
      setContainer(element);
    }, [setContainer]);

    return (
      <div
        ref={setEditorContainer}
        className="cm-theme-light"
        style={{height: "100%", fontSize: 14}}
      />
    );
  },
);

MarkdownEditor.displayName = "MarkdownEditor";

export default MarkdownEditor;
