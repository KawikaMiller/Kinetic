import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { fireCaption } from './captions';
import { genOf, type Config } from './config';
import { configRows } from './ConfigControls';
import { parseCustomArray, runCustom } from './custom';
import { show } from './frames';
import { DEFAULT_CASES } from './generator';
import { forAll } from './runner';
import { BUGS, PROPERTIES, bugOf, propOf } from './sorts';
import { Values } from './Values';

const CUSTOM_PLACEHOLDER = '10, 2, -3';

export function FireScene({ picker, config, set }: { picker: ReactNode; config: Config; set: (patch: Partial<Config>) => void }) {
  const key = JSON.stringify(config);
  const [ranFor, setRanFor] = useState<string | null>(null);
  const [custom, setCustom] = useState(CUSTOM_PLACEHOLDER);
  const setCaption = useSetCaption();
  const bug = bugOf(config.fn);
  const run = useMemo(() => forAll(bug.fn, config.props, genOf(config)), [bug, config]);
  const shown = ranFor === key ? run : null;
  const canRun = config.props.length > 0;

  useEffect(() => {
    setCaption(fireCaption(config, shown), { quiet: true });
  }, [setCaption, config, shown]);

  const parsed = parseCustomArray(custom);
  const customRows = parsed.ok ? runCustom(parsed.value) : [];
  const failing = shown?.failure != null;
  const stateOf = (i: number): LineState => (failing && bug.badLine === i ? 'bad' : 'idle');
  const ticked = PROPERTIES.filter((p) => config.props.includes(p.id));

  return (
    <StageFrame
      height={540}
      stats={
        <Stats>
          <Stat label="Cases run" value={shown ? shown.cases.length : 0} sub={`of ${DEFAULT_CASES}`} />
          <Stat
            label="Result"
            value={shown === null ? 'not run' : shown.failure ? `failed at case ${shown.failure.k}` : 'all passed'}
            color={shown === null ? 'var(--muted)' : shown.failure ? 'var(--bad)' : 'var(--ok)'}
            sub={shown?.failure ? shown.failure.failed.map((id) => propOf(id).label) : undefined}
          />
          <Stat label="Seed" value={config.seed} color="var(--muted)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a case that passed', shape: 'square' },
            { color: 'var(--bad)', label: 'a case that failed, and the wrong line', shape: 'square' },
            { color: 'var(--violet)', label: 'property', shape: 'square' },
          ]}
        />
      }
      controls={configRows(
        picker,
        config,
        set,
        <Button variant="primary" disabled={!canRun} onClick={() => setRanFor(key)}>
          Run {DEFAULT_CASES} cases
        </Button>,
      )}
    >
      <div className="pbt stage-pad">
        <div className="pbt-panels">
          <CodePanel title={`The function: ${bug.label}`} lines={bug.source} stateOf={stateOf} />
          <CodePanel
            title="Properties ticked"
            lines={ticked.flatMap((p) => p.source)}
            stateOf={() => 'idle'}
          />
        </div>
        {failing && (
          <Box variant="sunken" className="pbt-found" role="status">
            <SectionTitle hint="found by random inputs, as generated">Counterexample</SectionTitle>
            <p>
              Input <Values xs={shown!.failure!.input} state="bad" label="Failing input" />
            </p>
            <p>
              Output <Values xs={shown!.failure!.output} label="Output" />
            </p>
            <p className="pbt-flaw">{bug.flaw}</p>
          </Box>
        )}
        {shown && (
          <ul className="pbt-cases" aria-label="Cases run">
            {shown.cases.map((c) => (
              <li key={c.k} className={c.failed.length ? 'is-fail' : 'is-pass'}>
                <span className="pbt-k">case {c.k}</span>
                <Values xs={c.input} label={`Input of case ${c.k}`} />
                <span aria-hidden="true">→</span>
                <Values xs={c.output} label={`Output of case ${c.k}`} />
                <span className="chip">{c.failed.length ? `fail: ${c.failed.map((id) => propOf(id).label).join(', ')}` : 'pass'}</span>
              </li>
            ))}
          </ul>
        )}

        <Box className="pbt-custom">
          <SectionTitle hint="up to 20 whole numbers, each within ±1,000,000,000">Your own array</SectionTitle>
          <TextField label="Array" value={custom} onChange={setCustom} width={260} spellCheck={false} />
          {!parsed.ok && <Hint tone="muted">{parsed.error}</Hint>}
          {parsed.ok && (
            <table className="data-table pbt-table">
              <thead>
                <tr>
                  <th>Function</th>
                  <th>Output</th>
                  <th>Properties it breaks</th>
                </tr>
              </thead>
              <tbody>
                {customRows.map((r) => (
                  <tr key={r.bug}>
                    <td>{BUGS.find((b) => b.id === r.bug)!.label}</td>
                    <td>{show(r.output)}</td>
                    <td className={r.failed.length ? 'pbt-bad' : 'pbt-good'}>{r.failed.length ? r.failed.map((id) => propOf(id).label).join(', ') : 'none'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Box>

        <div className="pbt-notes">
          <Provenance kind="real">real JavaScript runs on every case; the bugs are lesson-authored on purpose</Provenance>
          <Provenance kind="toy">a small teaching runner, not fast-check</Provenance>
          <Hint block>The properties are a fixed menu; nothing you type is run as code.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
