import type { Player } from '../core/usePlayer';
import type { Frame } from '../core/types';

const SPEEDS = [0.5, 1, 2, 4];

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d={d} fill="currentColor" />
  </svg>
);

const ICONS = {
  restart: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  back: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
  fwd: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
};

/** Play / pause / step / scrub / speed controls for a usePlayer() instance. */
export function Transport<F extends Frame>({ player }: { player: Player<F> }) {
  const { index, count, playing, speed } = player;
  const pct = count > 1 ? (index / (count - 1)) * 100 : 0;

  return (
    <div className="transport">
      <div className="transport-buttons">
        <button type="button" className="tbtn" title="Restart (R)" onClick={player.restart}>
          <Icon d={ICONS.restart} />
        </button>
        <button type="button" className="tbtn" title="Step back (←)" onClick={() => player.step(-1)} disabled={index === 0}>
          <Icon d={ICONS.back} />
        </button>
        <button
          type="button"
          className="tbtn tbtn-play"
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={player.toggle}
        >
          <Icon d={playing ? ICONS.pause : ICONS.play} />
        </button>
        <button type="button" className="tbtn" title="Step forward (→)" onClick={() => player.step(1)} disabled={player.atEnd}>
          <Icon d={ICONS.fwd} />
        </button>
      </div>

      <input
        className="scrub"
        type="range"
        min={0}
        max={Math.max(0, count - 1)}
        value={index}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => {
          player.pause();
          player.seek(Number(e.target.value));
        }}
        aria-label="Timeline"
      />

      <span className="tcount">
        {index + 1}<span>/{count}</span>
      </span>

      <div className="tspeed" role="radiogroup" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={s === speed ? 'on' : ''} onClick={() => player.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
