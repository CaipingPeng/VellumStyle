import {useEffect, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {toast, type ToastItem} from "./toast.ts";
import {MOTION_DURATION_MEDIUM, MOTION_EASE_SMOOTH} from "../../utils/motion.ts";

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => toast.subscribe(setItems), []);

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[3000] flex flex-col">
      <AnimatePresence>
        {items.map((it) => (
          <motion.div
            key={it.id}
            initial={{height: 0, marginBottom: 0, opacity: 0, x: 24, y: -8, scale: 0.96}}
            animate={{height: "auto", marginBottom: 8, opacity: 1, x: 0, y: 0, scale: 1}}
            exit={{height: 0, marginBottom: 0, opacity: 0, x: 24, y: -8, scale: 0.96}}
            transition={{duration: MOTION_DURATION_MEDIUM, ease: MOTION_EASE_SMOOTH}}
            className="overflow-hidden"
          >
            <div
              className="max-w-[360px] rounded px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-md"
              style={{
                background: "rgba(26,26,30,0.92)",
                borderLeft: it.type === "error" ? "3px solid var(--danger)" : "3px solid var(--success)",
              }}
            >
              {it.message}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
