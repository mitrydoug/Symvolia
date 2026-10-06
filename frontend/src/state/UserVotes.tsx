import React, {
  FC,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeFunctionData, parseEventLogs, BaseError } from "viem";
import { FORUM_ABI, useForum } from "./Forum";
import useBlockSync from "@/hooks/useBlockSync";
import useLocalStorageSet from "@/hooks/useLocalStorageSet";
import { useUserRegistration } from "@/hooks/useUserRegistration";
import {
  type ContractWriteRequest,
  type SponsoredNetworkFeeEstimate,
  useContractWrite,
  useWalletAuth,
} from "@/wallet";

interface StatementSupport {
  statementId: bigint;
  support: bigint;
}

interface UserSupport {
  credits: number;
  statementSupport: Map<number, number>;
  /** Timestamp of the caller's most recent credit-affecting on-chain action
   *  (`Forum.getUserLastUpdated`). Strictly increases on every commit, so it
   *  is the authoritative signal that this user's on-chain state changed. */
  lastUpdated: bigint;
}

export enum SupportAdjustmentType {
  Delta = 0,
  SetTo = 1,
}

interface StagedSupportAdjustment {
  value: number;
  adjustmentType: SupportAdjustmentType;
}

interface StagedSupport {
  credits: number;
  supportAdjustments: Map<number, StagedSupportAdjustment>;
  stagedStatements: StagedStatement[];
}

export interface StagedStatement {
  /** Client-side temporary ID (uuid or counter) — NOT an on-chain ID. */
  tempId: string;
  text: string;
  initialSupport: number;
}

export type CommitStatus =
  | "idle"
  | "awaiting-approval"
  | "pending-confirmation"
  | "confirmed"
  | "cancelled"
  | "error";

interface UserSupportState {
  onChain?: UserSupport;
  staged?: StagedSupport;
  /** `onChain.lastUpdated` captured while staged was empty; staged edits are
   *  measured against it. If the synced value advances past it with no local
   *  submit in flight, the user's on-chain state changed elsewhere (e.g. from
   *  another device) and local changes are outdated. */
  stagedBaselineLastUpdated?: bigint;
  hasStagedChanges: boolean;
  hasEnoughCredits: boolean;
  commitStatus: CommitStatus;
  pendingTxHash?: `0x${string}`;
  /** `onChain.lastUpdated` captured at submit time. When the synced value moves
   *  past it, our submitted commit has landed and staged can be cleared. */
  submittedFromLastUpdated?: bigint;
  /** True when a foreign on-chain change was detected while local staged
   *  changes exist; drives the "Keep or Abandon" dialog. */
  isOutdated: boolean;
  /** Credit cost of the in-progress draft statement (before it is staged). */
  pendingDraftCost: number;
}

export type CommitPreview = {
  statementCount: number;
  supportAdjustmentCount: number;
  networkFee: SponsoredNetworkFeeEstimate;
};

type CommitChangesOptions = {
  selfFunded?: boolean;
};

type SyncOnChainState = {
  type: "SYNC_ONCHAIN_STATE";
  payload: {
    credits: bigint;
    statementSupport: StatementSupport[];
    lastUpdated: bigint;
  };
};

type StageUserSupport = {
  type: "STAGE_USER_SUPPORT";
  payload: { statementId: bigint; adjustment: StagedSupportAdjustment };
};

type SwitchUserSupport = {
  type: "SWITCH_USER_SUPPORT";
  payload: { sourceStatementId: number; targetStatementId: number };
};

type ClearStagedSupport = {
  type: "CLEAR_STAGED_SUPPORT";
};

type BeginCommit = {
  type: "BEGIN_COMMIT";
};

type BeginSubmission = {
  type: "BEGIN_SUBMISSION";
};

type CommitSubmitted = {
  type: "COMMIT_SUBMITTED";
  payload: { txHash: `0x${string}` };
};

type CommitReverted = {
  type: "COMMIT_REVERTED";
};

type CommitCancelled = {
  type: "COMMIT_CANCELLED";
};

type CommitError = {
  type: "COMMIT_ERROR";
};

type ResetCommitStatus = {
  type: "RESET_COMMIT_STATUS";
};

type RestorePendingCommit = {
  type: "RESTORE_PENDING_COMMIT";
  payload: {
    txHash: `0x${string}`;
    submittedFromLastUpdated: bigint;
  };
};

type KeepOutdatedChanges = {
  type: "KEEP_OUTDATED_CHANGES";
};

type AbandonOutdatedChanges = {
  type: "ABANDON_OUTDATED_CHANGES";
};

type StageStatement = {
  type: "STAGE_STATEMENT";
  payload: { tempId: string; text: string; initialSupport: number };
};

type UnstageStatement = {
  type: "UNSTAGE_STATEMENT";
  payload: { tempId: string };
};

type UpdateStagedInitialSupport = {
  type: "UPDATE_STAGED_INITIAL_SUPPORT";
  payload: { tempId: string; newSupport: number };
};

type SetPendingDraftCost = {
  type: "SET_PENDING_DRAFT_COST";
  payload: { cost: number };
};

type RestoreStaged = {
  type: "RESTORE_STAGED";
  payload: {
    supportAdjustments: Map<number, StagedSupportAdjustment>;
    stagedStatements: StagedStatement[];
    baselineLastUpdated?: bigint;
  };
};

type UserSupportAction =
  | SyncOnChainState
  | StageUserSupport
  | SwitchUserSupport
  | ClearStagedSupport
  | BeginCommit
  | BeginSubmission
  | CommitSubmitted
  | CommitReverted
  | CommitCancelled
  | CommitError
  | ResetCommitStatus
  | RestorePendingCommit
  | KeepOutdatedChanges
  | AbandonOutdatedChanges
  | StageStatement
  | UnstageStatement
  | UpdateStagedInitialSupport
  | SetPendingDraftCost
  | RestoreStaged;

