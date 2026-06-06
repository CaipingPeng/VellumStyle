// 编辑器 ↔ 预览 双向同步滚动引擎（按源码行号对齐）。
// 预览侧 DOM 的顶层块带 data-line（见 markdown/data-line.ts）；
// 编辑器侧由调用方提供「取顶部可视行 / 滚到某行」回调。

export interface ScrollSyncOptions {
  // 编辑器滚动容器（CodeMirror 的 .cm-scroller）
  editorScroller: HTMLElement;
  // 预览滚动容器（Preview 外层 overflow:auto 的 div）
  previewScroller: HTMLElement;
  // 取编辑器顶部可视行号（0-based，与 data-line 同基准）
  getEditorTopLine: () => number;
  // 把编辑器滚到指定行（0-based）
  scrollEditorToLine: (line: number) => void;
}

const LOCK_MS = 80;

export function createScrollSync(opts: ScrollSyncOptions): {destroy: () => void} {
  const {editorScroller, previewScroller, getEditorTopLine, scrollEditorToLine} = opts;
  // 程序触发的滚动会回弹 scroll 事件；lockUntil 期内忽略被动方事件，避免互推。
  let lockUntil = 0;
  let rafId = 0;

  // 读预览所有锚点元素，按 data-line 升序返回 {line, top}。
  const anchors = (): {line: number; top: number}[] => {
    const els = previewScroller.querySelectorAll<HTMLElement>("[data-line]");
    const list: {line: number; top: number}[] = [];
    for (const el of els) {
      const line = Number(el.getAttribute("data-line"));
      if (!Number.isNaN(line)) {
        list.push({line, top: el.offsetTop});
      }
    }
    list.sort((a, b) => a.line - b.line);
    return list;
  };

  // 编辑器 → 预览：按顶部行号在锚点间线性插值出预览 scrollTop。
  const syncEditorToPreview = () => {
    const list = anchors();
    if (list.length === 0) {
      return;
    }
    const line = getEditorTopLine();
    // 找 line <= 当前的最后一个锚点 prev，及其后第一个 next
    let prev = list[0];
    let next = list[list.length - 1];
    for (let i = 0; i < list.length; i++) {
      if (list[i].line <= line) {
        prev = list[i];
        next = list[i + 1] ?? list[i];
      } else {
        break;
      }
    }
    let top: number;
    if (next.line === prev.line) {
      top = prev.top;
    } else {
      const ratio = (line - prev.line) / (next.line - prev.line);
      top = prev.top + ratio * (next.top - prev.top);
    }
    lockUntil = Date.now() + LOCK_MS;
    previewScroller.scrollTop = top;
  };

  // 预览 → 编辑器：按预览 scrollTop 反插值出行号，滚编辑器到该行。
  const syncPreviewToEditor = () => {
    const list = anchors();
    if (list.length === 0) {
      return;
    }
    const st = previewScroller.scrollTop;
    let prev = list[0];
    let next = list[list.length - 1];
    for (let i = 0; i < list.length; i++) {
      if (list[i].top <= st) {
        prev = list[i];
        next = list[i + 1] ?? list[i];
      } else {
        break;
      }
    }
    let line: number;
    if (next.top === prev.top) {
      line = prev.line;
    } else {
      const ratio = (st - prev.top) / (next.top - prev.top);
      line = prev.line + ratio * (next.line - prev.line);
    }
    lockUntil = Date.now() + LOCK_MS;
    scrollEditorToLine(Math.round(line));
  };

  const onEditorScroll = () => {
    if (Date.now() < lockUntil) {
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(syncEditorToPreview);
  };

  const onPreviewScroll = () => {
    if (Date.now() < lockUntil) {
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(syncPreviewToEditor);
  };

  editorScroller.addEventListener("scroll", onEditorScroll, {passive: true});
  previewScroller.addEventListener("scroll", onPreviewScroll, {passive: true});

  return {
    destroy() {
      cancelAnimationFrame(rafId);
      editorScroller.removeEventListener("scroll", onEditorScroll);
      previewScroller.removeEventListener("scroll", onPreviewScroll);
    },
  };
}
