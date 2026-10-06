import { useCallback } from "react";
import { useReadContract } from "wagmi";
import { useWalletAuth } from "@/wallet";
import useBlockSync from "./useBlockSync";
import { blockPollingIntervalMs } from "../wagmiConfig";
import {
  isDevMode,
  devRegistryContractConfig,
  registryContractConfig,
} from "../contracts";

// All registry variants (dev, mock & production) share the same read
// interface. Use the active registry ABI for reads — each includes the shared
// read functions — paired with whichever address is active.
const registryReadConfig = {
  address: isDevMode
    ? devRegistryContractConfig.address
    : registryContractConfig.address,
  abi: registryContractConfig.abi,
} as const;

interface Registration {
  uniqueIdentifier: `0x${string}`;
  nationality: string;
  registeredAddresses: readonly `0x${string}`[];
  registrationTimestamp: bigint;
}

export interface UserRegistration {
  /** Whether the user is registered in the SymvoliaRegistry (any forum). */
  isRegistered: boolean;
  /** True while the registration query is still in-flight. */
  isLoading: boolean;
  /**
   * The user's nationality from their registration.
   * - `null` when not registered
   * - `""` when registered without disclosing nationality
   * - An ISO 3166-1 alpha-3 code (e.g. "USA", "CAN") otherwise
   */
  nationality: string | null;
  /**
   * The user's unique registry identifier (bytes32). This is stable across all
   * wallet addresses linked to the same verified identity.
   * - `null` when not registered
   */
  userId: `0x${string}` | null;
}

/**
 * Reads the user's global registration state from the SymvoliaRegistry.
 *
 * This is distinct from `isUserVerified` in `useUserVotes`, which checks
 * forum-specific membership via `Forum.isMember()`. A user can be registered
 * (verified their identity) but not be a member of the currently-selected
 * forum if nationality requirements don't match.
 */
export function useUserRegistration(): UserRegistration {
  const { address, isLoading: isWalletLoading } = useWalletAuth();

  const {
    data: isRegistered,
    isLoading: isRegisteredLoading,
    refetch: refetchIsRegistered,
  } = useReadContract({
    ...registryReadConfig,
    functionName: "isRegistered",
    args: address ? [address] : undefined,
    query: { enabled: !!address, staleTime: blockPollingIntervalMs },
  });

  const {
    data: registration,
    isLoading: isRegistrationLoading,
    refetch: refetchRegistration,
  } = useReadContract({
    ...registryReadConfig,
    functionName: "getUserRegistration",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isRegistered === true,
      staleTime: blockPollingIntervalMs,
    },
  });

  const refetchAll = useCallback(() => {
    void refetchIsRegistered();
    if (isRegistered) void refetchRegistration();
  }, [refetchIsRegistered, refetchRegistration, isRegistered]);

  useBlockSync(refetchAll);

  if (!isRegistered) {
    return {
      isRegistered: false,
      isLoading: isWalletLoading || (!!address && isRegisteredLoading),
      nationality: null,
      userId: null,
    };
  }

  const reg = registration as Registration | undefined;
  return {
    isRegistered: true,
    isLoading: isRegistrationLoading || !reg,
    nationality: reg?.nationality ?? null,
    userId: reg?.uniqueIdentifier ?? null,
  };
}
