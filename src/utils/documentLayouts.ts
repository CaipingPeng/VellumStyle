import {DEFAULT_CODE_THEME_ID} from "../markdown/codeThemes.ts";
import {sanitizeTypography, type TypographyState} from "../themes/typography.ts";

export const LAYOUT_FILE = ".vellumstyle-layout-map.json";
export interface ArticleLayout {markdownThemeId: string; codeThemeId: string; typography: TypographyState}
export type DocumentLayouts = Record<string, ArticleLayout>;
export function sanitizeLayout(raw: unknown, theme = "ink-haze"): ArticleLayout {
  const value = raw && typeof raw === "object" ? raw as Partial<ArticleLayout> : {};
  return {markdownThemeId: typeof value.markdownThemeId === "string" && value.markdownThemeId ? value.markdownThemeId : theme,
    codeThemeId: typeof value.codeThemeId === "string" && value.codeThemeId ? value.codeThemeId : DEFAULT_CODE_THEME_ID,
    typography: sanitizeTypography(value.typography)};
}
export function sanitizeLayouts(raw: unknown): DocumentLayouts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([path]) => path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((part) => part === ".." || part === "."))
    .map(([path, layout]) => [path, sanitizeLayout(layout)]));
}
export function remapLayouts(map: DocumentLayouts, from: string, to: string): DocumentLayouts {
  return Object.fromEntries(Object.entries(map).map(([path, layout]) => [path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path, layout]));
}
