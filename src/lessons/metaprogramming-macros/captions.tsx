import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Strategy } from './expand';
import type { FieldId, ProbeResult, ProbeSpec } from './reflection';
import { trapText } from './reflection';
import { MISTAKES, PHASES, TECHNIQUES, outcomeText, runPipeline, type MistakeId } from './phases';
import { reasons, valueText, type RunResult } from './run';

export const STRATEGY_LABEL: Record<Strategy, string> = { text: 'Text substitution', tree: 'Syntax-tree substitution', hygienic: 'Hygienic expansion' };

/** The macro scene's caption: the expansion as source, its value, and what went wrong if something did. */
export function macroCaption({ strategy, call, run, a }: { strategy: Strategy; call: string; run: RunResult; a: number }): ReactNode {
  if (!run.expanded.ok) return <>{STRATEGY_LABEL[strategy]} on <code>{call}</code>: {run.expanded.error}</>;
  const calls = run.evaluated && run.evaluated.ok ? run.evaluated.nextCalls : 0;
  return (
    <>
      {STRATEGY_LABEL[strategy]}: <code>{call}</code> expands to <code>{run.source}</code>, which {run.evaluated && run.evaluated.ok ? <>evaluates to <b>{run.evaluated.value}</b> at a = {a}</> : <>cannot be evaluated: {valueText(run.evaluated)}</>}.
      {calls > 0 ? <> The counter was read {plural(calls, 'time')}.</> : null} {reasons(run).join(' ')}
    </>
  );
}

export function reflectionCaption({ probe, spec, stale, added }: { probe: ProbeResult | null; spec: ProbeSpec | null; stale: number; added: readonly FieldId[] }): ReactNode {
  const staleText = stale === 0 ? <>All three serialisers agree with JSON.stringify.</> : <>{plural(stale, 'serialiser')} {stale === 1 ? 'is' : 'are'} stale: the object has {plural(added.length, 'new field')} that {stale === 1 ? 'it' : 'they'} did not pick up.</>;
  if (!probe || !spec) return <>Read the object through a real Proxy and watch which traps fire, or add a field and see which serialiser notices. {staleText}</>;
  return (
    <>
      <code>{spec.code}</code> returned <code>{probe.value}</code> and the Proxy saw {probe.log.length === 0 ? 'nothing' : probe.log.map(trapText).join(', ')}. {staleText}
    </>
  );
}

export function phasesCaption(mistake: MistakeId): ReactNode {
  const label = MISTAKES.find((m) => m.id === mistake)!.label;
  const outcomes = TECHNIQUES.map((t) => ({ t, o: runPipeline(t, mistake) }));
  const silent = outcomes.filter(({ o }) => o.kind === 'never').length;
  const caught = outcomes.filter(({ o }) => o.kind === 'surfaces');
  const first = caught[0];
  return (
    <>
      With {label}: {caught.length === 0 ? 'no technique catches it' : <>{plural(caught.length, 'technique')} catch it; the earliest is {first.t.label}, {outcomeText(first.o)}</>}, and {silent === 0 ? 'none stays silent' : `${silent} stay${silent === 1 ? 's' : ''} silent`}. The phases run in order: {PHASES.map((p) => p.label).join(', ')}.
    </>
  );
}
