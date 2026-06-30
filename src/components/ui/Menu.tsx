import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from "react";
import {createPortal} from "react-dom";
import {AnimatePresence, motion} from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 触发按钮，由调用方渲染并自行 toggle open。 */
  trigger: ReactNode;
  children: ReactNode;
  minWidth?: number;
  align?: "start" | "end";
}

export default function Menu({open, onClose, trigger, children, minWidth = 120, align = "start"}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({position: "fixed", top: 0, left: 0, minWidth});

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;

    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;

      const base: CSSProperties = {
        position: "fixed",
        top: rect.bottom + 4,
        minWidth,
      };

      if (align === "end") {
        base.right = Math.max(8, window.innerWidth - rect.right);
      } else {
        base.left = Math.max(8, rect.left);
      }

      setMenuStyle(base);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, minWidth, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              className="z-[2100] overflow-hidden rounded-sm border border-border bg-bg shadow-md"
              style={menuStyle}
              initial={{opacity: 0, scale: 0.96, y: -4}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.96, y: -4}}
              transition={{duration: 0.13, ease: [0.16, 1, 0.3, 1]}}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

interface ItemProps {
  onClick: () => void;
  children: ReactNode;
}

export function MenuItem({onClick, children}: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 text-left text-[13px] text-text transition-colors duration-fast hover:bg-bg-tertiary"
    >
      {children}
    </button>
  );
}
