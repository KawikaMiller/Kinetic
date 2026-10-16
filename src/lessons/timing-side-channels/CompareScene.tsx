import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { guessLimitNote, n } from './captions';
import {
  COMPARE_FNS, DEFAULT_GUESS, MAX_GUESS_BYTES, SECRET_BYTES, SECRET_TEXT, byteStates, compareOpening, parseGuess, type CompareFn,
} from './compare';
import { compareFrames } from './frames';
import { Honesty } from './Honesty';

const CELL = { cell: 17, gap: 2, font: 10 } as const;
const PRESETS = [
  { label: 'All wrong', text: 'xxxxxxxxxxxxxxxx' },
  { label: '4 bytes right', text: 'demoxxxxxxxxxxxx' },
  { label: '9 bytes right', text: DEFAULT_GUESS },
  { label: 'All right', text: SECRET_TEXT },
  { label: 'Wrong length', text: 'demo-tok' },
];
const FN_OPTIONS = [
  { value: 'early' as const, label: 'Early exit' },
  { value: 'constant' as const, label: 'Constant time' },
];

/** A byte as one cell of text: the character for printable ASCII, else its hex value. */
const cellText = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b.toString(16).padStart(2, '0'));

export function CompareScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(compareOpening);
  const [typed, setTyped] = useState(open.text);
  const [guess, setGuess] = useState<readonly number[]>(() => {
    const parsed = parseGuess(open.text);
    return parsed.ok ? parsed.value.bytes : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [fn, setFn] = useState<CompareFn>(open.fn);

  const early = useMemo(() => COMPARE_FNS.early(SECRET_BYTES, guess), [guess]);
  const constant = useMemo(() => COMPARE_FNS.constant(SECRET_BYTES, guess), [guess]);
  const frames = useMemo(() => compareFrames(fn, guess), [fn, guess]);
  const player = usePlayer(frames, { interval: 520 });
  const shown = player.frame.shown;
  const chosen = fn === 'early' ? early : constant;
  const states = useMemo(() => byteStates(SECRET_BYTES, guess, chosen), [guess, chosen]);

  const edit = (text: string) => {
    setTyped(text);
    const parsed = parseGuess(text);
    if (parsed.ok) {
      setGuess(parsed.value.bytes);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };

  const cell = (r: number, c: number): GridCellSpec => {
    if (r === 0) return { text: cellText(SECRET_BYTES[c]), tone: 'muted', fill: 'tint', intensity: 0.15 };
    if (c >= guess.length) return { fill: 'none' };
    const order = chosen.visited.indexOf(c);
    const lit = order >= 0 && order < shown;
    if (r === 1) {
      if (!lit) return { text: cellText(guess[c]), tone: 'dim', fill: 'outline' };
      return states[c] === 'match' ? { text: cellText(guess[c]), tone: 'ok', fill: 'solid' } : { text: cellText(guess[c]), tone: 'bad', fill: 'solid' };
    }
    return lit ? { text: order + 1, tone: 'info', fill: 'tint', intensity: 0.25 } : { fill: 'none' };
  };

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Early exit: comparisons" value={early.lengthMismatch ? '0' : n(early.comparisons)} color="var(--bad)" sub={early.lengthMismatch ? 'stopped at the length check' : 'moves with how much of the guess matches'} />
          <Stat label="Constant time: comparisons" value={constant.lengthMismatch ? '0' : n(constant.comparisons)} color="var(--ok)" sub={constant.lengthMismatch ? 'stopped at the length check' : 'the same for every guess of this length'} />
          <Stat label="Both answered" value={early.equal ? 'true' : 'false'} sub={`${n(guess.length)} of ${MAX_GUESS_BYTES} bytes typed`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'compared, matches', shape: 'square' },
            { color: 'var(--bad)', label: 'compared, differs', shape: 'square' },
            { color: 'var(--dim)', label: 'not visited (yet)', shape: 'square' },
            { color: 'var(--info)', label: 'order visited', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Function to step through" value={fn} onChange={setFn} options={FN_OPTIONS} />
        </>,
        <>
          <TextField label="Guess" value={typed} onChange={edit} width={190} spellCheck={false} ariaLabel="Guess, up to 16 bytes" />
          <ControlGroup label="Try" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.label} tone="info" on={typed === p.text} onClick={() => edit(p.text)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="tsc-stage stage-pad">
        <Box>
          <SectionTitle hint="a fake token, shown in the open so you can see why the count moves">The bytes each function looks at</SectionTitle>
          <CellGrid
            className="tsc-bytes"
            rows={3}
            cols={SECRET_BYTES.length}
            size={CELL}
            cell={cell}
            rowLabels={['token', 'guess', 'order']}
            ariaLabel={`Token and guess bytes: ${early.lengthMismatch ? 'lengths differ' : `${chosen.comparisons} comparisons by ${fn === 'early' ? 'early exit' : 'constant time'}`}`}
          />
          {error ? <p className="tsc-refused" role="alert">{error} The previous guess is kept.</p> : <Hint tone="muted" block>{guessLimitNote} The counts below come from an instrument inside the two functions, not from a clock.</Hint>}
        </Box>
        <Honesty />
      </div>
    </StageFrame>
  );
}
