import { FC, useState } from "react";
import {
  Box,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { theme } from "../theme";
import HomeIcon from "@mui/icons-material/Home";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ArticleIcon from "@mui/icons-material/Article";
import StarIcon from "@mui/icons-material/Star";
import HelpIcon from "@mui/icons-material/Help";
import { useUserVerification } from "../state/UserVotes";
import ChooseForumModal from "./ChooseForumModal";
import ForumSelectorChip from "./ForumSelectorChip";
import AppVersionLabel from "./AppVersionLabel";
import { useForum, forumToSlug } from "../state/Forum";
import { useForumNavigate, useForumPath } from "../hooks/useForumNavigate";
import useLogoSrc from "@/hooks/useLogoSrc";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: <HomeIcon />, memberOnly: false },
  {
    label: "My Support",
    href: "/my-support",
    icon: <FavoriteIcon />,
    memberOnly: true,
  },
  {
    label: "My Statements",
    href: "/my-statements",
    icon: <ArticleIcon />,
    memberOnly: true,
  },
  {
    label: "Starred",
    href: "/starred",
    icon: <StarIcon sx={{ color: "text.secondary" }} />,
    memberOnly: false,
  },
  {
    label: "How it works",
    href: "/how-it-works",
    icon: <HelpIcon />,
    memberOnly: false,
  },
];

const SideNav: FC = () => {
  const location = useLocation();
  const navigate = useForumNavigate();
  const rawNavigate = useNavigate();
  const { isUserVerified, isVerifiedLoading } = useUserVerification();
  const { name: forumName, setForum } = useForum();
  const forumPath = useForumPath();
  const logoSrc = useLogoSrc();

  const [chooseForumModalOpen, setChooseForumModalOpen] = useState(false);

  return (
    <>
      <Box
        component="nav"
        sx={{
          width: theme.custom.sideNav.width,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
        }}
      >
        {/* Logo */}
        <Box sx={{ mb: 0, display: "flex", justifyContent: "center" }}>
          <Link to={forumPath("/")} style={{ textDecoration: "none" }}>
            <img
              src={logoSrc}
              alt="Symvolia"
              style={{ height: "3.1rem", width: "auto" }}
            />
          </Link>
        </Box>

        {/* Forum selector — centered between logo and nav list */}
        <Box
          sx={{
            mt: -1,
            mb: 1.5,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <ForumSelectorChip
            forumName={forumName}
            onClick={() => setChooseForumModalOpen(true)}
            iconSize="1.8rem"
          />
        </Box>

        <List disablePadding>
          {NAV_ITEMS.filter(
            (item) => !item.memberOnly || isUserVerified || isVerifiedLoading,
          ).map((item) => {
            const isActive =
              item.href !== "#" && location.pathname === forumPath(item.href);

            return (
              <ListItemButton
                key={item.label}
                selected={isActive}
                onClick={() => {
                  if (item.href !== "#") void navigate(item.href);
                }}
                disabled={item.href === "#"}
                sx={{ borderRadius: 2, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  slotProps={{
                    primary: { fontWeight: isActive ? 600 : 400 },
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>

        <Divider sx={{ mt: 2.5, mb: 1.5, mx: 1.5 }} />

        <Box sx={{ px: 1 }}>
          <AppVersionLabel align="center" />
        </Box>
      </Box>

      <ChooseForumModal
        open={chooseForumModalOpen}
        onClose={() => setChooseForumModalOpen(false)}
        chooseForum={(forum: string) => {
          setForum(forum);
          setChooseForumModalOpen(false);
          const slug = forumToSlug(forum);
          void rawNavigate(`/${slug}`);
        }}
      />
    </>
  );
};

export default SideNav;
