/**
 * Why the metadata service is the prize, and the three ways to shrink what a reach gets. A toy model of a machine whose
 * link-local service hands out its role's temporary credential; the credential is fake and labelled so.
 */
import { FAKE_CREDENTIAL } from './ssrf';

export interface Hardening {
  /** The service demands a session token obtained with a request type the fetch feature cannot make. */
  token: boolean;
  /** The server runs in a container, and the network hop limit stops replies from crossing the extra hop. */
  hopLimit: boolean;
  /** The machine role can do very little. */
  leastPrivilege: boolean;
}

export const NO_HARDENING: Hardening = { token: false, hopLimit: false, leastPrivilege: false };

export type Exposure =
  | { kind: 'refused'; by: 'token' | 'hopLimit' }
  | { kind: 'credential'; scope: 'broad' | 'narrow'; value: string; can: readonly string[] };

const BROAD = ['read every storage bucket', 'write every storage bucket', 'start and stop machines'] as const;
const NARROW = ['read one storage bucket'] as const;

/** What a request that reaches the service from the feature gets, in the order the checks happen. */
export function exposure(h: Hardening): Exposure {
  if (h.hopLimit) return { kind: 'refused', by: 'hopLimit' };
  if (h.token) return { kind: 'refused', by: 'token' };
  return h.leastPrivilege ? { kind: 'credential', scope: 'narrow', value: FAKE_CREDENTIAL, can: NARROW } : { kind: 'credential', scope: 'broad', value: FAKE_CREDENTIAL, can: BROAD };
}

/** How many things a leaked credential could do: zero when refused. */
export const blastRadius = (h: Hardening): number => {
  const e = exposure(h);
  return e.kind === 'credential' ? e.can.length : 0;
};
