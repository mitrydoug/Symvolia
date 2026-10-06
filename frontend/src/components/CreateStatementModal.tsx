import { FC, useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CircularProgress,
  InputBase,
  Modal,
  Stack,
  Typography,
} from "@mui/material";
import { useReadContract } from "wagmi";
import { useForumNavigate } from "../hooks/useForumNavigate";

import { useUserVotes } from "../state/UserVotes";
import { useForum, FORUM_ABI } from "../state/Forum";
import { useSearch } from "@/hooks/useSearch";
import useBlockSync from "@/hooks/useBlockSync";
import useLocalStorageSet from "@/hooks/useLocalStorageSet";
import VoteToggle from "./VoteToggle";
import StatementCard from "./StatementCard";
import { Statement } from "../types";
import { fuseSimilarStatements } from "../localSearch/rankFusion";

const MAX_STATEMENT_LENGTH = 280;

type CreateStatementModalProps = {
  open: boolean;
  onClose: () => void;
};

const CreateStatementModal: FC<CreateStatementModalProps> = ({
  open,
  onClose,
}) => {
  const navigate = useForumNavigate();
  const [text, setText] = useState("");
  const [initialSupport, setInitialSupport] = useState(0);

  const { isUserVerified, stageStatement, setPendingDraftCost } =
    useUserVotes();
  const { forumContractAddress } = useForum();
  const { has: isBookmarked, toggle: toggleBookmark } =
    useLocalStorageSet("bookmarks");

  // ── Similar-statements search ──────────────────────────────────────────
  const hasSearch = text.trim().length > 0;
  const { hits, isLoading: isSearchLoading } = useSearch(
    text,
    forumContractAddress,
    { mode: "similarity" },
  );

  // Fetch the current statement count so we can discard stale/invalid IDs
  // that would cause getStatementsById to revert.
  const { data: statementCountRaw } = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "statementCount",
  });
  const statementCount =
    statementCountRaw !== undefined ? Number(statementCountRaw) : undefined;

  // Filter out any search hit whose ID is >= statementCount (stale index).
  const statementIds = useMemo(() => {
    if (statementCount === undefined) return [];
    return hits
      .filter((h) => h.statementId < statementCount)
      .map((h) => BigInt(h.statementId));
  }, [hits, statementCount]);

  const result = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [statementIds],
    query: { enabled: statementIds.length > 0 },
  });

  useBlockSync(result.refetch);

  const rawStatements = result.data as Statement[] | undefined;

  const relevanceOrder = useMemo(() => {
    const map = new Map<number, number>();
    hits.forEach((h, i) => map.set(h.statementId, i));
    return map;
  }, [hits]);

  // Single ordered list: a Reciprocal Rank Fusion of the similarity order and
  // the same results re-ranked by total vote count. See rankFusion.ts for the
  // SIMILARITY_WEIGHT / SUPPORT_WEIGHT / RRF_K tuning knobs.
  const similarStatements: Statement[] = useMemo(() => {
    if (!rawStatements) return [];
    return fuseSimilarStatements(rawStatements, relevanceOrder);
  }, [rawStatements, relevanceOrder]);

  const isSimilarLoading = isSearchLoading || result.isLoading;
  // Treat contract errors (e.g. all IDs invalid) as "no results".
  const noSimilarResults = result.isError && !result.isLoading;

  // ── Handlers ───────────────────────────────────────────────────────────
  const updateText = useCallback((textVal: string) => {
    if (textVal.length <= MAX_STATEMENT_LENGTH) {
      setText(textVal);
    }
  }, []);

  // Keep the credit bar in sync with the draft's initial support
  const draftCreditCost =
    (Math.abs(initialSupport) * (Math.abs(initialSupport) + 1)) / 2;
  useEffect(() => {
    if (open) {
      setPendingDraftCost(draftCreditCost);
    } else {
      setPendingDraftCost(0);
    }
    return () => setPendingDraftCost(0);
  }, [open, draftCreditCost, setPendingDraftCost]);

  const handleCreate = useCallback(() => {
    if (text.length > 0 && isUserVerified && stageStatement) {
      setPendingDraftCost(0);
      stageStatement(text, initialSupport);
      setText("");
      setInitialSupport(0);
      onClose();
      void navigate("/my-statements");
    }
  }, [
    text,
    initialSupport,
    isUserVerified,
    stageStatement,
    setPendingDraftCost,
    onClose,
    navigate,
  ]);

  const handleCancel = useCallback(() => {
    setPendingDraftCost(0);
    setText("");
    setInitialSupport(0);
    onClose();
  }, [setPendingDraftCost, onClose]);

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      aria-labelledby="create-statement-title"
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: { xs: "95vw", sm: 600, md: 700 },
          maxHeight: "90vh",
          bgcolor: "background.default",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          boxShadow: 24,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <Typography
          id="create-statement-title"
          variant="h6"
          sx={{ px: 3, pt: 2.5, pb: 1, fontWeight: 600, flexShrink: 0 }}
        >
          New Statement
        </Typography>

        {/* ── Body (scrollable) ───────────────────────────────────────── */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 3,
            pb: 1,
            /* Hide scrollbar but keep scrolling */
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {/* Statement input — card-style with vote toggle on the right */}
          <Card sx={{ p: 2 }}>
            <Stack direction="row" spacing={2}>
              {/* Text area + char count */}
              <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.5}>
                <InputBase
                  placeholder="What's on your mind?"
                  value={text}
                  onChange={(e) => updateText(e.target.value)}
                  multiline
                  minRows={3}
                  maxRows={6}
                  sx={{
                    fontSize: "1.05rem",
                    lineHeight: 1.5,
                    width: "100%",
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    textAlign: "right",
                    fontWeight:
                      text.length < MAX_STATEMENT_LENGTH * 0.9
                        ? "normal"
                        : "bold",
                  }}
                  color={
                    text.length < MAX_STATEMENT_LENGTH * 0.8
                      ? "text.secondary"
                      : text.length < MAX_STATEMENT_LENGTH * 0.9
                        ? "DarkOrange"
                        : "red"
                  }
                >
                  {text.length} / {MAX_STATEMENT_LENGTH}
                </Typography>
              </Stack>

              {/* Vertical vote toggle on the right */}
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{ flexShrink: 0 }}
              >
                <VoteToggle
                  userSupport={initialSupport}
                  uncommittedSupport={initialSupport !== 0}
                  onUserVoteChange={setInitialSupport}
                  direction="vertical"
                />
              </Stack>
            </Stack>
          </Card>

          {/* ── Similar Statements ────────────────────────────────────── */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Similar Statements
            </Typography>

            <Box
              sx={{
                maxHeight: 340,
                overflowY: "auto",
                scrollbarWidth: "thin",
                mx: -1,
                px: 1,
                py: 0.5,
              }}
            >
              {isSimilarLoading && !noSimilarResults && hasSearch ? (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  sx={{ py: 4 }}
                >
                  <CircularProgress size={24} />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    Searching…
                  </Typography>
                </Stack>
              ) : similarStatements.length > 0 ? (
                <Stack spacing={1}>
                  {similarStatements.map((stmt) => (
                    <StatementCard
                      key={`similar-${Number(stmt.id)}`}
                      statement={stmt}
                      isBookmarked={isBookmarked(Number(stmt.id))}
                      onToggleBookmark={toggleBookmark}
                    />
                  ))}
                </Stack>
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ py: 3, textAlign: "center" }}
                >
                  {hasSearch
                    ? "No similar statements found."
                    : "Start typing to see similar statements."}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* ── Footer buttons ──────────────────────────────────────────── */}
        <Stack
          direction="row"
          justifyContent="flex-end"
          spacing={2}
          sx={{
            px: 3,
            py: 2,
            borderTop: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <Button onClick={handleCancel}>Cancel</Button>
          <Button
            variant="contained"
            disabled={text.trim().length === 0}
            onClick={handleCreate}
          >
            Create
          </Button>
        </Stack>
      </Box>
    </Modal>
  );
};

export default CreateStatementModal;
