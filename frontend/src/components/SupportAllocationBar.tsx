import React from "react";
import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { useCreditAllocation } from "@/hooks/useCreditAllocation";

interface BreakdownRow {
  label: string;
  value: number;
  color: string;
}

const AllocationTooltip: React.FC<{ rows: BreakdownRow[] }> = ({ rows }) => (
  <Stack spacing={0.5} sx={{ py: 0.5 }}>
    {rows.map((row) => (
      <Stack
        key={row.label}
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ minWidth: 160 }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: row.color,
            flexShrink: 0,
          }}
        />
        <Typography variant="caption">{row.label}</Typography>
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{ ml: "auto", fontVariantNumeric: "tabular-nums" }}
        >
          {row.value}
        </Typography>
      </Stack>
    ))}
  </Stack>
);

// Component to display the support allocation progress bar
export const SupportAllocationBar: React.FC = () => {
  const allocation = useCreditAllocation();
  const {
    allocated: ALLOCATED_COLOR,
    unallocated: UNALLOCATED_COLOR,
    stagedIncrease: STAGED_INCREASE_COLOR,
    stagedDecrease: STAGED_DECREASE_COLOR,
  } = useTheme().custom.colors.allocation;

  if (!allocation || allocation.total === 0) {
    return null;
  }

  const stagedIsDecrease = allocation.stagedDirection === "decrease";
  // Grayed tint (used for the legend dot) and its full-strength counterpart
  // (alternated into the striped pattern on the bar).
  const stagedColor = stagedIsDecrease
    ? STAGED_DECREASE_COLOR
    : STAGED_INCREASE_COLOR;
  const stagedSolidColor = stagedIsDecrease
    ? UNALLOCATED_COLOR
    : ALLOCATED_COLOR;
  // Diagonal barber-pole stripes alternating the solid and grayed colors so the
  // staged segment reads as "pending / in-progress" at a glance.
  const stagedPattern = `repeating-linear-gradient(-45deg, ${stagedSolidColor} 0 4px, ${stagedColor} 4px 8px)`;

  const bluePercent = (allocation.allocated / allocation.total) * 100;
  const yellowPercent = (allocation.staged / allocation.total) * 100;
  const greenPercent = (allocation.unallocated / allocation.total) * 100;

  const rows: BreakdownRow[] = [
    { label: "Allocated", value: allocation.allocated, color: ALLOCATED_COLOR },
    { label: "Staged", value: allocation.staged, color: stagedColor },
    {
      label: "Unallocated",
      value: allocation.unallocated,
      color: UNALLOCATED_COLOR,
    },
  ];

  return (
    <Tooltip title={<AllocationTooltip rows={rows} />} arrow placement="bottom">
      <Box sx={{ width: "100%", mb: 0, cursor: "default" }}>
        <Box
          sx={{
            display: "flex",
            height: 8,
            borderRadius: 1,
            overflow: "hidden",
            backgroundColor: "grey.200",
          }}
        >
          {bluePercent > 0 && (
            <Box
              sx={{
                width: `${bluePercent}%`,
                backgroundColor: ALLOCATED_COLOR,
                transition: "width 0.3s ease-out",
              }}
            />
          )}
          {yellowPercent > 0 && (
            <Box
              sx={{
                width: `${yellowPercent}%`,
                backgroundColor: stagedColor,
                backgroundImage: stagedPattern,
                transition: "width 0.3s ease-out",
              }}
            />
          )}
          {greenPercent > 0 && (
            <Box
              sx={{
                width: `${greenPercent}%`,
                backgroundColor: UNALLOCATED_COLOR,
                transition: "width 0.3s ease-out",
              }}
            />
          )}
        </Box>
      </Box>
    </Tooltip>
  );
};
