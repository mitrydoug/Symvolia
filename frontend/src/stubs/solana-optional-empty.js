// Empty stub for Privy's OPTIONAL Solana / Farcaster mini-app peer dependencies.
//
// `@privy-io/react-auth` declares `@farcaster/mini-app-solana` and the
// `@solana/*` packages as OPTIONAL peer dependencies
// (peerDependenciesMeta.optional === true) and feature-detects them at runtime
// via `await import("@farcaster/mini-app-solana")`. Symvolia is EVM-only and
// never installs them.
//
// Because vite.config.js sets `build.rollupOptions.output.inlineDynamicImports`
// (required to keep the IPFS upload a single file for Pinata's file-count
// limit), Rollup must resolve every dynamic import at build time. An
// unresolved optional import becomes a stub that throws at module evaluation,
// which escapes Privy's try/catch and crashes the PrivyProvider.
//
// Aliasing those specifiers to this empty module lets the dynamic import
// resolve cleanly; Privy then proceeds down its "Solana not available" path.
export default {};
