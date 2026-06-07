// 模块级 toast 单例：组件外可直接 toast.show(...)，Toaster 订阅渲染。
export type ToastType = "info" | "error";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l([...items]);
}

export const toast = {
  show(message: string, type: ToastType = "info", duration = 2500) {
    const id = nextId++;
    items = [...items, {id, message, type}];
    emit();
    window.setTimeout(() => {
      items = items.filter((it) => it.id !== id);
      emit();
    }, duration);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    l([...items]);
    return () => {
      listeners.delete(l);
    };
  },
};
