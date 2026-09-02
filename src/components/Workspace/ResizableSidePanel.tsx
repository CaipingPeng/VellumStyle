import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_SIDE_PANEL_WIDTH,
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  SIDE_PANEL_WIDTH_STEP,
  resizeSidePanelWidth,
} from "./sidePanelLayout.ts";

interface ResizableSidePanelProps {
  ariaLabel: string;
  children: ReactNode;
}

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

export default function ResizableSidePanel({ariaLabel, children}: ResizableSidePanelProps) {
  const separatorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [width, setWidth] = useState(DEFAULT_SIDE_PANEL_WIDTH);

  const cleanupDragState = useCallback(() => {
    const drag = dragRef.current;
    if (drag && separatorRef.current) {
      try {
        separatorRef.current.releasePointerCapture(drag.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
      separatorRef.current.classList.remove("is-resizing");
    }
    dragRef.current = null;
    document.documentElement.classList.remove("workspace-is-resizing");
  }, []);

  useEffect(() => cleanupDragState, [cleanupDragState]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    document.documentElement.classList.add("workspace-is-resizing");
    event.currentTarget.classList.add("is-resizing");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue with React pointer handlers if capture is unavailable.
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setWidth(resizeSidePanelWidth(drag.startWidth, drag.startX, event.clientX));
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    cleanupDragState();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -SIDE_PANEL_WIDTH_STEP : SIDE_PANEL_WIDTH_STEP;
    setWidth((currentWidth) => resizeSidePanelWidth(currentWidth, 0, delta));
  };

  return (
    <div
      className="workspace-side-panel-container relative flex min-h-0 flex-none"
      style={{width}}
    >
      {children}
      <div
        ref={separatorRef}
        role="separator"
        aria-label={ariaLabel}
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDE_PANEL_WIDTH}
        aria-valuemax={MAX_SIDE_PANEL_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        title="拖动或用方向键调整；双击恢复默认"
        className="workspace-side-panel-separator"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => setWidth(DEFAULT_SIDE_PANEL_WIDTH)}
      />
    </div>
  );
}
