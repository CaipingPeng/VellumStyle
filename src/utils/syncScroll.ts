// 编辑器 ↔ 预览 双向同步滚动引擎（按源码行号对齐）。
// 预览侧 DOM 的顶层块带 data-line（见 markdown/data-line.ts）；
// 编辑器侧由调用方提供「取顶部可视行 / 滚到某行」回调。
//
// 设计要点：方向由"用户意图"决定，而不是由 scroll 事件 + 时间锁决定。
// 原因：CodeMirror 的 scrollIntoView 是异步的，程序触发的编辑器滚动常在
// 下一帧甚至更晚才真正发生，会越过任何固定时长的时间锁，被误判成用户滚动，
// 进而把另一侧"拉回"到量化后的位置，表现为滚动回弹。
// 因此这里用 wheel/pointerdown/touchstart/keydown 意图事件锁定"主动方"，
// 只从主动方单向同步到被动方；被动方因此产生的回弹 scroll 一律忽略，
// 与其到达时机无关。

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

type ScrollSource = "editor" | "preview";
type ScrollDirection = -1 | 0 | 1;

// 主动方判定：最后一次意图事件后这段时间内认为该侧仍是主动方；
// 主动方持续滚动时会不断刷新该计时，故只在真正停止滚动后才释放。
const IDLE_MS = 140;

