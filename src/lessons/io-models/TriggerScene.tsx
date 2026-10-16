import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { plural } from './captions';
import { CELLS, CELL_BYTES, DEFAULT_EDGE, MESSAGE_BYTES, parseReadSize, runEdge, type EdgeInput, type Trigger } from './edge';
import { connectionWord, edgeFrames, edgeStateAt } from './edgeView';

const TRIGGER_OPTIONS = [{ value: 'level' as const, label: 'Level-triggered' }, { value: 'edge' as const, label: 'Edge-triggered' }];
const SIZE_PRESETS = [50, 100, 150, 200, 300];
const STEP_MS = 900;
const CELL_VALUES = Array.from({ length: CELLS }, () => '');

export function TriggerScene({ picker }: { picker: ReactNode }) {
  const [input, setInput] = useState<EdgeInput>(DEFAULT_EDGE);
  const [text, setText] = useState(String(DEFAULT_EDGE.readBytes));
  const [error, setError] = useState<string | null>(null);
  const run = useMemo(() => runEdge(input), [input]);
  const frames = useMemo(() => edgeFrames(input, run), [input, run]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const s = edgeStateAt(run, player.frame.now);

  const setSize = (readBytes: number) => {
    setInput((i) => ({ ...i, readBytes }));
    setText(String(readBytes));
    setError(null);
  };
  const type = (value: string) => {
    setText(value);
    const parsed = parseReadSize(value);
    if (parsed.ok) {
      setInput((i) => ({ ...i, readBytes: parsed.value }));
      setError(null);
    } else setError(`${parsed.error} Keeping ${input.readBytes}.`);
  };

  const cellTone = (i: number): Tone => {
    const start = i * CELL_BYTES;
    if (start + CELL_BYTES <= s.readSoFar) return 'ok';
    if (start < s.readSoFar) return 'hi';
    return s.hung ? 'bad' : 'dim';
  };

  return (
    <StageFrame
      player={player}
      height={380}
      stats={
        <Stats>
          <Stat label="Bytes read" value={s.readSoFar} color="var(--ok)" sub={`of ${MESSAGE_BYTES}`} />
          <Stat label="Still unread" value={MESSAGE_BYTES - s.readSoFar} color={s.hung ? 'var(--bad)' : undefined} />
          <Stat label="epoll said readable" value={plural(s.reports, 'time')} color="var(--info)" />
          <Stat label="The connection" value={connectionWord(s)} color={s.hung ? 'var(--bad)' : s.finished ? 'var(--ok)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'bytes the handler has read', shape: 'square' },
            { color: 'var(--hi)', label: 'a cell read in part', shape: 'square' },
            { color: 'var(--dim)', label: 'bytes still in the socket', shape: 'square' },
            { color: 'var(--bad)', label: 'bytes epoll will not mention again: a hung connection', shape: 'square' },
            { color: 'var(--info)', label: 'epoll telling the program the fd is readable', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="epoll mode" value={input.trigger} onChange={(trigger: Trigger) => setInput((i) => ({ ...i, trigger }))} options={TRIGGER_OPTIONS} />
          <Toggle label="Read until EAGAIN" value={input.drain} onChange={(drain) => setInput((i) => ({ ...i, drain }))} off="No, one read" on="Yes, drain it" />
        </>,
        <>
          {SIZE_PRESETS.map((v) => <ChipButton key={v} tone="info" on={input.readBytes === v} onClick={() => setSize(v)}>{`${v} bytes`}</ChipButton>)}
          <TextField label="Bytes per read" value={text} onChange={type} onBlur={() => setText(String(input.readBytes))} width={90} spellCheck={false} />
        </>,
      ]}
    >
      <div className="iom-stage stage-pad">
        <Box>
          <SectionTitle hint={`${MESSAGE_BYTES} bytes in ${CELLS} cells of ${CELL_BYTES}`}>The message in the socket</SectionTitle>
          <ArrayStrip values={CELL_VALUES} cellTone={cellTone} renderValue={() => ''} cellTitle={(i) => `bytes ${i * CELL_BYTES} to ${(i + 1) * CELL_BYTES - 1}`} />
          {error && <p className="iom-status" role="status">{error}</p>}
          <Hint tone="muted" block>
            Level-triggered epoll reports an fd for as long as bytes remain. Edge-triggered reports it once per arrival, so a handler that reads less than the whole message and stops will not hear about the rest.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">one connection and one message; the stall is what the handler loop produces, not a script</Provenance>
          <Provenance kind="from-memory">edge goes quiet after a partial read, level reports again, draining to EAGAIN gets all 300 bytes: seen once on one Linux 6.18 kernel under WSL2, not run here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
