export interface MaterialOperationResult<T> {
  item: T;
  error?: unknown;
}

export async function runMaterialOperations<T>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<void>,
  onSettled?: (completed: number, total: number) => void,
): Promise<MaterialOperationResult<T>[]> {
  if (items.length === 0) return [];
  const results = new Array<MaterialOperationResult<T>>(items.length);
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      try {
        await operation(item);
        results[index] = {item};
      } catch (error) {
        results[index] = {item, error};
      }
      completed += 1;
      onSettled?.(completed, items.length);
    }
  };

  await Promise.all(Array.from({length: workerCount}, () => worker()));
  return results;
}
