import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { matchFrames } from './frames';
import {
  PRESETS, checkMatch, flagRows, preset, rustMatchSource, tsMatchSource,
  type Arms, type MatchLang, type PresetId, type Variant,
} from './model';

const SORTER_W = 360;
const SORTER_H = 210;
const SLOT_Y = 140;
const SLOT_XS = [52, 136, 220];
const CATCH_X = 308;
const SLOT_R = 26;
const DROP = { duration: 0.6, ease: 'easeIn' as const };

function Shape({ shape, x, y, r, className }: { shape: Variant['shape']; x: number; y: number; r: number; className?: string }) {
  if (shape === 'circle') return <circle cx={x} cy={y} r={r} className={className} />;
  if (shape === 'square') return <rect x={x - r * 0.88} y={y - r * 0.88} width={r * 1.76} height={r * 1.76} rx={4} className={className} />;
  return <polygon points={`${x},${y - r} ${x + r},${y + r * 0.8} ${x - r},${y + r * 0.8}`} className={className} />;
}

export function MatchScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState<PresetId>('fetch');
  const [lang, setLang] = useState<MatchLang>('rust');
  const [arms, setArms] = useState<Arms>([true, true, false]);
  const [catchAll, setCatchAll] = useState(false);
  const p = preset(presetId);
  const frames = useMemo(() => matchFrames(lang, p, arms, catchAll), [lang, p, arms, catchAll]);
  const player = usePlayer(frames, { interval: 1600 });
  const f = player.frame;
  const v = checkMatch(lang, p, arms, catchAll);
  const ts = tsMatchSource(p, arms, catchAll);
  const rs = rustMatchSource(p, arms, catchAll);
  const src = lang === 'ts' ? ts : rs;
  const current = f.current === null ? null : p.variants[f.current];
  const currentByDefault = f.current !== null && !arms[f.current];
  const rows = flagRows(p);

  const slotTone = (i: number) => (arms[i] ? 'ok' : catchAll ? 'dim' : f.checked ? 'orange' : 'muted');
  const lineState = (i: number): LineState => {
    if (lang === 'ts' && i === ts.neverLine && f.checked && !v.ok) return 'bad';
    if (lang === 'rust' && i === rs.matchLine && f.checked && !v.ok) return 'bad';
    const arm = src.armLine.indexOf(i);
    if (arm >= 0) return f.current === arm ? 'now' : f.done.some((d) => d.index === arm) ? 'done' : 'idle';
    if (catchAll && i === src.defaultLine) return v.defaultUnreachable ? 'cut' : currentByDefault ? 'now' : 'idle';
    return 'idle';
  };
  const consoleLines: ConsoleLine[] = [
    ...(f.checked && v.message ? [{ text: v.message, tone: v.warning ? ('muted' as const) : ('orange' as const) }] : []),
    ...(f.checked && v.ok && !v.message ? [{ text: 'compiles', tone: 'ok' as const }] : []),
    ...f.done.map((d) => ({ text: `render(${p.variants[d.index].sample.label}) → "${d.printed}"`, tone: d.byDefault ? ('info' as const) : ('ok' as const) })),
  ];
  const toggleArm = (i: number) => setArms(arms.map((a, j) => (j === i ? !a : a)) as Arms);

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Variants" value={p.variants.length} color="var(--ok)" />
          <Stat label="Flag combinations" value={rows.length} color="var(--muted)" />
          <Stat label="Nonsense combinations" value={rows.filter((r) => !r.means).length} color="var(--bad)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'covered arm / printed result' },
            { color: 'var(--orange)', label: 'missing arm, flagged by the compiler' },
            { color: 'var(--info)', label: 'handled by the catch-all' },
            { color: 'var(--dim)', label: 'no arm of its own / unreachable' },
            { color: 'var(--hi)', label: 'value being matched' },
            { color: 'var(--bad)', label: 'nonsense flag combination' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Type" value={presetId} onChange={setPresetId} options={PRESETS.map((x) => ({ value: x.id, label: x.label }))} />
          <Segmented label="Language" value={lang} onChange={setLang} options={[{ value: 'rust', label: 'Rust' }, { value: 'ts', label: 'TypeScript' }]} />
        </>,
        <>
          <ControlGroup label="Match arms">
            {p.variants.map((x, i) => (
              <ChipButton key={x.name} tone="ok" on={arms[i]} onClick={() => toggleArm(i)}>
                {x.name}
              </ChipButton>
            ))}
            <ChipButton tone="info" on={catchAll} onClick={() => setCatchAll(!catchAll)}>
              {lang === 'rust' ? '_ (catch-all)' : 'default (catch-all)'}
            </ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="noa stage-pad">
        <div className="noa-row">
          <div className="noa-col noa-sorter-col">
            <svg viewBox={`0 0 ${SORTER_W} ${SORTER_H}`} className="noa-sorter" role="img" aria-label={`Shape sorter: ${p.variants.map((x, i) => `${x.name} ${arms[i] ? 'has an arm' : 'has no arm'}`).join(', ')}${catchAll ? ', plus a catch-all' : ''}`}>
              {p.variants.map((x, i) => (
                <g key={x.name} className={`noa-slot tone-${slotTone(i)}`}>
                  <Shape shape={x.shape} x={SLOT_XS[i]} y={SLOT_Y} r={SLOT_R} className="noa-slot-shape" />
                  <text x={SLOT_XS[i]} y={SLOT_Y + 48} textAnchor="middle">
                    {x.name}
                  </text>
                  <text x={SLOT_XS[i]} y={SLOT_Y + 62} textAnchor="middle" className="noa-slot-sub">
                    {arms[i] ? 'arm ✓' : catchAll ? 'no arm' : 'missing'}
                  </text>
                </g>
              ))}
              {catchAll && (
                <g className={`noa-slot tone-${v.defaultUnreachable ? 'dim' : 'info'}`}>
                  <rect x={CATCH_X - 34} y={SLOT_Y - 24} width={68} height={48} rx={10} className="noa-slot-shape" />
                  <text x={CATCH_X} y={SLOT_Y + 5} textAnchor="middle">
                    {lang === 'rust' ? '_' : 'default'}
                  </text>
                  <text x={CATCH_X} y={SLOT_Y + 48} textAnchor="middle">
                    catch-all
                  </text>
                  <text x={CATCH_X} y={SLOT_Y + 62} textAnchor="middle" className="noa-slot-sub">
                    {v.defaultUnreachable ? 'unreachable' : 'catches the rest'}
                  </text>
                </g>
              )}
              {current && f.current !== null && (
                <motion.g
                  key={`${p.id}-${f.current}-${player.index}`}
                  className="noa-token tone-hi"
                  initial={{ x: SORTER_W / 2, y: 30 }}
                  animate={{ x: currentByDefault ? CATCH_X : SLOT_XS[f.current], y: SLOT_Y }}
                  transition={DROP}
                >
                  <Shape shape={current.shape} x={0} y={0} r={14} className="noa-token-shape" />
                </motion.g>
              )}
              {current && (
                <text className="noa-token-label" x={SORTER_W / 2} y={18} textAnchor="middle">
                  {current.sample.label}
                </text>
              )}
              {f.checked && !v.ok && (
                <text className="noa-flagged" x={SORTER_W / 2} y={34} textAnchor="middle">
                  doesn&apos;t compile: nothing runs
                </text>
              )}
            </svg>
          </div>
          <div className="noa-col">
            <CodePanel title={lang === 'rust' ? 'Rust (fixed)' : 'TypeScript'} lines={src.lines} stateOf={lineState} className="noa-code is-compile" />
            <ConsolePanel title={lang === 'rust' ? 'rustc, then run (fixed real outputs)' : 'tsc --strict, then run'} lines={consoleLines} empty="(not compiled yet)" />
          </div>
        </div>
        <div className="noa-flags">
          <SectionTitle>
            The same state as three flags: {rows.length} combinations, {rows.filter((r) => !r.means).length} of them nonsense
          </SectionTitle>
          <CellGrid
            rows={rows.length}
            cols={3}
            size={{ cell: 40, gap: 3, font: 11 }}
            colLabels={p.flags}
            cell={(r, c) => ({ text: rows[r].flags[c] ? 'true' : 'false', tone: rows[r].means ? 'muted' : 'bad', fill: rows[r].means ? 'outline' : 'tint' })}
            rowSuffix={{ width: 150, render: (r) => (rows[r].means ? `= ${rows[r].means!.name}` : rows[r].flags.some(Boolean) ? '✕ two states at once' : '✕ no state at all') }}
            ariaLabel={`All ${rows.length} combinations of ${p.flags.join(', ')}: only ${rows.filter((r) => r.means).length} mean a real state`}
            className="noa-flag-grid"
          />
          <Hint block>
            With flags, nothing stops two being set at once. A sum type has exactly {p.variants.length} values to be in, so the nonsense rows can&apos;t even be written. (All-false
            could mean &quot;not started yet&quot;: if that is a real state, make it a fourth variant on purpose.)
          </Hint>
        </div>
        <Hint block>
          Rust code and compiler messages are fixed, real rustc outputs, shown, not run. The TypeScript version and its messages are real: tsc and the outputs are checked in the
          lesson&apos;s tests.
        </Hint>
      </div>
    </StageFrame>
  );
}
