import { FC, useState } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Modal,
  TextField,
} from "@mui/material";
import ForumIcon from "./ForumIcon";

export type Forum = {
  label: string;
  value: string;
  /** Lowercase URL slug used as the first route segment. */
  slug: string;
  /** ISO 3166-1 alpha-3 country code, or null for non-country forums (e.g. "global") */
  countryCode: string | null;
};

export const FORUMS: Record<string, Forum> = {
  global: { label: "Earth", value: "global", slug: "earth", countryCode: null },
  USA: {
    label: "United States",
    value: "USA",
    slug: "usa",
    countryCode: "USA",
  },
  CAN: { label: "Canada", value: "CAN", slug: "can", countryCode: "CAN" },
};

const style = {
  position: "absolute",
  top: "80px",
  left: "50%",
  transform: "translateX(-50%)",
  width: "400px",
  bgcolor: "background.paper",
  border: "1px solid darkgray",
  borderRadius: "8px",
  boxShadow: 24,
  p: 2,
};

type ChooseForumModalProps = {
  open: boolean;
  onClose: () => void;
  chooseForum: (forum: string) => void;
};

const ChooseForumModal: FC<ChooseForumModalProps> = ({
  open,
  onClose,
  chooseForum,
}) => {
  const [text, setText] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
    >
      <Box sx={style}>
        <TextField
          placeholder="Search by country name ..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          fullWidth
        />
        <List>
          {Object.values(FORUMS)
            .filter((forum) =>
              forum.label.toLowerCase().includes(text.toLowerCase()),
            )
            .map((forum) => (
              <ListItem key={forum.value} disablePadding>
                <ListItemButton
                  onClick={() => {
                    chooseForum(forum.value);
                  }}
                >
                  <ListItemIcon>
                    <ForumIcon forum={forum} />
                  </ListItemIcon>
                  {forum.label}
                </ListItemButton>
              </ListItem>
            ))}
        </List>
      </Box>
    </Modal>
  );
};

export default ChooseForumModal;
