#!/usr/bin/env node
// Build the full backend environment for a Railway service by merging:
//   1. NON-SECRET config derived from the committed deployment JSON
//      (deployments/<network>.json) + profile — see lib/backend-config.mjs.
//   2. SECRET values injected via the process environment (in CI these come
//      from GitHub secrets; their values are never stored in source).
//   3. Non-secret, host-specific runtime variables (also from the environment,
//      typically GitHub repository/environment *variables*).
//
// The merged result is written as a dotenv file (KEY=VALUE per line) that the
// deploy workflow feeds to `railway variables --set`. This script never reads a
// secret from disk and never hard-codes one; it only names the keys it expects.
//
// Usage:
//   node scripts/railway-backend-variables.mjs --network <name> --out <file>
//
// Environment inputs (see SECRET_KEYS in the lib):
//   RELAY_RPC_URL, GAS_SPONSORSHIP_RPC_URL, MEILI_API_KEY  (required secrets)
//   INDEXER_RPC_URL                                        (optional secret)
//
// Non-secret operational settings (CORS_ORIGINS,
// ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE, ZKPASSPORT_VERIFIER_ADDRESS) are NOT
// read from the environment: they are derived from committed source
// (deploy/backend-services.json + deployments/<network>.json) via the lib.

import { writeFileSync } from "node:fs";

import {
  RUNTIME_VARIABLE_KEYS,
  SECRET_KEYS,
  backendConfigVariables,
  backendServiceConfig,
} from "./lib/backend-config.mjs";

// Secrets that must always be present for a healthy deployment. INDEXER_RPC_URL
// is intentionally optional: the indexer is disabled on current profiles, and
// the relay/sponsorship paths use their own RPC URLs.
const REQUIRED_SECRET_KEYS = new Set([
  "RELAY_RPC_URL",
  "GAS_SPONSORSHIP_RPC_URL",
  "MEILI_API_KEY",
]);

const parseArgs = (argv) => {
  const args = { network: undefined, out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--network") {
      args.network = argv[(i += 1)];
    } else if (flag === "--out") {
      args.out = argv[(i += 1)];
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }
  if (!args.network) {
    throw new Error("missing required --network <name>");
  }
  if (!args.out) {
    throw new Error("missing required --out <file>");
  }
  return args;
};

// A Railway variable value must be a single line. Reject anything with a
// newline so a malformed secret can't corrupt the dotenv file we emit.
const assertSingleLine = (key, value) => {
  if (/[\r\n]/.test(value)) {
    throw new Error(`value for ${key} must not contain a newline`);
  }
};

const collectFromEnv = (keys, { required }) => {
  const collected = [];
  const missing = [];
  for (const key of keys) {
    const value = process.env[key];
    if (value === undefined || value === "") {
      if (required.has(key)) {
        missing.push(key);
      }
      continue;
    }
    assertSingleLine(key, value);
    collected.push({ key, value });
  }
  return { collected, missing };
};

const main = () => {
  const { network, out } = parseArgs(process.argv.slice(2));

  // (1) Config derived from the repo — single source of truth.
  const configVars = backendConfigVariables(network);

  // The Railway service to target also lives in committed source, so the
  // deploy needs no GitHub variable. Printed to stdout for the shell wrapper.
  const railwayService = backendServiceConfig(network)?.railwayService;
  if (typeof railwayService !== "string" || railwayService.length === 0) {
    throw new Error(
      `missing services.${network}.railwayService in deploy/backend-services.json`,
    );
  }

  // (2) Secrets from the environment (GitHub secrets in CI).
  const secretResult = collectFromEnv(SECRET_KEYS, { required: REQUIRED_SECRET_KEYS });
  if (secretResult.missing.length > 0) {
    throw new Error(
      `missing required secret(s): ${secretResult.missing.join(", ")}. ` +
      "Provide them via the environment (GitHub secrets), never in source.",
    );
  }

  // (3) Optional non-secret runtime variables from the environment.
  const runtimeResult = collectFromEnv(RUNTIME_VARIABLE_KEYS, { required: new Set() });

  // Later entries win on key collision. Order: config, then env-provided
  // secrets/variables so an operator can override a derived default if needed.
  const merged = new Map();
  const provenance = new Map();
  for (const { key, value } of configVars) {
    merged.set(key, value);
    provenance.set(key, "config");
  }
  for (const { key, value } of secretResult.collected) {
    merged.set(key, value);
    provenance.set(key, "secret");
  }
  for (const { key, value } of runtimeResult.collected) {
    merged.set(key, value);
    provenance.set(key, "variable");
  }

  const lines = [...merged.entries()].map(([key, value]) => `${key}=${value}`);
  writeFileSync(out, `${lines.join("\n")}\n`);

  // Print provenance WITHOUT values so CI logs stay secret-free.
  console.error(`Backend variables for network "${network}" -> ${out}`);
  for (const [key, source] of provenance) {
    console.error(`  ${source.padEnd(8)} ${key}`);
  }
  console.error(`Wrote ${merged.size} variables. Target service: ${railwayService}`);

  // Stdout carries exactly the resolved service name for the shell wrapper.
  process.stdout.write(`${railwayService}\n`);
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
