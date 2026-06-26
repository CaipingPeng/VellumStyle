import {forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef} from "react";
import {useCodeMirror} from "@uiw/react-codemirror";
import {markdown, markdownLanguage} from "@codemirror/lang-markdown";
import {languages} from "@codemirror/language-data";
import {EditorState, Prec} from "@codemirror/state";
import {EditorView, keymap} from "@codemirror/view";
import {undo, redo} from "@codemirror/commands";
import {openSearchPanel, search} from "@codemirror/search";
import {
  wrapSelection as wrapSel,
  insertLink as insLink,
  prefixLines as prefixLn,
  insertCodeBlock as insCode,
  shouldReplaceEditorDoc,
  shouldQueueExternalValueDuringComposition,
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
  documentKey?: string | null;
  onChange: (value: string) => void;
  // 粘贴图片时触发；返回的 Promise 完成后编辑器无需额外处理（插入由回调内部完成）。
  onPasteImage?: (file: File) => void;
}

// Markdown 编辑器：CodeMirror 6，自动换行、无行号，支持光标插入与粘贴图片。
const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  ({value, documentKey = null, onChange, onPasteImage}, ref) => {
    const viewRef = useRef<EditorView | null>(null);
    const cspNonce = useMemo(() => getCodeMirrorCspNonce(), []);
    const composingRef = useRef(false);
    const compositionSettlingRef = useRef(false);
    const compositionEndFrameRef = useRef(0);
    const suppressChangeRef = useRef(false);
    const latestPropValueRef = useRef(value);
    const lastEmittedValueRef = useRef<string | null>(null);
    const pendingExternalValueRef = useRef<string | null>(null);
    const pendingExternalDocumentChangedRef = useRef(false);
    const lastDocumentKeyRef = useRef<string | null>(documentKey);
    const compositionStartValueRef = useRef<string | null>(null);
    const onChangeRef = useRef(onChange);
    const editorHostRef = useRef<HTMLDivElement | null>(null);

    latestPropValueRef.current = value;
    onChangeRef.current = onChange;

    const syncEditorWithValue = useCallback((incomingValue: string, externalUpdate = true, documentChanged = false) => {
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
        documentChanged,
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
      // composition 期间 CodeMirror 会随 compositionupdate 多次触发 docChanged；
      // 若此时把中间态经 onChange 回传父组件，会形成 value→effect→sync 的回环，
      // 在 composition 边缘与浏览器原生 beforeinput(insertCompositionText) 叠加，
      // 导致中文符号被写入两次。故组合期间抑制 emit，留待 compositionend 后
      // 由 emitCurrentEditorDoc 统一提交最终值。
      if (suppressChangeRef.current || composingRef.current || compositionSettlingRef.current) {
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
        search({top: true}),
        EditorState.phrases.of({
          Find: "查找",
          Replace: "替换为",
          next: "下一个",
          previous: "上一个",
          all: "全选",
          "match case": "区分大小写",
          regexp: "正则",
          "by word": "整词",
          replace: "替换",
          "replace all": "全部替换",
          close: "关闭",
          "current match": "当前匹配",
          "on line": "位于行",
          "replaced match on line $": "已替换第 $ 行匹配",
          "replaced $ matches": "已替换 $ 处匹配",
        }),
        Prec.highest(keymap.of([{key: "Ctrl-h", run: openSearchPanel}])),
        EditorView.lineWrapping,
        // 聚焦时不加任何边框；让内容区撑满高度，使空白区域点击也能定位光标。
        EditorView.theme({
          "&.cm-focused": {outline: "none"},
          ".cm-content": {minHeight: "100%"},
        }),
        EditorView.domEventHandlers({
          compositionstart() {
            if (compositionEndFrameRef.current) {
              cancelAnimationFrame(compositionEndFrameRef.current);
              compositionEndFrameRef.current = 0;
            }
            composingRef.current = true;
            compositionSettlingRef.current = false;
            compositionStartValueRef.current = latestPropValueRef.current;
            return false;
          },
          compositionend() {
            compositionSettlingRef.current = true;
            compositionEndFrameRef.current = requestAnimationFrame(() => {
              compositionEndFrameRef.current = 0;
              emitCurrentEditorDoc();
              composingRef.current = false;
              compositionSettlingRef.current = false;
              compositionStartValueRef.current = null;
              const pendingExternalValue = pendingExternalValueRef.current;
              const pendingExternalDocumentChanged = pendingExternalDocumentChangedRef.current;
              if (pendingExternalValue !== null) {
                pendingExternalValueRef.current = null;
                pendingExternalDocumentChangedRef.current = false;
                syncEditorWithValue(pendingExternalValue, true, pendingExternalDocumentChanged);
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
      const nextDocumentKey = documentKey ?? null;
      const documentChanged = lastDocumentKeyRef.current !== nextDocumentKey;
      if (documentChanged) {
        lastDocumentKeyRef.current = nextDocumentKey;
      }
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
            pendingExternalDocumentChangedRef.current = pendingExternalDocumentChangedRef.current || documentChanged;
          }
          return;
        }
        syncEditorWithValue(value, true, documentChanged);
      };
      sync();
      return () => cancelAnimationFrame(raf);
    }, [documentKey, syncEditorWithValue, value, view]);

    useEffect(() => {
      return () => {
        if (compositionEndFrameRef.current) {
          cancelAnimationFrame(compositionEndFrameRef.current);
        }
      };
    }, []);

    const setEditorContainer = useCallback((element: HTMLDivElement | null) => {
      setContainer(element);
      editorHostRef.current = element;
    }, [setContainer]);

    // 让 CodeMirror 搜索/替换浮层可在编辑区内随用随拖：注入一个拖拽手柄，仅修改定位，
    // 不触碰 CodeMirror 的搜索/替换命令与按钮事件绑定，避免引入功能回归。
    useEffect(() => {
      const host = editorHostRef.current;
      if (!host) return;
      let panel: HTMLElement | null = null;

      const onPointerDown = (event: PointerEvent) => {
        const handle = event.currentTarget as HTMLElement;
        if (!panel) return;
        const panelEl = panel;
        event.preventDefault();
        const parent = panel.offsetParent as HTMLElement | null;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const startLeft = panelRect.left - parentRect.left;
        const startTop = panelRect.top - parentRect.top;
        // 切换为显式定位并移除居中 transform，以便自由拖动。
        panelEl.style.transform = "none";
        panelEl.style.left = `${startLeft}px`;
        panelEl.style.top = `${startTop}px`;
        const originX = event.clientX;
        const originY = event.clientY;
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          // 捕获失败时拖动仍可由现有监听兜底
        }
        const clamp = (left: number, top: number) => {
          const maxLeft = Math.max(parent.clientWidth - panelEl.offsetWidth, 0);
          const maxTop = Math.max(parent.clientHeight - panelEl.offsetHeight, 0);
          panelEl.style.left = `${Math.min(Math.max(left, 0), maxLeft)}px`;
          panelEl.style.top = `${Math.min(Math.max(top, 0), maxTop)}px`;
        };
        const onMove = (ev: PointerEvent) => {
          clamp(startLeft + (ev.clientX - originX), startTop + (ev.clientY - originY));
        };
        const onUp = (ev: PointerEvent) => {
          try {
            handle.releasePointerCapture(ev.pointerId);
          } catch {
            // noop
          }
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      };

      const ensureHandle = () => {
        const p = host.querySelector<HTMLElement>(".cm-panel.cm-search");
        if (!p) {
          panel = null;
          return;
        }
        panel = p;
        // 每次注入都用本侧闭包的 onPointerDown，覆盖 StrictMode 重挂载等情况。
        p.querySelector(".od-search-drag-handle")?.remove();
        const handle = document.createElement("div");
        handle.className = "od-search-drag-handle";
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", "拖动查找替换面板");
        const grip = document.createElement("span");
        grip.className = "od-grip";
        handle.appendChild(grip);
        p.prepend(handle);
        handle.addEventListener("pointerdown", onPointerDown);
      };

      const onMutation = (records: MutationRecord[]) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as HTMLElement;
            if (el.classList.contains("cm-panel") || el.querySelector(".cm-panel.cm-search")) {
              ensureHandle();
            }
          });
        }
      };

      const editor = host.querySelector<HTMLElement>(".cm-editor");
      const observer = new MutationObserver(onMutation);
      observer.observe(editor ?? host, {childList: true, subtree: true});
      ensureHandle();

      return () => {
        observer.disconnect();
        const handle = panel?.querySelector(".od-search-drag-handle") as HTMLElement | null;
        if (handle) {
          handle.removeEventListener("pointerdown", onPointerDown);
        }
      };
    }, []);

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
