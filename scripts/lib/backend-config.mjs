// Shared derivation of Symvolia backend service configuration.
//
// This is the single source of truth for the NON-SECRET backend environment
// values that are derived from committed contract deployment JSON
// (deployments/<network>.json) plus the operational toggles in the deployment's
// profile (env/profiles/<deploymentProfile>.env).
//
// Consumers:
//   - scripts/generate-backend-env-examples.mjs — writes copy-paste .env.example
//     files (config + placeholder secrets) for humans.
//   - scripts/railway-backend-variables.mjs — merges this config with real
//     secrets from the CI environment and pushes it to Railway.
//
// Keeping the derivation here means the RPC-relay allowlist, forum addresses,
// registry address, and sponsorship signatures can never drift between the
// human-facing examples and what CI actually applies to the live service.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ENV_FLAG_TRUTHY = new Set(["1", "true", "yes", "on"]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : path.resolve(scriptDir, "..", "..");

export const repoRoot = defaultRepoRoot;
export const deploymentsDir = path.join(repoRoot, "deployments");
export const profilesDir = path.join(repoRoot, "env/profiles");
export const backendServicesPath = path.join(repoRoot, "deploy/backend-services.json");

// The Railway variable keys whose VALUES are secret and must never be committed
// to source. CI supplies these from GitHub secrets (see the deploy workflow);
// this list only names the keys, never their values.
export const SECRET_KEYS = Object.freeze([
  // RPC endpoints usually embed a provider API key in the URL path.
  "INDEXER_RPC_URL",
  "RELAY_RPC_URL",
  "GAS_SPONSORSHIP_RPC_URL",
  // Meilisearch master key.
  "MEILI_API_KEY",
]);

// Non-secret, environment-specific values that CI supplies from the process
// environment (GitHub repository/environment *variables*, not secrets) for
// values an operator must be able to flip WITHOUT a source change. Currently
// empty: CORS_ORIGINS, ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE, and
// ZKPASSPORT_VERIFIER_ADDRESS are deterministic per network and now live in
// source (deploy/backend-services.json + deployments/<network>.json). The
// mechanism is kept for any future break-glass toggle.
export const RUNTIME_VARIABLE_KEYS = Object.freeze([]);

const fail = (context, message) => {
  const error = new Error(`${context}: ${message}`);
  error.userFacing = true;
  throw error;
};

// Mirror the backend's env_flag semantics for INDEXER_ENABLED read from the
// deployment profile: unset/empty means enabled (the default); any other value
// is truthy only when it is one of 1/true/yes/on.
export const profileIndexerEnabled = (deploymentProfile) => {
  const profilePath = path.join(profilesDir, `${deploymentProfile}.env`);
  let contents;
  try {
    contents = readFileSync(profilePath, "utf8");
  } catch {
    return true;
  }

  let rawValue;
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*INDEXER_ENABLED\s*=\s*(.*)$/.exec(line);
    if (match) {
      rawValue = match[1];
    }
  }

  if (rawValue === undefined) {
    return true;
  }

  const normalized = rawValue
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()
    .toLowerCase();
  if (normalized === "") {
    return true;
  }
  return ENV_FLAG_TRUTHY.has(normalized);
};

export const registrySponsorshipSignatures = (registryMode) =>
  registryMode === "dev"
    ? ["register(string)"]
    : [
      "register((bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool)))",
    ];

export const loadDeployment = (networkName) => {
  const deploymentPath = path.join(deploymentsDir, `${networkName}.json`);
  let deployment;
  try {
    deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  } catch {
    fail(deploymentPath, "missing or invalid deployment JSON");
  }

  if (deployment.schemaVersion !== 1) {
    fail(deploymentPath, `unsupported schemaVersion ${deployment.schemaVersion}`);
  }
  if (deployment.network !== networkName) {
    fail(
      deploymentPath,
      `network field "${deployment.network}" does not match filename "${networkName}"`,
    );
  }
  if (typeof deployment.deployNetwork !== "string" || deployment.deployNetwork.length === 0) {
    fail(deploymentPath, "deployNetwork must be set");
  }
  if (
    typeof deployment.deploymentProfile !== "string" ||
    deployment.deploymentProfile.length === 0
  ) {
    fail(deploymentPath, "deploymentProfile must be set");
  }
  if (!ADDRESS_PATTERN.test(deployment.registryAddress)) {
    fail(deploymentPath, "registryAddress must be a 20-byte hex address");
  }
  if (
    typeof deployment.deploymentBlockNumber !== "number" ||
    !Number.isSafeInteger(deployment.deploymentBlockNumber) ||
    deployment.deploymentBlockNumber < 0
  ) {
    fail(deploymentPath, "deploymentBlockNumber must be a non-negative safe integer");
  }
  if (
    !deployment.forums ||
    typeof deployment.forums !== "object" ||
    Array.isArray(deployment.forums)
  ) {
    fail(deploymentPath, "forums must be an object mapping forum names to addresses");
  }

  const forumOrder = Array.isArray(deployment.forumOrder)
    ? deployment.forumOrder
    : Object.keys(deployment.forums);
  if (forumOrder.length === 0) {
    fail(deploymentPath, "forumOrder must contain at least one forum");
  }
  for (const forumName of forumOrder) {
    const address = deployment.forums[forumName];
    if (!ADDRESS_PATTERN.test(address)) {
      fail(deploymentPath, `forums.${forumName} must be a 20-byte hex address`);
    }
  }

  return { deployment, forumOrder };
};

