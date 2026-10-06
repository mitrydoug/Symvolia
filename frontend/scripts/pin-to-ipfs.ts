/**
 * Pin the frontend build output to IPFS via Pinata.
 *
 * Required environment variables:
 *   PINATA_JWT      — Pinata API key JWT
 *   PINATA_GATEWAY  — Pinata dedicated gateway domain (e.g. "example.mypinata.cloud")
 *
 * Usage:
 *   npx tsx scripts/pin-to-ipfs.ts [dist-dir]
 *
 * Defaults to "dist" if no directory is specified.
 * Sets the GitHub Actions output `cid` when running in CI.
 */

import { PinataSDK } from "pinata";
import { readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, relative } from "node:path";

const distDir = process.argv[2] ?? "dist";

/**
 * Recursively collect all files in a directory as File objects,
 * preserving relative paths as file names so that Pinata creates
 * the correct IPFS directory structure.
 */
function collectFiles(dir: string, base: string): File[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: File[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else {
      const relPath = relative(base, fullPath);
      const content = readFileSync(fullPath);
      files.push(new File([content], relPath));
    }
  }

  return files;
}

const { PINATA_JWT, PINATA_GATEWAY } = process.env;

if (!PINATA_JWT || !PINATA_GATEWAY) {
  console.error(
    "Error: PINATA_JWT and PINATA_GATEWAY environment variables are required.",
  );
  process.exit(1);
}

const pinata = new PinataSDK({
  pinataJwt: PINATA_JWT,
  pinataGateway: PINATA_GATEWAY,
});

const files = collectFiles(distDir, distDir);
console.log(`Uploading ${files.length} files from ${distDir}…`);

const result = await pinata.upload.public
  .fileArray(files)
  .name("symvolia-frontend");

console.log(`Pinned to IPFS with CID: ${result.cid}`);
console.log(`Gateway URL: https://${PINATA_GATEWAY}/ipfs/${result.cid}`);

// Set GitHub Actions output when running in CI
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `cid=${result.cid}\n`);
}
