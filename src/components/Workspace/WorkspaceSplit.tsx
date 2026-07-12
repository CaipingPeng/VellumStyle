import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_WORKSPACE_SPLIT_RATIO,
  clampWorkspaceSplitRatio,
  getWorkspacePaneWidths,
  getWorkspaceRatioBounds,
  ratioFromPointer,
  sanitizeWorkspaceSplitRatio,
  stepWorkspaceSplitRatio,
} from "./workspaceSplitLayout.ts";

interface WorkspaceSplitProps {
  ratio: number;
  onRatioCommit: (ratio: number) => void;
  editor: ReactNode;
  preview: ReactNode;
}

interface DragState {
  pointerId: number;
  ratio: number;
}

export default function WorkspaceSplit({ratio, onRatioCommit, editor, preview}: WorkspaceSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftRatioRef = useRef(sanitizeWorkspaceSplitRatio(ratio));
  const [draftRatio, setDraftRatio] = useState(draftRatioRef.current);
  const [containerWidth, setContainerWidth] = useState(0);

  const updateDraftRatio = useCallback((nextRatio: number) => {
    draftRatioRef.current = nextRatio;
    setDraftRatio(nextRatio);
  }, []);

  useEffect(() => {
    if (!dragRef.current) {
      updateDraftRatio(sanitizeWorkspaceSplitRatio(ratio));
    }
  }, [ratio, updateDraftRatio]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = (observedWidth?: number) => {
      const width = observedWidth ?? container.getBoundingClientRect().width;
      setContainerWidth(Math.max(width, 0));
    };
    measure();

    const observer = new ResizeObserver((entries) => {
      measure(entries[0]?.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const cleanupDragState = useCallback(() => {
    const drag = dragRef.current;
    if (drag && separatorRef.current) {
      try {
        separatorRef.current.releasePointerCapture(drag.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
    dragRef.current = null;
    document.documentElement.classList.remove("workspace-is-resizing");
  }, []);

  useEffect(() => cleanupDragState, [cleanupDragState]);

  const bounds = useMemo(() => getWorkspaceRatioBounds(containerWidth), [containerWidth]);
  const displayRatio = clampWorkspaceSplitRatio(draftRatio, containerWidth);
  const paneWidths = useMemo(
    () => getWorkspacePaneWidths(draftRatio, containerWidth),
    [containerWidth, draftRatio],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragRef.current = {pointerId: event.pointerId, ratio: displayRatio};
    document.documentElement.classList.add("workspace-is-resizing");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue with React pointer handlers if capture is unavailable.
    }
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !container) return;
    const rect = container.getBoundingClientRect();
    const nextRatio = ratioFromPointer(event.clientX, rect.left, rect.width);
    drag.ratio = nextRatio;
    updateDraftRatio(nextRatio);
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const committedRatio = drag.ratio;
    cleanupDragState();
    onRatioCommit(committedRatio);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nextRatio = stepWorkspaceSplitRatio(
      draftRatioRef.current,
      event.key,
      containerWidth,
      event.shiftKey || event.altKey,
    );
    if (nextRatio === null) return;
    event.preventDefault();
    updateDraftRatio(nextRatio);
    onRatioCommit(nextRatio);
  };

  const resetRatio = () => {
    const nextRatio = clampWorkspaceSplitRatio(DEFAULT_WORKSPACE_SPLIT_RATIO, containerWidth);
    updateDraftRatio(nextRatio);
    onRatioCommit(nextRatio);
  };

  const unmeasuredStyle = {flex: "1 1 0"};
  const editorStyle = containerWidth > 0 ? {width: paneWidths.editor} : unmeasuredStyle;
  const previewStyle = containerWidth > 0 ? {width: paneWidths.preview} : unmeasuredStyle;

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1" data-workspace-split>
      <div
        className="min-h-0 min-w-0 flex-none"
        data-workspace-pane="editor"
        style={editorStyle}
      >
        {editor}
      </div>
      <div
        ref={separatorRef}
        role="separator"
        aria-label="调整编辑器和预览宽度"
        aria-orientation="vertical"
        aria-valuemin={Math.round(bounds.min * 100)}
        aria-valuemax={Math.round(bounds.max * 100)}
        aria-valuenow={Math.round(displayRatio * 100)}
        tabIndex={0}
        title="拖动或用方向键调整；双击恢复默认"
        className="workspace-split-separator flex-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onKeyDown={handleKeyDown}
        onDoubleClick={resetRatio}
      />
      <div
        className="min-h-0 min-w-0 flex-none"
        data-workspace-pane="preview"
        style={previewStyle}
      >
        {preview}
      </div>
    </div>
  );
}
