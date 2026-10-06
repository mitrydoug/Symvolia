import { FC, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ArticleIcon from "@mui/icons-material/Article";
import StarIcon from "@mui/icons-material/Star";
import { useUserVerification } from "../state/UserVotes";
import { useForumNavigate, useForumPath } from "../hooks/useForumNavigate";

const ALL_NAV_ITEMS = [
  { label: "Home", href: "/", icon: <HomeIcon />, memberOnly: false },
  {
    label: "My Support",
    href: "/my-support",
    icon: <FavoriteBorderIcon />,
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
];

const BottomNav: FC = () => {
  const location = useLocation();
  const navigate = useForumNavigate();
  const { isUserVerified, isVerifiedLoading } = useUserVerification();
  const forumPath = useForumPath();

  const navItems = useMemo(
    () =>
      ALL_NAV_ITEMS.filter(
        (item) => !item.memberOnly || isUserVerified || isVerifiedLoading,
      ),
    [isUserVerified, isVerifiedLoading],
  );

  const currentIndex = navItems.findIndex(
    (item) => location.pathname === forumPath(item.href),
  );

  return (
    <Paper
      sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1200 }}
      elevation={3}
    >
      <BottomNavigation
        showLabels
        value={currentIndex === -1 ? false : currentIndex}
        onChange={(_, newValue: number) => {
          void navigate(navItems[newValue].href);
        }}
      >
        {navItems.map((item) => (
          <BottomNavigationAction
            key={item.label}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
};

export default BottomNav;
