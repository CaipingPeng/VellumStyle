export interface DebouncedMaxWaitScheduler<T> {
  schedule(value: T): void;
  flush(): void;
  cancel(): void;
}

/**
 * 尾防抖，并保证持续调用时最迟在 maxWaitMs 后执行一次。
 * 每次真正执行后都会开启一个新的等待周期。
 */
export function createDebouncedMaxWaitScheduler<T>(
  run: (value: T) => void,
  debounceMs: number,
  maxWaitMs: number,
): DebouncedMaxWaitScheduler<T> {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | undefined;
  let hasPending = false;

  const clearTimers = () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    if (maxWaitTimer !== null) clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  };

  const invoke = () => {
    if (!hasPending) {
      clearTimers();
      return;
    }
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    clearTimers();
    run(value);
  };

  return {
    schedule(value) {
      pending = value;
      hasPending = true;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(invoke, debounceMs);
      if (maxWaitTimer === null) {
        maxWaitTimer = setTimeout(invoke, maxWaitMs);
      }
    },
    flush: invoke,
    cancel() {
      pending = undefined;
      hasPending = false;
      clearTimers();
    },
  };
}
