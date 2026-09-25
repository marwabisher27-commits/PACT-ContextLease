import { ContractRegistry } from '../core/contract';
import { LeaseRegistry } from '../core/registry';
import { BackendAgent } from '../agents/backend.agent';
import { FrontendAgent } from '../agents/frontend.agent';
import { DataModelAgent } from '../agents/datamodel.agent';
import { AgentState } from '../agents/types';

export interface DemoEvent {
  step: number;
  description: string;
  agentStates: AgentState[];
}

export interface DemoDeps {
  contractRegistry: ContractRegistry;
  leaseRegistry: LeaseRegistry;
}

/**
 * Build a fresh set of registries and contracts for one demo run.
 * Call this on init and on Reset.
 */
export function buildDemoDeps(): DemoDeps {
  const contractRegistry = new ContractRegistry();
  const leaseRegistry = new LeaseRegistry(contractRegistry);

  // Define the two contracts used in this demo
  contractRegistry.define('api/login', '/api/login');
  contractRegistry.define('db/users', 'users');

  return { contractRegistry, leaseRegistry };
}

/**
 * runDemoSequence
 *
 * Executes the four narrative steps synchronously, calling onStep after each one.
 * Returns the full DemoEvent log.
 *
 * Steps:
 *   1. All three agents issue leases — all ACTIVE.
 *   2. Backend mutates api/login → /api/session — Frontend lease becomes STALE.
 *   3. Frontend attempts a write — blocked by PactStaleError, zero side effects.
 *   4. Frontend explicitly acknowledges the new contract and receives a new lease ID,
 *      then writes successfully. Old lease remains STALE.
 */
export function runDemoSequence(
  deps: DemoDeps,
  onStep: (event: DemoEvent) => void,
): DemoEvent[] {
  const { contractRegistry, leaseRegistry } = deps;

  const backend = new BackendAgent(contractRegistry, leaseRegistry);
  const frontend = new FrontendAgent(contractRegistry, leaseRegistry);
  const datamodel = new DataModelAgent(contractRegistry, leaseRegistry);

  const events: DemoEvent[] = [];

  function emit(step: number, description: string): void {
    const event: DemoEvent = {
      step,
      description,
      agentStates: [backend.getState(), frontend.getState(), datamodel.getState()],
    };
    events.push(event);
    onStep(event);
  }

  // ── Step 1: All agents start and issue leases ──────────────────────────────
  backend.start();
  frontend.start();
  datamodel.start();
  emit(
    1,
    'All agents issued leases. ' +
    'Backend owns api/login. ' +
    'Frontend depends on api/login v1. ' +
    'Data Model depends on db/users v1. All leases ACTIVE.',
  );

  // ── Step 2: Backend mutates the contract ───────────────────────────────────
  backend.mutateContract();
  // Data Model writes freely — unaffected
  datamodel.write();
  emit(
    2,
    'Backend mutated api/login → /api/session (v2). ' +
    'Frontend lease automatically marked STALE. ' +
    'Data Model wrote successfully — its lease is unaffected.',
  );

  // ── Step 3: Frontend attempts a write — blocked ────────────────────────────
  frontend.attemptWrite(); // captures PactStaleError internally
  emit(
    3,
    'Frontend attempted a write. ' +
    'PactStaleError thrown before any side effect. ' +
    'Payload is untouched.',
  );

  // ── Step 4: Frontend acknowledges new contract, receives new lease, writes ──
  frontend.acknowledgeAndReissue();
  frontend.attemptWrite();
  emit(
    4,
    'Frontend acknowledged contract v2: /api/session and received a new lease ID. ' +
    'Old lease remains STALE. New lease is ACTIVE — write succeeded.',
  );

  return events;
}