// Quadratic cost for a given support level (in credit parts).
// Matches the on-chain formula: s*(s+M)/(2*M) where M = creditMultiplier.
const triangle = (x: number, creditMultiplier: number): number =>
  (Math.abs(x) * (Math.abs(x) + creditMultiplier)) / (2 * creditMultiplier);

const inverseTriangle = (
  creditCost: number,
  creditMultiplier: number,
): number => {
  if (creditCost <= 0) return 0;
  return Math.floor(
    (Math.sqrt(
      creditMultiplier * creditMultiplier + 8 * creditMultiplier * creditCost,
    ) -
      creditMultiplier) /
      2,
  );
};

// Cost of changing support from `fromSupport` to `toSupport` (both in
// credit parts). A positive result means credits are spent; a negative
// result means credits are refunded.
const adjustmentCost = (
  fromSupport: number,
  toSupport: number,
  creditMultiplier: number,
): number => {
  return (
    triangle(toSupport, creditMultiplier) -
    triangle(fromSupport, creditMultiplier)
  );
};

const getAdjustedSupport = (
  onChainSupport: number,
  adjustment: StagedSupportAdjustment,
): number => {
  return adjustment.adjustmentType === SupportAdjustmentType.SetTo
    ? adjustment.value
    : onChainSupport + adjustment.value;
};

const setStagedSupportAdjustment = (
  supportAdjustments: Map<number, StagedSupportAdjustment>,
  statementId: number,
  onChainSupport: number,
  adjustment: StagedSupportAdjustment,
): void => {
  if (getAdjustedSupport(onChainSupport, adjustment) === onChainSupport) {
    supportAdjustments.delete(statementId);
  } else {
    supportAdjustments.set(statementId, adjustment);
  }
};

// ── localStorage helpers for staged-support persistence ──────────────────────

type PersistedSupportAdjustment = number | StagedSupportAdjustment;

interface PersistedStaged {
  supportAdjustments: [number, PersistedSupportAdjustment][];
  stagedStatements: StagedStatement[];
  /** `stagedBaselineLastUpdated` serialized as a string (bigint). */
  baselineLastUpdated?: string;
}

const normalizeSupportAdjustment = (
  adjustment: PersistedSupportAdjustment,
): StagedSupportAdjustment => {
  if (typeof adjustment === "number") {
    return {
      value: adjustment,
      adjustmentType: SupportAdjustmentType.Delta,
    };
  }

  return {
    value: Number(adjustment.value),
    adjustmentType:
      adjustment.adjustmentType === SupportAdjustmentType.SetTo
        ? SupportAdjustmentType.SetTo
        : SupportAdjustmentType.Delta,
  };
};

const stagedStorageKey = (
  chainFingerprint: string,
  forumName: string,
  addrKey: string,
): string => `symvolia:staged:${chainFingerprint}:${forumName}:${addrKey}`;

const saveStagedToStorage = (
  key: string,
  staged: StagedSupport,
  baselineLastUpdated?: bigint,
): void => {
  try {
    const data: PersistedStaged = {
      supportAdjustments: [...staged.supportAdjustments.entries()],
      stagedStatements: staged.stagedStatements,
      baselineLastUpdated: baselineLastUpdated?.toString(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded or localStorage unavailable
  }
};

const loadStagedFromStorage = (
  key: string,
): {
  supportAdjustments: Map<number, StagedSupportAdjustment>;
  stagedStatements: StagedStatement[];
  baselineLastUpdated?: bigint;
} | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedStaged;
    return {
      supportAdjustments: new Map(
        data.supportAdjustments.map(([statementId, adjustment]) => [
          statementId,
          normalizeSupportAdjustment(adjustment),
        ]),
      ),
      stagedStatements: data.stagedStatements ?? [],
      baselineLastUpdated:
        data.baselineLastUpdated !== undefined
          ? BigInt(data.baselineLastUpdated)
          : undefined,
    };
  } catch {
    return null;
  }
};

const clearStagedStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// ── localStorage helpers for pending-commit persistence ──────────────────────

interface PersistedPendingCommit {
  txHash: `0x${string}`;
  /** `submittedFromLastUpdated` serialized as a string (bigint). */
  submittedFromLastUpdated: string;
}

const pendingCommitStorageKey = (
  chainFingerprint: string,
  forumName: string,
  addrKey: string,
): string =>
  `symvolia:pendingCommit:${chainFingerprint}:${forumName}:${addrKey}`;

const savePendingCommitToStorage = (
  key: string,
  txHash: `0x${string}`,
  submittedFromLastUpdated: bigint,
): void => {
  try {
    const data: PersistedPendingCommit = {
      txHash,
      submittedFromLastUpdated: submittedFromLastUpdated.toString(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded or localStorage unavailable
  }
};

const loadPendingCommitFromStorage = (
  key: string,
): { txHash: `0x${string}`; submittedFromLastUpdated: bigint } | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPendingCommit;
    if (!data.txHash || data.submittedFromLastUpdated === undefined)
      return null;
    return {
      txHash: data.txHash,
      submittedFromLastUpdated: BigInt(data.submittedFromLastUpdated),
    };
  } catch {
    return null;
  }
};

const clearPendingCommitStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

/** Build an empty staged bucket seeded with the given available credits. */
const emptyStaged = (credits: number): StagedSupport => ({
  credits,
  supportAdjustments: new Map(),
  stagedStatements: [],
});

/** True when staged holds any support adjustment or new statement. */
const stagedHasContent = (staged?: StagedSupport): boolean =>
  (staged?.supportAdjustments.size ?? 0) > 0 ||
  (staged?.stagedStatements.length ?? 0) > 0;

