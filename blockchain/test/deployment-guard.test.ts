import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRODUCTION_ONLY_CHAIN_IDS,
  assertRegistryModeAllowedOnChain,
} from "../ignition/config/deployments.js";

const BASE_MAINNET_CHAIN_ID = 8453;

describe("assertRegistryModeAllowedOnChain", () => {
  it("treats Base mainnet as a production-only chain", () => {
    assert.ok(PRODUCTION_ONLY_CHAIN_IDS.has(BASE_MAINNET_CHAIN_ID));
  });

  it("rejects a dev registry on a production chain", () => {
    assert.throws(
      () =>
        assertRegistryModeAllowedOnChain(
          BASE_MAINNET_CHAIN_ID,
          "dev",
          "local-dev",
        ),
      /Refusing to deploy a non-production registry to chain 8453/,
    );
  });

  it("rejects a mock registry on a production chain", () => {
    assert.throws(
      () =>
        assertRegistryModeAllowedOnChain(
          BASE_MAINNET_CHAIN_ID,
          "mock",
          "base-sepolia",
        ),
      /profile "base-sepolia" selects "mock" mode/,
    );
  });

  it("allows a production registry on a production chain", () => {
    assert.doesNotThrow(() =>
      assertRegistryModeAllowedOnChain(
        BASE_MAINNET_CHAIN_ID,
        "production",
        "base",
      ),
    );
  });

  it("allows dev and mock registries on non-production chains", () => {
    // e.g. Base Sepolia (84532) and local simulated networks.
    assert.doesNotThrow(() =>
      assertRegistryModeAllowedOnChain(84532, "mock", "base-sepolia"),
    );
    assert.doesNotThrow(() =>
      assertRegistryModeAllowedOnChain(31337, "dev", "local-dev"),
    );
  });
});
