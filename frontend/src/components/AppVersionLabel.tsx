import { Typography } from "@mui/material";

const appVersion = import.meta.env.VITE_APP_VERSION ?? "unknown";
const repoUrl = "https://github.com/mitrydoug/symvolia";
const isReleaseVersion = /^\d+\.\d+\.\d+$/.test(appVersion);
const versionUrl = isReleaseVersion
  ? `${repoUrl}/releases/tag/v${appVersion}`
  : repoUrl;

type AppVersionLabelProps = {
  align?: "left" | "center" | "right";
};

const AppVersionLabel = ({ align = "left" }: AppVersionLabelProps) => (
  <Typography
    component="a"
    href={versionUrl}
    target="_blank"
    rel="noopener noreferrer"
    variant="caption"
    color="text.secondary"
    sx={{
      display: "block",
      textAlign: align,
      letterSpacing: 0.2,
      textDecoration: "none",
      cursor: "pointer",
      "&:hover": {
        textDecoration: "underline",
      },
    }}
  >
    Version {appVersion}
  </Typography>
);

export default AppVersionLabel;
