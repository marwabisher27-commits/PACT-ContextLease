# PACT ContextLease — Demo Plan

> **Scope note:** This is a self-contained prototype that *simulates* parallel coding agents and a
> PACT lease system. It is **not** a direct integration with IBM Bob. It is a working
> proof-of-concept built for the IBM Bob hackathon to illustrate the concept.

---

## Locked Design Decisions

| Decision | Choice |
|---|---|
| Registry instantiation | **Constructor injection.** No module-level singletons. Tests and demo runs each pass fresh `ContractRegistry` and `LeaseRegistry` instances into agents and the sequence runner. |
| Lease refresh semantics | A stale lease **never** becomes active. Frontend must explicitly read and acknowledge the current contract key *and its current version*, then receive a **brand-new lease ID** bound to that version. The old lease ID stays `STALE` forever and is never reused. |
| Pre-write guard | `writeLease(leaseId, payload)` checks the lease status **and** the bound contract version against the live registry atomically, before touching any payload state. Zero side effects when blocked. |
| Visualiser interaction | Manual **"Next Step"** button advances one step at a time. **"Reset"** reinitialises the full demo from scratch. No auto-play. |

---

## Top-Level Overview

Build a small, self-contained React + TypeScript demo that illustrates the core PACT ContextLease
concept.

The demo simulates three parallel coding agents:

| Agent | Role |
|---|---|
| **Backend** | Renames the API endpoint from `/api/login` → `/api/session` |
| **Frontend** | Still holds a plan that depends on `/api/login` — its lease is marked `STALE` and its next write is **blocked** |
| **Data Model** | Changes a database schema field — completely unrelated, continues freely |

Key behaviours the demo must prove:

1. **Stale detection** — when Backend commits a contract change, the registry invalidates every lease whose declared dependency includes the old contract version.
2. **Write blocking with zero side effects** — `writeLease` on a stale lease throws `PactStaleError` before touching any state.
3. **Isolation** — the Data Model agent's lease is unaffected because it declared no dependency on the login contract.
4. **Explicit recovery** — Frontend must explicitly read the new contract (`/api/session` at its current version) and call `issueLease` to receive a new lease ID. The old lease remains `STALE`.

---

## File Structure

```
pact-contextlease/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── core/
│   │   ├── errors.ts          ← PactStaleError, PactConflictError
│   │   ├── lease.ts           ← Lease type + LeaseStatus enum
│   │   ├── contract.ts        ← ContractRegistry (key → {value, version})
│   │   └── registry.ts        ← LeaseRegistry (takes ContractRegistry in constructor)
│   ├── agents/
│   │   ├── types.ts           ← AgentState shared type
│   │   ├── backend.agent.ts
│   │   ├── frontend.agent.ts
│   │   └── datamodel.agent.ts
│   └── demo/
│       ├── sequence.ts        ← runDemoSequence(registries, onStep)
│       ├── visualiser.tsx     ← React UI — Next Step + Reset
│       └── visualiser.css
└── tests/
    ├── lease.test.ts          ← unit tests for registry logic
    └── demo.test.ts           ← integration tests for the full sequence
```

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffolding

**Intent**
Set up a minimal Vite + React + TypeScript project with Vitest for testing.

**Expected Outcomes**
- `package.json` with: `react`, `react-dom`, `typescript`, `vite`, `@vitejs/plugin-react`,
  `vitest`, `@testing-library/react`, `@testing-library/jest-dom`.
- `tsconfig.json` — strict mode, JSX react-jsx, module ESNext.
- `vite.config.ts` — React plugin + Vitest globals enabled.
- `src/main.tsx` mounts `<App />` into `index.html`.
- `npm run dev` serves; `npm test` runs with zero failures.

**Todo List**
- [ ] Create `package.json`.
- [ ] Create `tsconfig.json`.
- [ ] Create `vite.config.ts`.
- [ ] Create `index.html`, `src/main.tsx`, `src/App.tsx`.

**Status** — `[ ] pending`

---

### Sub-Task 2 — Core PACT Types and Registry

**Intent**
Implement `errors.ts`, `lease.ts`, `contract.ts`, and `registry.ts`. These are the only modules
that contain lease logic. Agents, tests, and the demo sequence all receive instances via
constructor injection.

**Expected Outcomes**

`errors.ts`:
- `PactStaleError` — thrown when a write is attempted on a stale or mismatched lease.
- `PactConflictError` — thrown on duplicate lease id or contract key collisions.

