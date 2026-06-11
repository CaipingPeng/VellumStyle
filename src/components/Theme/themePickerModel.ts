interface ThemeListItem {
  id: string;
  name: string;
}

interface CodeThemeListItem extends ThemeListItem {
  group: string;
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

export function filterAndRankCodeThemes<T extends CodeThemeListItem>(
  themes: T[],
  query: string,
  pinnedIds: string[],
  currentId: string,
): T[] {
  const q = query.trim().toLocaleLowerCase("zh-CN");
  const pinnedOrder = new Map(pinnedIds.map((id, index) => [id, index]));
  return themes
    .map((theme, index) => ({theme, index}))
    .filter(({theme}) => {
      if (!q) return true;
      return (
        theme.name.toLocaleLowerCase("zh-CN").includes(q) ||
        theme.id.toLocaleLowerCase("zh-CN").includes(q) ||
        theme.group.toLocaleLowerCase("zh-CN").includes(q)
      );
    })
    .sort((a, b) => {
      const rank = (id: string) => id === currentId ? 0 : pinnedOrder.has(id) ? 1 : 2;
      const rankA = rank(a.theme.id);
      const rankB = rank(b.theme.id);
      const pinnedA = pinnedOrder.get(a.theme.id) ?? Number.MAX_SAFE_INTEGER;
      const pinnedB = pinnedOrder.get(b.theme.id) ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB || pinnedA - pinnedB || a.index - b.index;
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
