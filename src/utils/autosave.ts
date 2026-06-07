// debounce 自动保存：schedule 重置计时，到点 flush；flushNow 立即 flush 并取消计时。
// 取纯逻辑（计时决策 + pending 标记）便于单测，不耦合 store/CodeMirror。

export interface DebouncedSaver {
  schedule(text: string): void;
  flushNow(): Promise<void>;
}

export function createDebouncedSaver(
  save: (text: string) => void | Promise<void>,
  delayMs: number,
): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;

  async function doFlush() {
    if (pending === null) return;
    const text = pending;
    pending = null;
    await save(text);
  }

  return {
    schedule(text: string) {
      pending = text;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void doFlush();
      }, delayMs);
    },
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await doFlush();
    },
  };
}
