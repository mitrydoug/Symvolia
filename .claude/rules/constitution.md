<!--
================================================================================
SYNC IMPACT REPORT
================================================================================
Version change: N/A → 1.0.0 (initial ratification)

Modified principles: N/A (initial version)

Added sections:
  - Core Principles (6 principles)
  - Technology & Architecture
  - Development Workflow

Removed sections: N/A (initial version)

Templates requiring updates:
  ✅ plan-template.md - Compatible (Constitution Check section aligns)
  ✅ spec-template.md - Compatible (requirements/testing sections align)
  ✅ tasks-template.md - Compatible (phase structure supports principles)

Follow-up TODOs: None
================================================================================
-->

# Symvolia Constitution

## Core Principles

### I. Decentralization-First

All core functionality MUST be achievable through smart contracts and a static frontend alone. Backend services are OPTIONAL enhancements that provide auxiliary features (search, indexing) but MUST NOT be required for basic platform operation. Users MUST be able to interact with the system in a permissionless way without depending on centralized infrastructure.

**Rationale**: Symvolia serves as a "distributed, public billboard"—centralized dependencies would undermine censorship resistance and trustlessness.

### II. Smart Contract Correctness (NON-NEGOTIABLE)

All Solidity smart contract code MUST be thoroughly tested before deployment. Test coverage MUST include:
- Unit tests for all public/external functions
- Edge case handling (boundary conditions, overflow, reentrancy)
- Integration tests for contract interactions
- Fuzz testing where applicable

Contract changes MUST pass all existing tests plus new tests covering the change. No contract deployment without passing test suite.

**Rationale**: Smart contracts are immutable once deployed and handle user assets/votes. Bugs cannot be easily patched and may result in permanent loss of functionality or trust.

### III. Code Quality Standards

All code MUST pass automated quality gates before merge:
- **TypeScript/JavaScript**: `npm run typecheck`, `npm run lint`, `npm run format:check`
- **Python**: Type checking (mypy/pyright), linting (ruff/flake8), formatting (black/ruff)
- **Solidity**: Linting (solhint), formatting, static analysis (slither where applicable)

Autoformatters MUST be employed consistently. Code MUST be well-typed—avoid `any` types in TypeScript and untyped functions in Python.

**Rationale**: Consistent code quality reduces bugs, improves maintainability, and lowers onboarding friction for contributors.

### IV. Progressive Decentralization

The platform MUST support multiple tiers of user sophistication:
- **Beginner-friendly**: Embedded wallets and low-friction onboarding for new-to-web3 users
- **Intermediate**: Standard wallet connections (MetaMask, WalletConnect)
- **Advanced**: Direct contract interaction, self-custody options

Each tier MUST provide equivalent core functionality; advanced tiers offer greater sovereignty.

**Rationale**: Mass adoption requires accessibility, but web3 principles demand escape hatches to full decentralization.

### V. Humanity Verification

Users MUST verify their humanity before participating in voting or statement submission. The verification system:
- MUST prevent sybil attacks (one-person-one-vote integrity)
- MUST preserve user privacy to the maximum extent possible
- SHOULD support multiple verification providers (currently zkpassport)
- MUST NOT create centralized identity databases

**Rationale**: Quadratic voting's fairness depends on each participant being a unique human. Without verification, the system is vulnerable to manipulation.

### VI. Open Source Commitment

All code MUST remain open source under permissive licensing. Backend services:
- MUST use open source dependencies where viable alternatives exist
- MUST include documentation for self-hosting across major cloud providers (AWS, GCP, Azure)
- MUST NOT depend on proprietary services that cannot be replicated

**Rationale**: Open source aligns with decentralization principles and enables community verification, contribution, and independent deployment.

## Technology & Architecture

**Repository Structure**: Monorepo with three primary modules:
- `frontend/` — React + TypeScript static site (Material-UI)
- `blockchain/` — Solidity smart contracts (Hardhat)
- `backend/` — Python services for search/indexing (auxiliary, not required for core functionality)

**Languages & Frameworks**:
| Module     | Language   | Key Frameworks/Tools                      |
| ---------- | ---------- | ----------------------------------------- |
| Frontend   | TypeScript | React, Vite, Material-UI, ethers.js/wagmi |
| Blockchain | Solidity   | Hardhat, Foundry (testing)                |
| Backend    | Python     | FastAPI, Solr (search)                    |

**Deployment Targets**:
- Smart contracts: EVM-compatible chains
- Frontend: Static hosting (IPFS, Vercel, Netlify, or any static host)
- Backend: Containerized (Docker), documented for AWS/GCP/Azure

## Development Workflow

**Pre-Commit Requirements**:
1. All tests pass for affected modules
2. Linting and formatting checks pass
3. Type checking passes
4. For smart contracts: Security review checklist completed

**Branch Strategy**:
- `develop` — Integration branch for features
- `release` — Production-ready releases
- Feature branches: `[issue#]-feature-name`

**Documentation Requirements**:
- Public APIs MUST be documented
- Complex logic MUST include inline comments explaining rationale
- Backend services MUST include deployment documentation
- Smart contracts MUST include NatSpec documentation

## Governance

This constitution supersedes all other development practices in the repository. All pull requests and code reviews MUST verify compliance with these principles.

**Amendment Process**:
1. Proposed amendments MUST be documented with rationale
2. Breaking changes to principles require MAJOR version bump
3. Amendments MUST include a migration plan for existing code if applicable

**Compliance Review**:
- Constitution compliance SHOULD be verified during PR review
- Violations MUST be justified in writing if accepted (documented in PR description)
- Complexity beyond these guidelines MUST demonstrate why simpler alternatives are insufficient

**Version**: 1.0.0 | **Ratified**: 2026-02-07 | **Last Amended**: 2026-02-07
