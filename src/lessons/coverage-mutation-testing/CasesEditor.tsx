import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, ChipButton, Hint, TextField, Toggle } from '../../components/ui';
import { addCase, newCase, parseExpected, parseWeight, removeCase, MAX_CASES, type Suite } from './suite';

/** The suite as a table of cases, with a form to add one. The expected-value column and field exist only for the exact-value assertion. */
export function CasesEditor({ suite, onSuite }: { suite: Suite; onSuite: (s: Suite) => void }) {
  const [weight, setWeight] = useState('11');
  const [express, setExpress] = useState(false);
  const [expected, setExpected] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const exact = suite.mode === 'exact';

  const add = () => {
    const w = parseWeight(weight);
    if (!w.ok) return setError(w.error);
    const e = exact ? parseExpected(expected) : { ok: true as const, value: 0 };
    if (!e.ok) return setError(e.error);
    const result = addCase(suite, newCase(suite.mode, w.value, express, e.value));
    if (!result.ok) return setError(result.error);
    setError(null);
    onSuite(result.suite);
  };

  return (
    <Box className="cm-cases">
      <SectionTitle hint={`${suite.cases.length} of ${MAX_CASES}`}>Test cases</SectionTitle>
      {suite.cases.length === 0 ? (
        <p className="empty-note">No cases yet.</p>
      ) : (
        <table className="data-table cm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>weight</th>
              <th>express</th>
              {exact && <th>expects</th>}
              <th>
                <span className="cm-sr">remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {suite.cases.map((c, i) => (
              <tr key={`${c.weight}-${c.express}`}>
                <td>{i + 1}</td>
                <td>{c.weight}</td>
                <td>{String(c.express)}</td>
                {exact && <td>{c.expected}</td>}
                <td>
                  <ChipButton tone="bad" ariaLabel={`Remove case ${i + 1}`} onClick={() => onSuite(removeCase(suite, i))}>
                    ×
                  </ChipButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="cm-add">
        <TextField label="Weight" value={weight} onChange={setWeight} onEnter={add} width={72} spellCheck={false} />
        <Toggle label="express" value={express} onChange={setExpress} off="false" on="true" />
        {exact && <TextField label="Expects" value={expected} onChange={setExpected} onEnter={add} width={88} spellCheck={false} />}
        <Button onClick={add}>Add case</Button>
      </div>
      {error && <Hint tone="muted">{error}</Hint>}
    </Box>
  );
}
