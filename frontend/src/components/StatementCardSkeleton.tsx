import { FC } from "react";
import { Card, Skeleton, Stack } from "@mui/material";

/**
 * Skeleton placeholder matching the StatementCardShell layout.
 * Renders a pulsing card with placeholders for rank, text, and stats.
 */
const StatementCardSkeleton: FC = () => (
  <Card sx={{ p: 1.5 }}>
    <Stack direction="row" spacing={1.5}>
      {/* Left column: rank placeholder */}
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ width: 72, minWidth: 72, flexShrink: 0 }}
      >
        <Skeleton variant="circular" width={36} height={36} />
      </Stack>

      {/* Middle column: text + stats */}
      <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
        <Skeleton variant="text" width="90%" height={28} />
        <Skeleton variant="text" width="60%" height={20} />
      </Stack>
    </Stack>
  </Card>
);

/**
 * A list of skeleton cards for use as a loading placeholder.
 */
export const StatementListSkeleton: FC<{ count?: number }> = ({
  count = 5,
}) => (
  <Stack spacing={2}>
    {Array.from({ length: count }, (_, i) => (
      <StatementCardSkeleton key={i} />
    ))}
  </Stack>
);

export default StatementCardSkeleton;
