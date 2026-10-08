import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { chainFrames, type ChainFrame, type ChainStep } from './frames';
import { CITY, FIX_CODE, FIX_MODES, LINKS, NO_NULLS, evaluate, userSource, type FixMode, type Link, type Nulls } from './model';

/** Which program line each step of the chain is evaluated on (0 is the `const user` data line). */
const LINE_OF: Record<FixMode, Record<ChainStep, number>> = {
  plain: { user: 1, address: 1, city: 1, call: 1, result: 2 },
  optional: { user: 1, address: 1, city: 1, call: 1, result: 2 },
  optionalDefault: { user: 1, address: 1, city: 1, call: 1, result: 2 },
  ladder: { user: 2, address: 3, city: 4, call: 5, result: 9 },
  option: { user: 1, address: 2, city: 3, call: 4, result: 6 },
};

const NODE_LABEL: Record<ChainStep, string> = { user: 'user', address: '.address', city: '.city', call: '.toUpperCase()', result: 'city' };

function nodeValue(step: ChainStep, n: Nulls, f: ChainFrame): string {
  if (step === 'call') return f.seen.includes('call') ? `"${CITY.toUpperCase()}"` : '…';
  if (step === 'result') return f.printed ? f.printed.replace('Ship to ', '') : '…';
  if (!f.seen.includes(step)) return '…';
  return n[step] ? 'null' : step === 'city' ? `"${CITY}"` : '{ … }';
}

function nodeTone(step: ChainStep, n: Nulls, f: ChainFrame, handled: boolean): string {
  if (f.skipped.includes(step)) return 'dim';
  if (step === f.current && step !== 'result') return 'hi';
  if (step === 'result') return f.printed === null ? 'muted' : f.silentBug ? 'bad' : 'ok';
  if (!f.seen.includes(step)) return 'muted';
  if (step !== 'call' && n[step]) return f.crashed ? 'bad' : handled ? 'ok' : 'bad';
  return 'info';
}

export function ChainScene({ picker }: { picker: ReactNode }) {
  const [nulls, setNulls] = useState<Nulls>({ ...NO_NULLS, address: true });
  const [mode, setMode] = useState<FixMode>('plain');
  const frames = useMemo(() => chainFrames(mode, nulls), [mode, nulls]);
  const player = usePlayer(frames, { interval: 1700 });
  const f = player.frame;
  const out = evaluate(mode, nulls);
  const lines = [userSource(nulls), ...FIX_CODE[mode]];
  const activeLine = f.current ? LINE_OF[mode][f.current] : null;
  const handled = mode !== 'plain' && mode !== 'optional';
  const steps: ChainStep[] = [...LINKS, 'call', 'result'];

  return (
    <StageFrame
      player={player}
      height={430}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'link being read now' },
            { color: 'var(--info)', label: 'present value' },
            { color: 'var(--bad)', label: 'the null that crashed / a leaked undefined' },
            { color: 'var(--ok)', label: 'handled' },
            { color: 'var(--dim)', label: 'never evaluated' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Make null">
            {LINKS.map((l: Link) => (
              <ChipButton key={l} tone="bad" on={nulls[l]} onClick={() => setNulls({ ...nulls, [l]: !nulls[l] })}>
                {l}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="Code" value={mode} onChange={setMode} options={FIX_MODES} />
        </>,
      ]}
    >
      <div className="noa stage-pad">
        <ol className="noa-chain" aria-label="The chain user.address.city.toUpperCase(), link by link">
          {steps.map((s, i) => (
            <Fragment key={s}>
              {i > 0 && (
                <li className="noa-arrow" aria-hidden>
                  →
                </li>
              )}
              <li className={`noa-link tone-${nodeTone(s, nulls, f, handled)} ${s === f.current ? 'is-current' : ''}`}>
                <span className="noa-link-name">{NODE_LABEL[s]}</span>
                <span className="noa-link-value">{nodeValue(s, nulls, f)}</span>
              </li>
            </Fragment>
          ))}
        </ol>
        <div className="noa-row">
          <div className="noa-col">
            <CodePanel
              title="JavaScript"
              lines={lines}
              stateOf={(i) => (f.crashed && i === activeLine ? 'bad' : i === activeLine ? 'now' : 'idle')}
              className="noa-code"
            />
            {mode === 'option' && <Hint block>Option is a dozen lines written for this lesson: map turns a null result into None, like Java&apos;s Optional.map.</Hint>}
          </div>
          <div className="noa-col">
            <ConsolePanel
              lines={f.printed ? [f.silentBug ? { text: f.printed, tone: 'bad' } : f.printed] : []}
              error={f.crashed ? out.error : undefined}
              empty="(not run yet)"
            />
            <Box className="noa-quote" variant="sunken">
              <blockquote>&ldquo;I call it my billion-dollar mistake. It was the invention of the null reference in 1965.&rdquo;</blockquote>
              <cite>Tony Hoare, inventor of the null reference (in ALGOL W), speaking at QCon London, 2009</cite>
            </Box>
          </div>
        </div>
        <Hint block>The program runs as real JavaScript in the lesson&apos;s tests: every crash message and printed line here is what V8 gives for that combination.</Hint>
      </div>
    </StageFrame>
  );
}
