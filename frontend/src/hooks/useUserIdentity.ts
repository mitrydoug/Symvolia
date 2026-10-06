import { useCallback } from "react";
import useLocalStorageValue from "./useLocalStorageValue";
import { useUserRegistration } from "./useUserRegistration";
import { boringAvatarDataUri } from "../util";

/** Name shown for users who have not verified their identity. */
export const ANONYMOUS_NAME = "Human";

export interface UserIdentity {
  /**
   * The registry `userId` (bytes32) when the user is verified, else `null`.
   * Stable across every wallet linked to the same verified identity.
   */
  userId: `0x${string}` | null;
  /** Whether the user has a verified (registered) identity. */
  isVerified: boolean;
  /** True while the underlying registration lookup is still in-flight. */
  isLoading: boolean;
  /**
   * The user's chosen display name (empty string when unset). Only meaningful
   * for verified users; persisted locally and keyed by `userId` so it follows
   * the identity across wallets in this browser.
   */
  nickname: string;
  /** Persist a new display name for the verified identity. No-op when unverified. */
  setNickname: (value: string) => void;
  /**
   * Name to render in the UI: the chosen nickname for verified users (falling
   * back to `ANONYMOUS_NAME` when unset), and always `ANONYMOUS_NAME` for
   * unverified users.
   */
  displayName: string;
  /**
   * Avatar data URI derived deterministically from the `userId`, or `null` for
   * unverified users (render the default gray avatar).
   */
  avatar: string | null;
}

/**
 * Ties a user's display name and avatar to their verified registry identity
 * (`userId`) rather than their wallet address. Two different wallets belonging
 * to the same verified identity therefore share one display name and avatar.
 * Unverified users have no display name ("Human") and the default avatar.
 */
export function useUserIdentity(): UserIdentity {
  const { userId, isRegistered, isLoading } = useUserRegistration();

  const isVerified = isRegistered && !!userId;

  // Key the locally-stored nickname by identity, not wallet address. Unverified
  // users share a throwaway key that is never displayed.
  const storageKey = userId
    ? `symvolia:nickname:${userId.slice(0, 10)}`
    : "symvolia:nickname:anon";
  const [nickname, setStoredNickname] = useLocalStorageValue(storageKey, "");

  const setNickname = useCallback(
    (value: string) => {
      if (!userId) return;
      setStoredNickname(value);
    },
    [userId, setStoredNickname],
  );

  const displayName = isVerified ? nickname || ANONYMOUS_NAME : ANONYMOUS_NAME;

  const avatar = isVerified && userId ? boringAvatarDataUri(userId) : null;

  return {
    userId,
    isVerified,
    isLoading,
    nickname,
    setNickname,
    displayName,
    avatar,
  };
}

export default useUserIdentity;
