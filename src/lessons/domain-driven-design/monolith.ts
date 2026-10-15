/**
 * Scene 1 of domain-driven-design: one invented `Customer` with 14 attributes, and which of four teams'
 * code reads or writes each. A change request touches the attributes it names, and the teams that must
 * change are every team with any access to one of them. The blast radius is computed from this matrix.
 */

import type { Tone } from '../../core/tone';

export type Team = 'billing' | 'shipping' | 'support' | 'marketing';
export const TEAMS: { id: Team; label: string }[] = [
  { id: 'billing', label: 'Billing' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'support', label: 'Support' },
  { id: 'marketing', label: 'Marketing' },
];

/** Teams are plain categories. */
export const TEAM_TONE: Record<Team, Tone> = { billing: 'amber', shipping: 'sky', support: 'pink', marketing: 'orange' };

export type Access = 'r' | 'w' | '';

export interface Attribute {
  id: string;
  label: string;
  /** In the order of TEAMS: billing, shipping, support, marketing. */
  access: [Access, Access, Access, Access];
}

export const ATTRIBUTES: Attribute[] = [
  { id: 'name', label: 'name', access: ['r', 'r', 'r', 'r'] },
  { id: 'email', label: 'email', access: ['r', 'r', 'w', 'w'] },
  { id: 'billingAddress', label: 'billing address', access: ['w', '', 'r', ''] },
  { id: 'shippingAddress', label: 'shipping address', access: ['', 'w', 'r', 'r'] },
  { id: 'taxId', label: 'tax id', access: ['w', 'r', 'r', ''] },
  { id: 'paymentTerms', label: 'payment terms', access: ['w', '', 'r', ''] },
  { id: 'creditLimit', label: 'credit limit', access: ['w', 'r', 'r', ''] },
  { id: 'supportTier', label: 'support tier', access: ['r', 'r', 'w', ''] },
  { id: 'ticketHistory', label: 'ticket history', access: ['', '', 'w', 'r'] },
  { id: 'loyaltyPoints', label: 'loyalty points', access: ['r', '', 'r', 'w'] },
  { id: 'preferredCarrier', label: 'preferred carrier', access: ['r', 'w', 'r', ''] },
  { id: 'deliveryNotes', label: 'delivery notes', access: ['', 'w', 'r', 'r'] },
  { id: 'marketingOptIn', label: 'marketing opt-in', access: ['r', '', 'r', 'w'] },
  { id: 'sla', label: 'SLA', access: ['r', '', 'w', ''] },
];

export interface Request {
  id: string;
  label: string;
  attributes: string[];
}

export const REQUESTS: Request[] = [
  { id: 'tier', label: 'Support renames "tier"', attributes: ['supportTier'] },
  { id: 'tax', label: 'Billing changes the tax-id format', attributes: ['taxId'] },
  { id: 'optin', label: 'Marketing redefines the opt-in', attributes: ['marketingOptIn'] },
  { id: 'carrier', label: 'Shipping recodes the carriers', attributes: ['preferredCarrier'] },
  { id: 'points', label: 'Loyalty points start to expire', attributes: ['loyaltyPoints'] },
];

const attributeById = (id: string) => ATTRIBUTES.find((a) => a.id === id)!;

/** The teams with any access to an attribute. */
export const teamsOf = (a: Attribute): Team[] => TEAMS.filter((_, i) => a.access[i] !== '').map((t) => t.id);

/** The teams whose code must change for a request: any team that reads or writes an attribute it names. */
export function teamsTouched(r: Request): Team[] {
  const touched = new Set(r.attributes.flatMap((id) => teamsOf(attributeById(id))));
  return TEAMS.map((t) => t.id).filter((t) => touched.has(t));
}

/** Blast radius: teams touched, out of all of them. */
export const blastRadius = (r: Request) => teamsTouched(r).length;

/** Attributes that three or more teams touch: where one model is hardest to change. */
export const widelyShared = (): Attribute[] => ATTRIBUTES.filter((a) => teamsOf(a).length >= 3);
