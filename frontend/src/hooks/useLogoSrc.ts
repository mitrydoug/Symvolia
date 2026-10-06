import { useColorScheme } from "@mui/material/styles";

/**
 * Returns the path to the Symvolia logo appropriate for the active color
 * scheme. The dark variant uses lightened colors for adequate contrast against
 * dark backgrounds. Resolves the "system" preference to the OS-reported mode.
 */
const useLogoSrc = (): string => {
  const { mode, systemMode } = useColorScheme();
  const resolvedMode = mode === "system" ? systemMode : mode;
  return resolvedMode === "dark"
    ? "./symvolia-logo-dark.svg"
    : "./symvolia-logo.svg";
};

export default useLogoSrc;
