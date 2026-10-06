import { FC } from "react";
import type { Forum } from "./ChooseForumModal";
import { getForumIconSrc } from "../forumAssets";

interface ForumIconProps {
  forum: Forum;
  /** Icon height in CSS units. Defaults to "1.5rem". Both flag and globe icons share this exact height. */
  size?: string;
}

/**
 * Renders the appropriate icon for a forum:
 * - Country forums: 4×3 flag SVG from /flags/
 * - Non-country forums (e.g. "global"): earth.png globe icon (displayed as "Earth")
 *
 * Both variants render at exactly the same height to prevent layout shift.
 */
const ForumIcon: FC<ForumIconProps> = ({ forum, size = "1.5rem" }) => {
  // Wrap in a fixed-height container so swapping icons causes no layout shift
  const wrapper: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: size,
  };

  const iconSrc = getForumIconSrc(forum);

  if (iconSrc !== "./earth.png") {
    return (
      <span style={wrapper}>
        <img
          src={iconSrc}
          alt={`${forum.label} flag`}
          style={{ height: size, width: "auto", borderRadius: "3px" }}
        />
      </span>
    );
  }

  return (
    <span style={wrapper}>
      <img
        src="./earth.png"
        alt="Earth"
        style={{
          height: `calc(${size} * 1.4)`,
          width: "auto",
          borderRadius: "3px",
        }}
      />
    </span>
  );
};

export default ForumIcon;
