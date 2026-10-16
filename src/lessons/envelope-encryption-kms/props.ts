import type { ReactNode } from 'react';
import type { Vault } from './vault';

/** What every scene that works on the vault receives from the Stage. */
export interface VaultSceneProps {
  picker: ReactNode;
  vault: Vault;
  /** Run an async change to the vault; ignored while one is already running. */
  run: (change: (v: Vault) => Promise<Vault>) => void;
  /** Rebuild the vault from scratch (fresh keys, the seed records, a new backup). */
  reset: () => void;
  busy: boolean;
}
