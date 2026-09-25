import { describe, it, expect } from 'vitest';
import { buildDemoDeps, runDemoSequence, DemoEvent } from '../src/demo/sequence';
import { LeaseStatus } from '../src/core/lease';

// ---------------------------------------------------------------------------
// Integration tests — run the full demo sequence end-to-end.
// Each test constructs its own fresh registries via buildDemoDeps().
// ---------------------------------------------------------------------------

describe('Demo sequence — integration', () => {
  function runFull() {
    const deps = buildDemoDeps();
    const events: DemoEvent[] = [];
    runDemoSequence(deps, (e) => events.push(e));
    return { events, deps };
  }

  // Helper — find an agent state by id within an event
  function agent(event: DemoEvent, id: string) {
    const s = event.agentStates.find((a) => a.agentId === id);
    if (!s) throw new Error(`Agent "${id}" not found in event ${event.step}`);
    return s;
  }

  // ── Step 1 snapshot ───────────────────────────────────────────────────────

  it('Step 1 snapshot: all three agents are ACTIVE', () => {
    const { events } = runFull();
    const step1 = events[0];

    expect(agent(step1, 'backend').leaseStatus).toBe(LeaseStatus.ACTIVE);
    expect(agent(step1, 'frontend').leaseStatus).toBe(LeaseStatus.ACTIVE);
    expect(agent(step1, 'datamodel').leaseStatus).toBe(LeaseStatus.ACTIVE);
  });

  it('Step 1 snapshot is immutable — later steps do not retroactively change it', () => {
    const { events } = runFull();

    // Capture the Step 1 values before any later events are inspected
    const step1BackendStatus  = agent(events[0], 'backend').leaseStatus;
    const step1FrontendStatus = agent(events[0], 'frontend').leaseStatus;
    const step1DatamodelStatus = agent(events[0], 'datamodel').leaseStatus;
    const step1BackendAction  = agent(events[0], 'backend').lastAction;
    const step1FrontendAction = agent(events[0], 'frontend').lastAction;

    // Now inspect later steps (this would expose aliasing if AgentState were a live ref)
    void events[1];
    void events[2];
    void events[3];

    // Step 1 must still reflect the state at the moment of emission — all ACTIVE,
    // and Backend must show the "start" action, NOT the later mutation action.
    expect(step1BackendStatus).toBe(LeaseStatus.ACTIVE);
    expect(step1FrontendStatus).toBe(LeaseStatus.ACTIVE);
    expect(step1DatamodelStatus).toBe(LeaseStatus.ACTIVE);
    expect(step1BackendAction).toMatch(/start/i);
    expect(step1BackendAction).not.toMatch(/mutateContract/i);
    expect(step1FrontendAction).toMatch(/start/i);
  });

  // ── Step 2: mutation semantics ────────────────────────────────────────────

  it('after step 2: Backend remains ACTIVE — it owns the contract, not a consumer', () => {
    const { events } = runFull();
    const step2 = events[1];

    expect(agent(step2, 'backend').leaseStatus).toBe(LeaseStatus.ACTIVE);
  });

  it('after step 2: Frontend lease is STALE (consumer of mutated contract)', () => {
    const { events } = runFull();
    expect(agent(events[1], 'frontend').leaseStatus).toBe(LeaseStatus.STALE);
  });

  it('after step 2: Data Model lease is ACTIVE (unrelated contract, unaffected)', () => {
    const { events } = runFull();
    expect(agent(events[1], 'datamodel').leaseStatus).toBe(LeaseStatus.ACTIVE);
  });

  // ── Step 3: write blocking ────────────────────────────────────────────────

  it('after step 3: Frontend write was blocked; error captured in lastAction and errorMessage', () => {
    const { events } = runFull();
    const step3 = events[2];
    const frontendState = agent(step3, 'frontend');

    // The last action must reflect the block
    expect(frontendState.lastAction).toMatch(/blocked|PactStaleError/i);
    // An error message must be present and name the error
    expect(frontendState.errorMessage).not.toBeNull();
    expect(frontendState.errorMessage).toMatch(/PactStaleError/i);
    // Status must still be STALE (write did not succeed)
    expect(frontendState.leaseStatus).toBe(LeaseStatus.STALE);
  });

  // ── Step 4: recovery guarantees ───────────────────────────────────────────

  it('after step 4: Frontend holds a new lease ID — different from the original step 1 ID', () => {
    const { events } = runFull();

    const step1LeaseId = agent(events[0], 'frontend').currentLeaseId;
    const step4LeaseId = agent(events[3], 'frontend').currentLeaseId;

    expect(step4LeaseId).not.toBeNull();
    expect(step4LeaseId).not.toBe(step1LeaseId);
  });

  it('after step 4: new Frontend lease is ACTIVE', () => {
    const { events } = runFull();
    expect(agent(events[3], 'frontend').leaseStatus).toBe(LeaseStatus.ACTIVE);
  });

  it('after step 4: write succeeded and no error is present', () => {
    const { events } = runFull();
    const step4Frontend = agent(events[3], 'frontend');

    expect(step4Frontend.errorMessage).toBeNull();
    expect(step4Frontend.lastAction).toMatch(/success/i);
  });

  it('after step 4: old Frontend lease ID is permanently STALE in the registry', () => {
    const { deps, events } = runFull();
    const oldLeaseId = agent(events[0], 'frontend').currentLeaseId;
    expect(oldLeaseId).not.toBeNull();

    const oldLease = deps.leaseRegistry.getLease(oldLeaseId!);
    expect(oldLease).toBeDefined();
    expect(oldLease!.status).toBe(LeaseStatus.STALE);
  });

  // ── Data Model isolation across all steps ─────────────────────────────────

  it('Data Model lease ID and status are unchanged across all four steps', () => {
    const { events } = runFull();

    const dmStep1 = agent(events[0], 'datamodel');
    const dmStep4 = agent(events[3], 'datamodel');

    expect(dmStep4.currentLeaseId).toBe(dmStep1.currentLeaseId);
    expect(dmStep4.leaseStatus).toBe(LeaseStatus.ACTIVE);
  });

  // ── Step 4 copy ───────────────────────────────────────────────────────────

  it('Step 4 description contains the required acknowledgement copy', () => {
    const { events } = runFull();
    const step4 = events[3];

    expect(step4.description).toMatch(/Frontend acknowledged contract v2: \/api\/session/);
    expect(step4.description).toMatch(/new lease ID/i);
    expect(step4.description).toMatch(/Old lease remains STALE/);
    expect(step4.description).toMatch(/New lease is ACTIVE/);
    expect(step4.description).toMatch(/write succeeded/i);
  });
});
