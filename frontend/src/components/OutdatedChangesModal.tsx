import { FC } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from "@mui/material";

interface OutdatedChangesModalProps {
  open: boolean;
  onKeep: () => void;
  onAbandon: () => void;
}

/**
 * Shown when the user's on-chain state changed without a local submit (e.g. an
 * action taken on another device) while local staged changes exist. The user
 * chooses to keep their local changes (rebased onto the fresh on-chain state)
 * or abandon them in favour of the latest on-chain state.
 */
const OutdatedChangesModal: FC<OutdatedChangesModalProps> = ({
  open,
  onKeep,
  onAbandon,
}) => {
  return (
    <Dialog open={open} disableEscapeKeyDown>
      <DialogTitle>Local changes are outdated</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Your on-chain support has changed elsewhere since you started editing
          here. You can keep your unsaved local changes and apply them on top of
          the latest state, or abandon them and start from the latest on-chain
          state.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1} sx={{ px: 1, pb: 1 }}>
          <Button color="inherit" onClick={onAbandon}>
            Abandon local changes
          </Button>
          <Button variant="contained" onClick={onKeep}>
            Keep local changes
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

export default OutdatedChangesModal;
