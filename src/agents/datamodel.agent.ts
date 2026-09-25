import { ContractRegistry } from '../core/contract';
import { LeaseRegistry, WriteResult } from '../core/registry';
import { Lease } from '../core/lease';
import { AgentState } from './types';

/**
 * DataModelAgent
 *
 * Simulated coding agent responsible for database schema changes.
 * Its lease depends on contract:db/users — entirely unrelated to api/login.
 * It should be completely unaffected when Backend mutates api/login.
 */
export class DataModelAgent {
  private readonly contracts: ContractRegistry;
  private readonly registry: LeaseRegistry;
  private lease: Lease | null = null;
  private lastWriteResult: WriteResult | null = null;
  private lastAction = 'not started';

  constructor(contracts: ContractRegistry, registry: LeaseRegistry) {
    this.contracts = contracts;
    this.registry = registry;
  }

  /** Issue a lease declaring awareness of db/users at its current version. */
  start(): void {
    const entry = this.contracts.get('db/users');
    if (!entry) throw new Error('Contract db/users not defined.');
    this.lease = this.registry.issueLease(
      'datamodel',
      new Map([['db/users', entry.version]]),
      'datamodel-plan-v1',
    );
    this.lastAction = 'start: issued lease on db/users v' + entry.version;
  }

  /** Perform a write — should always succeed regardless of api/login mutations. */
  write(): WriteResult {
    if (!this.lease) throw new Error('DataModelAgent not started.');
    this.lastWriteResult = this.registry.writeLease(this.lease.id, {
      change: 'add column users.session_token',
    });
    this.lastAction = 'write: ✅ success';
    return this.lastWriteResult;
  }

  getState(): AgentState {
    return {
      agentId: 'datamodel',
      currentLeaseId: this.lease?.id ?? null,
      leaseStatus: this.lease?.status ?? null,
      lastAction: this.lastAction,
      errorMessage: null,
    };
  }
}
