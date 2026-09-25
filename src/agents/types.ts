import { LeaseStatus } from '../core/lease';

/**
 * Snapshot of an agent's observable state — used by the visualiser and tests.
 */
export interface AgentState {
  agentId: string;
  /** The lease ID currently held by this agent (may be stale or replaced). */
  currentLeaseId: string | null;
  leaseStatus: LeaseStatus | null;
  lastAction: string;
  errorMessage: string | null;
}
