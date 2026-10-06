import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const byBranch = {
  develop: {
    deploymentFile: path.join(repoRoot, "deployments", "base_sepolia.json"),
    chainLabel: "Base Sepolia",
    explorerAddressBase: "https://sepolia.basescan.org/address/",
  },
  release: {
    deploymentFile: path.join(repoRoot, "deployments", "base.json"),
    chainLabel: "Base Mainnet",
    explorerAddressBase: "https://basescan.org/address/",
  },
};

const knownForums = {
  global: { emoji: "🌍", label: "Earth" },
  USA: { emoji: "🇺🇸", label: "United States" },
  CAN: { emoji: "🇨🇦", label: "Canada" },
};

const shortenAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const forumDescriptor = (forumKey) => {
  const known = knownForums[forumKey];
  if (known) {
    return known;
  }

  return { emoji: "🏳️", label: forumKey };
};

const branch = process.env.DEPLOY_BRANCH ?? "develop";
const config = byBranch[branch];

if (!config) {
  throw new Error(`Unsupported DEPLOY_BRANCH: ${branch}`);
}

const deployment = JSON.parse(readFileSync(config.deploymentFile, "utf8"));
const forumOrder = Array.isArray(deployment.forumOrder)
  ? deployment.forumOrder
  : Object.keys(deployment.forums ?? {});

const bullets = forumOrder
  .filter((forumKey) => typeof deployment.forums?.[forumKey] === "string")
  .map((forumKey) => {
    const address = deployment.forums[forumKey];
    const { emoji, label } = forumDescriptor(forumKey);
    const shortAddress = shortenAddress(address);
    const addressUrl = `${config.explorerAddressBase}${address}`;
    return `- ${emoji} ${label}: [${shortAddress}](${addressUrl})`;
  });

if (bullets.length === 0) {
  throw new Error(`No forum contract addresses found in ${config.deploymentFile}`);
}

const output = [
  "## Contract addresses",
  "",
  `Contracts deployed to **${config.chainLabel}**.`,
  "",
  ...bullets,
].join("\n");

process.stdout.write(`${output}\n`);
