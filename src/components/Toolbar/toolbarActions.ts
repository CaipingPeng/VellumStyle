export const SECONDARY_ACTIONS = ["import", "export", "theme", "settings"] as const;

export type SecondaryAction = (typeof SECONDARY_ACTIONS)[number];
