import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetCaption } from './caption';
import type { Frame } from './types';

export interface PlayerOptions {
  /** Base milliseconds per frame at 1× speed. */
  interval?: number;
  /** Start playing on first mount. */
  autoplay?: boolean;
  /** Start playing from the top whenever `frames` changes identity (default true). */
  autoplayOnChange?: boolean;
  /** Bind Space / ← / → / R to this player (default true). */
  keyboard?: boolean;
}

export interface Player<F extends Frame> {
  frame: F;
  index: number;
  count: number;
  playing: boolean;
  atEnd: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: (delta: number) => void;
  seek: (index: number) => void;
  restart: () => void;
  /**
   * Override what happens the next time `frames` changes, instead of the
   * blanket `autoplayOnChange`. Call it in the same handler that changes the
   * lesson's input, e.g. editing a board rewinds silently, but picking a new
   * algorithm plays, or adding a request jumps straight to its frames:
   *   player.queueNext({ play: true, from: oldFrames.length })
   */
  queueNext: (next: { play: boolean; from?: number }) => void;
}

/**
 * Drives a precomputed list of frames: play / pause / step / scrub / speed.
 * Precomputing frames means stepping backwards is free and every state is
 * reproducible. Pair with <Transport player={...} />.
 */
export function usePlayer<F extends Frame>(frames: F[], opts: PlayerOptions = {}): Player<F> {
  const { interval = 900, autoplay = false, autoplayOnChange = true, keyboard = true } = opts;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState(1);
  const [prevFrames, setPrevFrames] = useState(frames);
  const [queued, setQueued] = useState<{ play: boolean; from?: number } | null>(null);
  const setCaption = useSetCaption();

  // New frames (e.g. the learner picked a different input): rewind, or do
  // whatever queueNext() asked for.
  if (frames !== prevFrames) {
    setPrevFrames(frames);
    setIndex(Math.max(0, Math.min(frames.length - 1, queued?.from ?? 0)));
    setPlaying(queued ? queued.play : autoplayOnChange);
    setQueued(null);
  }

  const last = Math.max(0, frames.length - 1);
  const i = Math.min(index, last);
  const frame = frames[i];

  useEffect(() => {
    if (frame && frame.say !== undefined) setCaption(frame.say, { quiet: frame.quiet });
  }, [frame, setCaption]);

  useEffect(() => {
    if (!playing || i >= last) return;
    const hold = frames[i]?.hold ?? 1;
    const t = setTimeout(() => {
      setIndex(i + 1);
      if (i + 1 >= last) setPlaying(false);
    }, (interval * hold) / speed);
    return () => clearTimeout(t);
  }, [playing, i, last, interval, speed, frames]);

  const play = useCallback(() => {
    if (i >= last) setIndex(0);
    setPlaying(true);
  }, [i, last]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);
  const seek = useCallback((n: number) => setIndex(Math.max(0, Math.min(last, n))), [last]);
  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      seek(i + delta);
    },
    [i, seek],
  );
  const restart = useCallback(() => {
    setIndex(0);
    setPlaying(true);
  }, []);

  // Keep the latest handlers reachable from a single long-lived listener.
  const keys = useRef({ toggle, step, restart });
  useEffect(() => {
    keys.current = { toggle, step, restart };
  });

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        keys.current.toggle();
      } else if (e.key === 'ArrowRight') keys.current.step(1);
      else if (e.key === 'ArrowLeft') keys.current.step(-1);
      else if (e.key === 'r' || e.key === 'R') keys.current.restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard]);

  return {
    frame, index: i, count: frames.length, playing, atEnd: i >= last,
    speed, setSpeed, play, pause, toggle, step, seek, restart, queueNext: setQueued,
  };
}
