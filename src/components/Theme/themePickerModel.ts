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
