import { useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { BACKUP_RETENTION_DAYS, MAX_DAY, STRATEGY_ABOUT, STRATEGY_LABEL, STRATEGY_ORDER, countStatus, stateOf, type Status, type Strategy } from './copies';
import { recordsCaption } from './captions';
import { initialRecords } from './opening';

const STATUS_TEXT: Record<Status, string> = { readable: 'still readable', deleted: 'deleted', unreadable: 'unreadable', held: 'kept: legal hold', absent: 'never made' };
const STATUS_COLOUR: Record<Status, string> = { readable: 'var(--bad)', deleted: 'var(--ok)', unreadable: 'var(--violet)', held: 'var(--orange)', absent: 'var(--dim)' };

/** Scene 1: one invented person's record fans out into eight places; a deletion request reaches some of them. */
export function RecordsScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRecords);
  const states = stateOf(state);
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const readable = countStatus(states, 'readable');

  return (
    <StageFrame
      height={470}
      intro={recordsCaption(state)}
      introKey={[state.strategy, state.day, state.legalHold, state.minimise]}
      stats={
        <Stats>
          <Stat label="Still readable" value={`${readable} of ${states.length - countStatus(states, 'absent')}`} color={readable > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`day ${state.day} after the request`} />
          <Stat label="Deleted or unreadable" value={countStatus(states, 'deleted') + countStatus(states, 'unreadable')} color="var(--ok)" sub={`${countStatus(states, 'unreadable')} unreadable (key destroyed)`} />
          <Stat label="Legal hold" value={countStatus(states, 'held')} color={countStatus(states, 'held') > 0 ? 'var(--orange)' : 'var(--muted)'} sub="copies a hold keeps (a legal duty to keep them, illustrative)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a copy still holding the data', shape: 'square' },
            { color: 'var(--ok)', label: 'deleted', shape: 'square' },
            { color: 'var(--violet)', label: 'unreadable (key destroyed)', shape: 'square' },
            { color: 'var(--orange)', label: 'kept under a legal hold', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<Strategy> label="Deletion strategy" value={state.strategy} onChange={(v) => set({ strategy: v })} options={STRATEGY_ORDER.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))} />
        </>,
        <>
          <Slider label="Days since the request" value={state.day} min={0} max={MAX_DAY} onChange={(v) => set({ day: v })} />
          <Toggle label="Legal hold" value={state.legalHold} onChange={(v) => set({ legalHold: v })} />
          <Toggle label="Data minimisation" value={state.minimise} onChange={(v) => set({ minimise: v })} />
        </>,
      ]}
    >
      <div className="pe-stage stage-pad">
        <p className="pe-note">
          <b>{STRATEGY_LABEL[state.strategy]}</b>: {STRATEGY_ABOUT[state.strategy]}. The record is an invented person (mara@example.test); backup retention is {BACKUP_RETENTION_DAYS} days, illustrative. A legal hold is a legal duty to keep certain records: here the primary database and the backups, as an illustration.
        </p>
        <SectionTitle>Where the record lives</SectionTitle>
        <ul className="pe-cards">
          {states.map(({ copy, status, goneOn }) => (
            <li key={copy.id} className="pe-card" style={{ borderColor: STATUS_COLOUR[status] }}>
              <span className="pe-badge" style={{ color: STATUS_COLOUR[status] }}>
                {STATUS_TEXT[status]}
              </span>
              <b>{copy.label}</b>
              <span className="pe-sub">
                {copy.holds}
                {status === 'readable' && goneOn !== null ? `; goes on day ${goneOn}` : ''}
                {status === 'readable' && goneOn === null ? '; nothing ever removes it' : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">an invented person and eight invented stores: nothing is deleted anywhere</Provenance>
        <Provenance kind="illustrative">synthetic retention windows and delays; unreadable is a model flag (the lesson runs no encryption)</Provenance>
        <Provenance kind="from-memory">engineering education, not legal advice: deletion duties and their wording come from memory, so check with counsel and the text</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
