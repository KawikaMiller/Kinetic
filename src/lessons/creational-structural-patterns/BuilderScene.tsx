import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { builderCaption } from './frames';
import { ARG_NAMES, BUILD_RULES, DEFAULT_CHOICE, POSITIONAL, buildFrom, builderLines, type BuilderChoice } from './model';
import { Recognise } from './Recognise';

const POSITIONAL_LINE = `const req = new Request(${POSITIONAL.join(', ')});`;

export function BuilderScene({ picker }: { picker: ReactNode }) {
  const [showNames, setShowNames] = useState(false);
  const [c, setC] = useState<BuilderChoice>(DEFAULT_CHOICE);
  useIntroCaption(builderCaption(c), [c]);
  const r = buildFrom(c);
  const set = (patch: Partial<BuilderChoice>) => setC({ ...c, ...patch });

  const positional = () => (
    <>
      {'const req = new Request('}
      {POSITIONAL.map((v, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <span className={`csp-arg ${showNames ? 'is-named' : ''}`} title={ARG_NAMES[i]}>
            {showNames && <span className="csp-arg-name">{ARG_NAMES[i]}: </span>}
            {v}
          </span>
        </span>
      ))}
      {');'}
    </>
  );

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'an argument’s hidden meaning' },
            { color: 'var(--ok)', label: 'build() accepts' },
            { color: 'var(--bad)', label: 'build() refuses' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Positional arguments" value={showNames} onChange={setShowNames} off="as written" on="show what each one means" />
        </>,
        <>
          <Segmented label="method" value={c.method} onChange={(m) => set({ method: m })} options={[{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]} />
          <Toggle label="body" value={c.body} onChange={(b) => set({ body: b })} off="none" on="JSON body" />
          <Segmented label="retries" value={c.retries} onChange={(n) => set({ retries: n })} options={[{ value: 3, label: '3' }, { value: 9, label: '9' }]} />
          <Segmented label="timeout" value={c.timeoutMs} onChange={(t) => set({ timeoutMs: t })} options={[{ value: 5000, label: '5000 ms' }, { value: 0, label: '0 ms' }]} />
        </>,
      ]}
    >
      <div className="csp stage-pad">
        <CodePanel title="7 positional arguments: hover one, or show their names" lines={[POSITIONAL_LINE]} renderLine={positional} className="csp-code" />
        <div className="csp-row">
          <div className="csp-col">
            <CodePanel title="the same request with a builder" lines={builderLines(c)} className="csp-code" />
          </div>
          <div className="csp-col">
            <ConsolePanel title="build()" lines={r.ok ? [JSON.stringify(r.request)] : r.errors.map((text) => ({ text: `✕ ${text}`, tone: 'bad' as const }))} />
            <Hint block>build() checks: {BUILD_RULES.map((x) => x.text).join('; ')}.</Hint>
          </div>
        </div>
        <Hint block>
          When not to: in JavaScript an options object often does the same job (<code>new Request(url, {'{ method: \'GET\', retries: 3 }'})</code>). Reach for a builder when
          construction has steps or rules worth enforcing in one place; it is a choice, not a rule.
        </Hint>
        <Recognise current="builder" />
      </div>
    </StageFrame>
  );
}
