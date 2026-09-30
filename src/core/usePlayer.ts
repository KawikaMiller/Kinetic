import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetCaption } from './caption';
import { useRegisterPlayer } from './playerRegistry';
import type { Frame } from './types';

export type ShortcutAction = 'toggle' | 'forward' | 'back' | 'restart';

/** Where typing happens: no shortcut may fire while focus is here. */
const TEXT_ENTRY = 'input, select, textarea, [contenteditable]';
/** Controls that Space activates natively (or via role): Space must press them, not toggle playback. */
const SPACE_ACTIVATES = 'button, a[href], summary, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="link"], [role="menuitem"]';

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}
interface TargetLike {
  closest(selector: string): unknown;
}

/** Which player shortcut a keydown means, or null to leave the key alone. Pure, for testing. */
export function shortcutFor(e: KeyLike, target: TargetLike | null): ShortcutAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (target?.closest(TEXT_ENTRY)) return null;
  switch (e.key) {
    case ' ':
      return target?.closest(SPACE_ACTIVATES) ? null : 'toggle';
    case 'ArrowRight':
      return 'forward';
    case 'ArrowLeft':
      return 'back';
    case 'r':
    case 'R':
      return 'restart';
    default:
      return null;
  }
}

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
  // Nothing left to play (a one-frame player, or already on the last frame): never report "playing".
  const isPlaying = playing && i < last;
  useRegisterPlayer(keyboard);

  useEffect(() => {
    if (frame && frame.say !== undefined) setCaption(frame.say, { quiet: frame.quiet });
  }, [frame, setCaption]);

  useEffect(() => {
    if (!isPlaying) return;
    const hold = frames[i]?.hold ?? 1;
    const t = setTimeout(() => {
      setIndex(i + 1);
      if (i + 1 >= last) setPlaying(false);
    }, (interval * hold) / speed);
    return () => clearTimeout(t);
  }, [isPlaying, i, last, interval, speed, frames]);

  const play = useCallback(() => {
    if (last === 0) return; // a single frame has nothing to play
    if (i >= last) setIndex(0);
    setPlaying(true);
  }, [i, last]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (isPlaying ? pause() : play()), [isPlaying, play, pause]);
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
    setPlaying(last > 0);
  }, [last]);

  // Keep the latest handlers reachable from a single long-lived listener.
  const keys = useRef({ toggle, step, restart });
  useEffect(() => {
    keys.current = { toggle, step, restart };
  });

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const action = shortcutFor(e, target);
      if (action === 'toggle') {
        e.preventDefault(); // keep Space from scrolling the page
        keys.current.toggle();
      } else if (action === 'forward') keys.current.step(1);
      else if (action === 'back') keys.current.step(-1);
      else if (action === 'restart') keys.current.restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard]);

  return {
    frame, index: i, count: frames.length, playing: isPlaying, atEnd: i >= last,
    speed, setSpeed, play, pause, toggle, step, seek, restart, queueNext: setQueued,
  };
}