const reducer = (
  state: UserSupportState,
  action: UserSupportAction & { creditMultiplier: number },
): UserSupportState => {
  let newState = { ...state };

  switch (action.type) {
    case "SYNC_ONCHAIN_STATE": {
      const _supportMap = new Map<number, number>();
      action.payload.statementSupport.forEach((s) => {
        _supportMap.set(Number(s.statementId), Number(s.support));
      });
      const onChainState: UserSupport = {
        credits: Number(action.payload.credits),
        statementSupport: _supportMap,
        lastUpdated: action.payload.lastUpdated,
      };
      newState.onChain = onChainState;

      if (!newState.staged) {
        newState.staged = emptyStaged(onChainState.credits);
      }

      const hadStaged = stagedHasContent(newState.staged);

      // Reconcile local state against the authoritative on-chain lastUpdated.
      if (
        newState.submittedFromLastUpdated !== undefined &&
        onChainState.lastUpdated > newState.submittedFromLastUpdated
      ) {
        // Our submitted commit landed: clear staged silently and confirm.
        newState.staged = emptyStaged(onChainState.credits);
        newState.submittedFromLastUpdated = undefined;
        newState.pendingTxHash = undefined;
        newState.isOutdated = false;
        newState.commitStatus = "confirmed";
      } else if (
        hadStaged &&
        newState.submittedFromLastUpdated === undefined &&
        newState.stagedBaselineLastUpdated !== undefined &&
        onChainState.lastUpdated > newState.stagedBaselineLastUpdated
      ) {
        // On-chain state changed for this user without a local submit in
        // flight (e.g. an action from another device). Flag it so the user
        // can keep or abandon their local changes.
        newState.isOutdated = true;
      }

      // While there are no staged changes, keep the baseline tracking the
      // live value so the next edit is measured against current on-chain
      // state (and a landed commit never looks "outdated").
      if (!stagedHasContent(newState.staged)) {
        newState.stagedBaselineLastUpdated = onChainState.lastUpdated;
      }

      break;
    }
    case "STAGE_USER_SUPPORT": {
      const { statementId, adjustment } = action.payload;
      if (!state.staged || !newState.staged) {
        throw new Error(
          "Cannot stage support adjustment before on-chain state is synced",
        );
      }
      newState.staged = {
        ...state.staged,
        supportAdjustments: new Map(state.staged.supportAdjustments),
        stagedStatements: [...state.staged.stagedStatements],
      };
      const statementIdNumber = Number(statementId);
      const onChainSupport =
        newState.onChain?.statementSupport.get(statementIdNumber) || 0;
      setStagedSupportAdjustment(
        newState.staged.supportAdjustments,
        statementIdNumber,
        onChainSupport,
        adjustment,
      );
      break;
    }
    case "SWITCH_USER_SUPPORT": {
      const { sourceStatementId, targetStatementId } = action.payload;
      if (sourceStatementId === targetStatementId) break;
      if (!state.staged || !newState.staged || !newState.onChain) {
        throw new Error(
          "Cannot switch support before on-chain state is synced",
        );
      }
      const baseSupportState = newState.onChain;

      newState.staged = {
        ...state.staged,
        supportAdjustments: new Map(state.staged.supportAdjustments),
        stagedStatements: [...state.staged.stagedStatements],
      };

      const sourceOnChainSupport =
        baseSupportState.statementSupport.get(sourceStatementId) || 0;
      const sourceAdjustment =
        newState.staged.supportAdjustments.get(sourceStatementId);
      const sourceSupport = sourceAdjustment
        ? getAdjustedSupport(sourceOnChainSupport, sourceAdjustment)
        : sourceOnChainSupport;

      if (sourceSupport === 0) break;

      const targetOnChainSupport =
        baseSupportState.statementSupport.get(targetStatementId) || 0;
      const targetAdjustment =
        newState.staged.supportAdjustments.get(targetStatementId);
      const targetSupport = targetAdjustment
        ? getAdjustedSupport(targetOnChainSupport, targetAdjustment)
        : targetOnChainSupport;

      if (
        targetSupport !== 0 &&
        Math.sign(targetSupport) !== Math.sign(sourceSupport)
      ) {
        break;
      }

      const mergedCreditCost =
        triangle(sourceSupport, action.creditMultiplier) +
        triangle(targetSupport, action.creditMultiplier);
      const mergedSupport =
        Math.sign(sourceSupport) *
        inverseTriangle(mergedCreditCost, action.creditMultiplier);

      setStagedSupportAdjustment(
        newState.staged.supportAdjustments,
        sourceStatementId,
        sourceOnChainSupport,
        {
          value: 0,
          adjustmentType: SupportAdjustmentType.SetTo,
        },
      );
      setStagedSupportAdjustment(
        newState.staged.supportAdjustments,
        targetStatementId,
        targetOnChainSupport,
        {
          value: mergedSupport - targetOnChainSupport,
          adjustmentType: SupportAdjustmentType.Delta,
        },
      );
      break;
    }
    case "CLEAR_STAGED_SUPPORT": {
      newState.staged = emptyStaged(
        newState.onChain ? newState.onChain.credits : 0,
      );
      newState.isOutdated = false;
      newState.stagedBaselineLastUpdated = newState.onChain?.lastUpdated;
      break;
    }
    case "BEGIN_COMMIT": {
      newState.commitStatus = "awaiting-approval";
      break;
    }
    case "BEGIN_SUBMISSION": {
      newState.commitStatus = "pending-confirmation";
      break;
    }
    case "COMMIT_SUBMITTED": {
      newState.commitStatus = "pending-confirmation";
      newState.pendingTxHash = action.payload.txHash;
      // Snapshot the current on-chain lastUpdated. When the synced value moves
      // past it, we know this commit landed and clear staged.
      newState.submittedFromLastUpdated = newState.onChain?.lastUpdated;
      newState.isOutdated = false;
      break;
    }
    case "RESTORE_PENDING_COMMIT": {
      // Resume watching a tx submitted before a reload so the spinner and
      // lastUpdated reconciliation pick up where they left off.
      newState.pendingTxHash = action.payload.txHash;
      newState.submittedFromLastUpdated =
        action.payload.submittedFromLastUpdated;
      newState.commitStatus = "pending-confirmation";
      break;
    }
    case "COMMIT_REVERTED": {
      // The submitted tx reverted on-chain (lastUpdated will not advance), so
      // keep staged changes for retry and surface the failure.
      newState.commitStatus = "error";
      newState.pendingTxHash = undefined;
      newState.submittedFromLastUpdated = undefined;
      break;
    }
    case "COMMIT_CANCELLED": {
      newState.commitStatus = "cancelled";
      newState.pendingTxHash = undefined;
      newState.submittedFromLastUpdated = undefined;
      break;
    }
    case "COMMIT_ERROR": {
      newState.commitStatus = "error";
      // Keep staged changes (no work lost) and keep pendingTxHash +
      // submittedFromLastUpdated so a late-landing tx still reconciles via
      // lastUpdated. Pre-submission errors have neither set, so this is a
      // no-op beyond the status change.
      break;
    }
    case "RESET_COMMIT_STATUS": {
      // The user dismissed the terminal-state modal. Return to idle and stop
      // watching the tx, but KEEP staged changes so work is not lost. If a
      // dismissed tx lands later, the lastUpdated baseline surfaces it as an
      // outdated change the user can keep or abandon.
      newState.commitStatus = "idle";
      newState.pendingTxHash = undefined;
      newState.submittedFromLastUpdated = undefined;
      break;
    }
    case "KEEP_OUTDATED_CHANGES": {
      // Rebase staged intents onto the fresh on-chain state; the credit
      // validation below recomputes sufficiency against the new baseline.
      newState.isOutdated = false;
      newState.stagedBaselineLastUpdated = newState.onChain?.lastUpdated;
      break;
    }
    case "ABANDON_OUTDATED_CHANGES": {
      newState.staged = emptyStaged(
        newState.onChain ? newState.onChain.credits : 0,
      );
      newState.isOutdated = false;
      newState.stagedBaselineLastUpdated = newState.onChain?.lastUpdated;
      break;
    }
    case "STAGE_STATEMENT": {
      if (!state.staged) {
        throw new Error(
          "Cannot stage statement before on-chain state is synced",
        );
      }
      newState.staged = {
        ...state.staged,
        supportAdjustments: new Map(state.staged.supportAdjustments),
        stagedStatements: [
          ...state.staged.stagedStatements,
          {
            tempId: action.payload.tempId,
            text: action.payload.text,
            initialSupport: action.payload.initialSupport,
          },
        ],
      };
      break;
    }
    case "UNSTAGE_STATEMENT": {
      if (!state.staged) break;
      newState.staged = {
        ...state.staged,
        supportAdjustments: new Map(state.staged.supportAdjustments),
        stagedStatements: state.staged.stagedStatements.filter(
          (s) => s.tempId !== action.payload.tempId,
        ),
      };
      break;
    }
    case "UPDATE_STAGED_INITIAL_SUPPORT": {
      if (!state.staged) break;
      newState.staged = {
        ...state.staged,
        supportAdjustments: new Map(state.staged.supportAdjustments),
        stagedStatements: state.staged.stagedStatements.map((s) =>
          s.tempId === action.payload.tempId
            ? { ...s, initialSupport: action.payload.newSupport }
            : s,
        ),
      };
      break;
    }
    case "SET_PENDING_DRAFT_COST": {
      newState.pendingDraftCost = action.payload.cost;
      break;
    }
    case "RESTORE_STAGED": {
      if (!state.staged) break;
      newState.staged = {
        ...state.staged,
        supportAdjustments: action.payload.supportAdjustments,
        stagedStatements: action.payload.stagedStatements,
      };
      if (action.payload.baselineLastUpdated !== undefined) {
        newState.stagedBaselineLastUpdated = action.payload.baselineLastUpdated;
      }
      break;
    }
  }

  // Calculate total adjustment cost
  let totalAdjustmentCost = 0;
  if (newState.staged && newState.onChain) {
    for (const [statementId, adjustment] of newState.staged
      .supportAdjustments) {
      const onChainSupport =
        newState.onChain.statementSupport.get(statementId) || 0;
      const newSupport = getAdjustedSupport(onChainSupport, adjustment);
      totalAdjustmentCost += adjustmentCost(
        onChainSupport,
        newSupport,
        action.creditMultiplier,
      );
    }
    // Include cost for staged new statements
    for (const stmt of newState.staged.stagedStatements) {
      totalAdjustmentCost += adjustmentCost(
        0,
        stmt.initialSupport,
        action.creditMultiplier,
      );
    }
    // Include cost of the in-progress draft (before it is staged)
    totalAdjustmentCost += newState.pendingDraftCost;
  }

  const stagedCredits = (newState.onChain?.credits || 0) - totalAdjustmentCost;

  const hasStagedChanges =
    (newState.staged?.supportAdjustments.size ?? 0) > 0 ||
    (newState.staged?.stagedStatements.length ?? 0) > 0;

  newState = {
    ...newState,
    staged: newState.staged
      ? {
          ...newState.staged,
          credits: stagedCredits,
        }
      : undefined,
    hasStagedChanges,
    hasEnoughCredits: stagedCredits >= 0,
  };

  return newState;
};

