import { type FC, type ReactNode } from "react";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import ExploreIcon from "@mui/icons-material/Explore";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import SavingsIcon from "@mui/icons-material/Savings";
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck";
import LockIcon from "@mui/icons-material/Lock";
import EditNoteIcon from "@mui/icons-material/EditNote";
import PublicIcon from "@mui/icons-material/Public";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useNavigate } from "react-router-dom";

import { useForumNavigate } from "@/hooks/useForumNavigate";

type GuideSection = {
  title: string;
  icon: ReactNode;
  body: ReactNode;
};

const guideSections: GuideSection[] = [
  {
    title: "Browse first",
    icon: <ExploreIcon />,
    body: (
      <>
        Start by reading the ranked statement feed. You can switch forums,
        search for related ideas, open statement pages, and see how support has
        changed over time before connecting a wallet or committing anything.
      </>
    ),
  },
  {
    title: "Verify once",
    icon: <HowToRegIcon />,
    body: (
      <>
        Verification helps keep participation tied to real people instead of
        duplicate accounts. Some forums may also check eligibility for that
        forum. After verification, you can support statements and write your
        own.
      </>
    ),
  },
  {
    title: "Use credits thoughtfully",
    icon: <SavingsIcon />,
    body: (
      <>
        Credits represent how much support you can allocate. Adding more support
        to one statement costs increasingly more credits, so strong conviction
        is possible while broad support still matters.
      </>
    ),
  },
  {
    title: "Stage changes safely",
    icon: <PlaylistAddCheckIcon />,
    body: (
      <>
        You can experiment with support levels before submitting anything. The
        right panel tracks staged changes and remaining credits. Reset discards
        pending choices; nothing is public until you lock it in.
      </>
    ),
  },
  {
    title: "Lock it in",
    icon: <LockIcon />,
    body: (
      <>
        Lock it in submits your staged choices. Your wallet may ask for a
        confirmation, and the transaction can take a little time. Once
        confirmed, those changes become part of the public record.
      </>
    ),
  },
  {
    title: "Write clear statements",
    icon: <EditNoteIcon />,
    body: (
      <>
        Good statements are specific enough for strangers to understand and
        support. For example, “Expand protected bike lanes near schools” is more
        useful than “Fix transportation.”
      </>
    ),
  },
  {
    title: "Know what is public",
    icon: <PublicIcon />,
    body: (
      <>
        Committed statements and support are public. Your display name is stored
        locally in this browser, but wallet activity may still be visible. Avoid
        putting private personal information into public statements.
      </>
    ),
  },
];

const questions = [
  {
    question: "Can I change my mind?",
    answer:
      "Yes. You can stage new support changes later and lock them in when you are ready.",
  },
  {
    question: "What happens if I disconnect my wallet?",
    answer:
      "You can keep browsing. Wallet-specific local preferences and staged activity depend on reconnecting the same wallet.",
  },
  {
    question: "Why do credits get more expensive on one statement?",
    answer:
      "The cost curve makes intense support visible without letting one person cheaply dominate every ranking.",
  },
];

const HowItWorks: FC = () => {
  const navigate = useForumNavigate();
  const rawNavigate = useNavigate();

  return (
    <Box sx={{ py: { xs: 1, sm: 3 } }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            How Symvolia works
          </Typography>
          <Typography color="text.secondary">
            Symvolia is a public board for surfacing what verified people care
            about. You can explore freely, stage choices safely, and submit only
            when you choose to lock them in.
          </Typography>
        </Box>

        <Stack spacing={2}>
          {guideSections.map((section) => (
            <Box key={section.title}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    bgcolor: "action.hover",
                    color: "primary.main",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {section.icon}
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {section.title}
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {section.body}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          ))}
        </Stack>

        <Box>
          <Divider sx={{ mb: 3 }} />
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  bgcolor: "action.hover",
                  color: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <HelpOutlineIcon />
              </Box>
              <Typography variant="h6" fontWeight={800}>
                Common questions
              </Typography>
            </Stack>
            {questions.map((item) => (
              <Box key={item.question}>
                <Typography fontWeight={700}>{item.question}</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {item.answer}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button onClick={() => void navigate("/")}>Browse statements</Button>
          <Button
            variant="outlined"
            onClick={() => void rawNavigate("/verify")}
          >
            Get verified
          </Button>
          <Button variant="outlined" onClick={() => void navigate("/write")}>
            Write a statement
          </Button>
        </Stack>

        <Button
          variant="text"
          size="small"
          onClick={() => void rawNavigate("/welcome")}
          sx={{ alignSelf: "flex-start", color: "text.secondary" }}
        >
          Show the welcome screen
        </Button>
      </Stack>
    </Box>
  );
};

export default HowItWorks;
