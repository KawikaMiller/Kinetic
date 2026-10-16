import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextArea } from '../../components/ui';
import { ASCII_BITS, MAX_TEXT, TABLE_ROWS, TEXT_DEFAULT, TEXT_PRESETS, clampText } from './model';
import { textEntropy } from '../../core/entropy';
import { bits2, bits3, showChar, textCaption } from './text';

export function TextScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(TEXT_DEFAULT);
  const [look, setLook] = useState<string | null>(null);
  const t = useMemo(() => textEntropy(text), [text]);
  const shown = t ? t.symbols.slice(0, TABLE_ROWS) : [];
  const hidden = t ? t.symbols.length - shown.length : 0;
  // The symbol under the microscope: the one picked, else the rarest of those listed.
  const focus = shown.find((s) => s.sym === look) ?? shown[shown.length - 1];

  return (
    <StageFrame
      height={420}
      intro={textCaption(t)}
      introKey={[text]}
      stats={
        <Stats>
          <Stat label="Characters" value={t ? t.n : '–'} sub={t ? `${t.symbols.length} different` : 'no symbols'} />
          <Stat label="Entropy, order 0" value={t ? `${bits3(t.bitsPerChar)} bits` : '–'} color="var(--violet)" sub="per character" />
          <Stat label="n × H" value={t ? `${bits2(t.totalBits)} bits` : '–'} color="var(--violet)" sub={t ? `plain ASCII: ${ASCII_BITS * t.n} bits` : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'share of the text' },
            { color: 'var(--hi)', label: 'the symbol you are looking at' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Examples" inline>
            {TEXT_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={text === p.text} onClick={() => setText(p.text)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextArea label={`Your text (up to ${MAX_TEXT} characters)`} value={text} onChange={setText} sanitize={(s) => clampText(s)} rows={2} mono ariaLabel="Text to measure" className="ent-text-field" />
          <Hint>Counted by code point, so an emoji is one character. Pick a symbol in the table to see how surprising it is here.</Hint>
        </>,
      ]}
    >
      <div className="ent-stage stage-pad">
        {t ? (
          <table className="ent-table" aria-label="Symbol frequencies">
            <thead>
              <tr>
                <th scope="col">symbol</th>
                <th scope="col">count</th>
                <th scope="col">share</th>
                <th scope="col">surprise</th>
                <th scope="col" aria-label="share as a bar" />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.sym} className={s === focus ? 'is-focus' : undefined}>
                  <th scope="row">
                    <ChipButton tone="hi" on={s === focus} ariaLabel={`Look at ${showChar(s.sym)}`} onClick={() => setLook(s.sym)}>
                      {showChar(s.sym)}
                    </ChipButton>
                  </th>
                  <td>{s.count}</td>
                  <td>{bits3(s.probability)}</td>
                  <td className={s === focus ? 'ent-hi' : undefined}>{bits2(s.surprise)} bits</td>
                  <td className="ent-bar-cell">
                    <Bar value={s.probability} max={1} tone={s === focus ? 'hi' : 'info'} height={10} animate={false} ariaLabel={`${showChar(s.sym)} is ${bits3(s.probability)} of the text`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="ent-empty">No symbols yet.</p>
        )}
        {hidden > 0 && <p className="ent-note">and {hidden} rarer {hidden === 1 ? 'symbol' : 'symbols'} not listed (they are counted in the entropy).</p>}
        {focus && t && (
          <p className="ent-note">
            <b className="ent-hi">{showChar(focus.sym)}</b> is {bits3(focus.probability)} of this text, so seeing it carries −log2 {bits3(focus.probability)} = {bits2(focus.surprise)} bits: a rare symbol is a bigger surprise than a common one.
          </p>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">order-0 entropy of this one sample, computed live: an estimate from its own counts, not the text&apos;s true information</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
