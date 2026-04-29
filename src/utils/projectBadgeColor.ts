/** Stable Modus badge `color` per project id (replaces ad-hoc hex tiles). */
export const PROJECT_BADGE_COLORS = [
  "primary",
  "secondary",
  "success",
  "warning",
  "danger",
  "tertiary",
] as const;

export type ProjectBadgeColor = (typeof PROJECT_BADGE_COLORS)[number];

export function badgeColorForProjectId(id: string): ProjectBadgeColor {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
  }
  const idx = Math.abs(h) % PROJECT_BADGE_COLORS.length;
  return PROJECT_BADGE_COLORS[idx];
}
