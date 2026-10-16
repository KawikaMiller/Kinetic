import { useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { phasesCaption } from './captions';
import { OPENING } from './opening';
import { MISTAKES, PHASES, TECHNIQUES, outcomeText, runPipeline, type MistakeId } from './phases';

const TABLE_MIN_WIDTH = 560;

/** Scene 3: for one kind of mistake, when does each technique's check run, and does it ever catch it? */
export function PhasesScene({ picker }: { picker: ReactNode }) {
  const [mistake, setMistake] = useState<MistakeId>(OPENING.phases.mistake);
  const outcomes = TECHNIQUES.map((t) => ({ t, o: runPipeline(t, mistake) }));
  const silent = outcomes.filter(({ o }) => o.kind === 'never').length;
  const caught = outcomes.filter(({ o }) => o.kind === 'surfaces').length;

  return (
    <StageFrame
      height={520}
      intro={phasesCaption(mistake)}
      introKey={mistake}
      stats={
        <Stats>
          <Stat label="Catch it" value={caught} color="var(--hi)" sub="the mistake surfaces in a phase" />
          <Stat label="Stay silent" value={silent} color={silent ? 'var(--orange)' : 'var(--ok)'} sub="undefined or stale, never an error" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the phase where it surfaces', shape: 'square' },
            { color: 'var(--info)', label: 'phases that ran before it', shape: 'square' },
            { color: 'var(--orange)', label: 'never an error: silently wrong', shape: 'square' },
            { color: 'var(--ok)', label: 'picked up: no problem', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="The mistake" value={mistake} onChange={setMistake} options={MISTAKES.map((m) => ({ value: m.id, label: m.label }))} />
        </>,
      ]}
    >
      <div className="mm-stage stage-pad">
        <SectionTitle>When each technique looks, and what happens</SectionTitle>
        <WideRegion minWidth={TABLE_MIN_WIDTH} label="Phase table: scroll sideways to see all of it">
          <table className="data-table mm-phases">
            <thead>
              <tr>
                <th>Technique</th>
                {PHASES.map((p) => (
                  <th key={p.id}>{p.label}</th>
                ))}
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map(({ t, o }) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  {PHASES.map((p) => {
                    const ran = o.ran.includes(p.id);
                    const surfaces = o.kind === 'surfaces' && o.phase === p.id;
                    return (
                      <td key={p.id} className={surfaces ? 'mm-hit' : ran ? 'mm-ran' : 'mm-skipped'}>
                        {surfaces ? 'caught' : t.phase === p.id ? 'looks here' : ran ? 'ran' : 'not reached'}
                      </td>
                    );
                  })}
                  <td className={o.kind === 'never' ? 'mm-silent' : o.kind === 'fine' ? 'mm-fine' : 'mm-caught'}>{outcomeText(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <SectionTitle>The toy rules behind the table</SectionTitle>
        <WideRegion minWidth={TABLE_MIN_WIDTH} label="Rules table: scroll sideways to see all of it">
          <table className="data-table mm-rules">
            <thead>
              <tr>
                <th>Technique</th>
                <th>Looks at the schema</th>
                <th>Checks names</th>
                <th>Checks types</th>
              </tr>
            </thead>
            <tbody>
              {TECHNIQUES.map((t) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>{PHASES.find((p) => p.id === t.phase)!.label}</td>
                  <td>{t.checks.names ? 'yes' : 'no'}</td>
                  <td>{t.checks.types ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <p className="mm-note">These are the lesson's own rules: a technique that does not check a kind of mistake lets it through to be found later, which the table above shows as silent. The rules say what this toy checks, not what every macro system, generator or proxy does.</p>
        <SectionTitle>All three mistakes at once</SectionTitle>
        <WideRegion minWidth={TABLE_MIN_WIDTH} label="Mistake table: scroll sideways to see all of it">
          <table className="data-table mm-all">
            <thead>
              <tr>
                <th>Technique</th>
                {MISTAKES.map((m) => (
                  <th key={m.id} className={m.id === mistake ? 'is-current' : ''}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TECHNIQUES.map((t) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  {MISTAKES.map((m) => {
                    const o = runPipeline(t, m.id);
                    return (
                      <td key={m.id} className={o.kind === 'never' ? 'mm-silent' : o.kind === 'fine' ? 'mm-fine' : 'mm-caught'}>
                        {outcomeText(o)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <p className="mm-note">An error at expansion or generation is cheap to find; one at the first call or the access is found by whoever runs the program; and a silent one is found when somebody notices a wrong answer. Reflection is not free to fix later: the checks it skips do not run at all.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy pipeline with simple rules for what each technique checks; real tools differ</Provenance>
        <Provenance kind="from-memory">JavaScript decorators are a language feature in recent versions: check the current state of the standard</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
