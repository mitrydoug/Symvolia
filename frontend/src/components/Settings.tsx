import { FC, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Divider,
  FormHelperText,
  IconButton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import IndeterminateCheckBoxIcon from "@mui/icons-material/IndeterminateCheckBox";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TextFieldsOutlinedIcon from "@mui/icons-material/TextFieldsOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { styled, useColorScheme } from "@mui/material/styles";
import { useWalletAuth } from "@/wallet";

import useUserIdentity from "@/hooks/useUserIdentity";
import { useUserRegistration } from "@/hooks/useUserRegistration";
import {
  hasBackendSearch,
  useSearchEngineMode,
  type SearchEngineMode,
} from "@/hooks/useSearchEngineMode";
import {
  useLocalSearchEngine,
  type LocalSearchEngineKind,
} from "@/hooks/useLocalSearchEngine";
import { toAlpha2 } from "../countryCodeMap";
import { targetChain } from "../wagmiConfig";
import {
  RPC_URL_STORAGE_KEY,
  normalizeRpcUrlInput,
  validateRpcUrlChain,
} from "../rpcUrl";

type ThemeMode = "light" | "dark" | "system";

const RPC_VALIDATION_DEBOUNCE_MS = 600;

type RpcValidation =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

// A classic light/dark switch with a sun (light) and moon (dark) glyph riding
// on the thumb, painted as inline SVGs so the icon stays centered in the knob.
const SUN_ICON =
  'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 24 24"><path fill="%23f5b300" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>\')';
const MOON_ICON =
  'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 24 24"><path fill="%23fff" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>\')';

const ThemeSwitch = styled(Switch)(() => ({
  width: 58,
  height: 34,
  padding: 7,
  "& .MuiSwitch-switchBase": {
    margin: 1,
    padding: 0,
    transform: "translateX(6px)",
    "&.Mui-checked": {
      color: "#fff",
      transform: "translateX(22px)",
      "& .MuiSwitch-thumb": {
        backgroundColor: "#2c2c2c",
      },
      "& .MuiSwitch-thumb:before": {
        backgroundImage: MOON_ICON,
      },
      "& + .MuiSwitch-track": {
        opacity: 1,
        backgroundColor: "#8796a5",
      },
    },
  },
  "& .MuiSwitch-thumb": {
    backgroundColor: "#f4f4f4",
    width: 32,
    height: 32,
    "&::before": {
      content: "''",
      position: "absolute",
      width: "100%",
      height: "100%",
      left: 0,
      top: 0,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundImage: SUN_ICON,
    },
  },
  "& .MuiSwitch-track": {
    opacity: 1,
    backgroundColor: "#aab4be",
    borderRadius: 10,
  },
}));

const Settings: FC = () => {
  const { address } = useWalletAuth();
  const { nickname, setNickname, avatar, isVerified } = useUserIdentity();
  const { nationality, isRegistered } = useUserRegistration();
  const [nicknameInput, setNicknameInput] = useState(nickname);
  const [editingNickname, setEditingNickname] = useState(false);
  const [storedRpcUrl] = useState(() => {
    try {
      return localStorage.getItem(RPC_URL_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [rpcUrlInput, setRpcUrlInput] = useState(storedRpcUrl);
  const [rpcValidation, setRpcValidation] = useState<RpcValidation>({
    kind: "idle",
  });
  const { mode, setMode, systemMode } = useColorScheme();
  const [searchEngine, setSearchEngine] = useSearchEngineMode();
  const [localEngine, setLocalEngine] = useLocalSearchEngine();

  useEffect(() => {
    setNicknameInput(nickname);
  }, [nickname]);

  // Validate a custom RPC URL in the background (debounced) as the user types,
  // so they know it targets the right chain before saving.
  useEffect(() => {
    const candidate = normalizeRpcUrlInput(rpcUrlInput);
    if (!candidate || candidate === storedRpcUrl) {
      setRpcValidation({ kind: "idle" });
      return;
    }

    setRpcValidation({ kind: "checking" });
    let cancelled = false;
    const handle = window.setTimeout(() => {
      validateRpcUrlChain(candidate, targetChain.id, targetChain.name)
        .then(() => {
          if (!cancelled) setRpcValidation({ kind: "valid" });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setRpcValidation({
            kind: "invalid",
            message:
              error instanceof Error
                ? error.message
                : "Unable to validate RPC URL.",
          });
        });
    }, RPC_VALIDATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [rpcUrlInput, storedRpcUrl]);

  if (!address) return <Navigate to="/" replace />;

  const trimmedNickname = nicknameInput.trim();
  const hasNicknameChange = trimmedNickname !== nickname;
  const alpha2 = nationality ? toAlpha2(nationality) : null;
  const selectedThemeMode: ThemeMode = mode ?? "system";
  const resolvedThemeMode =
    selectedThemeMode === "system" ? systemMode : selectedThemeMode;
  const isDarkTheme = resolvedThemeMode === "dark";
  const hasStoredRpcUrl = storedRpcUrl.length > 0;
  const canSaveRpcUrl = rpcValidation.kind === "valid";
  // The local-engine choice only matters when browser-local search is in use:
  // either it's the only option, or the user has selected it explicitly.
  const localSearchActive = !hasBackendSearch || searchEngine === "local";

  const handleStartEdit = () => {
    setNicknameInput(nickname);
    setEditingNickname(true);
  };

  const handleCancelEdit = () => {
    setNicknameInput(nickname);
    setEditingNickname(false);
  };

  const handleSaveNickname = () => {
    setNickname(trimmedNickname);
    setEditingNickname(false);
  };

  const handleToggleTheme = () => {
    setMode(isDarkTheme ? "light" : "dark");
  };

  const handleSearchEngineChange = (
    _event: unknown,
    value: SearchEngineMode | null,
  ) => {
    if (value) setSearchEngine(value);
  };

  const handleLocalEngineChange = (
    _event: unknown,
    value: LocalSearchEngineKind | null,
  ) => {
    if (value) setLocalEngine(value);
  };

  // A validated custom RPC is persisted and applied via a reload, because the
  // wagmi transport is built once at startup from the stored value.
  const handleSaveRpcUrl = () => {
    const candidate = normalizeRpcUrlInput(rpcUrlInput);
    if (!candidate || rpcValidation.kind !== "valid") return;
    localStorage.setItem(RPC_URL_STORAGE_KEY, candidate);
    window.location.reload();
  };

  const handleRemoveRpcUrl = () => {
    localStorage.removeItem(RPC_URL_STORAGE_KEY);
    window.location.reload();
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <Box sx={{ width: "100%", maxWidth: 560, py: { xs: 2, sm: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  Settings
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Your preferences, saved on this browser.
                </Typography>
              </Box>
              <Tooltip
                title={
                  isDarkTheme ? "Switch to light theme" : "Switch to dark theme"
                }
              >
                <ThemeSwitch
                  checked={isDarkTheme}
                  onChange={handleToggleTheme}
                  slotProps={{ input: { "aria-label": "Toggle theme" } }}
                />
              </Tooltip>
            </Stack>
          </Box>

          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar
                src={avatar ?? undefined}
                sx={{ width: 50, height: 50 }}
              />
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                {isVerified && editingNickname ? (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <TextField
                      value={nicknameInput}
                      onChange={(event) => setNicknameInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleSaveNickname();
                        if (event.key === "Escape") handleCancelEdit();
                      }}
                      variant="standard"
                      placeholder="Display name"
                      autoFocus
                      slotProps={{ htmlInput: { maxLength: 32 } }}
                    />
                    <Tooltip title="Save">
                      <span>
                        <IconButton
                          size="small"
                          onClick={handleSaveNickname}
                          disabled={!hasNicknameChange}
                        >
                          <CheckIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Cancel">
                      <IconButton size="small" onClick={handleCancelEdit}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="h6" fontWeight={700} noWrap>
                      {nickname || "Human"}
                    </Typography>
                    {isVerified && (
                      <Tooltip title="Edit display name">
                        <IconButton size="small" onClick={handleStartEdit}>
                          <EditIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                )}
                {!isRegistered ? (
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
                  >
                    <IndeterminateCheckBoxIcon
                      sx={{ fontSize: 20, color: "text.disabled" }}
                    />
                    <Typography variant="body1" color="text.secondary">
                      Not verified
                    </Typography>
                  </Box>
                ) : (
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
                  >
                    {alpha2 ? (
                      <img
                        src={`./flags/${alpha2}.svg`}
                        alt={`${nationality} flag`}
                        style={{
                          height: "1rem",
                          width: "auto",
                          borderRadius: "2px",
                        }}
                      />
                    ) : (
                      <img
                        src="./earth.png"
                        alt="Earth"
                        style={{
                          height: "1.25rem",
                          width: "auto",
                          borderRadius: "2px",
                        }}
                      />
                    )}
                    <Typography variant="body1" color="text.secondary">
                      Verified
                    </Typography>
                  </Box>
                )}
              </Box>
            </Stack>

            {!isVerified && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body2" color="text.secondary">
                  Verify your identity to choose a display name. Until then you
                  appear as “Human”.
                </Typography>
              </>
            )}
          </Box>

          {hasBackendSearch ? (
            <Box>
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle1" fontWeight={700}>
                  Search
                </Typography>
                <Tooltip
                  title={
                    "Browser-local search runs entirely in this browser — no search server, more privacy, and it keeps working if the backend is down. " +
                    "It indexes only currently-ranked statements plus those engaged in the last day, so older or low-support statements may not appear. " +
                    "Similarity is keyword-based (not semantic). Backend search covers every statement."
                  }
                  enterTouchDelay={0}
                  leaveTouchDelay={6000}
                >
                  <InfoOutlinedIcon
                    sx={{
                      fontSize: 16,
                      color: "text.secondary",
                      cursor: "help",
                    }}
                  />
                </Tooltip>
              </Stack>
              <ToggleButtonGroup
                value={searchEngine}
                exclusive
                onChange={handleSearchEngineChange}
                aria-label="Search engine"
                size="small"
                fullWidth
              >
                <ToggleButton value="backend" aria-label="Backend search">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CloudOutlinedIcon fontSize="small" />
                    <span>Backend</span>
                  </Stack>
                </ToggleButton>
                <ToggleButton value="local" aria-label="Browser-local search">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <StorageOutlinedIcon fontSize="small" />
                    <span>Browser-local</span>
                  </Stack>
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {searchEngine === "local"
                  ? "Search runs in your browser. Covers ranked and recently-active statements only."
                  : "Search runs against the hosted search service. Covers all statements."}
              </Typography>
            </Box>
          ) : null}

          {localSearchActive ? (
            <Box>
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle1" fontWeight={700}>
                  Browser-local engine
                </Typography>
                <Tooltip
                  title={
                    "Lexical search matches words and prefixes — fast, tiny, and always on. " +
                    "Semantic search also understands meaning, so it finds related statements that don't share the same words. " +
                    "It downloads a ~30 MB language model the first time you use it (cached afterwards) and indexing takes a few seconds longer."
                  }
                  enterTouchDelay={0}
                  leaveTouchDelay={6000}
                >
                  <InfoOutlinedIcon
                    sx={{
                      fontSize: 16,
                      color: "text.secondary",
                      cursor: "help",
                    }}
                  />
                </Tooltip>
              </Stack>
              <ToggleButtonGroup
                value={localEngine}
                exclusive
                onChange={handleLocalEngineChange}
                aria-label="Browser-local search engine"
                size="small"
                fullWidth
              >
                <ToggleButton value="lexical" aria-label="Lexical search">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextFieldsOutlinedIcon fontSize="small" />
                    <span>Lexical</span>
                  </Stack>
                </ToggleButton>
                <ToggleButton value="hybrid" aria-label="Semantic search">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AutoAwesomeOutlinedIcon fontSize="small" />
                    <span>Semantic</span>
                  </Stack>
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {localEngine === "hybrid"
                  ? "Semantic search understands meaning. Downloads a ~30 MB model on first use; embeddings are cached in your browser for reuse."
                  : "Lexical search matches words and prefixes. No download required."}
              </Typography>
            </Box>
          ) : null}

          <Box>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              RPC
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Custom RPC URL"
                value={rpcUrlInput}
                onChange={(event) => setRpcUrlInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSaveRpcUrl) {
                    handleSaveRpcUrl();
                  }
                }}
                size="small"
                fullWidth
                placeholder="https://..."
                error={rpcValidation.kind === "invalid"}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  onClick={handleSaveRpcUrl}
                  disabled={!canSaveRpcUrl}
                  sx={{ alignSelf: { sm: "flex-start" } }}
                >
                  Save RPC URL
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleRemoveRpcUrl}
                  disabled={!hasStoredRpcUrl}
                  sx={{ alignSelf: { sm: "flex-start" } }}
                >
                  Remove
                </Button>
              </Stack>
              <FormHelperText error={rpcValidation.kind === "invalid"}>
                {rpcValidation.kind === "checking" && "Checking chain ID..."}
                {rpcValidation.kind === "valid" &&
                  `Looks good — reports ${targetChain.name}.`}
                {rpcValidation.kind === "invalid" && rpcValidation.message}
                {rpcValidation.kind === "idle" &&
                  (hasStoredRpcUrl
                    ? `Using a custom RPC for ${targetChain.name}.`
                    : `Optional. Overrides the built-in RPC for ${targetChain.name} (${targetChain.id}).`)}
              </FormHelperText>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};

export default Settings;