`lease.ts`:
- `LeaseStatus` enum: `ACTIVE | STALE | REVOKED`.
- `Lease` type: `{ id, agentId, status, dependencies: Map<contractKey, boundVersion>, planHash }`.

`contract.ts`:
- `ContractEntry`: `{ value: string, version: number }`.
- `ContractRegistry` class:
  - `define(key, initialValue)` — registers a contract at `version: 1`.
  - `mutate(key, newValue)` — increments the version; notifies listeners.
  - `get(key)` → `ContractEntry | undefined`.
  - `onChange(listener: (key: string) => void)` — subscribe to mutations (used by `LeaseRegistry`).

`registry.ts`:
- `LeaseRegistry` constructor takes a `ContractRegistry` instance and subscribes to `onChange`.
- `issueLease(agentId, dependencies: Map<contractKey, version>, planHash)` → `Lease`.
  - Validates that each dependency key exists in `ContractRegistry` at the supplied version.
  - Throws `PactStaleError` if any supplied version is already outdated at issue time.
- `writeLease(leaseId, payload)`:
  - Throws `PactStaleError` if lease status is not `ACTIVE`.
  - Re-checks each `lease.dependencies` entry against the live contract version before writing.
  - Throws `PactStaleError` if any version has advanced since the lease was issued.
  - Zero side effects if either check fails.
  - Returns `{ success: true, payload }` on success.
- `onContractMutated(key)` (internal, called by `onChange` listener) — sets status `STALE` on every
  lease whose `dependencies` includes `key`.

**No `reset()` method. No singleton export. Isolation is achieved by constructing fresh instances.**

**Todo List**
- [ ] Create `src/core/errors.ts`.
- [ ] Create `src/core/lease.ts`.
- [ ] Create `src/core/contract.ts`.
- [ ] Create `src/core/registry.ts`.

**Status** — `[ ] pending`

---

### Sub-Task 3 — Agent Modules

**Intent**
Implement three agent classes. Each receives `ContractRegistry` and `LeaseRegistry` via
constructor injection. Agents do not import each other — all coordination is through the registries.

**Expected Outcomes**

`backend.agent.ts` — `BackendAgent`:
- Constructor: `(contractRegistry, leaseRegistry)`.
- `start()`: issues a lease declaring dependency on `contract:api/login` at its current version.
- `mutateContract()`: calls `contractRegistry.mutate('api/login', '/api/session')`, which
  automatically marks Frontend's lease `STALE` via the registry listener.

`frontend.agent.ts` — `FrontendAgent`:
- Constructor: `(contractRegistry, leaseRegistry)`.
- `start()`: issues lease declaring dependency on `contract:api/login` at its current version.
- `attemptWrite()`: calls `leaseRegistry.writeLease(this.currentLeaseId, payload)`.
  Returns the result or captures the `PactStaleError`.
- `acknowledgeAndReissue()`: reads `contractRegistry.get('api/login')` (now `/api/session`),
  calls `leaseRegistry.issueLease(...)` with the new key+version, stores the **new** lease ID.
  The old lease ID is never touched again.

`datamodel.agent.ts` — `DataModelAgent`:
- Constructor: `(contractRegistry, leaseRegistry)`.
- `start()`: issues lease depending on `contract:db/users` at its current version.
- `write()`: calls `leaseRegistry.writeLease(this.currentLeaseId, payload)`.

`types.ts`:
- `AgentState`: `{ agentId, currentLeaseId, leaseStatus, lastAction, errorMessage | null }`.

**Todo List**
- [ ] Create `src/agents/types.ts`.
- [ ] Create `src/agents/backend.agent.ts`.
- [ ] Create `src/agents/frontend.agent.ts`.
- [ ] Create `src/agents/datamodel.agent.ts`.

**Status** — `[ ] pending`

---

### Sub-Task 4 — Demo Sequence

**Intent**
Write `runDemoSequence(deps, onStep)` — a pure synchronous orchestration function that:
- Accepts injected `{ contractRegistry, leaseRegistry }`.
- Executes the four narrative steps.
- Calls `onStep(DemoEvent)` after each step so the visualiser can render incrementally.

**Steps**
1. All three agents call `start()` — all leases `ACTIVE`.
2. Backend calls `mutateContract()` — Frontend lease becomes `STALE`, Data Model stays `ACTIVE`.
3. Frontend calls `attemptWrite()` — blocked with `PactStaleError`, zero side effects.
4. Frontend calls `acknowledgeAndReissue()` then `attemptWrite()` again — new lease `ACTIVE`, write succeeds.

