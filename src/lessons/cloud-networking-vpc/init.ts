/** The state each scene opens in (pure, so a test can switch through all of them) and the edits the learner makes. */
import { EMPTY_DRAFT, buildRule, type RuleDraft } from './rules';
import { DEFAULT_ROWS, MAX_SUBNET_ROWS, type CarveRow } from './planner';
import {
  FLOWS, MAX_RULES, naclRuleText, presetConfig, rulesOf, sgRuleText, withRules, cidrText,
  type AnyRule, type Flow, type ListRef, type NaclRule, type PresetId, type RouteEntry, type SgRule, type VpcConfig,
} from './vpc';

export const flowById = (id: string): Flow => FLOWS.find((f) => f.id === id) ?? FLOWS[0];

// ---- scene 1: the packet tracer ------------------------------------------------------------------

export interface TracerState {
  preset: PresetId;
  flow: string;
}
export const initialTracer = (): TracerState => ({ preset: 'three-tier', flow: 'user-web' });

// ---- scene 2: editing the rules ------------------------------------------------------------------

export interface RulesState {
  preset: PresetId;
  cfg: VpcConfig;
  list: ListRef;
  draft: RuleDraft;
  /** The last thing the Add or Remove button did, or why it refused. */
  note: string | null;
  flow: string;
}
/** Opens on a broken design: the app cannot reach the database, and the list that holds the missing rule is already selected. */
export const initialRules = (): RulesState => ({
  preset: 'app-db',
  cfg: presetConfig('app-db'),
  list: { kind: 'sg', dir: 'in', instance: 'db' },
  draft: { ...EMPTY_DRAFT },
  note: null,
  flow: 'app-db',
});

export const loadPreset = (s: RulesState, preset: PresetId): RulesState => ({ ...s, preset, cfg: presetConfig(preset), note: null, draft: { ...EMPTY_DRAFT } });
export const pickList = (s: RulesState, list: ListRef): RulesState => ({ ...s, list, note: null, draft: { ...EMPTY_DRAFT } });
export const editDraft = (s: RulesState, patch: Partial<RuleDraft>): RulesState => ({ ...s, draft: { ...s.draft, ...patch } });

export function ruleText(ref: ListRef, r: AnyRule): string {
  if (ref.kind === 'route') {
    const e = r as RouteEntry;
    return `${cidrText(e)} to ${e.target === 'igw' ? 'internet gateway' : 'NAT gateway'}`;
  }
  return ref.kind === 'sg' ? sgRuleText(r as SgRule) : naclRuleText(r as NaclRule);
}

/** Add the drafted rule, or keep everything and say which field to fix. */
export function addRule(s: RulesState): RulesState {
  const built = buildRule(s.cfg, s.list, s.draft);
  if (!built.ok) return { ...s, note: built.error };
  const next = [...rulesOf(s.cfg, s.list), built.value];
  return { ...s, cfg: withRules(s.cfg, s.list, next), note: `Added: ${ruleText(s.list, built.value)}.${next.length >= MAX_RULES ? ` The list now has ${MAX_RULES} entries, the most the lesson allows.` : ''}`, draft: { ...EMPTY_DRAFT } };
}

export function removeRule(s: RulesState, index: number): RulesState {
  const list = rulesOf(s.cfg, s.list);
  if (index < 0 || index >= list.length) return s;
  return { ...s, cfg: withRules(s.cfg, s.list, list.filter((_, i) => i !== index)), note: `Removed: ${ruleText(s.list, list[index])}.` };
}

// ---- scene 3: planning the CIDRs -----------------------------------------------------------------

export interface PlannerState {
  rows: CarveRow[];
  vpcA: string;
  vpcB: string;
  /** The subnet size the "will it fit" line asks about. */
  prefix: number;
}
export const DEFAULT_PLAN_PREFIX = 24;
export const initialPlanner = (): PlannerState => ({ rows: DEFAULT_ROWS.map((r) => ({ ...r })), vpcA: '10.0.0.0/16', vpcB: '10.0.0.0/16', prefix: DEFAULT_PLAN_PREFIX });

export const setRowText = (s: PlannerState, i: number, text: string): PlannerState => ({ ...s, rows: s.rows.map((r, k) => (k === i ? { ...r, text } : r)) });
export const addRow = (s: PlannerState): PlannerState => (s.rows.length >= MAX_SUBNET_ROWS ? s : { ...s, rows: [...s.rows, { name: `subnet ${s.rows.length + 1}`, text: '' }] });
export const removeRow = (s: PlannerState, i: number): PlannerState => ({ ...s, rows: s.rows.filter((_, k) => k !== i) });
