import { useMemo, useState } from 'react';
import { CallStackPanel } from '../../components/CallStackPanel';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Segmented } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { errorFrames } from './frames';
import { FN_ARGS, programLines, type FailAt, type Mode, type Preset } from './model';
import './styles.css';

const STEP_MS = 1100;

const MODES = [
  { value: 'exceptions' as const, label: 'Exceptions' },
  { value: 'result' as const, label: 'Result type' },
];
const FAILS = [
  { value: 'none' as const, label: 'Nothing fails' },
  { value: 'callBank' as const, label: 'callBank' },
  { value: 'chargeCard' as const, label: 'chargeCard' },
];
const PRESETS = [
  { value: 'boundary' as const, label: 'Catch at the boundary' },
  { value: 'swallow' as const, label: 'Empty catch {}' },
  { value: 'rethrow' as const, label: 'Rethrow with cause' },
  { value: 'unhandled' as const, label: 'No catch at all' },
];

export function Stage() {
  const [mode, setMode] = useState<Mode>('exceptions');
  const [failAt, setFailAt] = useState<FailAt>('callBank');
  const [preset, setPreset] = useState<Preset>('boundary');
  const lines = useMemo(() => programLines(mode, preset, failAt), [mode, preset, failAt]);
  const frames = useMemo(() => errorFrames(lines, mode, preset, failAt), [lines, mode, preset, failAt]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  return (
    <StageFrame
      player={player}
      height={440}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running' },
            { color: 'var(--bad)', label: 'throwing' },
            { color: 'var(--dim)', label: 'skipped (no catch)' },
            { color: 'var(--violet)', label: 'finally' },
            { color: 'var(--ok)', label: 'catch handles it' },
            { color: 'var(--info)', label: 'returning' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Failure model" value={mode} onChange={setMode} options={MODES} />
          <Segmented label="Make this fail" value={failAt} onChange={setFailAt} options={FAILS} />
        </>,
        mode === 'exceptions' && (
          <Segmented key="preset" label="How chargeCard and handleRequest react" value={preset} onChange={setPreset} options={PRESETS} />
        ),
      ].filter(Boolean)}
    >
      <div className="eh stage-pad">
        <CodePanel title={mode === 'exceptions' ? 'The program: exceptions' : 'The program: result values'} lines={lines} active={f.line} className="eh-code" />
        <div className="eh-side">
          <CallStackPanel
            frames={[...f.stack].reverse().map((s) => ({ id: s.fn, name: `${s.fn}(${FN_ARGS[s.fn]})`, detail: s.detail, state: s.state, tone: s.tone }))}
            meta={`${f.stack.length} deep`}
            alarm={f.crash !== null}
            minHeight={170}
            empty={<p className="empty-note">{f.crash ? 'every frame unwound' : 'nothing running'}</p>}
          />
          <ConsolePanel title="console" lines={f.output} error={f.crash ?? undefined} empty="(nothing printed yet)" />
          {f.lost && (
            <div className="eh-ghost" role="note">
              <span className="eh-ghost-label">lost forever</span>
              <code>Error('{f.lost}')</code>
              <span>swallowed by catch {'{}'}: no log, no retry, no alert</span>
            </div>
          )}
          <Box variant="sunken" className="eh-advice">
            <SectionTitle>Which one when?</SectionTitle>
            <ul>
              <li><b>Expected failures</b> (bad input, not found, card declined): a result value, or a catch close to where you can do something about it.</li>
              <li><b>Bugs and the unexpected</b>: let them throw. Fail loudly and handle them once, at the boundary (the request handler).</li>
              <li>Never <code>catch {'{}'}</code> and carry on: log it, rethrow it, or handle it for real.</li>
            </ul>
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}
