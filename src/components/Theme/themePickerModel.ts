interface ThemeListItem {
  id: string;
  name: string;
}

export function filterAndRankThemes<T extends ThemeListItem>(
  themes: T[],
  query: string,
  favoriteIds: string[],
  currentId: string,
): T[] {
  const q = query.trim().toLocaleLowerCase("zh-CN");
  const favorites = new Set(favoriteIds);
  return themes
    .map((theme, index) => ({theme, index}))
    .filter(({theme}) => {
      if (!q) return true;
      return theme.name.toLocaleLowerCase("zh-CN").includes(q) || theme.id.toLocaleLowerCase("zh-CN").includes(q);
    })
    .sort((a, b) => {
      const rank = (id: string) => id === currentId ? 0 : favorites.has(id) ? 1 : 2;
      return rank(a.theme.id) - rank(b.theme.id) || a.index - b.index;
    })
    .map(({theme}) => theme);
}

export function getPageJumpRange(currentPage: number, totalPages: number, windowSize: number): number[] {
  if (totalPages <= 0 || windowSize <= 0) return [];

  const safeCurrent = Math.min(Math.max(0, currentPage), totalPages - 1);
  const size = Math.min(windowSize, totalPages);
  const maxStart = Math.max(0, totalPages - size);
  const start = Math.min(safeCurrent, maxStart);

  return Array.from({length: size}, (_, index) => start + index);
}

export function shouldShowPageJumpInput(totalPages: number, threshold: number): boolean {
  return totalPages > threshold;
}

export function getPageJumpTarget(input: string, totalPages: number): number | null {
  const value = input.trim();
  if (totalPages <= 0 || !/^\d+$/.test(value)) return null;

  const pageNumber = Number(value);
  if (!Number.isSafeInteger(pageNumber)) return null;

  return Math.min(Math.max(1, pageNumber), totalPages) - 1;
}
