import { FC } from "react";
import { Box, Stack, Typography } from "@mui/material";
import useLogoSrc from "@/hooks/useLogoSrc";

export interface SymvoliaLogoProps {
  /** Height of the icon (any CSS length). */
  height: string | number;
  /**
   * Font size for the "Symvolia" wordmark. Defaults to the icon height so the
   * wordmark visually matches the mark.
   */
  fontSize?: string | number;
  /** Gap between the icon and the wordmark, in MUI spacing units. */
  gap?: number;
}

/**
 * Brand lockup: the rounded-square confluence mark followed by the "Symvolia"
 * wordmark set in Martel. The mark artwork no longer embeds the wordmark, so it
 * is rendered here as live text — which keeps it crisp at any size and lets the
 * wordmark inherit the theme's text color across light/dark modes.
 */
const SymvoliaLogo: FC<SymvoliaLogoProps> = ({
  height,
  fontSize,
  gap = 1.5,
}) => {
  const logoSrc = useLogoSrc();
  return (
    <Stack direction="row" alignItems="baseline" spacing={gap}>
      <Box
        component="img"
        src={logoSrc}
        alt=""
        aria-hidden
        sx={{ height, width: "auto", display: "block" }}
      />
      <Typography
        component="span"
        sx={{
          fontFamily: "'Martel', serif",
          fontWeight: 800,
          fontSize: fontSize ?? height,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: "text.primary",
          whiteSpace: "nowrap",
        }}
      >
        Symvolia
      </Typography>
    </Stack>
  );
};

export default SymvoliaLogo;
