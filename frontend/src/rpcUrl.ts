export const RPC_URL_STORAGE_KEY = "symvolia:settings:rpcUrl";

const getLocalStorageRpcUrl = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const stored = localStorage.getItem(RPC_URL_STORAGE_KEY)?.trim();
    return stored ? stored : undefined;
  } catch {
    return undefined;
  }
};

const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Resolve the RPC URL to use: a user-configured override from local storage
 * when present and valid, otherwise the provided fallback. The caller owns
 * validating and supplying the fallback (e.g. from an env variable).
 */
export const resolveRpcUrl = (fallbackRpcUrl: string): string => {
  const storedRpcUrl = getLocalStorageRpcUrl();
  if (storedRpcUrl && isHttpUrl(storedRpcUrl)) {
    return storedRpcUrl;
  }

  return fallbackRpcUrl;
};

export const normalizeRpcUrlInput = (value: string): string => value.trim();

export const validateRpcUrlChain = async (
  rpcUrl: string,
  expectedChainId: number,
  expectedChainName: string,
): Promise<{ chainId: number }> => {
  const parsedUrl = new URL(rpcUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("RPC URL must use http or https.");
  }

  const response = await fetch(parsedUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    result?: string;
    error?: { message?: string };
  };

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  if (typeof payload.result !== "string" || !payload.result.startsWith("0x")) {
    throw new Error("RPC did not return a valid chain id.");
  }

  const chainId = Number(BigInt(payload.result));
  if (!Number.isFinite(chainId)) {
    throw new Error("RPC returned an unsupported chain id.");
  }

  if (chainId !== expectedChainId) {
    throw new Error(
      `This RPC reports chain ID ${chainId}, but this site expects ${expectedChainName} (${expectedChainId}).`,
    );
  }

  return { chainId };
};
