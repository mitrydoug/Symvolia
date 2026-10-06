import React from "react";
import {
  CircularProgress,
  IconButton,
  InputAdornment,
  Tooltip,
  TextField,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  fullWidth?: boolean;
  /** Show a spinner (e.g. while the semantic index is building on first use). */
  busy?: boolean;
  /** Tooltip shown on the busy spinner. */
  busyTitle?: string;
}

const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  onClear,
  fullWidth = false,
  busy = false,
  busyTitle = "Preparing search…",
}) => (
  <TextField
    placeholder="Search..."
    size="small"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    slotProps={{
      input: {
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
          </InputAdornment>
        ),
        endAdornment:
          busy || value ? (
            <InputAdornment position="end">
              {busy && (
                <Tooltip title={busyTitle} enterTouchDelay={0}>
                  <CircularProgress
                    size={16}
                    thickness={5}
                    aria-label={busyTitle}
                    sx={{ color: "text.secondary", mr: 0.5 }}
                  />
                </Tooltip>
              )}
              {value && (
                <IconButton size="small" onClick={onClear} edge="end">
                  <ClearIcon fontSize="small" />
                </IconButton>
              )}
            </InputAdornment>
          ) : undefined,
        sx: {
          height: 40,
          fontSize: "0.875rem",
          borderRadius: 2,
          bgcolor: "action.hover",
          pl: 1.5,
          pr: 0.5,
          "&:hover": {
            bgcolor: "action.selected",
          },
        },
      },
    }}
    sx={{
      width: fullWidth ? "100%" : "auto",
      flexGrow: 1,
      "& .MuiOutlinedInput-root": {
        borderRadius: 2,
        "& fieldset": { border: "none" },
        "&:hover fieldset": { border: "none" },
        "&.Mui-focused fieldset": {
          border: "1px solid",
          borderColor: "primary.main",
        },
      },
    }}
  />
);

export default SearchField;
