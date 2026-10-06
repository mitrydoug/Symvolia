import React, { useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import { Avatar, Button, Stack } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { useUserVotes } from "../state/UserVotes";
import ChooseForumModal from "./ChooseForumModal";
import ForumSelectorChip from "./ForumSelectorChip";
import { useForum, forumToSlug } from "../state/Forum";
import useIsMobile from "@/hooks/useIsMobile";
import useUserIdentity from "@/hooks/useUserIdentity";
import useLogoSrc from "@/hooks/useLogoSrc";
import { theme } from "../theme";
import { ProfileDrawer } from "./UserProfileMenu";
import { useSearchQuery } from "@/state/Search";
import { useLocalSearch } from "@/state/LocalSearch";
import SearchField from "./SearchField";
import { useForumNavigate, useForumPath } from "../hooks/useForumNavigate";
import { useWalletAuth } from "@/wallet";

// Sub-components
interface LogoProps {
  isMobile: boolean;
  homePath: string;
}

const Logo: React.FC<LogoProps> = ({ isMobile, homePath }) => {
  const logoSrc = useLogoSrc();
  return (
    <Link to={homePath} style={{ textDecoration: "none" }}>
      <img
        src={logoSrc}
        alt="Symvolia"
        style={{
          height: isMobile
            ? theme.custom.appBar.logoIcon.size.mobile
            : theme.custom.appBar.logoIcon.size.desktop,
          width: "auto",
        }}
      />
    </Link>
  );
};

export default function MenuAppBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    address,
    connect,
    disconnect: doDisconnect,
    isLoading: walletAuthLoading,
  } = useWalletAuth();
  const isMobile = useIsMobile();
  const [chooseForumModalOpen, setChooseForumModalOpen] = useState(false);
  const { name: forumName, setForum } = useForum();
  const navigate = useForumNavigate();
  const rawNavigate = useNavigate();
  const forumPath = useForumPath();
  const { displayName, avatar } = useUserIdentity();

  const {
    query: localQuery,
    setQuery: setSearchQuery,
    clearQuery: clearSearch,
  } = useSearchQuery();

  // Show a spinner in the search field while the semantic index builds on first
  // use (model download + embedding), so the ~15 s cold start isn't a silent wait.
  const { engineKind, isIndexing, isReady } = useLocalSearch();
  const searchBusy = engineKind === "hybrid" && isIndexing && !isReady;
  const searchBusyTitle = "Preparing semantic search — one-time setup";

  const {
    isUserVerified,
    commitChanges,
    state: userVoteState,
  } = useUserVotes();

  return (
    <>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          bgcolor: "background.default",
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            flexDirection: "column",
            alignItems: "stretch",
            maxWidth: "1000px",
            width: "100%",
            mx: "auto",
            px: 3,
            py: 1,
          }}
        >
          {/* First row: Three-section layout */}
          {isMobile ? (
            <Stack direction="row" alignItems="center" sx={{ width: "100%" }}>
              {/* Left section: Forum selector */}
              <Box
                sx={{ flex: 1, display: "flex", justifyContent: "flex-start" }}
              >
                <ForumSelectorChip
                  forumName={forumName}
                  onClick={() => setChooseForumModalOpen(true)}
                />
              </Box>

              {/* Center section: Logo */}
              <Box sx={{ flex: 1, display: "flex", justifyContent: "center" }}>
                <Logo isMobile={isMobile} homePath={forumPath("/")} />
              </Box>

              {/* Right section: Profile */}
              <Box
                sx={{ flex: 1, display: "flex", justifyContent: "flex-end" }}
              >
                {address ? (
                  <>
                    <IconButton
                      size="medium"
                      aria-label="profile of current user"
                      aria-controls="menu-appbar"
                      aria-haspopup="true"
                      onClick={() => setDrawerOpen(true)}
                      color="inherit"
                    >
                      <Avatar src={avatar ?? undefined} />
                    </IconButton>
                    <ProfileDrawer
                      open={drawerOpen}
                      onClose={() => setDrawerOpen(false)}
                      isUserVerified={isUserVerified}
                      navigate={(path: string) => void navigate(path)}
                      disconnect={doDisconnect}
                      username={displayName}
                      avatar={avatar}
                      commitChanges={commitChanges ?? (() => {})}
                      hasStagedChanges={
                        userVoteState?.hasStagedChanges ?? false
                      }
                      commitBusy={
                        userVoteState?.commitStatus !== undefined &&
                        userVoteState?.commitStatus !== "idle"
                      }
                      hasEnoughCredits={userVoteState?.hasEnoughCredits ?? true}
                    />
                  </>
                ) : (
                  <Button
                    onClick={connect}
                    size="small"
                    disabled={walletAuthLoading}
                  >
                    <Typography variant="body1" component="div">
                      Connect
                    </Typography>
                  </Button>
                )}
              </Box>
            </Stack>
          ) : (
            <Stack direction="row" spacing={2} alignItems="center" flexGrow={1}>
              {/* Desktop layout */}
              <Logo isMobile={isMobile} homePath={forumPath("/")} />

              <ForumSelectorChip
                forumName={forumName}
                onClick={() => setChooseForumModalOpen(true)}
              />

              <SearchField
                value={localQuery}
                onChange={setSearchQuery}
                onClear={clearSearch}
                busy={searchBusy}
                busyTitle={searchBusyTitle}
              />

              {!address && (
                <Button
                  onClick={connect}
                  size="medium"
                  disabled={walletAuthLoading}
                >
                  <Typography variant="body1" component="div">
                    Connect
                  </Typography>
                </Button>
              )}
            </Stack>
          )}

          {/* Second row on mobile: Search bar */}
          {isMobile && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 1, width: "100%" }}
            >
              <SearchField
                value={localQuery}
                onChange={setSearchQuery}
                onClear={clearSearch}
                busy={searchBusy}
                busyTitle={searchBusyTitle}
                fullWidth
              />
            </Stack>
          )}
        </Toolbar>
      </AppBar>
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
}
