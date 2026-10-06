import path from "path";
import { readFileSync } from "fs";
import type { Abi, Address } from "viem";

type Artifact = { abi: Abi };
type EnvValues = Record<string, string>;

export type DeploymentEnv = {
  deployNetwork: string;
  deploymentProfile: string;
  registryMode: string;
  registryAddress: Address;
  forumAddresses: Address[];
};

export const repoRoot = path.resolve(import.meta.dirname, "../../..");

export function loadAbi(artifactPath: string): Abi {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as Artifact;
  return artifact.abi;
}

export function parseEnvFile(filePath: string): EnvValues {
  const values: EnvValues = {};
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex);
    let value = line.slice(equalsIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

export function loadDeploymentEnv(): DeploymentEnv {
  const deploymentEnvPath = path.join(
    repoRoot,
    "backend/.generated/deployment.env",
  );
  const env = parseEnvFile(deploymentEnvPath);
  const registryAddress = env.REGISTRY_ADDRESS as Address | undefined;
  const forumAddresses = env.FORUM_CONTRACT_ADDRESSES?.split(",").map(
    (value) => value.trim() as Address,
  );

  if (!registryAddress || !forumAddresses) {
    throw new Error(`Missing deployment values in ${deploymentEnvPath}`);
  }

  return {
    deployNetwork: env.DEPLOY_NETWORK,
    deploymentProfile: env.DEPLOYMENT_PROFILE,
    registryMode: env.REGISTRY_MODE,
    registryAddress,
    forumAddresses,
  };
}

export function forumAddressForName(
  forumName: string,
  forumOrder: readonly string[],
  forumAddresses: readonly Address[],
): Address {
  const forumIndex = forumOrder.indexOf(forumName);
  const forumAddress = forumAddresses[forumIndex];
  if (!forumAddress) {
    throw new Error(`Missing deployed address for forum ${forumName}`);
  }
  return forumAddress;
}

export function requireDevRegistry(registryMode: string): void {
  if (registryMode !== "dev") {
    throw new Error(
      `Mock seeding requires REGISTRY_MODE=dev, got ${registryMode}`,
    );
  }
}

export function requireWalletCount(
  available: number,
  requiredAccountIndexes: readonly number[],
): void {
  const required = Math.max(...requiredAccountIndexes) + 1;
  if (available < required) {
    throw new Error(
      `Mock seeding requires ${required} wallet accounts, got ${available}`,
    );
  }
}
