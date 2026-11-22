export const LIFETIME_MS = 72 * 60 * 60 * 1000;

export type DisappearMode = '72h' | '1h' | '1m' | '10s';
export const DISAPPEAR_MS: Record<DisappearMode, number> = {
  '72h': 72 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1m': 60 * 1000,
  '10s': 10 * 1000,
};

export function lifetimeFor(mode?: string | null): number {
  if (mode && mode in DISAPPEAR_MS) return DISAPPEAR_MS[mode as DisappearMode];
  return LIFETIME_MS;
}
