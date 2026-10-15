import { LEASE_BROKEN_SEED } from './lease';
import { BROKEN_SEED } from './lww';
import { LOG_BROKEN_SEED } from './orderLog';

export type Bug = 'lww' | 'lease' | 'log';

/** The seed each bug opens on: the one its test pins as failing, so the seed on screen is the one that breaks. */
export const BUG_SEEDS: Record<Bug, number> = { lww: BROKEN_SEED, lease: LEASE_BROKEN_SEED, log: LOG_BROKEN_SEED };