type UserNotVerifiedContextValue = {
  isUserVerified: false;
  isVerifiedLoading: boolean;
  state: undefined;
  dispatch: undefined;
  commitChanges: undefined;
  previewCommitChanges: undefined;
  resetChanges: undefined;
  resetCommitStatus: undefined;
  getEffectiveSupport: undefined;
  getOnChainSupport: undefined;
  hasAdjustment: undefined;
  switchSupport: undefined;
  stageStatement: undefined;
  unstageStatement: undefined;
  updateStagedInitialSupport: undefined;
  keepOutdatedChanges: undefined;
  abandonOutdatedChanges: undefined;
  setPendingDraftCost: (cost: number) => void;
};

type UserSupportContextValue = {
  isUserVerified: true;
  isVerifiedLoading: boolean;
  state: UserSupportState;
  dispatch: React.Dispatch<UserSupportAction>;
  commitChanges: (options?: CommitChangesOptions) => void | Promise<void>;
  previewCommitChanges: () => Promise<CommitPreview | undefined>;
  resetChanges: () => void;
  resetCommitStatus: () => void;
  getEffectiveSupport: (statementId: number) => number;
  getOnChainSupport: (statementId: number) => number;
  hasAdjustment: (statementId: number) => boolean;
  switchSupport: (sourceStatementId: number, targetStatementId: number) => void;
  stageStatement: (text: string, initialSupport?: number) => void;
  unstageStatement: (tempId: string) => void;
  updateStagedInitialSupport: (tempId: string, newSupport: number) => void;
  keepOutdatedChanges: () => void;
  abandonOutdatedChanges: () => void;
  setPendingDraftCost: (cost: number) => void;
};

