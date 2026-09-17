// 预览渲染结果的容量控制。
//
// 只按「条数」限流是不够的：缓存 key 是全文、value 是最终 HTML，
// 20KB 文档约 60–80KB HTML，50 条 ≈ 4MB；文档涨到 100KB 时单条就能到几百 KB，
// 50 条就是几十 MB 常驻内存。所以在条数之外再加一条字节预算，谁先到就淘汰谁。
//
// 淘汰策略保持原来的 FIFO（Map 的插入顺序），不改成 LRU——缓存只在
// 「没命中」时写入，撤销/重做命中已有条目不会写，所以顺序差异实际可以忽略，
// 不值得为此改动行为。

/** JS 字符串按 UTF-16 计，1 个字符占 2 字节。 */
export function htmlByteSize(html: string): number {
  return html.length * 2;
}

export interface RenderCacheLimits {
  /** 最多缓存多少条。 */
  maxEntries: number;
  /** Markdown 键与 HTML 值的总字节上限（按 UTF-16 计）。 */
  maxBytes: number;
}

export interface RenderCache {
  get(key: string): string | undefined;
  set(key: string, html: string): void;
  readonly size: number;
  readonly byteSize: number;
  clear(): void;
}

export function createRenderCache(limits: RenderCacheLimits): RenderCache {
  const entries = new Map<string, string>();
  let bytes = 0;

  function evict(): void {
    // 始终保留最近 1 条：单个超大文档也必须能命中缓存，
    // 否则撤销/重做会退化成每次全量重渲染（实测 20KB 文档 150–400ms/次）。
    while (entries.size > 1 && (entries.size > limits.maxEntries || bytes > limits.maxBytes)) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const evicted = entries.get(oldestKey);
      entries.delete(oldestKey);
      bytes -= htmlByteSize(oldestKey) + htmlByteSize(evicted ?? "");
    }
  }

  return {
    get: (key) => entries.get(key),
    set: (key, html) => {
      // 同一个 key 再次写入时要先扣掉旧值，否则字节数会越算越多。
      const previous = entries.get(key);
      if (previous !== undefined) {
        bytes -= htmlByteSize(key) + htmlByteSize(previous);
        entries.delete(key);
      }
      entries.set(key, html);
      bytes += htmlByteSize(key) + htmlByteSize(html);
      evict();
    },
    get size() {
      return entries.size;
    },
    get byteSize() {
      return bytes;
    },
    clear: () => {
      entries.clear();
      bytes = 0;
    },
  };
}
