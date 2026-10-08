import { useMemo, useState, type ReactNode } from 'react';
import { CallStackPanel } from '../../components/CallStackPanel';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { usePlayer } from '../../core/usePlayer';
import { protoFrames } from './frames';
import { PROGRAMS, PROGRAM_CODE, type ProgramId } from './model';

/** Shown instead of running `[...naturals()]`: the lesson never starts an endless spread. */
export const SPREAD_REFUSAL = 'Not run: [...naturals()] asks for every value of a generator that never finishes, so the spread would never return and the tab would freeze.';

export function ProtoScene({ picker }: { picker: ReactNode }) {
  const [program, setProgram] = useState<ProgramId>('gen');
  const [refused, setRefused] = useState(false);
  const frames = useMemo(() => protoFrames(program), [program]);
  const player = usePlayer(frames, { interval: 1800 });
  const f = player.frame;
  const code = PROGRAM_CODE[program];
  const setCaption = useSetCaption();
  const refuse = () => {
    player.pause();
    setRefused(true);
    setCaption(<>{SPREAD_REFUSAL} With <code>take</code>, the same generator is safe: it only runs as far as it is asked.</>);
  };
  const pick = (p: ProgramId) => {
    setProgram(p);
    setRefused(false);
  };
  const lines: ConsoleLine[] = [...f.printed.map((t) => (t.includes('done: true') ? { text: t, tone: 'ok' as const } : t)), ...(refused ? [{ text: SPREAD_REFUSAL, tone: 'bad' as const }] : [])];

  return (
    <StageFrame
      player={player}
      height={480}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'line running / frame running' },
            { color: 'var(--dim)', label: 'frame waiting (caller, or a suspended generator)' },
            { color: 'var(--violet)', label: 'suspended generator, parked off the stack' },
            { color: 'var(--ok)', label: 'printed results; done: true' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Program" value={program} onChange={pick} options={PROGRAMS} />
          {program === 'naturals' && <Button onClick={refuse}>Try [...naturals()]</Button>}
        </>,
      ]}
    >
      <div className="itg stage-pad">
        <div className="itg-row">
          <div className="itg-col">
            <CodePanel title="definition" lines={code.def} active={f.defLine} className="itg-code" />
            <CodePanel title="caller" lines={code.caller} active={f.callerLine} className="itg-code" />
          </div>
          <div className="itg-col itg-stacks">
            <CallStackPanel frames={f.stack} title="Call stack" anchor="top" minHeight={96} />
            <CallStackPanel
              frames={f.parked ? [{ id: 'parked', name: f.parked, state: 'waiting', tone: 'violet' }] : []}
              title="Suspended generator (on the heap)"
              anchor="top"
              minHeight={52}
              showDepth={false}
              empty={<p className="empty-note">none</p>}
              className="itg-parked"
            />
            <ConsolePanel lines={lines} empty="(nothing yet)" />
          </div>
        </div>
        <Hint block>
          The results are what real JavaScript returns for these exact snippets (checked in the lesson&apos;s tests). A suspended generator leaves the call stack, like an awaiting
          async function: its frame waits as an object until the next next().
        </Hint>
      </div>
    </StageFrame>
  );
}
