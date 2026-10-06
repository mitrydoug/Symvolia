/**
 * Helpers for reading Vite environment variables. Values are trimmed and empty
 * strings are treated as "unset" so blank env entries behave like missing ones.
 */

/** Trim an env value, returning undefined for empty/whitespace-only values. */
export const optionalEnvValue = (
  value: string | undefined,
): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
};

/** Read a required env value, throwing a descriptive error when it is missing. */
export const requiredEnvValue = (
  name: keyof ImportMetaEnv,
  value: string | undefined,
): string => {
  const trimmedValue = optionalEnvValue(value);
  if (!trimmedValue) {
    throw new Error(`${name} is required.`);
  }

  return trimmedValue;
};
