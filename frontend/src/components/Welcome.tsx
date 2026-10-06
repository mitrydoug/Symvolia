import { FC } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import ExploreIcon from "@mui/icons-material/Explore";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import CampaignIcon from "@mui/icons-material/Campaign";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import useLogoSrc from "@/hooks/useLogoSrc";
import { getStoredForumSlug } from "../state/Forum";
import { markWelcomeSeen } from "../state/welcome";

type Pillar = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const pillars: Pillar[] = [
  {
    icon: <ExploreIcon fontSize="medium" />,
    title: "Browse freely",
    body: "Read the ranked board of what people care about. No wallet needed to look around.",
  },
  {
    icon: <VerifiedUserIcon fontSize="medium" />,
    title: "Real people, one voice each",
    body: "Every participant is a verified human, so the rankings reflect people — not bots.",
  },
  {
    icon: <CampaignIcon fontSize="medium" />,
    title: "Support what matters",
    body: "When you're ready, back the statements you believe in and add your own.",
  },
];

/**
 * Full-page first-run welcome. Rendered outside the app shell (like the verify
 * flow). Shown once, when a visitor lands on the bare site root; entering the
 * app from here records the dismissal so it never interrupts a return visit.
 */
const Welcome: FC = () => {
  const navigate = useNavigate();
  const logoSrc = useLogoSrc();

  const enter = (path: string) => {
    markWelcomeSeen();
    void navigate(path);
  };

  const slug = getStoredForumSlug();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 6,
      }}
    >
      <Container maxWidth="sm" disableGutters>
        <Stack spacing={5} alignItems="center" textAlign="center">
          {/* Brand + value proposition */}
          <Stack spacing={2.5} alignItems="center">
            <Box
              component="img"
              src={logoSrc}
              alt="Symvolia"
              sx={{ height: "3.75rem", width: "auto" }}
            />
            <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.2 }}>
              A public billboard for what people actually care about
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ maxWidth: 460 }}
            >
              Symvolia surfaces the statements that verified people support —
              openly, and without bots or gatekeepers. Take a look around; you
              only need a wallet when you want to join in.
            </Typography>
          </Stack>

          {/* Three pillars */}
          <Stack
            spacing={2.5}
            sx={{ width: "100%", maxWidth: 460 }}
            textAlign="left"
          >
            {pillars.map((pillar) => (
              <Stack
                key={pillar.title}
                direction="row"
                spacing={2}
                alignItems="flex-start"
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    bgcolor: "action.hover",
                    color: "primary.main",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {pillar.icon}
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {pillar.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {pillar.body}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>

          {/* Calls to action */}
          <Stack spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
            <Button
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={() => enter(`/${slug}`)}
              sx={{ px: 4, py: 1.25, fontSize: "1rem" }}
            >
              See the billboard
            </Button>
            <Button
              variant="text"
              onClick={() => enter(`/${slug}/how-it-works`)}
            >
              How it works
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
};

export default Welcome;
