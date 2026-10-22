/**
 * "When does it run?" A toy pipeline of five phases in the order a program meets them. Each technique looks at
 * the schema in one phase and checks what its rules say it checks; a mistake surfaces in the first phase whose
 * check catches it, or never (silently undefined or silently stale). The table is the result of running the
 * pipeline, not typed cells.
 */
export type PhaseId = 'expansion' | 'generation' | 'definition' | 'first-call' | 'access';
export type TechniqueId = 'macro' | 'codegen' | 'decorator' | 'reflection' | 'proxy';
export type MistakeId = 'misspelled' | 'wrong-type' | 'added-later';

export const PHASES: { id: PhaseId; label: string }[] = [
  { id: 'expansion', label: 'at expansion' },
  { id: 'generation', label: 'at generation' },
  { id: 'definition', label: 'at definition' },
  { id: 'first-call', label: 'at the first call' },
  { id: 'access', label: 'at the access' },
];

export interface Technique {
  id: TechniqueId;
  label: string;
  /** The phase in which it reads the schema. */
  phase: PhaseId;
  /** What its check can catch when it looks: the lesson's toy rules, shown on screen in the rules table. */
  checks: { names: boolean; types: boolean };
}

export const TECHNIQUES: Technique[] = [
  { id: 'macro', label: 'Macro (expansion time)', phase: 'expansion', checks: { names: true, types: false } },
  { id: 'codegen', label: 'Code generation (build time)', phase: 'generation', checks: { names: true, types: false } },
  { id: 'decorator', label: 'Decorator or annotation (definition time)', phase: 'definition', checks: { names: true, types: true } },
  { id: 'reflection', label: 'Reflection (run time)', phase: 'first-call', checks: { names: false, types: true } },
  { id: 'proxy', label: 'Proxy (access time)', phase: 'access', checks: { names: true, types: true } },
];

export const MISTAKES: { id: MistakeId; label: string }[] = [
  { id: 'misspelled', label: 'a misspelled field' },
  { id: 'wrong-type', label: 'a wrong type' },
  { id: 'added-later', label: 'a field added later' },
];

/** The schema gains its new field after this phase has run, so a technique that looked earlier never saw it. */
export const SCHEMA_GROWS_AFTER: PhaseId = 'definition';

export type Outcome =
  | { kind: 'surfaces'; phase: PhaseId; ran: PhaseId[] }
  | { kind: 'never'; why: string; ran: PhaseId[] }
  | { kind: 'fine'; ran: PhaseId[] };

const order = PHASES.map((p) => p.id);

/** Run the pipeline phase by phase for one technique and one mistake. */
export function runPipeline(technique: Technique, mistake: MistakeId): Outcome {
  const ran: PhaseId[] = [];
  let sawNewField = false;
  for (const phase of order) {
    ran.push(phase);
    if (phase === technique.phase) {
      sawNewField = order.indexOf(phase) > order.indexOf(SCHEMA_GROWS_AFTER);
      if (mistake === 'misspelled' && technique.checks.names) return { kind: 'surfaces', phase, ran };
      if (mistake === 'wrong-type' && technique.checks.types) return { kind: 'surfaces', phase, ran };
    }
  }
  if (mistake === 'misspelled') return { kind: 'never', why: 'the property is silently undefined', ran };
  if (mistake === 'wrong-type') return { kind: 'never', why: 'the wrong type is silently used', ran };
  return sawNewField ? { kind: 'fine', ran } : { kind: 'never', why: 'the new field is silently missing until it is regenerated or edited in', ran };
}

export const outcomeText = (o: Outcome): string =>
  o.kind === 'surfaces' ? PHASES.find((p) => p.id === o.phase)!.label : o.kind === 'fine' ? 'picked up: no problem' : `never: ${o.why}`;
