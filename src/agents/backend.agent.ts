import { ContractRegistry } from '../core/contract';
import { LeaseRegistry } from '../core/registry';
import { Lease } from '../core/lease';
import { AgentState } from './types';

/**
 * BackendAgent
 *
 * Simulated coding agent responsible for the authentication API.
 * It issues a lease with no dependency on api/login — it *owns* that contract,
 * it does not consume it. Consumers (e.g. FrontendAgent) declare the dependency.
 *
 * When it calls mutateContract(), the registry marks all *consumer* leases STALE.
 * Backend's own lease is unaffected because it never declared api/login as a dependency.
 */
export class BackendAgent {
  private readonly contracts: ContractRegistry;
  private readonly registry: LeaseRegistry;
  private lease: Lease | null = null;
  private lastAction = 'not started';

  constructor(contracts: ContractRegistry, registry: LeaseRegistry) {
    this.contracts = contracts;
    this.registry = registry;
  }

  /**
   * Issue a lease with no contract dependencies — Backend owns the contract,
   * it does not consume it, so there is nothing to go stale on its side.
   */
  start(): void {
    this.lease = this.registry.issueLease(
      'backend',
      new Map(), // no dependencies — Backend is the contract owner
      'backend-plan-v1',
    );
    this.lastAction = 'start: issued lease (owner of api/login, no dependency declared)';
  }

  /**
   * Mutate the api/login contract to point at /api/session.
   * Triggers stale propagation for all consumer leases that declared api/login.
   */
  mutateContract(): void {
    this.contracts.mutate('api/login', '/api/session');
    this.lastAction = 'mutateContract: api/login → /api/session (v2)';
  }

  getState(): AgentState {
    return {
      agentId: 'backend',
      currentLeaseId: this.lease?.id ?? null,
      leaseStatus: this.lease?.status ?? null,
      lastAction: this.lastAction,
      errorMessage: null,
    };
  }
}
