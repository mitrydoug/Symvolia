import { FC } from "react";
import { ButtonBase, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { FORUMS } from "./ChooseForumModal";
import ForumIcon from "./ForumIcon";

interface ForumSelectorChipProps {
  forumName: string;
  onClick: () => void;
  /** Icon height passed through to {@link ForumIcon}. Defaults to "1.6rem". */
  iconSize?: string;
}

/**
 * The forum (region) picker rendered as a rounded pill.
 *
 * Previously the selector was a bare flag/globe glyph, which users didn't
 * recognise as interactive. Wrapping the (still large) forum icon in a pill
 * alongside a down chevron makes the "click to switch forum" affordance
 * obvious. The icon + chevron pair is centered with even padding so nothing
 * ever touches the rounded edges, and we get hover/focus states plus keyboard
 * support for free via ButtonBase.
 */
const ForumSelectorChip: FC<ForumSelectorChipProps> = ({
  forumName,
  onClick,
  iconSize = "1.6rem",
}) => {
  const forum = FORUMS[forumName];
  if (!forum) return null;

  return (
    <Tooltip title="Change forum">
      <ButtonBase
        onClick={onClick}
        aria-haspopup="true"
        aria-controls="menu-appbar"
        aria-label={`Forum: ${forum.label}. Click to change forum`}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          px: 1.25,
          py: 0.5,
          // Tall enough to fully contain the globe, which ForumIcon renders at
          // 1.4× its nominal size (intentional). Without this, ButtonBase's
          // overflow:hidden clips the top/bottom of the enlarged icon.
          minHeight: `calc(${iconSize} * 1.4 + 16px)`,
          // Match the rounded corners of the UserProfilePanel.
          borderRadius: 3,
          transition: "background-color 0.15s ease",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <ForumIcon forum={forum} size={iconSize} />
        <ExpandMoreIcon
          fontSize="small"
          sx={{ color: "text.secondary" }}
          aria-hidden
        />
      </ButtonBase>
    </Tooltip>
  );
};

export default ForumSelectorChip;
