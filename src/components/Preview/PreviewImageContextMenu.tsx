import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {Copy, Save} from "lucide-react";
import {clampMenuPosition, type PreviewImageMenuTarget} from "./previewImageContextMenu.ts";

interface Props {
  target: PreviewImageMenuTarget;
  onCopy: (source: string) => void | Promise<void>;
  onSave: (source: string) => void | Promise<void>;
  onClose: () => void;
}

interface MenuPosition {
  left: number;
  top: number;
}

const VIEWPORT_GAP = 8;

export default function PreviewImageContextMenu({target, onCopy, onSave, onClose}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    setPosition(clampMenuPosition(
      target.x,
      target.y,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight,
      VIEWPORT_GAP,
    ));
    itemRefs.current[0]?.focus();
  }, [target.source, target.x, target.y]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const eventTarget = event.target;
      if (eventTarget instanceof Node && !menuRef.current?.contains(eventTarget)) {
        onClose();
      }
    };
    const handleBlur = () => onClose();
    const handleScroll = () => onClose();

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (Math.max(activeIndex, 0) + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  const style: CSSProperties = {
    position: "fixed",
    left: position?.left ?? target.x,
    top: position?.top ?? target.y,
    visibility: position ? "visible" : "hidden",
  };

  return createPortal(
    <div
      ref={menuRef}
      className="vs-preview-image-menu"
      role="menu"
      aria-label="图片操作"
      style={style}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={(element) => {
          itemRefs.current[0] = element;
        }}
        type="button"
        className="vs-preview-image-menu-item"
        role="menuitem"
        onClick={() => {
          void onCopy(target.source);
        }}
      >
        <Copy size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>拷贝图片</span>
      </button>
      <button
        ref={(element) => {
          itemRefs.current[1] = element;
        }}
        type="button"
        className="vs-preview-image-menu-item"
        role="menuitem"
        onClick={() => {
          void onSave(target.source);
        }}
      >
        <Save size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>将图片另存为</span>
      </button>
    </div>,
    document.body,
  );
}
