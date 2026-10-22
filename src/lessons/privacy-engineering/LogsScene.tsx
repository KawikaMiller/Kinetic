import { useState, type ReactNode } from 'react';
import { LogStream } from '../../components/LogStream';
import type { LogRow } from '../../components/logRows';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { logsCaption } from './captions';
import {
  CANDIDATE_EMAILS, EXPOSURE_TEXT, FIELDS, FIELD_ORDER, SAMPLE_LINES, TREATMENT_LABEL, TREATMENT_ORDER, exposure, hashOf, recover, stillIdentifying, treat,
  type Exposure, type FieldId, type Recovery, type Treatment,
} from './logline';
import { initialLogs } from './opening';
import { NotLegalAdviceChip } from './NotLegalAdviceChip';

const EXPOSURE_COLOUR: Record<Exposure, string> = {
  identifies: 'var(--bad)', partly: 'var(--orange)', guessable: 'var(--bad)', linkable: 'var(--violet)', gone: 'var(--ok)', 'not-personal': 'var(--dim)',
};

interface Rendered {
  rows: LogRow[];
  recovery: Recovery | null;
}

/** Scene 4: a log line template, each field kept, masked, hashed, keyed-hashed or dropped, and what a short guess list recovers. */
export function LogsScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialLogs);
  const { choice } = state;
  const key = FIELD_ORDER.map((f) => choice[f]).join(',');
  const rendered = useAsyncValue<Rendered>(async () => {
    const rows = await Promise.all(
      SAMPLE_LINES.map(async (line, i) => {
        const parts = await Promise.all(FIELD_ORDER.map(async (f) => ({ f, value: await treat(f, line[f], choice[f]) })));
        return { id: i, text: parts.filter((p) => p.value !== null).map((p) => `${p.f}=${p.value}`).join(' ') } as LogRow;
      }),
    );
    const logged = await treat('email', SAMPLE_LINES[0].email, choice.email);
    const plain = await hashOf(SAMPLE_LINES[0].email);
    const recovery = logged !== null && (choice.email === 'hash' || choice.email === 'hmac') && plain !== null ? await recover(logged, CANDIDATE_EMAILS) : null;
    return { rows, recovery };
  }, key);
  const still = stillIdentifying(choice);

  return (
    <StageFrame
      height={460}
      intro={logsCaption(choice, rendered?.recovery ?? null)}
      introKey={[key, rendered ? (rendered.recovery?.recovered ?? 'none') : 'pending']}
      stats={
        <Stats>
          <Stat label="Fields that still identify" value={`${still.length} of ${FIELD_ORDER.filter((f) => FIELDS[f].pii).length}`} color={still.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub="personal fields a guess or a glance can tie to a person" />
          <Stat label="Hashed email" value={rendered?.recovery ? (rendered.recovery.recovered ? 'recovered' : 'not recovered') : '-'} color={rendered?.recovery?.recovered ? 'var(--bad)' : 'var(--ok)'} sub="five candidate addresses tried" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'identifies, or a guess reproduces it', shape: 'square' },
            { color: 'var(--orange)', label: 'partly identifying', shape: 'square' },
            { color: 'var(--violet)', label: 'pseudonymous but linkable', shape: 'square' },
            { color: 'var(--ok)', label: 'dropped', shape: 'square' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="pe-stage stage-pad">
        <SectionTitle>One log line template: choose what happens to each field (the template itself is read-only)</SectionTitle>
        <ul className="pe-fields">
          {FIELD_ORDER.map((f: FieldId) => {
            const ex = exposure(f, choice[f]);
            return (
              <li key={f} className="pe-field">
                <div className="pe-field-head">
                  <b title={FIELDS[f].note}>{FIELDS[f].label}</b>
                  <span className="pe-sub">{FIELDS[f].pii ? 'personal data' : 'not personal'}</span>
                  <span style={{ color: EXPOSURE_COLOUR[ex] }}>{EXPOSURE_TEXT[ex]}</span>
                </div>
                <Segmented<Treatment> ariaLabel={`Treatment for ${FIELDS[f].label}`} value={choice[f]} onChange={(v) => setState((s) => ({ choice: { ...s.choice, [f]: v } }))} options={TREATMENT_ORDER.map((t) => ({ value: t, label: TREATMENT_LABEL[t] }))} />
              </li>
            );
          })}
        </ul>
        <LogStream label="The log lines as written" rows={rendered?.rows ?? []} live="off" empty="Computing the hashes…" />
        {rendered?.recovery && (
          <div className="pe-block">
            <SectionTitle>Trying five invented addresses against the logged email (plain SHA-256, first 12 digits)</SectionTitle>
            <table className="data-table">
              <tbody>
                {rendered.recovery.tried.map((t) => (
                  <tr key={t.candidate}>
                    <td>{t.candidate}</td>
                    <td>{t.digest}</td>
                    <td style={{ color: t.match ? 'var(--bad)' : 'var(--dim)' }}>{t.match ? 'reproduces the logged value' : 'no match'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ProvenanceRow>
        <NotLegalAdviceChip />
        <Provenance kind="real">SHA-256 and HMAC are computed in your browser by crypto.subtle</Provenance>
        <Provenance kind="simulated">invented people, addresses (documentation ranges) and a fake demo key; no real log is read</Provenance>
        <Provenance kind="from-memory">pseudonymisation, anonymisation and personal data are defined differently in law: check with counsel and the text</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
