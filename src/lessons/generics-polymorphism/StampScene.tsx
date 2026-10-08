import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { stampFrames } from './frames';
import {
  DEFAULT_USES, ILLUSTRATIVE_COPY_KB, LANGS, MAX_USES, distinctArgs, lang, spellTemplate, spellType, sourceLineFor, type LangId, type TypeArg,
} from './model';

const SCENE_W = 520;
const SCENE_H = 220;
const TEMPLATE_AT = { x: SCENE_W / 2, y: 40 };
const COPY_Y = 160;
const COPY_W = 150;
const COPY_XS = [92, 260, 428];
const ARGS: TypeArg[] = ['int', 'string', 'point'];
const POP = { duration: 0.35 };

export function StampScene({ picker }: { picker: ReactNode }) {
  const [langId, setLangId] = useState<LangId>('java');
  const [uses, setUses] = useState<TypeArg[]>(DEFAULT_USES);
  const l = lang(langId);
  const frames = useMemo(() => stampFrames(l, uses), [l, uses]);
  const player = usePlayer(frames, { interval: 1600 });
  const f = player.frame;
  const currentArg = f.current === null ? null : uses[f.current];
  const shownArgs = distinctArgs(uses.slice(0, f.done));
  const demo: ConsoleLine[] = l.demo.flatMap((d) => [{ text: `> ${d.code}`, tone: 'muted' as const }, ...d.result.split('\n').map((text) => ({ text, tone: d.tone }))]);

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Uses" value={uses.length} color="var(--muted)" />
          <Stat label="Distinct type args" value={distinctArgs(uses).length} color="var(--info)" />
          <Stat label="Compiled copies" value={f.copies} color="var(--hi)">
            <Bar value={f.sizeKb} max={MAX_USES * ILLUSTRATIVE_COPY_KB} tone="hi" height={8} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'the generic definition' },
            { color: 'var(--info)', label: 'compiled code / runtime type' },
            { color: 'var(--hi)', label: 'the use being compiled; code size bar' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Language" value={langId} onChange={setLangId} options={LANGS.map((x) => ({ value: x.id, label: x.label }))} />
        </>,
        <>
          <ControlGroup label="Add a use">
            {ARGS.map((a) => (
              <ChipButton key={a} tone="info" disabled={uses.length >= MAX_USES} onClick={() => setUses([...uses, a])}>
                + {spellType(l, a)}
              </ChipButton>
            ))}
            <ChipButton tone="muted" onClick={() => setUses(DEFAULT_USES)}>
              reset uses
            </ChipButton>
          </ControlGroup>
          {uses.length >= MAX_USES && <Hint tone="muted">{MAX_USES} uses is the most this scene shows; reset to try another mix.</Hint>}
        </>,
      ]}
    >
      <div className="gp stage-pad">
        <WideRegion minWidth={480} label="Compiled copies: scroll sideways to see all of them">
          <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="gp-stamp-svg" role="img" aria-label={`${spellTemplate(l)} compiled into ${f.copies} cop${f.copies === 1 ? 'y' : 'ies'}`}>
            <SceneNode at={TEMPLATE_AT} w={200} h={48} title={spellTemplate(l)} sub="generic definition" tone="violet" on className="gp-node" />
            {l.strategy === 'monomorphised' &&
              shownArgs.map((a, i) => (
                <motion.g key={`${l.id}-${a}`} initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={POP}>
                  <line className="gp-stamp-edge" x1={TEMPLATE_AT.x} y1={TEMPLATE_AT.y + 24} x2={COPY_XS[i]} y2={COPY_Y - 26} />
                  <SceneNode at={{ x: COPY_XS[i], y: COPY_Y }} w={COPY_W} h={52} title={spellType(l, a)} sub={`T = ${l.args[a]}`} tone={a === currentArg ? 'hi' : 'info'} on className="gp-node" />
                </motion.g>
              ))}
            {l.strategy !== 'monomorphised' && f.done > 0 && (
              <motion.g key={`${l.id}-one`} initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={POP}>
                <line className="gp-stamp-edge" x1={TEMPLATE_AT.x} y1={TEMPLATE_AT.y + 24} x2={l.strategy === 'reified' ? 150 : TEMPLATE_AT.x} y2={COPY_Y - 26} />
                <SceneNode
                  at={{ x: l.strategy === 'reified' ? 150 : TEMPLATE_AT.x, y: COPY_Y }}
                  w={220}
                  h={52}
                  title={l.strategy === 'reified' ? `${spellTemplate(l)}, compiled once` : spellTemplate(l).replace('<T>', '')}
                  sub={l.id === 'java' ? 'T erased: holds Object' : l.id === 'ts' ? 'plain JavaScript, no types' : 'one definition in the DLL'}
                  tone={currentArg !== null ? 'hi' : 'info'}
                  on
                  className="gp-node"
                />
              </motion.g>
            )}
            {l.strategy === 'reified' && (
              <g>
                <text className="scene-zone" x={330} y={COPY_Y - 44}>
                  RUNTIME TYPES
                </text>
                {shownArgs.map((a, i) => (
                  <motion.g key={a} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={POP} className={`gp-rt tone-${a === currentArg ? 'hi' : 'info'}`}>
                    <rect x={330} y={COPY_Y - 34 + i * 30} width={150} height={24} rx={12} />
                    <text x={405} y={COPY_Y - 18 + i * 30} textAnchor="middle">
                      {spellType(l, a)}
                    </text>
                  </motion.g>
                ))}
              </g>
            )}
          </svg>
        </WideRegion>
        <div className="gp-row">
          <div className="gp-col">
            <CodePanel title={`uses · ${l.label}`} lines={uses.map((a, i) => sourceLineFor(l, a, i))} active={f.current} className="gp-code" />
          </div>
          <div className="gp-col">
            <ConsolePanel title={`${l.label}: fixed real output`} lines={demo} />
          </div>
        </div>
        <Hint block>
          Java, C#, Rust and C++ outputs are fixed, real compiler and runtime results, shown, not run. Code sizes are illustrative ({ILLUSTRATIVE_COPY_KB} KB a copy), not
          measured. C# nuance: .NET shares one native body for reference-type arguments and makes one per value type, but every argument stays visible at run time.
        </Hint>
      </div>
    </StageFrame>
  );
}
