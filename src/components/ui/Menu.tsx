import {useEffect, useRef, type ReactNode} from "react";
import {AnimatePresence, motion} from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 触发按钮，由调用方渲染并自行 toggle open。 */
  trigger: ReactNode;
  children: ReactNode;
  minWidth?: number;
}

export default function Menu({open, onClose, trigger, children, minWidth = 120}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute left-0 top-[34px] z-10 overflow-hidden rounded-sm border border-border bg-bg shadow-md"
            style={{minWidth}}
            initial={{opacity: 0, scale: 0.96, y: -4}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: -4}}
            transition={{duration: 0.13, ease: [0.16, 1, 0.3, 1]}}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
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
      className="block w-full cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-[13px] text-text transition-colors duration-fast hover:bg-bg-tertiary"
    >
      {children}
    </button>
  );
}
