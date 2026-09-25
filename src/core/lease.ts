export enum LeaseStatus {
  ACTIVE = 'ACTIVE',
  STALE = 'STALE',
  REVOKED = 'REVOKED',
}

/**
 * A lease issued to an agent.
 *
 * `dependencies` maps contract key → the version the agent acknowledged at issue time.
 * The lease is considered stale if any live contract version has advanced past the bound version.
 */
export interface Lease {
  readonly id: string;
  readonly agentId: string;
  status: LeaseStatus;
  /** contract key → version bound at issuance */
  readonly dependencies: Map<string, number>;
  readonly planHash: string;
}
