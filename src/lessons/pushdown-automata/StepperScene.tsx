import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CallStackPanel } from '../../components/CallStackPanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import type { PdaAcceptMode } from '../../core/automata';
import { usePlayer } from '../../core/usePlayer';
import { playFrames } from './frames';
import { MAX_SUBJECT, PRESETS, build, checkSubject, presetById, ruleText, type PresetId } from '../../core/pdaPresets';
import { OPENING } from './opening';
import { stepRun } from '../../core/pdaStepper';

const STEP_MS = 900;
const MAX_VISIBLE_CONFIGS = 8;
const ACCEPT_MODES: { value: PdaAcceptMode; label: string }[] = [
  { value: 'final-state', label: 'Final state' },
  { value: 'empty-stack', label: 'Empty stack' },
];

/** Scene 1: a pushdown automaton steps through a string. */
export function StepperScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState<PresetId>(OPENING.stepper.preset);
  const [text, setText] = useState(OPENING.stepper.subject);
  const [subject, setSubject] = useState(OPENING.stepper.subject);
  const [error, setError] = useState<string | null>(null);
  const [accept, setAccept] = useState<PdaAcceptMode>(OPENING.stepper.accept);
  const preset = presetById(presetId);
  const { pda } = useMemo(() => build(preset, accept), [preset, accept]);
  const run = useMemo(() => stepRun(pda, subject, accept), [pda, subject, accept]);
  const frames = useMemo(() => playFrames(pda, run, subject, accept), [pda, run, subject, accept]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const lead = f.configs[0];
  const stack = lead ? [...lead.stack] : [];
  const unread = lead ? subject.slice(lead.pos) : '';
  const inLanguage = preset.member(subject);

  const type = (next: string) => {
    setText(next);
    const r = checkSubject(next);
    if (r.ok) {
      setSubject(r.value);
      setError(null);
    } else setError(r.error);
  };
  const load = (id: PresetId) => {
    const p = presetById(id);
    setPresetId(id);
    type(p.samples[0]);
  };

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Live configurations" value={f.configs.length} color="var(--violet)" sub={`${run.explored} distinct configurations in the whole run`} />
          <Stat label="Stack" value={stack.length} color="var(--hi)" sub="symbols on the first configuration's stack" />
          <Stat
            label="Result"
            value={f.end === null ? 'reading' : f.end === 'accepted' ? 'accepted' : f.end === 'rejected' ? 'rejected' : 'unknown'}
            color={f.end === null ? 'var(--muted)' : f.end === 'accepted' ? 'var(--ok)' : f.end === 'rejected' ? (f.rejection === 'leftover' ? 'var(--orange)' : 'var(--bad)') : 'var(--orange)'}
            sub={f.end === null ? 'the machine is still reading' : `${inLanguage ? 'in' : 'not in'} the language of ${preset.language}`}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'top of the stack', shape: 'square' },
            { color: 'var(--violet)', label: 'live configuration', shape: 'square' },
            { color: 'var(--ok)', label: 'accepting configuration', shape: 'square' },
            { color: 'var(--bad)', label: 'rejected, no move', shape: 'square' },
            { color: 'var(--orange)', label: 'rejected, symbols left on the stack', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Machine">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={p.id === presetId} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="Accept by" value={accept} onChange={setAccept} options={ACCEPT_MODES} />
        </>,
        <>
          <TextField label={`Input (up to ${MAX_SUBJECT} of a b ( ) [ ])`} value={text} onChange={type} width={220} spellCheck={false} maxLength={40} />
          <ControlGroup label="Try">
            {preset.samples.map((s) => (
              <ChipButton key={s} tone="muted" on={subject === s && !error} onClick={() => type(s)}>
                {s}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint tone="muted" block>
            <span role="status" className="pd-status">
              {error ? <span className="pd-error">{error} The last good input stays.</span> : null}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="pd-stage stage-pad">
        <div className="pd-stepper">
          <div className="pd-stack">
            <CallStackPanel
              frames={stack.map((s, i) => ({ id: stack.length - i, name: s, state: i === 0 ? 'running' : 'waiting' }))}
              anchor="bottom"
              meta="stack, top first"
              empty={<p className="empty-note">empty</p>}
            />
          </div>
          <div className="pd-config">
            <SectionTitle>Input</SectionTitle>
            {subject.length ? (
              <ArrayStrip values={[...subject]} cellMax={40} cellState={(i) => (lead && i < lead.pos ? 'dim' : lead && i === lead.pos ? 'active' : 'idle')} />
            ) : (
              <p className="empty-note">the empty input</p>
            )}
            <SectionTitle>Configurations: (state, unread input, stack)</SectionTitle>
            <ul className="pd-configs" aria-label="Live configurations">
              {f.configs.slice(0, MAX_VISIBLE_CONFIGS).map((c) => (
                <li key={`${c.state}|${c.pos}|${c.stack}`} className={`pd-config-row ${f.end === 'accepted' && c === lead ? 'is-accepting' : ''}`}>
                  <code>
                    ({c.state}, {subject.slice(c.pos) || 'ε'}, {c.stack})
                  </code>
                </li>
              ))}
              {f.configs.length > MAX_VISIBLE_CONFIGS ? <li className="empty-note">+{f.configs.length - MAX_VISIBLE_CONFIGS} more</li> : null}
              {f.configs.length === 0 ? <li className="pd-config-row is-dead">none: every configuration died</li> : null}
            </ul>
            <p className="pd-note">First configuration: unread <code>{unread || 'ε'}</code>.</p>
          </div>
        </div>
        <div className="pd-rules">
          <SectionTitle>Transitions: state, input, top → state, push</SectionTitle>
          <ol className="pd-rule-list">
            {pda.rules.map((r, i) => (
              <li key={i} className={f.fired.includes(i) ? 'is-fired' : ''}>
                <code>{ruleText(r)}</code>
              </li>
            ))}
          </ol>
        </div>
        <p className="pd-note">
          Both ways of accepting recognise the same languages: a machine that accepts by final state can be rebuilt to empty its stack at the end, and the reverse, by the textbook conversion (an extra bottom marker and an extra final state). {preset.id === 'wwr' ? 'This machine has to guess where the middle is: every guess is a configuration, and a machine with one stack may guess. ' : ''}A real parser avoids guessing by restricting the grammar.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">small machines built for this page, with the finishing move added for the accepting mode shown</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
