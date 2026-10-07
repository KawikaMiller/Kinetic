import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, TextField } from '../../components/ui';
import { NA } from '../../core/format';
import { popIn } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { coinFrames, coinSummary, type CoinSystem } from './frames';
import { coinVerdict, dpCoins, greedyCoins, parseCoins, parseTarget, TRICKY_COINS, US_COINS } from './model';

const STEP_MS = 900;
const DP_COLS = 10;

const PRESETS: { label: string; target: number; coins: readonly number[] }[] = [
  { label: '6 with 1, 3, 4', target: 6, coins: TRICKY_COINS },
  { label: '30 with 1, 10, 25', target: 30, coins: [1, 10, 25] },
  { label: '8 with 4, 5', target: 8, coins: [4, 5] },
];

const setText = (xs: readonly number[]) => `{${xs.join(', ')}}`;

export function CoinsScene({ picker }: { picker: ReactNode }) {
  const [targetText, setTargetText] = useState('6');
  const [coinsText, setCoinsText] = useState(TRICKY_COINS.join(', '));
  const [target, setTarget] = useState(6);
  const [coins, setCoins] = useState<readonly number[]>(TRICKY_COINS);
  const targetParse = parseTarget(targetText);
  const coinsParse = parseCoins(coinsText);

  const systems: CoinSystem[] = useMemo(() => [{ name: `US coins ${setText(US_COINS)}`, coins: US_COINS }, { name: `Your coins ${setText(coins)}`, coins }], [coins]);
  const frames = useMemo(() => coinFrames(target, systems), [target, systems]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const dp = useMemo(() => dpCoins(coins, target), [coins, target]);

  const onTarget = (text: string) => {
    setTargetText(text);
    const r = parseTarget(text);
    if (r.ok) setTarget(r.value);
  };
  const onCoins = (text: string) => {
    setCoinsText(text);
    const r = parseCoins(text);
    if (r.ok) setCoins(r.value);
  };
  const load = (p: (typeof PRESETS)[number]) => {
    onTarget(String(p.target));
    onCoins(p.coins.join(', '));
  };

  const rows = Math.ceil((target + 1) / DP_COLS);
  const errors = [!targetParse.ok && targetParse.error, !coinsParse.ok && coinsParse.error].filter(Boolean);

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'coins greedy took' },
            { color: 'var(--violet)', label: 'the fewest possible (DP)' },
            { color: 'var(--hi)', label: 'the target amount' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Target" value={targetText} onChange={onTarget} width={64} spellCheck={false} className="gr-field" />
          <TextField label="Your coins" value={coinsText} onChange={onCoins} width={150} spellCheck={false} className="gr-field" />
        </>,
        <ControlGroup key="try" label="Try" inline className="gr-presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.label} tone="info" size="md" on={target === p.target && coins.join() === p.coins.join()} onClick={() => load(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="gr stage-pad">
        <p className="gr-error" role="status">
          {errors.length ? `${errors.join(' ')} Still showing ${target} with ${setText(coins)}.` : ''}
        </p>
        <div className="gr-coin-row">
          {systems.map((s) => (
            <CoinPanel key={s.name} sys={s} target={target} shown={f.taken} done={f.done} />
          ))}
        </div>
        <Box className="gr-dp">
          <SectionTitle hint="the reference answer">
            Fewest coins for every amount 0-{target}, with {setText(coins)}
          </SectionTitle>
          <CellGrid
            rows={rows}
            cols={DP_COLS}
            size={{ cell: 30 }}
            rowLabels={Array.from({ length: rows }, (_, r) => String(r * DP_COLS))}
            colLabels={Array.from({ length: DP_COLS }, (_, c) => `+${c}`)}
            cell={(r, c) => {
              const a = r * DP_COLS + c;
              if (a > target) return { fill: 'none' };
              const v = dp.best[a];
              return a === target ? { text: v ?? NA, tone: 'hi', fill: 'solid' } : { text: v ?? NA, tone: 'muted', fill: 'tint', intensity: 0.12 };
            }}
            cellTitle={(r, c) => {
              const a = r * DP_COLS + c;
              const v = dp.best[a];
              return a > target ? '' : v === null ? `${a}: can't be made` : `${a}: ${v} coin${v === 1 ? '' : 's'} at best`;
            }}
            ariaLabel={`Fewest coins for each amount from 0 to ${target}`}
            className="gr-dp-grid"
          />
          <Hint block>
            Each cell is the fewest coins that make that amount exactly ({NA} = impossible), filled in from smaller amounts. The DP itself is the
            dynamic-programming lesson's job: here it's only the answer key.
          </Hint>
        </Box>
      </div>
    </StageFrame>
  );
}

function CoinPanel({ sys, target, shown, done }: { sys: CoinSystem; target: number; shown: number; done: boolean }) {
  const g = greedyCoins(sys.coins, target);
  const dp = dpCoins(sys.coins, target);
  const v = coinVerdict(sys.coins, target);
  const taken = g.taken.slice(0, shown);
  const left = target - taken.reduce((a, b) => a + b, 0);
  const tone = v.kind === 'optimal' ? 'ok' : v.kind === 'impossible' ? 'muted' : 'bad';
  return (
    <Box className="gr-coins">
      <SectionTitle>{sys.name}</SectionTitle>
      <div className="gr-coin-line">
        <span className="gr-coin-key">greedy</span>
        <AnimatePresence initial={false}>
          {taken.map((c, i) => (
            <motion.span key={i} className="gr-coin tone-info" {...popIn}>
              {c}
            </motion.span>
          ))}
        </AnimatePresence>
        <span className="gr-left">{left > 0 ? `${left} left` : 'paid'}</span>
      </div>
      {done && (
        <>
          <div className="gr-coin-line">
            <span className="gr-coin-key">fewest</span>
            {dp.coins ? dp.coins.map((c, i) => <span key={i} className="gr-coin tone-violet">{c}</span>) : <span className="gr-left">none</span>}
          </div>
          <p className={`gr-verdict tone-${tone}`}>{coinSummary(sys, target)}</p>
        </>
      )}
    </Box>
  );
}
