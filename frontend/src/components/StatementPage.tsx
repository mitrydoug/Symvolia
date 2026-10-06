import { FC } from "react";
import { useParams } from "react-router-dom";
import { useReadContract } from "wagmi";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import { useForum, FORUM_ABI } from "../state/Forum";
import { Statement } from "../types";
import StatementCard from "./StatementCard";
import SupportChart from "./SupportChart";
import SimilarStatements from "./SimilarStatements";
import useBlockSync from "@/hooks/useBlockSync";
import { useForumNavigate } from "../hooks/useForumNavigate";

const StatementPage: FC = () => {
  const navigate = useForumNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const { forumContractAddress } = useForum();

  const id = BigInt(statementId ?? "0");

  const result = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [[id]],
    query: { enabled: !!statementId },
  });

  useBlockSync(result.refetch);

  const statement = result.data ? (result.data as Statement[])[0] : undefined;

  if (result.isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!statement) {
    return (
      <Typography color="text.secondary" sx={{ pt: 4, textAlign: "center" }}>
        Statement not found.
      </Typography>
    );
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
        onClick={() => {
          void navigate(-1);
        }}
        sx={{
          mb: 1,
          textTransform: "none",
          color: "text.secondary",
          fontSize: "0.8rem",
          p: 0,
          minWidth: 0,
        }}
        size="small"
        variant="text"
      >
        Back
      </Button>

      <StatementCard statement={statement} />

      <Box sx={{ mt: 2 }}>
        <SupportChart statementId={statement.id} />
      </Box>

      <Box sx={{ mt: 2 }}>
        <SimilarStatements
          query={statement.text}
          excludeId={statement.id}
          switchSupportFromId={statement.id}
          stickyHeader
        />
      </Box>
    </Box>
  );
};

export default StatementPage;
