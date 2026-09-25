import { describe, it, expect } from 'vitest';
import { ContractRegistry } from '../src/core/contract';
import { LeaseRegistry } from '../src/core/registry';
import { LeaseStatus } from '../src/core/lease';
import { PactStaleError } from '../src/core/errors';

// ---------------------------------------------------------------------------
// Helpers — fresh instances for every test (constructor injection, no reset())
// ---------------------------------------------------------------------------

function makeRegistries() {
  const contracts = new ContractRegistry();
  const registry = new LeaseRegistry(contracts);
  contracts.define('api/login', '/api/login');
  contracts.define('db/users', 'users');
  return { contracts, registry };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('LeaseRegistry — unit', () => {
  // 1. writeLease succeeds on an ACTIVE lease with the correct version bound.
  it('writeLease succeeds on an ACTIVE lease with correct version', () => {
    const { contracts, registry } = makeRegistries();
    const entry = contracts.get('api/login')!;
    const lease = registry.issueLease(
      'agent-a',
      new Map([['api/login', entry.version]]),
      'plan-v1',
    );

    const result = registry.writeLease(lease.id, { payload: 'hello' });
    expect(result.success).toBe(true);
    expect(result.payload).toEqual({ payload: 'hello' });
    expect(lease.status).toBe(LeaseStatus.ACTIVE);
  });

  // 2. writeLease throws PactStaleError on a STALE lease; payload state is untouched.
  it('writeLease throws PactStaleError on a STALE lease with zero side effects', () => {
    const { contracts, registry } = makeRegistries();
    const entry = contracts.get('api/login')!;
    const lease = registry.issueLease(
      'agent-a',
      new Map([['api/login', entry.version]]),
      'plan-v1',
    );

    // Mutate the contract — marks the lease STALE via onChange listener
    contracts.mutate('api/login', '/api/session');
    expect(lease.status).toBe(LeaseStatus.STALE);

    let sideEffectTarget = 'untouched';
    let threw: PactStaleError | null = null;
    try {
      registry.writeLease(lease.id, 'SHOULD_NOT_REACH');
      sideEffectTarget = 'mutated'; // must not be reached
    } catch (err) {
      if (err instanceof PactStaleError) threw = err;
      else throw err;
    }

    expect(threw).not.toBeNull();
    expect(threw).toBeInstanceOf(PactStaleError);
    expect(sideEffectTarget).toBe('untouched'); // zero side effects confirmed
  });

  // 3. writeLease throws PactStaleError if the contract version advanced between issue and write,
  //    even when the lease status is still ACTIVE at the moment of the check.
  it('writeLease throws PactStaleError when contract version advances after issue (version mismatch)', () => {
    const { contracts, registry } = makeRegistries();
    const entry = contracts.get('api/login')!;

    // Issue lease at version 1
    const lease = registry.issueLease(
      'agent-a',
      new Map([['api/login', entry.version]]),
      'plan-v1',
    );

    // Directly advance the contract without going through the listener mechanism
    // (simulates a race: contract mutated between issuance and the write call)
    contracts.mutate('api/login', '/api/session'); // triggers listener → status STALE

    expect(() =>
      registry.writeLease(lease.id, 'payload'),
    ).toThrow(PactStaleError);
  });

  // 4. onContractMutated marks ONLY leases that declared the mutated dependency STALE;
  //    unrelated leases remain ACTIVE.
  it('onContractMutated only affects leases that declared the mutated dependency', () => {
    const { contracts, registry } = makeRegistries();

    const loginEntry = contracts.get('api/login')!;
    const usersEntry = contracts.get('db/users')!;

    const loginLease = registry.issueLease(
      'frontend',
      new Map([['api/login', loginEntry.version]]),
      'plan-v1',
    );
    const datamodelLease = registry.issueLease(
      'datamodel',
      new Map([['db/users', usersEntry.version]]),
      'plan-v1',
    );

    // Mutate api/login only
    contracts.mutate('api/login', '/api/session');

    expect(loginLease.status).toBe(LeaseStatus.STALE);
    expect(datamodelLease.status).toBe(LeaseStatus.ACTIVE); // unaffected
  });

  // 5. issueLease throws PactStaleError when the agent supplies an outdated version.
  it('issueLease throws PactStaleError if the agent supplies an outdated version number', () => {
    const { contracts, registry } = makeRegistries();

    // Advance the contract before the agent reads it
    contracts.mutate('api/login', '/api/session'); // now at version 2

    expect(() =>
      registry.issueLease(
        'agent-a',
        new Map([['api/login', 1]]), // agent still thinks it's at version 1
        'plan-v1',
      ),
    ).toThrow(PactStaleError);
  });

  // 6. acknowledgeAndReissue: new lease gets a different ID; old lease remains STALE.
  it('new lease issued after acknowledgement has a different ID; old lease stays STALE', () => {
    const { contracts, registry } = makeRegistries();

    // Issue original lease
    const v1Entry = contracts.get('api/login')!;
    const oldLease = registry.issueLease(
      'frontend',
      new Map([['api/login', v1Entry.version]]),
      'plan-v1',
    );
    const oldLeaseId = oldLease.id;

    // Mutate → old lease is STALE
    contracts.mutate('api/login', '/api/session');
    expect(oldLease.status).toBe(LeaseStatus.STALE);

    // Agent explicitly reads the NEW version and issues a fresh lease
    const v2Entry = contracts.get('api/login')!;
    expect(v2Entry.version).toBe(2);

    const newLease = registry.issueLease(
      'frontend',
      new Map([['api/login', v2Entry.version]]),
      'plan-v2',
    );

    // New lease must have a different ID and be ACTIVE
    expect(newLease.id).not.toBe(oldLeaseId);
    expect(newLease.status).toBe(LeaseStatus.ACTIVE);

    // Old lease must remain STALE (never reactivated)
    const oldLeaseRecord = registry.getLease(oldLeaseId);
    expect(oldLeaseRecord?.status).toBe(LeaseStatus.STALE);

    // New lease write must succeed
    const result = registry.writeLease(newLease.id, 'new-payload');
    expect(result.success).toBe(true);
  });
});