export const UserVoteContext = createContext<
  UserNotVerifiedContextValue | UserSupportContextValue | undefined
>(undefined);

// Verification flags are split into their own context so that components which
// only care about verification status (SideNav, UserProfilePanel, BottomNav,
// UserProfile) do not re-render on every staged vote toggle. These flags only
// change when the wallet/membership state resolves, not when staged support
// changes, so this context value stays referentially stable across toggles.
type UserVerificationContextValue = {
  isUserVerified: boolean;
  isVerifiedLoading: boolean;
};

export const UserVerificationContext = createContext<
  UserVerificationContextValue | undefined
>(undefined);

// Per-statement support is exposed through an external store so that each
// StatementCard can subscribe (via useSyncExternalStore) to ONLY its own
// statement's effective support. A staged vote toggle then re-renders just the
// affected card instead of every card that calls useUserVotes. The store value
// itself is referentially stable across toggles (its functions read the latest
// state through a ref), so consuming it never triggers a re-render.
type SupportStoreValue = {
  subscribe: (onStoreChange: () => void) => () => void;
  getEffectiveSupportParts: (statementId: number) => number;
  getHasAdjustment: (statementId: number) => boolean;
  getOnChainSupport: (statementId: number) => number;
  switchSupport: (sourceStatementId: number, targetStatementId: number) => void;
  dispatch: React.Dispatch<UserSupportAction>;
};

export const SupportStoreContext = createContext<SupportStoreValue | undefined>(
  undefined,
);

