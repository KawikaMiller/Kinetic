import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { mitigationCaption, n } from './captions';
import { Honesty } from './Honesty';
import { LEAK_CLASSES, MITIGATIONS, classVerdict, coverageOf, mitigationOpening, openClasses, type ClassVerdict, type MitigationId } from './mitigations';

const VERDICT_TEXT: Record<ClassVerdict, string> = { covered: 'covered', partly: 'partly', open: 'open' };
const COVERAGE_TEXT = { full: 'addresses', partial: 'partly', none: '-' } as const;

/** Library comparison functions, from memory. */
const LIBRARIES = [
  { language: 'Node.js', name: '`crypto.timingSafeEqual`', note: 'throws if the two buffers differ in length' },
  { language: 'Python', name: '`hmac.compare_digest`', note: 'compares two strings or byte strings without an early exit' },
  { language: 'Go', name: '`crypto/subtle.ConstantTimeCompare`', note: 'returns 0 when the lengths differ' },
  { language: 'Java', name: '`MessageDigest.isEqual`', note: 'a byte-array comparison meant to take the same time' },
];

const code = (text: string) => text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

export function MitigationScene({ picker }: { picker: ReactNode }) {
  const [enabled, setEnabled] = useState<readonly MitigationId[]>(mitigationOpening);
  const toggle = (id: MitigationId) => setEnabled((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));
  const caption = mitigationCaption(enabled);
  const open = openClasses(enabled);

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Mitigations on" value={`${n(enabled.length)} of ${n(MITIGATIONS.length)}`} color="var(--violet)" />
          <Stat label="Classes still open" value={n(open.length)} color={open.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`of ${n(LEAK_CLASSES.length)} classes in this table`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'mitigation switched on', shape: 'square' },
            { color: 'var(--ok)', label: 'class covered', shape: 'square' },
            { color: 'var(--bad)', label: 'class open', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Mitigations" inline>
            {MITIGATIONS.map((m) => (
              <ChipButton key={m.id} tone="violet" on={enabled.includes(m.id)} onStyle="solid" size="md" onClick={() => toggle(m.id)}>{m.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="tsc-stage stage-pad">
        <Box>
          <SectionTitle hint="a decision table in words: no demonstration here">Which class of leak each mitigation addresses</SectionTitle>
          <div className="tsc-matrix-scroll">
            <table className="data-table tsc-matrix">
              <thead>
                <tr>
                  <th>Class of leak</th>
                  {MITIGATIONS.map((m) => <th key={m.id} className={enabled.includes(m.id) ? 'is-on' : undefined}>{m.label}</th>)}
                  <th>With your choices</th>
                </tr>
              </thead>
              <tbody>
                {LEAK_CLASSES.map((c) => {
                  const verdict = classVerdict(enabled, c.id);
                  return (
                    <tr key={c.id}>
                      <th scope="row">{c.label}</th>
                      {MITIGATIONS.map((m) => (
                        <td key={m.id} className={enabled.includes(m.id) ? 'is-on' : undefined}>{COVERAGE_TEXT[coverageOf(m.id, c.id)]}</td>
                      ))}
                      <td className={`tsc-verdict is-${verdict}`}>{VERDICT_TEXT[verdict]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Hint tone="muted" block>
            Cache state and branch-predictor state are shared between security domains, which is the root of the Spectre family and of cache timing leaks. The mitigations are partial and each has a price, listed below for the ones switched on. No gadget code, address pattern or probing procedure appears here.
          </Hint>
        </Box>
        <Box>
          <SectionTitle hint="what each one switched on costs">The price</SectionTitle>
          {enabled.length === 0 ? (
            <Hint tone="muted" block>Nothing is switched on, so nothing is paid for, and every class above is open.</Hint>
          ) : (
            <ul className="tsc-costs">
              {MITIGATIONS.filter((m) => enabled.includes(m.id)).map((m) => (
                <li key={m.id}><b>{m.label}:</b> {m.cost}.</li>
              ))}
            </ul>
          )}
        </Box>
        <Box>
          <SectionTitle hint="from memory: check each one's documentation">What to use instead of writing your own comparison</SectionTitle>
          <ul className="tsc-costs">
            {LIBRARIES.map((l) => (
              <li key={l.language}><b>{l.language}:</b> {code(l.name)}, {l.note}.</li>
            ))}
          </ul>
          <Hint tone="muted" block>
            To keep the length out of the comparison, compare HMACs of both values (equal-length digests) rather than the raw values, and leave cryptography to vetted libraries. One caution: a compiler can undo constant-time code, which is why libraries use assembly or barriers.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">the mitigation list and what each addresses, after the Spectre paper (Kocher et al., 2018), the Meltdown paper (Lipp et al., 2018) and vendor guidance; verify against them</Provenance>
          <Provenance kind="from-memory">the four library functions and their behaviour; verify each against its documentation</Provenance>
        </ProvenanceRow>
        <Honesty simulated={false} />
      </div>
    </StageFrame>
  );
}
