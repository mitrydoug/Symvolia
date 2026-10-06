import { FC } from "react";
import { Box, Stack, Typography } from "@mui/material";
import useLogoSrc from "@/hooks/useLogoSrc";

/**
 * Full-screen placeholder shown on mobile browsers during alpha. The mobile
 * experience is not yet functional, so instead of rendering the app we show
 * the Symvolia logo and a "coming soon" message.
 */
const MobileComingSoon: FC = () => {
  const logoSrc = useLogoSrc();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 4,
        pt: "33vh",
      }}
    >
      <Stack spacing={4} alignItems="center" textAlign="center">
        <img
          src={logoSrc}
          alt="Symvolia"
          style={{ width: "70%", maxWidth: 280, height: "auto" }}
        />
        <Typography variant="h6" color="text.secondary">
          A mobile experience is coming soon.
        </Typography>
      </Stack>
    </Box>
  );
};

export default MobileComingSoon;
