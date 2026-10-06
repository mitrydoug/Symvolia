import React, { useState } from "react";
import {
  Avatar,
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Typography,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { useForumNavigate } from "@/hooks/useForumNavigate";
import { useUserVerification } from "../state/UserVotes";
import { useUserRegistration } from "@/hooks/useUserRegistration";
import { toAlpha2 } from "../countryCodeMap";
import useUserIdentity from "@/hooks/useUserIdentity";
import IndeterminateCheckBoxIcon from "@mui/icons-material/IndeterminateCheckBox";
import { useWalletAuth } from "@/wallet";

const UserProfilePanel: React.FC = () => {
  const { disconnect } = useWalletAuth();
  const navigate = useForumNavigate();
  const { displayName, avatar } = useUserIdentity();
  const { isVerifiedLoading } = useUserVerification();
  const {
    nationality,
    isRegistered,
    isLoading: isRegistrationLoading,
  } = useUserRegistration();

  const isStatusLoading = isVerifiedLoading || isRegistrationLoading;

  const alpha2 = nationality ? toAlpha2(nationality) : null;

  const [menuOpen, setMenuOpen] = useState(false);

  if (isStatusLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          bgcolor: "action.hover",
          borderRadius: 3,
          pl: 1,
          pr: 1.5,
          py: 1,
        }}
      >
        <Skeleton
          variant="rounded"
          width={36}
          height={36}
          sx={{ borderRadius: 2 }}
        />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="70%" height={24} />
          <Skeleton variant="text" width="50%" height={18} />
        </Box>
      </Box>
    );
  }

  return (
    /* Account chip + menu — one connected surface */
    <Box
      sx={{
        bgcolor: "action.hover",
        borderRadius: 3,
        overflow: "hidden",
        transition: (theme) =>
          theme.transitions.create("border-radius", {
            duration: theme.transitions.duration.shortest,
          }),
      }}
    >
      {/* header row — toggles the account menu */}
      <Box
        onClick={() => setMenuOpen((prev) => !prev)}
        role="button"
        aria-label={menuOpen ? "Collapse account menu" : "Open account menu"}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          pl: 1,
          pr: 1.5,
          py: 0.5,
          cursor: "pointer",
          bgcolor: menuOpen ? "action.selected" : "transparent",
          "&:hover": { bgcolor: "action.selected" },
          borderBottomLeftRadius: "12px",
          borderBottomRightRadius: "12px",
        }}
      >
        <Avatar
          src={avatar ?? undefined}
          sx={{ width: 36, height: 36, borderRadius: 2.5 }}
        />

        <Box sx={{ minWidth: 0, flex: 1, ml: 0.5, mb: 0.25 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {displayName}
          </Typography>

          {/* Verified / Not Verified status */}
          {isStatusLoading && (
            <Skeleton variant="text" width={80} height={18} />
          )}
          {!isStatusLoading && !isRegistered && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
              }}
            >
              <IndeterminateCheckBoxIcon
                sx={{ fontSize: 16, color: "text.disabled" }}
              />
              <Typography variant="body2" color="text.secondary">
                Not verified
              </Typography>
            </Box>
          )}
          {!isStatusLoading && isRegistered && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                ml: 0.5,
              }}
            >
              {alpha2 ? (
                <img
                  src={`./flags/${alpha2}.svg`}
                  alt={`${nationality} flag`}
                  style={{
                    height: "0.75rem",
                    width: "auto",
                    borderRadius: "2px",
                  }}
                />
              ) : (
                <img
                  src="./earth.png"
                  alt="Earth"
                  style={{
                    height: "1rem",
                    width: "auto",
                    borderRadius: "2px",
                  }}
                />
              )}
              <Typography variant="body2" color="text.secondary">
                Verified
              </Typography>
            </Box>
          )}
        </Box>

        {menuOpen ? (
          <KeyboardArrowUpIcon
            sx={{ color: "text.secondary", flexShrink: 0 }}
          />
        ) : (
          <KeyboardArrowDownIcon
            sx={{ color: "text.secondary", flexShrink: 0 }}
          />
        )}
      </Box>

      {/* menu folds out underneath, sharing the chip surface */}
      <Collapse in={menuOpen}>
        <List disablePadding sx={{ px: 0.5, pb: 0.5, pt: 0.5 }}>
          <ListItemButton
            dense
            onClick={() => void navigate("/settings")}
            sx={{
              borderRadius: 2,
              py: 0.5,
              "&:hover": { bgcolor: "action.selected" },
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Settings"
              slotProps={{ primary: { variant: "body2" } }}
            />
          </ListItemButton>
          <ListItemButton
            dense
            onClick={() => disconnect()}
            sx={{
              borderRadius: 2,
              py: 0.5,
              color: "#e57373",
              "&:hover": { bgcolor: "action.selected" },
            }}
          >
            <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Disconnect"
              slotProps={{ primary: { variant: "body2" } }}
            />
          </ListItemButton>
        </List>
      </Collapse>
    </Box>
  );
};

export default UserProfilePanel;