**Expected Outcomes**
- `DemoEvent` type: `{ step: number, description: string, agentStates: AgentState[] }`.
- `runDemoSequence` returns `DemoEvent[]` (the full log) and also calls `onStep` live.

**Todo List**
- [ ] Create `src/demo/sequence.ts` with `DemoEvent` type and `runDemoSequence`.

**Status** — `[ ] pending`

---

### Sub-Task 5 — React Visualiser

**Intent**
`<PactVisualiser />` runs the demo step-by-step with a "Next Step" button and a "Reset" button.

**Expected Outcomes**
- Three columns (one per agent), each showing: agent name, lease ID (truncated), lease status
  (colour-coded badge), last action, and error if blocked.
- "▶ Next Step" advances through the pre-collected `DemoEvent[]`.
- "↺ Reset" reconstructs fresh registries and agents, resets step counter.
- After step 2: Frontend column shows red `STALE` badge.
- After step 3: Frontend column shows ⛔ "Write blocked — PactStaleError".
- After step 4: Frontend column shows green `ACTIVE` badge with new lease ID; old lease ID
  is visible in the history as permanently `STALE`.
- Data Model column stays green throughout.

**Todo List**
- [ ] Create `src/demo/visualiser.tsx`.
- [ ] Create `src/demo/visualiser.css`.
- [ ] Wire into `src/App.tsx`.

**Status** — `[ ] pending`

---

### Sub-Task 6 — Automated Tests

**Intent**
Unit and integration tests that prove the blocking and isolation guarantees.
All tests use constructor injection — no singletons, no `reset()`.

**Unit tests (`tests/lease.test.ts`)**
- `writeLease` succeeds on an `ACTIVE` lease with correct version.
- `writeLease` throws `PactStaleError` on a `STALE` lease with zero side effects (assert
  payload state unchanged after the throw).
- `writeLease` throws `PactStaleError` if the contract version advanced between issue and write
  (even if lease status is still `ACTIVE`).
- `onContractMutated` marks only the leases that declared the mutated dependency `STALE`;
  unrelated leases stay `ACTIVE`.
- `issueLease` throws `PactStaleError` when the agent supplies an outdated version number.
- `acknowledgeAndReissue` issues a new lease ID; the old lease ID remains `STALE`.

**Integration tests (`tests/demo.test.ts`)**
- After step 2: Frontend lease is `STALE`; Data Model lease is `ACTIVE`.
- After step 3: `attemptWrite` threw `PactStaleError`; side-effect payload is untouched.
- After step 4: Frontend holds a **new** lease ID (different from step-1 ID); new lease is `ACTIVE`.
- Data Model lease ID and status are unchanged across all four steps.

**Todo List**
- [ ] Create `tests/lease.test.ts` with the six unit cases.
- [ ] Create `tests/demo.test.ts` with the four integration cases.

**Status** — `[ ] pending`

---

## Dependency Order

```
Sub-Task 1 (scaffolding)
  └─► Sub-Task 2 (core registry)
        └─► Sub-Task 3 (agents)
              └─► Sub-Task 4 (demo sequence)
                    ├─► Sub-Task 5 (visualiser)
                    └─► Sub-Task 6 (tests)
```

Sub-Tasks 5 and 6 are independent of each other and can be implemented after Sub-Task 4.

---

## Demo Script (hackathon presentation)

1. Open browser — three agent columns, all show green `ACTIVE`.
2. **Next Step** — Backend mutates contract; Frontend column flips to red `STALE`.
3. **Next Step** — Frontend attempts write; column shows ⛔ blocked error.
4. **Next Step** — Frontend acknowledges `/api/session`, receives new lease ID; column shows green `ACTIVE` and ✅ write success.
5. Point out: Data Model column has been green the entire time.
6. **Reset** — demo restarts cleanly for the next viewer.

Narrative: *"PACT ContextLease detected that Frontend's plan was stale before any side effect was written. The old lease is permanently invalidated. Frontend had to explicitly acknowledge the new contract before receiving a fresh lease. Data Model was unaffected throughout."*

---

## Non-Goals

- No real HTTP server or network layer.
- No persistent storage.
- No authentication or user management.
- No IBM Bob API integration.
- No CI/CD pipeline.
- No advanced UI beyond what is needed to visualise the four steps.