export const UserVoteProvider: FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [state, rawDispatch] = useReducer(reducer, {
    onChain: undefined,
    staged: undefined,
    hasStagedChanges: false,
    hasEnoughCredits: true,
    commitStatus: "idle",
    isOutdated: false,
    pendingDraftCost: 0,
  });
  const { writeContract, previewNetworkFee } = useContractWrite();
  const {
    address: participantAddress,
    isLoading: isWalletLoading,
    kind: walletKind,
  } = useWalletAuth();
  const { userId } = useUserRegistration();
  const publicClient = usePublicClient();
  const {
    forumContractAddress,
    chainFingerprint,
    name: forumName,
    creditMultiplier,
  } = useForum();

  // Wrap dispatch to inject creditMultiplier into every action
  const dispatch = useCallback(
    (action: UserSupportAction) => rawDispatch({ ...action, creditMultiplier }),
    [creditMultiplier],
  );

  // ── External store bridge for selective per-statement subscriptions ─────────
  // Keep the latest reducer state in a ref so the store getters (which are
  // referentially stable) can always read fresh values, and notify subscribers
  // after each commit. StatementCards subscribe to only their own statement id.
  const stateRef = useRef(state);
  stateRef.current = state;
  const supportListenersRef = useRef(new Set<() => void>());

  const subscribeSupport = useCallback((onStoreChange: () => void) => {
    supportListenersRef.current.add(onStoreChange);
    return () => {
      supportListenersRef.current.delete(onStoreChange);
    };
  }, []);

  useEffect(() => {
    supportListenersRef.current.forEach((listener) => listener());
  }, [state]);

  const getEffectiveSupportParts = useCallback(
    (statementId: number): number => {
      const current = stateRef.current;
      const onChainSupport =
        current.onChain?.statementSupport.get(statementId) || 0;
      const adjustment = current.staged?.supportAdjustments.get(statementId);
      return adjustment
        ? getAdjustedSupport(onChainSupport, adjustment)
        : onChainSupport;
    },
    [],
  );

  const getHasAdjustmentSnapshot = useCallback(
    (statementId: number): boolean =>
      stateRef.current.staged?.supportAdjustments.has(statementId) || false,
    [],
  );

  const getOnChainSupportSnapshot = useCallback(
    (statementId: number): number =>
      stateRef.current.onChain?.statementSupport.get(statementId) || 0,
    [],
  );

  const switchSupport = useCallback(
    (sourceStatementId: number, targetStatementId: number) => {
      dispatch({
        type: "SWITCH_USER_SUPPORT",
        payload: { sourceStatementId, targetStatementId },
      });
    },
    [dispatch],
  );

  const supportStoreValue = useMemo<SupportStoreValue>(
    () => ({
      subscribe: subscribeSupport,
      getEffectiveSupportParts,
      getHasAdjustment: getHasAdjustmentSnapshot,
      getOnChainSupport: getOnChainSupportSnapshot,
      switchSupport,
      dispatch,
    }),
    [
      subscribeSupport,
      getEffectiveSupportParts,
      getHasAdjustmentSnapshot,
      getOnChainSupportSnapshot,
      switchSupport,
      dispatch,
    ],
  );

  // Track authored statements in localStorage for "My Statements"
  const { add: addAuthoredStatement } =
    useLocalStorageSet("authoredStatements");

  const {
    data: isUserVerified,
    refetch: refetchIsMember,
    isLoading: isVerifiedLoading,
  } = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    account: participantAddress,
    functionName: "isMember",
    args: [],
    query: {
      enabled: !!participantAddress,
    },
  });

  const { data: onChainUserStatementSupport, refetch: refetchSupport } =
    useReadContract({
      address: forumContractAddress,
      abi: FORUM_ABI,
      account: participantAddress,
      functionName: "getUserStatementSupport",
      args: [],
      query: {
        enabled: Boolean(participantAddress && isUserVerified),
      },
    });

  const { data: onChainUserBalance, refetch: refetchBalance } = useReadContract(
    {
      address: forumContractAddress,
      abi: FORUM_ABI,
      account: participantAddress,
      functionName: "getUserBalance",
      args: [],
      query: {
        enabled: Boolean(participantAddress && isUserVerified),
      },
    },
  );

  const { data: onChainUserLastUpdated, refetch: refetchLastUpdated } =
    useReadContract({
      address: forumContractAddress,
      abi: FORUM_ABI,
      account: participantAddress,
      functionName: "getUserLastUpdated",
      args: [],
      query: {
        enabled: Boolean(participantAddress && isUserVerified),
      },
    });

  const refetch = useCallback(() => {
    void refetchIsMember();
    if (isUserVerified) {
      void refetchSupport();
      void refetchBalance();
      void refetchLastUpdated();
    }
  }, [
    refetchIsMember,
    refetchSupport,
    refetchBalance,
    refetchLastUpdated,
    isUserVerified,
  ]);

  // Sync with blockchain on every new block
  const { triggerSync } = useBlockSync(refetch);

  useEffect(() => {
    // Load state from blockchain
    if (
      onChainUserStatementSupport !== undefined &&
      onChainUserBalance !== undefined &&
      onChainUserLastUpdated !== undefined
    ) {
      dispatch({
        type: "SYNC_ONCHAIN_STATE",
        payload: {
          credits: onChainUserBalance,
          statementSupport: [...onChainUserStatementSupport],
          lastUpdated: onChainUserLastUpdated,
        },
      });
    }
  }, [
    onChainUserStatementSupport,
    onChainUserBalance,
    onChainUserLastUpdated,
    dispatch,
  ]);

  // ── Staged-support persistence ──────────────────────────────────────────
  const persistKey =
    chainFingerprint && participantAddress
      ? stagedStorageKey(
          chainFingerprint,
          forumName,
          participantAddress.slice(0, 10),
        )
      : undefined;
  const restoredKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!persistKey || !state.staged || restoredKeyRef.current === persistKey)
      return;
    restoredKeyRef.current = persistKey;
    const saved = loadStagedFromStorage(persistKey);
    if (
      saved &&
      (saved.supportAdjustments.size > 0 || saved.stagedStatements.length > 0)
    ) {
      dispatch({ type: "RESTORE_STAGED", payload: saved });
    }
  }, [persistKey, state.staged, dispatch]);
  useEffect(() => {
    if (!persistKey || !state.staged) return;
    if (
      state.staged.supportAdjustments.size === 0 &&
      state.staged.stagedStatements.length === 0
    ) {
      clearStagedStorage(persistKey);
    } else {
      saveStagedToStorage(
        persistKey,
        state.staged,
        state.stagedBaselineLastUpdated,
      );
    }
  }, [persistKey, state.staged, state.stagedBaselineLastUpdated]);

  // ── Pending-commit persistence ──────────────────────────────────────────
  // Persist the in-flight tx so a reload can resume watching it and reconcile
  // via lastUpdated instead of losing track of a submitted commit.
  const pendingCommitKey =
    chainFingerprint && participantAddress
      ? pendingCommitStorageKey(
          chainFingerprint,
          forumName,
          participantAddress.slice(0, 10),
        )
      : undefined;
  const restoredPendingKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!pendingCommitKey || restoredPendingKeyRef.current === pendingCommitKey)
      return;
    restoredPendingKeyRef.current = pendingCommitKey;
    const saved = loadPendingCommitFromStorage(pendingCommitKey);
    if (saved) {
      dispatch({
        type: "RESTORE_PENDING_COMMIT",
        payload: {
          txHash: saved.txHash,
          submittedFromLastUpdated: saved.submittedFromLastUpdated,
        },
      });
    }
  }, [pendingCommitKey, dispatch]);
  useEffect(() => {
    if (!pendingCommitKey) return;
    if (state.pendingTxHash && state.submittedFromLastUpdated !== undefined) {
      savePendingCommitToStorage(
        pendingCommitKey,
        state.pendingTxHash,
        state.submittedFromLastUpdated,
      );
    } else {
      clearPendingCommitStorage(pendingCommitKey);
    }
  }, [pendingCommitKey, state.pendingTxHash, state.submittedFromLastUpdated]);

  // Wait for transaction receipt once a tx hash is available
  const { data: txReceipt } = useWaitForTransactionReceipt({
    hash: state.pendingTxHash,
    confirmations: 1,
    query: {
      enabled: !!state.pendingTxHash,
    },
  });

  // When the receipt arrives, either record a revert or capture authored
  // statement IDs and trigger a sync. On success we do NOT clear staged here —
  // SYNC_ONCHAIN_STATE reconciles via lastUpdated once the fresh state loads.
  const processedReceiptRef = useRef<`0x${string}` | undefined>(undefined);
  useEffect(() => {
    if (!txReceipt) return;
    if (processedReceiptRef.current === txReceipt.transactionHash) return;
    processedReceiptRef.current = txReceipt.transactionHash;

    if (txReceipt.status === "reverted") {
      dispatch({ type: "COMMIT_REVERTED" });
      return;
    }

    // Decode StatementAdded events to get the actual on-chain IDs.
    const statementEvents = parseEventLogs({
      abi: FORUM_ABI,
      logs: txReceipt.logs,
      eventName: "StatementAdded",
    });
    for (const event of statementEvents) {
      addAuthoredStatement(Number(event.args.id));
    }

    // Trigger an immediate sync so SYNC_ONCHAIN_STATE fires with fresh
    // contract data (advancing lastUpdated), which clears staged and marks
    // the commit confirmed.
    triggerSync();
  }, [txReceipt, addAuthoredStatement, triggerSync, dispatch]);

  // Timeout: if commit is in-flight for more than 30 seconds, treat as error
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (
      state.commitStatus !== "idle" &&
      state.commitStatus !== "confirmed" &&
      state.commitStatus !== "cancelled" &&
      state.commitStatus !== "error"
    ) {
      commitTimeoutRef.current = setTimeout(() => {
        dispatch({ type: "COMMIT_ERROR" });
      }, 30_000);
    } else {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
      }
    }
    return () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
      }
    };
  }, [state.commitStatus, dispatch]);

  const buildCommitRequest = useCallback(async (): Promise<
    ContractWriteRequest | undefined
  > => {
    if (
      state.hasStagedChanges &&
      state.hasEnoughCredits &&
      state.staged &&
      publicClient &&
      participantAddress
    ) {
      const hasSupportAdjustments = state.staged.supportAdjustments.size > 0;

      const calls: `0x${string}`[] = [];

      for (const stmt of state.staged.stagedStatements) {
        calls.push(
          encodeFunctionData({
            abi: FORUM_ABI,
            functionName: "addStatement",
            args: [stmt.text, BigInt(stmt.initialSupport)],
          }),
        );
      }

      if (hasSupportAdjustments) {
        const supportAdjustments: {
          statementId: bigint;
          value: bigint;
          adjustmentType: number;
        }[] = [];
        for (const [statementId, adjustment] of state.staged
          .supportAdjustments) {
          supportAdjustments.push({
            statementId: BigInt(statementId),
            value: BigInt(adjustment.value),
            adjustmentType: adjustment.adjustmentType,
          });
        }
        calls.push(
          encodeFunctionData({
            abi: FORUM_ABI,
            functionName: "adjustSupport",
            args: [supportAdjustments],
          }),
        );
      }

      const gasEstimate = await publicClient.estimateContractGas({
        address: forumContractAddress,
        abi: FORUM_ABI,
        functionName: "multicall",
        args: [calls],
        account: participantAddress,
      });

      return {
        address: forumContractAddress,
        abi: FORUM_ABI,
        functionName: "multicall",
        args: [calls],
        gas: (gasEstimate * 120n) / 100n,
      };
    }
  }, [
    state.hasStagedChanges,
    state.hasEnoughCredits,
    state.staged,
    publicClient,
    participantAddress,
    forumContractAddress,
  ]);

  const previewCommitChanges = useCallback(async () => {
    if (!state.staged) return undefined;

    const request = await buildCommitRequest();
    if (!request) return undefined;

    return {
      statementCount: state.staged.stagedStatements.length,
      supportAdjustmentCount: state.staged.supportAdjustments.size,
      networkFee: await previewNetworkFee(request, { userId }),
    };
  }, [buildCommitRequest, previewNetworkFee, state.staged, userId]);

  const commitChanges = useCallback(
    async (options?: CommitChangesOptions) => {
      if (
        state.hasStagedChanges &&
        state.hasEnoughCredits &&
        state.staged &&
        publicClient &&
        participantAddress
      ) {
        if (walletKind === "external") {
          dispatch({ type: "BEGIN_COMMIT" });
        } else {
          dispatch({ type: "BEGIN_SUBMISSION" });
        }

        try {
          const request = await buildCommitRequest();
          if (!request) {
            throw new Error("No staged changes are ready to commit.");
          }

          const txHash = await writeContract({
            ...request,
            selfFunded: options?.selfFunded ?? false,
            uiOptions: { showWalletUIs: false },
          });

          dispatch({ type: "COMMIT_SUBMITTED", payload: { txHash } });
        } catch (err: unknown) {
          if (err instanceof BaseError) {
            if (err.shortMessage?.toLowerCase().includes("rejected")) {
              dispatch({ type: "COMMIT_CANCELLED" });
              return;
            }
          }

          dispatch({ type: "COMMIT_ERROR" });
        }
      }
    },
    [
      state,
      writeContract,
      buildCommitRequest,
      publicClient,
      participantAddress,
      walletKind,
      dispatch,
    ],
  );

  const resetCommitStatus = useCallback(() => {
    dispatch({ type: "RESET_COMMIT_STATUS" });
  }, [dispatch]);

  // Rendering reads directly from live on-chain state; staged adjustments are
  // layered on top in getEffectiveSupport.
  const renderOnChain = state.onChain;

  // Helper function to get effective support (on-chain + adjustment)
  const getEffectiveSupport = useCallback(
    (statementId: number): number => {
      const onChainSupport =
        renderOnChain?.statementSupport.get(statementId) || 0;
      const adjustment = state.staged?.supportAdjustments.get(statementId);
      return adjustment
        ? getAdjustedSupport(onChainSupport, adjustment)
        : onChainSupport;
    },
    [renderOnChain, state.staged],
  );

  // Helper function to get on-chain support (without adjustments)
  const getOnChainSupport = useCallback(
    (statementId: number): number => {
      return renderOnChain?.statementSupport.get(statementId) || 0;
    },
    [renderOnChain],
  );

  // Helper function to check if a statement has a pending adjustment
  const hasAdjustment = useCallback(
    (statementId: number): boolean => {
      return state.staged?.supportAdjustments.has(statementId) || false;
    },
    [state.staged],
  );

  // Stage a new statement for batched submission
  const stageStatement = useCallback(
    (text: string, initialSupport = 0) => {
      const tempId = crypto.randomUUID();
      dispatch({
        type: "STAGE_STATEMENT",
        payload: { tempId, text, initialSupport },
      });
    },
    [dispatch],
  );

  // Remove a staged statement before it is committed
  const unstageStatement = useCallback(
    (tempId: string) => {
      dispatch({ type: "UNSTAGE_STATEMENT", payload: { tempId } });
    },
    [dispatch],
  );

  // Update the initial support value of a staged statement
  const updateStagedInitialSupport = useCallback(
    (tempId: string, newSupport: number) => {
      dispatch({
        type: "UPDATE_STAGED_INITIAL_SUPPORT",
        payload: { tempId, newSupport },
      });
    },
    [dispatch],
  );

  // Set the credit cost of the in-progress draft statement
  const setPendingDraftCost = useCallback(
    (cost: number) => {
      dispatch({ type: "SET_PENDING_DRAFT_COST", payload: { cost } });
    },
    [dispatch],
  );

  const resetChanges = useCallback(() => {
    dispatch({ type: "CLEAR_STAGED_SUPPORT" });
  }, [dispatch]);

  // Rebase local staged changes onto the fresh on-chain state.
  const keepOutdatedChanges = useCallback(() => {
    dispatch({ type: "KEEP_OUTDATED_CHANGES" });
  }, [dispatch]);

  // Discard local staged changes in favour of the fresh on-chain state.
  const abandonOutdatedChanges = useCallback(() => {
    dispatch({ type: "ABANDON_OUTDATED_CHANGES" });
  }, [dispatch]);

  // Verification is still loading if the query is in-flight OR the wallet
  // address hasn't resolved yet (the query won't even start without it).
  const isVerifiedStillLoading =
    isWalletLoading || (!!participantAddress && isVerifiedLoading);

  // Stable verification value: only changes when membership/wallet state
  // resolves, NOT on staged vote toggles (state.onChain is untouched by
  // staging), so flag-only consumers avoid re-rendering on every toggle.
  const verificationValue = useMemo<UserVerificationContextValue>(
    () => ({
      isUserVerified: !!isUserVerified,
      isVerifiedLoading: isUserVerified
        ? !state.onChain
        : isVerifiedStillLoading,
    }),
    [isUserVerified, state.onChain, isVerifiedStillLoading],
  );

  const verifiedValue = useMemo<UserSupportContextValue>(
    () => ({
      isUserVerified: true,
      isVerifiedLoading: !state.onChain,
      state,
      dispatch,
      commitChanges,
      previewCommitChanges,
      resetChanges,
      resetCommitStatus,
      getEffectiveSupport,
      getOnChainSupport,
      hasAdjustment,
      switchSupport,
      stageStatement,
      unstageStatement,
      updateStagedInitialSupport,
      keepOutdatedChanges,
      abandonOutdatedChanges,
      setPendingDraftCost,
    }),
    [
      state,
      dispatch,
      commitChanges,
      previewCommitChanges,
      resetChanges,
      resetCommitStatus,
      getEffectiveSupport,
      getOnChainSupport,
      hasAdjustment,
      switchSupport,
      stageStatement,
      unstageStatement,
      updateStagedInitialSupport,
      keepOutdatedChanges,
      abandonOutdatedChanges,
      setPendingDraftCost,
    ],
  );

  const unverifiedValue = useMemo<UserNotVerifiedContextValue>(
    () => ({
      isUserVerified: false,
      isVerifiedLoading: isVerifiedStillLoading,
      state: undefined,
      dispatch: undefined,
      commitChanges: undefined,
      previewCommitChanges: undefined,
      resetChanges: undefined,
      resetCommitStatus: undefined,
      getEffectiveSupport: undefined,
      getOnChainSupport: undefined,
      hasAdjustment: undefined,
      switchSupport: undefined,
      stageStatement: undefined,
      unstageStatement: undefined,
      updateStagedInitialSupport: undefined,
      keepOutdatedChanges: undefined,
      abandonOutdatedChanges: undefined,
      setPendingDraftCost,
    }),
    [isVerifiedStillLoading, setPendingDraftCost],
  );

  const voteValue = isUserVerified ? verifiedValue : unverifiedValue;

  return (
    <UserVerificationContext.Provider value={verificationValue}>
      <SupportStoreContext.Provider value={supportStoreValue}>
        <UserVoteContext.Provider value={voteValue}>
          {children}
        </UserVoteContext.Provider>
      </SupportStoreContext.Provider>
    </UserVerificationContext.Provider>
  );
};

