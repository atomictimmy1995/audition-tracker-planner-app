/**
 * Monetization boundaries (spec §7). RevenueCat wiring is phase 7; until
 * then everyone is on the free tier and Pro features show the upgrade path.
 */

export const FREE_LIMITS = {
  activeAuditions: 1,
  excerptCards: 3,
} as const;

export interface Entitlements {
  pro: boolean;
}

/** TODO(phase 7): read from RevenueCat customer info. */
export async function getEntitlements(): Promise<Entitlements> {
  return { pro: false };
}

export function canAddAudition(activeCount: number, ent: Entitlements): boolean {
  return ent.pro || activeCount < FREE_LIMITS.activeAuditions;
}

export function canAddExcerptCard(cardCount: number, ent: Entitlements): boolean {
  return ent.pro || cardCount < FREE_LIMITS.excerptCards;
}

export const UPGRADE_COPY = {
  auditions:
    'Free covers one active audition. Pro tracks your whole season — unlimited auditions, overlap analysis, and the AI practice plan.',
  cards:
    'Free covers three excerpt cards. Pro keeps your whole portfolio — every excerpt, every recording, every year.',
  plan:
    'The AI practice plan is a Pro feature: overlap analysis, a periodized rotation, and a plan that adapts when life happens.',
};
