import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { factoryCaption } from './frames';
import { NEW_PROVIDER, PROVIDERS, appCode, touchedFiles } from './model';
import { Recognise } from './Recognise';

export function FactoryScene({ picker }: { picker: ReactNode }) {
  const [factory, setFactory] = useState(false);
  const [added, setAdded] = useState(false);
  useIntroCaption(factoryCaption(factory, added), [factory, added]);
  const before = appCode(PROVIDERS, factory);
  const files = added ? appCode([...PROVIDERS, NEW_PROVIDER], factory) : before;
  const touched = added ? touchedFiles(factory) : [];
  /** A line is touched when it wasn't in that file before the change (an inserted or rewritten line). */
  const changed = (name: string, i: number) => added && !before.find((b) => b.name === name)!.lines.includes(files.find((f) => f.name === name)!.lines[i]);

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Files touched" value={added ? touched.length : '–'} color={added ? (touched.length > 1 ? 'var(--orange)' : 'var(--ok)') : 'var(--muted)'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--orange)', label: 'a line the change touches' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Code" value={factory} onChange={setFactory} off="new at each call site" on="createPaymentClient()" />
          <ChipButton tone="orange" on={added} onClick={() => setAdded(!added)}>
            + add {NEW_PROVIDER}
          </ChipButton>
        </>,
      ]}
    >
      <div className="csp stage-pad">
        <div className="csp-files">
          {files.map((f) => (
            <CodePanel
              key={f.name}
              title={f.name}
              lines={f.lines}
              stateOf={(i) => (changed(f.name, i) ? 'next' : 'idle')}
              className={`csp-code ${touched.includes(f.name) ? 'is-touched' : ''}`}
            />
          ))}
        </div>
        <Hint block>
          This is a simple factory function; the GoF Factory Method (subclasses decide) and Abstract Factory (families of related objects) are bigger relatives. When not to: with one implementation that will never vary, a factory is indirection for nothing. It pays off when the choice really varies (config, tests, platforms) and
          the callers shouldn&apos;t care which class they get.
        </Hint>
        <Recognise current="factory" />
      </div>
    </StageFrame>
  );
}
