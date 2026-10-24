// 防抖的 localStorage 包装：zustand persist 每次 set() 都会同步 setItem，
// 编辑器输入时该写盘会阻塞主线程。这里把写操作合并为 400ms 尾防抖
// （连续输入期间最多 2s 一次强制落盘），并在页面隐藏/退出前 flush 兜底。

const DEBOUNCE_MS = 400;
const MAX_WAIT_MS = 2000;

interface PendingWrite {
  key: string;
  value: string;
}

export function createDebouncedLocalStorage(): Storage {
  const raw = window.localStorage;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: PendingWrite | null = null;

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    if (pending !== null) {
      try {
        raw.setItem(pending.key, pending.value);
      } finally {
        pending = null;
      }
    }
  }

  // 应用退出/窗口隐藏前把最后一次状态落盘，避免丢最近一次偏好修改。
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);

  const storage: Storage = {
    get length() {
      return raw.length;
    },
    clear() {
      flush();
      raw.clear();
    },
    getItem(key) {
      return raw.getItem(key);
    },
    key(index) {
      return raw.key(index);
    },
    removeItem(key) {
      flush();
      raw.removeItem(key);
    },
    setItem(key, value) {
      pending = {key, value};
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, DEBOUNCE_MS);
      if (maxTimer === null) {
        maxTimer = setTimeout(flush, MAX_WAIT_MS);
      }
    },
  };
  return storage;
}