// The interesting derived pieces shared by the example generator and the CI
// variables script.
export const deriveBackendFacts = (deployment, forumOrder) => {
  const registryMode = deployment.registryMode ?? "production";
  const indexerEnabled = profileIndexerEnabled(deployment.deploymentProfile);
  const orderedForumAddresses = forumOrder.map((forumName) => deployment.forums[forumName]);
  const relayAllowedContracts = [...orderedForumAddresses, deployment.registryAddress];
  const signatures = registrySponsorshipSignatures(registryMode);
  return {
    registryMode,
    indexerEnabled,
    orderedForumAddresses,
    relayAllowedContracts,
    signatures,
  };
};

const RPC_RELAY_ALLOWED_METHODS =
  "eth_chainId,eth_blockNumber,eth_getBlockByNumber,eth_getTransactionByHash," +
  "eth_getTransactionReceipt,eth_call,eth_estimateGas,eth_getCode,eth_getLogs";

// Per-network non-secret backend service settings (the Railway service to
// target, CORS, gas-sponsorship approval policy, and the optional zkPassport
// verifier address). Committed source of truth, deliberately separate from
// deployments/<network>.json (which the contract deploy script overwrites
// wholesale) and from the frontend/local-dev profiles. Returns undefined when
// the network has no entry.
let cachedBackendServices;
export const backendServiceConfig = (networkName) => {
  if (cachedBackendServices === undefined) {
    try {
      const parsed = JSON.parse(readFileSync(backendServicesPath, "utf8"));
      cachedBackendServices =
        parsed && typeof parsed.services === "object" && parsed.services !== null
          ? parsed.services
          : {};
    } catch {
      cachedBackendServices = {};
    }
  }
  return cachedBackendServices[networkName];
};

// The flat, ordered list of NON-SECRET config variables derived purely from the
// repo (deployment JSON + profile + backend-services.json). Returns an array of
// { key, value } so the CI script can push them verbatim and callers keep a
// stable ordering.
export const backendConfigVariables = (networkName) => {
  const { deployment, forumOrder } = loadDeployment(networkName);
  const {
    registryMode,
    indexerEnabled,
    orderedForumAddresses,
    relayAllowedContracts,
    signatures,
  } = deriveBackendFacts(deployment, forumOrder);

  const service = backendServiceConfig(networkName);
  if (!service) {
    fail(backendServicesPath, `missing services.${networkName} entry`);
  }
  if (typeof service.corsOrigins !== "string" || service.corsOrigins.length === 0) {
    fail(backendServicesPath, `services.${networkName}.corsOrigins must be a non-empty string`);
  }
  const inspectApprove = service.gasSponsorshipInspectApprove === true ? "true" : "false";

  // The zkPassport verifier is only eth_call'd in production registry mode;
  // emit it only when present and relevant, validating the address shape.
  const verifierVariables = [];
  if (registryMode === "production") {
    if (!ADDRESS_PATTERN.test(service.zkPassportVerifierAddress ?? "")) {
      fail(
        backendServicesPath,
        `services.${networkName}.zkPassportVerifierAddress must be a 20-byte hex address in production registry mode`,
      );
    }
    verifierVariables.push({
      key: "ZKPASSPORT_VERIFIER_ADDRESS",
      value: service.zkPassportVerifierAddress,
    });
  }

  return [
    // Contract deployment metadata
    { key: "DEPLOY_NETWORK", value: deployment.deployNetwork },
    { key: "DEPLOYMENT_PROFILE", value: deployment.deploymentProfile },
    { key: "REGISTRY_MODE", value: registryMode },
    { key: "REGISTRY_ADDRESS", value: deployment.registryAddress },
    { key: "GAS_SPONSORSHIP_REGISTRY_SIGNATURES", value: signatures.join(";") },
    { key: "FORUM_CONTRACT_ADDRESSES", value: orderedForumAddresses.join(",") },
    ...verifierVariables,

    // Indexer polling and catch-up behavior. INDEXER_ENABLED defaults to true
    // in the backend, so it is only emitted when the profile opts out.
    ...(indexerEnabled ? [] : [{ key: "INDEXER_ENABLED", value: "false" }]),
    { key: "INDEXER_POLL_INTERVAL_SECONDS", value: "60" },
    { key: "INDEXER_MAX_BLOCKS_PER_REQUEST", value: "600" },
    { key: "INDEXER_MAX_STARTUP_LOOKBACK_SECONDS", value: "14400" },

    // Constrained JSON-RPC relay for frontend read traffic.
    { key: "RPC_RELAY_ALLOWED_METHODS", value: RPC_RELAY_ALLOWED_METHODS },
    { key: "RPC_RELAY_ALLOWED_CONTRACTS", value: relayAllowedContracts.join(",") },
    { key: "RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS", value: "15" },
    { key: "RPC_RELAY_GETLOGS_WINDOW_BLOCKS", value: "1000" },

    // Gas-sponsorship webhook approval policy + leaky-bucket metering.
    { key: "ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE", value: inspectApprove },
    { key: "GAS_SPONSORSHIP_RATE_LIMIT_DB", value: "/data/sponsorship.db" },
    { key: "GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS", value: "5000000" },
    { key: "GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY", value: "20000000" },

    // Meilisearch connection (private networking) + optional semantic search.
    { key: "MEILI_URL", value: "http://meilisearch.railway.internal:7700" },
    { key: "MEILI_SEMANTIC_SEARCH_ENABLED", value: "false" },
    { key: "MEILI_SEMANTIC_EMBEDDER_NAME", value: "statement-text" },
    {
      key: "MEILI_SEMANTIC_EMBEDDER_MODEL",
      value: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    },
    { key: "MEILI_TASK_TIMEOUT_MS", value: "300000" },

    // Browser/API access.
    { key: "CORS_ORIGINS", value: service.corsOrigins },
  ];
};
