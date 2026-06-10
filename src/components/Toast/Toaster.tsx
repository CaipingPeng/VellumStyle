import {useEffect, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {toast, type ToastItem} from "./toast.ts";

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => toast.subscribe(setItems), []);

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[3000] flex flex-col gap-2">
      <AnimatePresence>
        {items.map((it) => (
          <motion.div
            key={it.id}
            initial={{opacity: 0, x: 24}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: 24}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            className="max-w-[360px] rounded px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-md"
            style={{
              background: "rgba(26,26,30,0.92)",
              borderLeft: it.type === "error" ? "3px solid var(--danger)" : "3px solid var(--success)",
            }}
          >
            {it.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
