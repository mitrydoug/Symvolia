import { FC } from "react";
import { Box, Tab, Tabs } from "@mui/material";

export type SortMode = "top" | "relevant" | "latest";

interface SortTabsProps {
  value: SortMode;
  onChange: (value: SortMode) => void;
  /** When false, "Relevant" and "Latest" tabs are disabled. */
  hasSearch?: boolean;
  /** When false, the parent component is responsible for sticky positioning. */
  sticky?: boolean;
  /** Extend the tab background into the scroll container gutters. */
  fullBleed?: boolean;
}

const TAB_INDEX: Record<SortMode, number> = {
  top: 0,
  relevant: 1,
  latest: 2,
};
const INDEX_TAB: SortMode[] = ["top", "relevant", "latest"];

const SortTabs: FC<SortTabsProps> = ({
  value,
  onChange,
  hasSearch = true,
  sticky = true,
  fullBleed = true,
}) => (
  <Box
    sx={{
      borderBottom: 1,
      borderColor: "divider",
      mb: sticky ? 1 : 0,
      position: sticky ? "sticky" : "relative",
      top: sticky ? 0 : undefined,
      zIndex: sticky ? 2 : undefined,
      bgcolor: "background.default",
      // Extend background wider than cards to cover drop-shadow bleed
      mx: fullBleed ? -3 : 0,
      px: fullBleed ? 3 : 0,
    }}
  >
    <Tabs
      value={TAB_INDEX[value]}
      onChange={(_, idx: number) => {
        onChange(INDEX_TAB[idx]);
      }}
    >
      <Tab label="Top" />
      <Tab label="Relevant" disabled={!hasSearch} />
      <Tab label="Latest" disabled={!hasSearch} />
    </Tabs>
  </Box>
);

export default SortTabs;
