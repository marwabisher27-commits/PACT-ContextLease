import { ContractRegistry } from '../core/contract';
import { LeaseRegistry, WriteResult } from '../core/registry';
import { Lease } from '../core/lease';
import { PactStaleError } from '../core/errors';
import { AgentState } from './types';

/**
 * FrontendAgent
 *
 * Simulated coding agent responsible for the UI login flow.
 * It issues a lease on api/login. After Backend mutates that contract, this agent's
 * lease becomes STALE and any write attempt is blocked.
 *
 * Recovery requires explicitly calling acknowledgeAndReissue(), which:
 *   1. Reads the CURRENT contract state (api/login now points to /api/session at version 2).
 *   2. Calls issueLease() with the new version → receives a BRAND NEW lease ID.
 *   3. The old lease ID remains STALE and is never reused.
 */
export class FrontendAgent {
  private readonly contracts: ContractRegistry;
  private readonly registry: LeaseRegistry;

  private lease: Lease | null = null;
  private lastWriteResult: WriteResult | null = null;
  private lastError: PactStaleError | null = null;
  private lastAction = 'not started';

  /** The lease ID held before acknowledgeAndReissue (kept for display). */
  private staleLease: Lease | null = null;

  constructor(contracts: ContractRegistry, registry: LeaseRegistry) {
    this.contracts = contracts;
    this.registry = registry;
  }

  /** Issue a lease declaring awareness of api/login at its current version. */
  start(): void {
    const entry = this.contracts.get('api/login');
    if (!entry) throw new Error('Contract api/login not defined.');
    this.lease = this.registry.issueLease(
      'frontend',
      new Map([['api/login', entry.version]]),
      'frontend-plan-v1',
    );
    this.lastAction = 'start: issued lease on api/login v' + entry.version;
  }

  /**
   * Attempt a write. Throws nothing — captures PactStaleError internally.
   * Returns the WriteResult on success, null if blocked.
   */
  attemptWrite(): WriteResult | null {
    this.lastError = null;
    if (!this.lease) throw new Error('FrontendAgent not started.');
    try {
      this.lastWriteResult = this.registry.writeLease(this.lease.id, {
        change: 'update login form endpoint',
      });
      this.lastAction = 'attemptWrite: ✅ success';
      return this.lastWriteResult;
    } catch (err) {
      if (err instanceof PactStaleError) {
        this.lastError = err;
        this.lastAction = 'attemptWrite: ⛔ blocked — ' + err.message;
        return null;
      }
      throw err;
    }
  }

  /**
   * Explicitly acknowledge the new contract state and receive a new lease ID.
   *
   * The agent reads the CURRENT value and version of api/login (which Backend
   * has mutated to /api/session v2), then calls issueLease with that version.
   * A brand-new lease ID is assigned. The old lease remains STALE forever.
   */
  acknowledgeAndReissue(): void {
    if (!this.lease) throw new Error('FrontendAgent not started.');
    const entry = this.contracts.get('api/login');
    if (!entry) throw new Error('Contract api/login not found.');

    // Preserve the old stale lease for display
    this.staleLease = this.lease;

    // Issue a new lease bound to the current (post-mutation) version
    this.lease = this.registry.issueLease(
      'frontend',
      new Map([['api/login', entry.version]]),
      'frontend-plan-v2-acknowledges-session',
    );
    this.lastAction =
      `acknowledgeAndReissue: new lease ${this.lease.id} bound to api/login v${entry.version} (${entry.value})`;
    this.lastError = null;
  }

  getState(): AgentState {
    return {
      agentId: 'frontend',
      currentLeaseId: this.lease?.id ?? null,
      leaseStatus: this.lease?.status ?? null,
      lastAction: this.lastAction,
      errorMessage: this.lastError?.message ?? null,
    };
  }

  getStaleLease(): Lease | null {
    return this.staleLease;
  }

  getLastError(): PactStaleError | null {
    return this.lastError;
  }
}
