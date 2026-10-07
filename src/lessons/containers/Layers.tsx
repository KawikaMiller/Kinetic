import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { BAD, buildFrames, GOOD, SLOW_BUILD_SECONDS, type Change } from './frames';

const LAYER_SPRING = { type: 'spring', stiffness: 300, damping: 24 } as const;

/** Dockerfile layer caching: which layers a rebuild can reuse, depending on instruction order. */
export function Layers({ picker }: { picker: ReactNode }) {
  const [order, setOrder] = useState<'good' | 'bad'>('good');
  const [change, setChange] = useState<Change>('first');
  const file = order === 'good' ? GOOD : BAD;
  const frames = useMemo(() => buildFrames(file, change), [file, change]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Build time" value={`${f.seconds.toFixed(1)} s`} color={f.seconds > SLOW_BUILD_SECONDS ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Layers reused" value={`${f.statuses.filter((s) => s === 'cached').length}/${file.length}`} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'cached (reused)' },
            { color: 'var(--bad)', label: 'rebuilt (the slow, costly part)' },
            { color: 'var(--dim)', label: 'not reached yet' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Segmented
            label="Dockerfile"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'good', label: 'Deps first (good)' },
              { value: 'bad', label: 'Copy everything first' },
            ]}
          />
          <Segmented
            label="Build"
            value={change}
            onChange={setChange}
            options={[
              { value: 'first', label: 'First build' },
              { value: 'code', label: 'Edit source code' },
              { value: 'deps', label: 'Edit package.json' },
            ]}
          />
          <Hint block>
            Illustrative timings and sizes, not a measured build. The cache rule is Docker's: a layer is reused only if its
            instruction, its copied files and every layer below it are unchanged.
          </Hint>
        </Controls>
      }
    >
      <div className="ct-layers">
        <div className="ct-dockerfile">
          <span className="ct-label">Dockerfile</span>
          <ol>
            {file.map((ins, i) => (
              <li key={ins.text} className={`${f.statuses[i]} ${f.current === i ? 'on' : ''}`}>
                <span className="ct-ln">{i + 1}</span>
                <code>{ins.text}</code>
                <em>{f.statuses[i] === 'cached' ? 'CACHED' : f.statuses[i] === 'built' ? `${ins.seconds}s` : ''}</em>
              </li>
            ))}
          </ol>
        </div>
        <div className="ct-image">
          <span className="ct-label">image = stack of read-only layers</span>
          <div className="ct-layerstack">
            <AnimatePresence initial={false}>
              {file.map((ins, i) =>
                f.statuses[i] === 'pending' ? null : (
                  <motion.div
                    key={`${order}-${change}-${i}`}
                    className={`ct-layer ${f.statuses[i]}`}
                    initial={{ opacity: 0, y: -40, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={LAYER_SPRING}
                  >
                    <span>{ins.what}</span>
                    <b>{ins.size}</b>
                  </motion.div>
                ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}
