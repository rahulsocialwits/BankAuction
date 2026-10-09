/**
 * Small environment-backed feature switches.
 *
 * Defaults deliberately preserve current behaviour. Public UI switches must use
 * NEXT_PUBLIC_ variables because their values are read by browser-rendered code.
 * Server-only flags should use non-public variables and must never gate access
 * control or security checks.
 */
export const FEATURE_FLAGS = {
  propertyMap: {
    env: "NEXT_PUBLIC_FEATURE_PROPERTY_MAP",
    defaultEnabled: true,
  },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const config = FEATURE_FLAGS[flag];
  const raw = process.env[config.env];
  if (raw === undefined || raw.trim() === "") return config.defaultEnabled;
  return !DISABLED_VALUES.has(raw.trim().toLowerCase());
}
