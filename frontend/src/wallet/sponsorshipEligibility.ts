import { backendApiUrl } from "@/hooks/useSearchEngineMode";
import type { SponsoredNetworkFeeEstimate } from "./types";

/**
 * Sponsorship outlook for a prepared userOperation, mirrored from the backend
 * `/alchemy/gas-policy/eligibility` endpoint. It lets the fee preview tell a
 * clean rate-limit decline apart from a genuine error before the user submits.
 */
export type SponsorshipEligibilityStatus =
  | "sponsored"
  | "rate_limited"
  | "ineligible"
  | "error";

export type SponsorshipEligibility = {
  status: SponsorshipEligibilityStatus;
  detail?: string;
  retryAfterSeconds?: number;
};

const RATE_LIMITED_WARNING = "Symvolia has hit its sponsorship limit for now.";

/**
 * viem prepares user operations with `bigint` gas/nonce fields, which are not
 * JSON-serialisable. Convert them to decimal strings; the backend accepts hex,
 * decimal, or integer numeric fields.
 */
const serializeUserOperation = (
  userOperation: Record<string, unknown>,
): Record<string, unknown> => {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(userOperation)) {
    serialized[key] = typeof value === "bigint" ? value.toString() : value;
  }
  return serialized;
};

/**
 * Ask the backend whether a prepared userOperation would be sponsored. Returns
 * `undefined` when no backend is configured, no `userId` is available, or the
 * request fails, so callers degrade to their client-side heuristic. The
 * `userId` (the caller's zkPassport id) is required: the endpoint meters
 * against it directly and never resolves identity server-side, so we skip the
 * call rather than send one it would reject. It is only used for this
 * read-only preview and never consumes budget.
 */
export const fetchSponsorshipEligibility = async (
  userOperation: Record<string, unknown>,
  userId?: string | null,
): Promise<SponsorshipEligibility | undefined> => {
  if (!backendApiUrl || !userId) return undefined;
  try {
    const response = await fetch(
      `${backendApiUrl}/alchemy/gas-policy/eligibility`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userOperation: serializeUserOperation(userOperation),
          userId,
        }),
      },
    );
    if (!response.ok) return undefined;
    const data = (await response.json()) as {
      status?: string;
      detail?: string | null;
      retry_after_seconds?: number | null;
    };
    if (!data.status) return undefined;
    return {
      status: data.status as SponsorshipEligibilityStatus,
      detail: data.detail ?? undefined,
      retryAfterSeconds:
        typeof data.retry_after_seconds === "number"
          ? data.retry_after_seconds
          : undefined,
    };
  } catch {
    return undefined;
  }
};

/**
 * Map a sponsorship-eligibility result onto the fee estimate's `reason`/
 * `warning` fields. Returns `undefined` for the `sponsored` status, where the
 * meter says we are within budget so the decline came from Alchemy's own policy
 * (or a transient error) — the caller then keeps its own fallback message.
 */
export const eligibilityFeeExtra = (
  eligibility: SponsorshipEligibility,
): Pick<SponsoredNetworkFeeEstimate, "reason" | "warning"> | undefined => {
  switch (eligibility.status) {
    case "rate_limited":
      return { warning: RATE_LIMITED_WARNING };
    case "ineligible":
      return {
        reason:
          "This action isn't eligible for gas sponsorship, so it will be self-funded.",
      };
    case "error":
      return { warning: "Sponsorship couldn't be confirmed right now." };
    case "sponsored":
    default:
      return undefined;
  }
};