export const useUserVotes = () => {
  const state = useContext(UserVoteContext);
  if (!state) {
    throw new Error(
      "useUserVoteContext must be used within a UserVoteProvider",
    );
  }
  return state;
};

// Lightweight hook for components that only need verification status. Backed by
// a dedicated context whose value is stable across staged vote toggles, so
// these consumers don't re-render on every toggle.
export const useUserVerification = () => {
  const value = useContext(UserVerificationContext);
  if (!value) {
    throw new Error(
      "useUserVerification must be used within a UserVoteProvider",
    );
  }
  return value;
};

// Selective per-statement subscription. A card re-renders only when ITS own
// effective support or adjustment flag changes, not on every staged toggle.
// Also returns the stable dispatch / getOnChainSupport so consuming cards can
// avoid subscribing to the volatile UserVoteContext entirely.
export const useStatementSupport = (statementId: number) => {
  const store = useContext(SupportStoreContext);
  if (!store) {
    throw new Error(
      "useStatementSupport must be used within a UserVoteProvider",
    );
  }
  const supportParts = useSyncExternalStore(store.subscribe, () =>
    store.getEffectiveSupportParts(statementId),
  );
  const hasAdjustment = useSyncExternalStore(store.subscribe, () =>
    store.getHasAdjustment(statementId),
  );
  return {
    supportParts,
    hasAdjustment,
    getOnChainSupport: store.getOnChainSupport,
    dispatch: store.dispatch,
  };
};

// Access the stable support-store actions/getters without subscribing to any
// per-statement value. The returned value is referentially stable across staged
// vote toggles, so consumers don't re-render on toggles.
export const useSupportStore = () => {
  const store = useContext(SupportStoreContext);
  if (!store) {
    throw new Error("useSupportStore must be used within a UserVoteProvider");
  }
  return store;
};
