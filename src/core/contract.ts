import { PactConflictError } from './errors';

export interface ContractEntry {
  readonly key: string;
  value: string;
  version: number;
}

type ChangeListener = (key: string) => void;

/**
 * ContractRegistry
 *
 * Stores named API/data contracts. Each contract has a version number that increments
 * on every mutation. LeaseRegistry subscribes via onChange() to detect stale leases.
 */
export class ContractRegistry {
  private readonly contracts = new Map<string, ContractEntry>();
  private readonly listeners: ChangeListener[] = [];

  /** Register a new contract at version 1. Throws if key already exists. */
  define(key: string, initialValue: string): void {
    if (this.contracts.has(key)) {
      throw new PactConflictError(`Contract key "${key}" is already defined.`);
    }
    this.contracts.set(key, { key, value: initialValue, version: 1 });
  }

  /**
   * Mutate an existing contract: increment version and notify listeners.
   * Throws if the key does not exist.
   */
  mutate(key: string, newValue: string): void {
    const entry = this.contracts.get(key);
    if (!entry) {
      throw new PactConflictError(`Contract key "${key}" does not exist.`);
    }
    entry.value = newValue;
    entry.version += 1;
    for (const listener of this.listeners) {
      listener(key);
    }
  }

  /** Returns the current entry for a key, or undefined if not found. */
  get(key: string): ContractEntry | undefined {
    return this.contracts.get(key);
  }

  /** Subscribe to contract mutations. Used by LeaseRegistry. */
  onChange(listener: ChangeListener): void {
    this.listeners.push(listener);
  }
}
