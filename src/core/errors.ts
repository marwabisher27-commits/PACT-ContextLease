export class PactStaleError extends Error {
  readonly leaseId: string;
  readonly reason: string;

  constructor(leaseId: string, reason: string) {
    super(`PactStaleError [lease=${leaseId}]: ${reason}`);
    this.name = 'PactStaleError';
    this.leaseId = leaseId;
    this.reason = reason;
    Object.setPrototypeOf(this, PactStaleError.prototype);
  }
}

export class PactConflictError extends Error {
  constructor(message: string) {
    super(`PactConflictError: ${message}`);
    this.name = 'PactConflictError';
    Object.setPrototypeOf(this, PactConflictError.prototype);
  }
}
