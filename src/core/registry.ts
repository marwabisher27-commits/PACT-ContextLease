import { ContractRegistry } from './contract';
import { PactStaleError } from './errors';
import { Lease, LeaseStatus } from './lease';

let _leaseCounter = 0;
function newLeaseId(): string {
  return `lease-${(++_leaseCounter).toString().padStart(4, '0')}`;
}

export interface WriteResult {
  success: true;
  leaseId: string;
  payload: unknown;
}

/**
 * LeaseRegistry
 *
 * Central PACT store. Receives a ContractRegistry at construction and subscribes to its
 * onChange event. All coordination between agents flows through this registry.
 *
 * Key invariants:
 *  - A stale lease is NEVER reactivated. Agents must call issueLease() to get a new lease ID.
 *  - writeLease checks lease status AND live contract versions atomically before touching payload.
 *  - Zero side effects when either guard fails.
 */
export class LeaseRegistry {
  private readonly leases = new Map<string, Lease>();
  private readonly contracts: ContractRegistry;

  constructor(contractRegistry: ContractRegistry) {
    this.contracts = contractRegistry;
    contractRegistry.onChange((key) => this.onContractMutated(key));
  }

  /**
   * Issue a new lease bound to the supplied dependency versions.
   *
   * @param agentId      Identifier for the requesting agent.
   * @param dependencies Map of contractKey → version the agent has explicitly read.
   * @param planHash     Opaque string representing the agent's current plan.
   * @returns            A new Lease with status ACTIVE.
   * @throws PactStaleError if any supplied version is already behind the live contract.
   */
  issueLease(
    agentId: string,
    dependencies: Map<string, number>,
    planHash: string,
  ): Lease {
    // Validate all dependency versions before issuing.
    for (const [key, boundVersion] of dependencies) {
      const live = this.contracts.get(key);
      if (live === undefined) {
        throw new PactStaleError(
          '(pre-issue)',
          `Contract key "${key}" does not exist.`,
        );
      }
      if (live.version !== boundVersion) {
        throw new PactStaleError(
          '(pre-issue)',
          `Contract "${key}" is at version ${live.version} but agent supplied version ${boundVersion}.`,
        );
      }
    }

    const id = newLeaseId();
    const lease: Lease = {
      id,
      agentId,
      status: LeaseStatus.ACTIVE,
      dependencies: new Map(dependencies),
      planHash,
    };
    this.leases.set(id, lease);
    return lease;
  }

  /**
   * Attempt to write using a lease.
   *
   * Guards checked BEFORE touching payload (zero side effects if either fails):
   *   1. Lease must exist.
   *   2. Lease status must be ACTIVE.
   *   3. Every dependency version must still match the live contract.
   *
   * @throws PactStaleError if any check fails.
   */
  writeLease(leaseId: string, payload: unknown): WriteResult {
    const lease = this.leases.get(leaseId);
    if (!lease) {
      throw new PactStaleError(leaseId, 'Lease does not exist.');
    }

    // Guard 1: status check (catches leases already marked STALE by onContractMutated)
    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new PactStaleError(
        leaseId,
        `Lease status is ${lease.status}. A stale lease cannot write.`,
      );
    }

    // Guard 2: live version check — runs even if status is still ACTIVE (race condition defence)
    for (const [key, boundVersion] of lease.dependencies) {
      const live = this.contracts.get(key);
      if (live === undefined || live.version !== boundVersion) {
        // Mark stale to reflect the confirmed mismatch, then throw without touching payload
        lease.status = LeaseStatus.STALE;
        throw new PactStaleError(
          leaseId,
          `Contract "${key}" version mismatch: bound=${boundVersion}, live=${live?.version ?? 'missing'}.`,
        );
      }
    }

    // Both guards passed — safe to commit the write
    return { success: true, leaseId, payload };
  }

  /** Returns the lease for a given ID, or undefined. */
  getLease(leaseId: string): Lease | undefined {
    return this.leases.get(leaseId);
  }

  // ---------------------------------------------------------------------------
  // Internal — triggered by ContractRegistry.onChange
  // ---------------------------------------------------------------------------
  private onContractMutated(key: string): void {
    for (const lease of this.leases.values()) {
      if (lease.dependencies.has(key) && lease.status === LeaseStatus.ACTIVE) {
        lease.status = LeaseStatus.STALE;
      }
    }
  }
}
