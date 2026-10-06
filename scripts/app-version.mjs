import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const versionFilePath = path.join(repoRoot, "VERSION");
const baseVersionPattern = /^\d+\.\d+\.\d+$/;

export const readBaseVersion = () => {
  const version = readFileSync(versionFilePath, "utf8").trim();

  if (!baseVersionPattern.test(version)) {
    throw new Error(
      `VERSION must be plain semver (for example 0.1.0). Received: ${version}`,
    );
  }

  return version;
};

const getGitShortSha = () => {
  const sha = process.env.GITHUB_SHA;
  if (sha) {
    return sha.slice(0, 7);
  }

  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
};

const resolveMode = (mode = "auto") => {
  if (mode === "release" || mode === "dev") {
    return mode;
  }

  const refName =
    process.env.APP_VERSION_REF_NAME ??
    process.env.GITHUB_REF_NAME ??
    process.env.DEPLOY_BRANCH;

  if (refName === "release") {
    return "release";
  }

  return "dev";
};

export const resolveAppVersion = ({ mode = "auto" } = {}) => {
  const baseVersion = readBaseVersion();
  const resolvedMode = resolveMode(mode);

  if (resolvedMode === "release") {
    return baseVersion;
  }

  return `${baseVersion}-dev.${getGitShortSha()}`;
};

if (process.argv[1] === __filename) {
  const arg = process.argv[2];
  const mode = arg === "release" || arg === "dev" ? arg : "auto";
  process.stdout.write(`${resolveAppVersion({ mode })}\n`);
}