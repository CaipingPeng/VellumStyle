// debounce 自动保存：schedule 重置计时，到点 flush；flushNow 立即 flush 并取消计时。
// 保存串行执行，避免慢磁盘/Tauri 写入时并发 flush 抢占编辑体验。

export interface DebouncedSaver {
  schedule(text: string): void;
  flushNow(): Promise<void>;
}

interface DebouncedSaverEvents {
  onScheduled?: () => void;
  onFlushStart?: (text: string) => void;
  onFlushSuccess?: (text: string) => void;
  onFlushError?: (error: unknown) => void;
}

export function createDebouncedSaver(
  save: (text: string) => void | Promise<void>,
  delayMs: number,
  events: DebouncedSaverEvents = {},
): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  let flushRequested = false;
  let drainPromise: Promise<void> | null = null;

  async function drain() {
    while (flushRequested && pending !== null) {
      flushRequested = false;
      const text = pending;
      pending = null;
      events.onFlushStart?.(text);
      try {
        await save(text);
        events.onFlushSuccess?.(text);
      } catch (error) {
        events.onFlushError?.(error);
        throw error;
      }
    }
  }

  function startDrain(): Promise<void> {
    if (!drainPromise) {
      drainPromise = drain().finally(() => {
        drainPromise = null;
        if (flushRequested && pending !== null) {
          void startDrain().catch(() => undefined);
        }
      });
    }
    return drainPromise;
  }

  return {
    schedule(text: string) {
      pending = text;
      events.onScheduled?.();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flushRequested = true;
        void startDrain().catch(() => undefined);
      }, delayMs);
    },
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending === null) {
        await drainPromise;
        return;
      }
      flushRequested = true;
      await startDrain();
    },
  };
}
