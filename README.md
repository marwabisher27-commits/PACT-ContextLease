# PACT ContextLease

> **IBM Bob Hackathon prototype.**
> The agents in this demo are **simulated in TypeScript**. This is not a direct integration with IBM Bob or any IBM product. It is a working proof-of-concept illustrating the ContextLease concept.

---

## The Problem

When multiple AI coding agents work in parallel on the same codebase, one agent can change a shared contract — an API path, a schema, a type — while another agent is mid-task and still planning against the old version. Without coordination, the second agent writes code that is silently incompatible. The bug lands in the codebase with no warning.

**PACT ContextLease** solves this by giving each agent a *lease* that is explicitly bound to the contract versions it acknowledged when it started. If any dependency changes, the lease is marked **STALE** and the next write is **blocked before any side effect is applied**. The agent must explicitly read and acknowledge the new contract, receiving a brand-new lease ID. The old lease stays permanently STALE.

---

## How it Works

### Contracts and Leases

- A **ContractRegistry** stores named contracts (`api/login`, `db/users`, …) as `{ value, version }` pairs. Every mutation increments the version and notifies subscribers.
- A **LeaseRegistry** issues leases. Each lease records the contract key → version the agent explicitly read at issue time.
- `writeLease()` runs two guards **atomically before touching any payload**:
  1. Lease status must be `ACTIVE`.
  2. Every bound contract version must still match the live registry.
- If either guard fails, a `PactStaleError` is thrown and the payload is untouched.

### Mutation Semantics

An agent that **owns** a contract (e.g. Backend) declares no dependency on it — it cannot go stale on something it controls. Only **consumers** declare dependencies and can be invalidated.

---

## The Four Demo Steps

| Step | What happens |
|------|-------------|
| **1 — Leases Issued** | All three agents start. Backend owns `api/login` (no dependency). Frontend depends on `api/login v1`. Data Model depends on `db/users v1`. All leases **ACTIVE**. |
| **2 — Backend Mutates** | Backend changes `api/login → /api/session` (v2). Frontend's lease is automatically marked **STALE**. Backend remains **ACTIVE** (it owns the contract). Data Model is **unaffected**. |
| **3 — Frontend Blocked** | Frontend attempts a write. `PactStaleError` is thrown before any state is changed. Payload is untouched. |
| **4 — Explicit Recovery** | Frontend reads the current contract (`api/login v2: /api/session`) and calls `issueLease` with the new version. A **new lease ID** is issued. The old lease stays permanently STALE. The new lease is ACTIVE and the write succeeds. |

---

## Running Locally

```bash
# Install dependencies
npm install

# Start the development server (opens at http://localhost:5173)
npm run dev
```

Use the **▶ Next Step** button to advance through the four steps one at a time.
Use the **↺ Reset** button to restart the demo from scratch.

---

## Running Tests

```bash
npm test
```

Expected output:

```
✓ tests/lease.test.ts  (6 tests)
✓ tests/demo.test.ts   (12 tests)

Test Files  2 passed (2)
Tests       18 passed (18)
```

### What the Tests Prove

**Unit tests (`tests/lease.test.ts`)**

- `writeLease` succeeds on an ACTIVE lease with the correct version.
- `writeLease` throws `PactStaleError` on a STALE lease; payload is untouched (zero side effects).
- `writeLease` throws `PactStaleError` if the contract version advanced after issue, even if status is still ACTIVE.
- `onContractMutated` marks only leases that declared the mutated dependency STALE; unrelated leases stay ACTIVE.
- `issueLease` rejects an outdated version number at issue time.
- A new lease after acknowledgement gets a different ID; the old lease stays STALE.

**Integration tests (`tests/demo.test.ts`)**

- Step 1 snapshot shows all three agents ACTIVE.
- Step 1 snapshot is immutable — later mutations do not retroactively change it.
- Backend remains ACTIVE after its own mutation (owner semantics).
- Frontend is STALE after step 2; Data Model is ACTIVE.
- Step 3 write is blocked and `PactStaleError` is captured.
- Step 4 produces a new lease ID; old lease is permanently STALE in the registry.
- Data Model lease ID and status are unchanged across all four steps.
- Step 4 description contains the required acknowledgement copy.

---

## Production Build

```bash
npm run build
# Output in dist/
```

---

## Project Structure

```
src/
  core/
    errors.ts       — PactStaleError, PactConflictError
    lease.ts        — Lease type, LeaseStatus enum
    contract.ts     — ContractRegistry (key → {value, version})
    registry.ts     — LeaseRegistry (constructor injection, two-guard writeLease)
  agents/
    types.ts        — AgentState
    backend.agent.ts
    frontend.agent.ts
    datamodel.agent.ts
  demo/
    sequence.ts     — runDemoSequence(), buildDemoDeps()
    visualiser.tsx  — React UI (Next Step + Reset)
    visualiser.css
tests/
  lease.test.ts     — 6 unit tests
  demo.test.ts      — 12 integration tests
```

---

## Scope and Disclaimers

- No real HTTP server, no network calls, no persistent storage.
- No IBM Bob API integration. The agents are TypeScript classes that simulate the parallel-agent scenario.
- Built for the IBM Bob Hackathon to demonstrate the ContextLease concept as a working prototype.
