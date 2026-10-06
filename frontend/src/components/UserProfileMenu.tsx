import React from "react";
import {
  Avatar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import SettingsIcon from "@mui/icons-material/Settings";
import GitHubIcon from "@mui/icons-material/GitHub";
import IndeterminateCheckBoxIcon from "@mui/icons-material/IndeterminateCheckBox";
import AppVersionLabel from "./AppVersionLabel";

export interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  isUserVerified: boolean;
  navigate: (path: string) => void;
  disconnect: () => void;
  username?: string;
  avatar?: string | null;
  commitChanges: () => void | Promise<void>;
  hasStagedChanges: boolean;
  commitBusy?: boolean;
  hasEnoughCredits?: boolean;
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  open,
  onClose,
  isUserVerified,
  navigate,
  disconnect,
  username,
  avatar,
  commitChanges,
  hasStagedChanges,
  commitBusy = false,
  hasEnoughCredits = true,
}) => {
  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleCommit = () => {
    void commitChanges();
    onClose();
  };

  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: "80%",
            maxWidth: 320,
          },
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        {/* Header with avatar, username, and settings */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar src={avatar ?? undefined} sx={{ width: 40, height: 40 }} />
            <Box>
              <Typography variant="h6" fontWeight="medium">
                {username || "User"}
              </Typography>
              {!isUserVerified && (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <IndeterminateCheckBoxIcon
                    sx={{ fontSize: 16, color: "text.disabled" }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Not verified
                  </Typography>
                </Stack>
              )}
            </Box>
          </Stack>
          <IconButton onClick={() => handleNavigate("/settings")}>
            <SettingsIcon />
          </IconButton>
        </Stack>

        {/* Lock it In button */}
        {isUserVerified && (
          <Button
            variant="outlined"
            fullWidth
            onClick={handleCommit}
            disabled={!hasStagedChanges || commitBusy || !hasEnoughCredits}
            sx={{
              mb: 2,
              borderColor:
                hasStagedChanges && !commitBusy ? "warning.main" : "grey.300",
              color:
                hasStagedChanges && !commitBusy ? "warning.main" : "grey.500",
              "&:hover": {
                borderColor:
                  hasStagedChanges && !commitBusy ? "warning.dark" : "grey.400",
                backgroundColor:
                  hasStagedChanges && !commitBusy
                    ? "rgba(237, 108, 2, 0.04)"
                    : undefined,
              },
            }}
          >
            Lock it In!
          </Button>
        )}

        {/* Navigation list */}
        <List disablePadding>
          {isUserVerified ? (
            <>
              <ListItem disablePadding>
                <ListItemButton onClick={() => handleNavigate("/settings")}>
                  <ListItemText
                    primary="Settings"
                    slotProps={{
                      primary: { variant: "body1", fontWeight: 500 },
                    }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton onClick={() => handleNavigate("/my-support")}>
                  <ListItemText
                    primary="Your Support"
                    slotProps={{
                      primary: { variant: "body1", fontWeight: 500 },
                    }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => handleNavigate("/my-statements")}
                >
                  <ListItemText
                    primary="My Statements"
                    slotProps={{
                      primary: { variant: "body1", fontWeight: 500 },
                    }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton onClick={() => handleNavigate("/starred")}>
                  <ListItemText
                    primary="Starred"
                    slotProps={{
                      primary: { variant: "body1", fontWeight: 500 },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            </>
          ) : (
            <ListItem disablePadding>
              <ListItemButton onClick={() => handleNavigate("/verify")}>
                <ListItemIcon>
                  <HowToRegIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Get verified"
                  slotProps={{ primary: { variant: "body1", fontWeight: 500 } }}
                />
              </ListItemButton>
            </ListItem>
          )}
        </List>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1, minHeight: 48 }} />

        {/* How it works */}
        <List disablePadding sx={{ mt: 4 }}>
          <ListItem disablePadding>
            <ListItemButton onClick={() => handleNavigate("/how-it-works")}>
              <ListItemText
                primary="How it works"
                slotProps={{ primary: { variant: "body1", fontWeight: 500 } }}
              />
            </ListItemButton>
          </ListItem>
        </List>

        {/* Logout button */}
        <Button
          variant="outlined"
          fullWidth
          onClick={handleDisconnect}
          sx={{
            mt: 2,
            mb: 2,
            borderColor: "error.light",
            color: "error.main",
            "&:hover": {
              borderColor: "error.main",
              backgroundColor: "rgba(211, 47, 47, 0.04)",
            },
          }}
        >
          Logout
        </Button>

        {/* Social icons */}
        <Stack direction="row" spacing={2} justifyContent="center">
          <IconButton
            component="a"
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitHubIcon />
          </IconButton>
          <IconButton
            component="a"
            href="https://discord.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Box
              component="img"
              src="discord-round-black-icon.png"
              alt="Discord"
              sx={{ width: 24, height: 24 }}
            />
          </IconButton>
        </Stack>

        <Box sx={{ mt: 2 }}>
          <AppVersionLabel align="center" />
        </Box>
      </Box>
    </Drawer>
  );
};