export function createScrollSync(opts: ScrollSyncOptions): {destroy: () => void} {
  const {editorScroller, previewScroller, getEditorTopLine, scrollEditorToLine} = opts;
  let activeSource: ScrollSource | null = null;
  let idleTimer = 0;
  let rafId = 0;
  let editorWheelDirection: ScrollDirection = 0;
  let previewWheelDirection: ScrollDirection = 0;
  let lastEditorScrollTop = editorScroller.scrollTop;
  let lastPreviewScrollTop = previewScroller.scrollTop;
  let lastEditorToPreviewTop: number | null = null;
  let lastPreviewToEditorLine: number | null = null;

  const scheduleRaf = (callback: () => void) => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(callback);
  };

  const clearIdle = () => {
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    }
  };

  const setActive = (source: ScrollSource) => {
    if (activeSource !== source) {
      // 切换主动方：取消上一轮可能挂起的反向同步，避免旧方向残留执行。
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    activeSource = source;
    clearIdle();
    idleTimer = window.setTimeout(() => {
      // 一段时间内没有任何意图事件 / 主动方滚动，释放主动方。被动方迟到
      // 的回弹 scroll 此时会被当作普通事件：因 activeSource 为 null 而被忽略。
      activeSource = null;
      editorWheelDirection = 0;
      previewWheelDirection = 0;
      lastEditorToPreviewTop = null;
      lastPreviewToEditorLine = null;
    }, IDLE_MS);
  };

  const wheelDirection = (event: Event): ScrollDirection => {
    if (event.type !== "wheel") {
      return 0;
    }
    const wheelEvent = event as WheelEvent;
    if (Math.abs(wheelEvent.deltaY) <= Math.abs(wheelEvent.deltaX)) {
      return 0;
    }
    return wheelEvent.deltaY > 0 ? 1 : -1;
  };

  const markEditorIntent = (event: Event) => {
    const direction = wheelDirection(event);
    if (event.type === "wheel" && !direction) {
      return;
    }
    if (direction && direction !== editorWheelDirection) {
      lastEditorToPreviewTop = previewScroller.scrollTop;
    } else if (!direction) {
      lastEditorToPreviewTop = null;
    }
    editorWheelDirection = direction;
    previewWheelDirection = 0;
    lastPreviewToEditorLine = null;
    if (event.type !== "wheel") {
      lastEditorScrollTop = editorScroller.scrollTop;
    }
    setActive("editor");
  };

  const markPreviewIntent = (event: Event) => {
    const direction = wheelDirection(event);
    if (event.type === "wheel" && !direction) {
      return;
    }
    if (direction && direction !== previewWheelDirection) {
      lastPreviewToEditorLine = null;
    } else if (!direction) {
      lastPreviewToEditorLine = null;
    }
    previewWheelDirection = direction;
    editorWheelDirection = 0;
    lastEditorToPreviewTop = null;
    if (event.type !== "wheel") {
      lastPreviewScrollTop = previewScroller.scrollTop;
    }
    setActive("preview");
  };

  const isScrollInWheelDirection = (
    scroller: HTMLElement,
    direction: ScrollDirection,
    getLastTop: () => number,
    setLastTop: (top: number) => void,
  ) => {
    const nextTop = scroller.scrollTop;
    const delta = nextTop - getLastTop();
    setLastTop(nextTop);
    return !direction || delta * direction > 1;
  };

  const allowsMonotonicTarget = (
    nextValue: number,
    lastValue: number | null,
    direction: ScrollDirection,
  ) => {
    if (!direction || lastValue === null) {
      return true;
    }
    return direction > 0 ? nextValue + 1 >= lastValue : nextValue <= lastValue + 1;
  };

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
    if (!allowsMonotonicTarget(top, lastEditorToPreviewTop, editorWheelDirection)) {
      return;
    }
    lastEditorToPreviewTop = top;
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
    const roundedLine = Math.round(line);
    if (!allowsMonotonicTarget(roundedLine, lastPreviewToEditorLine, previewWheelDirection)) {
      return;
    }
    lastPreviewToEditorLine = roundedLine;
    scrollEditorToLine(roundedLine);
  };

  const onEditorScroll = () => {
    // 编辑器只有在"用户正在主动滚它"时才是同步源；其余情况（含我们调用
    // scrollEditorToLine 触发的异步回弹）一律忽略，杜绝 preview→editor→preview 回滚。
    if (activeSource !== "editor") {
      lastEditorScrollTop = editorScroller.scrollTop;
      return;
    }
    // CodeMirror 会在 wheel 后异步测量真实行高，并用反向 scrollTop 修正来维持
    // 自己的滚动锚点。这类修正不是用户继续滚动，不能再同步到预览，否则会
    // 触发 preview scroll + React 更新，把编辑区持续拉回旧位置。
    if (!isScrollInWheelDirection(
      editorScroller,
      editorWheelDirection,
      () => lastEditorScrollTop,
      (top) => {
        lastEditorScrollTop = top;
      },
    )) {
      return;
    }
    setActive("editor"); // 刷新活跃计时，覆盖连续滚动 / 惯性滚动
    scheduleRaf(syncEditorToPreview);
  };

  const onPreviewScroll = () => {
    if (activeSource !== "preview") {
      lastPreviewScrollTop = previewScroller.scrollTop;
      return;
    }
    if (!isScrollInWheelDirection(
      previewScroller,
      previewWheelDirection,
      () => lastPreviewScrollTop,
      (top) => {
        lastPreviewScrollTop = top;
      },
    )) {
      return;
    }
    setActive("preview");
    scheduleRaf(syncPreviewToEditor);
  };

  const intentEvents = ["wheel", "pointerdown", "touchstart", "keydown"] as const;

  for (const eventName of intentEvents) {
    editorScroller.addEventListener(eventName, markEditorIntent, {passive: true});
    previewScroller.addEventListener(eventName, markPreviewIntent, {passive: true});
  }
  editorScroller.addEventListener("scroll", onEditorScroll, {passive: true});
  previewScroller.addEventListener("scroll", onPreviewScroll, {passive: true});

  return {
    destroy() {
      cancelAnimationFrame(rafId);
      clearIdle();
      for (const eventName of intentEvents) {
        editorScroller.removeEventListener(eventName, markEditorIntent);
        previewScroller.removeEventListener(eventName, markPreviewIntent);
      }
      editorScroller.removeEventListener("scroll", onEditorScroll);
      previewScroller.removeEventListener("scroll", onPreviewScroll);
    },
  };
}
