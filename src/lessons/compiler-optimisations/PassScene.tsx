import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { namesOf, staticCount } from './ir';
import { passCaption } from './captions';
import { firstRoundChanges, passView, type PassView } from './model';
import { INT32, OPENING, ORDER_PRESETS } from './opening';
import { PASS_IDS, PASS_LABEL, PASS_SHORT, type PassId } from './passes';
import { P1 } from './programs';
import { IrCode } from './IrCode';

/** Scene 2: switch passes on, order them, and see what each one finds in a straight-line program. */
export function PassScene({ picker }: { picker: ReactNode }) {
  const [order, setOrder] = useState<readonly PassId[]>(OPENING.passes.order);
  const [enabled, setEnabled] = useState<ReadonlySet<PassId>>(OPENING.passes.enabled);
  const [fixedPoint, setFixedPoint] = useState(OPENING.passes.fixedPoint);
  const [input, setInput] = useState(OPENING.passes.input);
  const [draft, setDraft] = useState(String(OPENING.passes.input));
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(OPENING.passes.step);
  const refocus = useRef<string | null>(null);

  const view = useMemo(() => passView(order, enabled, fixedPoint, input), [order, enabled, fixedPoint, input]);
  const names = useMemo(() => namesOf(P1), []);
  const first = firstRoundChanges(view);
  const maxStep = Math.max(view.beforeRun.executed, view.afterRun.executed);
  const at = Math.min(step, maxStep);

  useEffect(() => {
    if (refocus.current) document.querySelector<HTMLElement>(`[data-move="${refocus.current}"]`)?.focus();
    refocus.current = null;
  }, [order]);

  const edit = (text: string) => {
    setDraft(text);
    const parsed = parseBoundedInt(text, { min: INT32.min, max: INT32.max, messages: { tooSmall: () => 'a 32-bit integer is at least -2,147,483,648', tooBig: () => 'a 32-bit integer is at most 2,147,483,647' } });
    if (parsed.ok) {
      setInput(parsed.value);
      setError(null);
    } else setError(parsed.error);
  };
  const move = (pass: PassId, delta: -1 | 1) => {
    const i = order.indexOf(pass);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    refocus.current = `${pass}-${delta < 0 ? 'up' : 'down'}`;
    setOrder(next);
  };
  const toggle = (pass: PassId) => {
    const next = new Set(enabled);
    if (!next.delete(pass)) next.add(pass);
    setEnabled(next);
  };

  const stateOf = (run: PassView['beforeRun'], lineAt: (b: number, i: number) => number, tint: 'del' | 'add', set: Set<number>) => (line: number) => {
    const s = run.trace[at - 1];
    if (at > 0 && s && lineAt(s.block, s.instr) === line) return 'now' as const;
    return set.has(line) ? tint : ('idle' as const);
  };

  return (
    <StageFrame
      height={470}
      intro={passCaption(view, input)}
      introKey={`${order.join()}-${[...enabled].sort().join()}-${fixedPoint}-${input}`}
      stats={
        <Stats>
          <Stat label="Instructions in the listing" value={`${staticCount(view.before)} to ${staticCount(view.after)}`} color="var(--info)" sub="counted from the printed code" />
          <Stat label={`Executed on a = ${input}`} value={`${view.beforeRun.executed} to ${view.afterRun.executed}`} color="var(--info)" sub={`returns ${view.beforeRun.value} before, ${view.afterRun.value} after`} />
          <Stat label="Same result" value={view.same ? 'yes' : 'no'} color={view.same ? 'var(--ok)' : 'var(--bad)'} sub="the optimised code against the original" />
          <Stat label="Rounds that changed something" value={view.pipeline.changedRounds} sub={fixedPoint ? 'repeated until a round changes nothing' : 'one pass through the list'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'removed or rewritten away', shape: 'square' },
            { color: 'var(--ok)', label: 'created or rewritten', shape: 'square' },
            { color: 'var(--hi)', label: 'executing at this step', shape: 'square' },
            { color: 'var(--info)', label: 'executed-instruction count', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {ORDER_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={order.join() === p.order.join()} onClick={() => setOrder(p.order)}>{p.label}</ChipButton>
          ))}
          <Toggle label="Rounds" value={fixedPoint} onChange={setFixedPoint} off="Once" on="To a fixed point" />
        </>,
        <>
          <TextField label="Input a (32-bit integer)" value={draft} onChange={edit} width={140} spellCheck={false} />
          <Slider label="Interpreter step" value={at} min={0} max={maxStep} onChange={setStep} format={(v) => (v === 0 ? 'not started' : String(v))} />
          <Hint><span role="status">{error ?? 'The passes run top to bottom. Move one with its arrows.'}</span></Hint>
        </>,
      ]}
    >
      <div className="co-stage stage-pad">
        <ol className="co-tray" aria-label="Passes, in the order they run">
          {order.map((pass, i) => (
            <li key={pass} className="co-pass">
              <ChipButton tone="info" on={enabled.has(pass)} onClick={() => toggle(pass)} size="md">{`${i + 1}. ${PASS_LABEL[pass]}`}</ChipButton>
              <span className="co-pass-count">{enabled.has(pass) ? `changed ${first[pass] ?? 0} in round 1` : 'switched off'}</span>
              <Button className="co-move" softDisabled={i === 0} data-move={`${pass}-up`} aria-label={`Move ${PASS_SHORT[pass]} up`} onClick={() => move(pass, -1)}>Up</Button>
              <Button className="co-move" softDisabled={i === order.length - 1} data-move={`${pass}-down`} aria-label={`Move ${PASS_SHORT[pass]} down`} onClick={() => move(pass, 1)}>Down</Button>
            </li>
          ))}
        </ol>
        <div className="co-two">
          <IrCode title="Before (P1)" lines={view.beforeListing.lines} names={names} stateOf={stateOf(view.beforeRun, view.beforeListing.at, 'del', view.diff.removed)} />
          <IrCode title="After" lines={view.afterListing.lines} names={names} stateOf={stateOf(view.afterRun, view.afterListing.at, 'add', view.diff.added)} />
        </div>
        {view.pipeline.rounds.length > 0 && (
          <ol className="co-rounds" aria-label="What each round changed">
            {view.pipeline.rounds.map((r, i) => (
              <li key={i}>round {i + 1}: {r.steps.map((s) => `${PASS_SHORT[s.pass]} ${s.changed}`).join(', ')}</li>
            ))}
          </ol>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy IR and {PASS_IDS.length} toy passes; real compilers run many more, repeatedly, with analyses between them</Provenance>
        <Provenance kind="not-run">nothing here was compiled by GCC or LLVM</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
