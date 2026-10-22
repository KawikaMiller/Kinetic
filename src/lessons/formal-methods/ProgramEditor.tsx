import { ChipButton, Hint, Segmented, TextField } from '../../components/ui';
import { MAX_STEPS, EFFECTS, type Effect, type Spec } from './spec';
import { refocusAfterRemove } from '../../core/refocus';
import { addStep, moveStep, removeStep, setEffect, setStep, type Edited } from './edit';

const REMOVE_FOCUS = { group: '.fm-rows', items: 'button[aria-label^="Remove step"]' };

/** The program as rows: a guard field, an effect list, and up, down and remove buttons; one step is marked critical. */
export function ProgramEditor({ spec, onChange, refusal, onRefuse }: { spec: Spec; onChange: (s: Spec) => void; refusal: string | null; onRefuse: (message: string | null) => void }) {
  const apply = (r: Edited) => { if (r.ok) { onRefuse(null); onChange(r.spec); } else onRefuse(r.message); };
  const critical = Array.from({ length: spec.steps.length }, (_, k) => ({ value: k, label: `step ${k}` }));
  return (
    <div className="fm-editor">
      <ol className="fm-rows">
        {spec.steps.map((s, k) => (
          <li key={k} className="fm-row">
            <span className="fm-k mono">{k}</span>
            <TextField label="guard" value={s.guard} onChange={(guard) => { onRefuse(null); onChange(setStep(spec, k, { guard })); }} spellCheck={false} width={220} />
            <label className="fm-effect">
              <span>effect</span>
              <select className="fm-select" value={s.effect} aria-label={`Effect of step ${k}`} onChange={(e) => { onRefuse(null); onChange(setEffect(spec, k, e.target.value as Effect)); }}>
                {EFFECTS.map((effect) => <option key={effect} value={effect}>{effect}</option>)}
              </select>
            </label>
            <ChipButton size="sm" ariaLabel={`Move step ${k} up`} onClick={() => apply(moveStep(spec, k, -1))}>up</ChipButton>
            <ChipButton size="sm" ariaLabel={`Move step ${k} down`} onClick={() => apply(moveStep(spec, k, 1))}>down</ChipButton>
            <ChipButton size="sm" tone="muted" ariaLabel={`Remove step ${k}`} onClick={(e) => { refocusAfterRemove(e.currentTarget, REMOVE_FOCUS); apply(removeStep(spec, k)); }}>remove</ChipButton>
          </li>
        ))}
      </ol>
      <div className="fm-tools">
        <ChipButton size="sm" onClick={() => apply(addStep(spec))}>+ step ({spec.steps.length} of {MAX_STEPS})</ChipButton>
        <Segmented label="Critical step" value={spec.critical} onChange={(c) => onChange({ ...spec, critical: c })} options={critical} />
      </div>
      <Hint block tone={refusal ? 'bad' : 'faint'}><span role="status">{refusal ?? 'A step runs when its guard is true; its effect changes a variable; the process then moves to the next step, and the last step wraps to step 0.'}</span></Hint>
    </div>
  );
}
