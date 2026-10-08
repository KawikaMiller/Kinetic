import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSetCaption } from './caption';
import { useRegisterPlayer } from './playerRegistry';
import type { Frame } from './types';

export type ShortcutAction = 'toggle' | 'forward' | 'back' | 'restart';

/** Where typing happens: no shortcut may fire while focus is here. */
const TEXT_ENTRY = 'input, select, textarea, [contenteditable]';
/** Controls that Space activates natively (or via role): Space must press them, not toggle playback. */
const SPACE_ACTIVATES = 'button, a[href], summary, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="link"], [role="menuitem"]';
/** Widgets where ←/→ move a selection (radio groups, tab lists, sliders): they own the arrows. */
const ARROWS_MOVE_SELECTION = '[role="radiogroup"], [role="radio"], [role="tablist"], [role="tab"], [role="slider"], [role="listbox"], [role="menu"]';

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** Set when a handler nearer the target already used the key (a composite widget's arrows). */
  defaultPrevented?: boolean;
}
interface TargetLike {
  closest(selector: string): unknown;
}

/** Which player shortcut a keydown means, or null to leave the key alone. Pure, for testing. */
export function shortcutFor(e: KeyLike, target: TargetLike | null): ShortcutAction | null {
  if (e.defaultPrevented) return null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (target?.closest(TEXT_ENTRY)) return null;
  switch (e.key) {
    case ' ':
      return target?.closest(SPACE_ACTIVATES) ? null : 'toggle';
    case 'ArrowRight':
      return target?.closest(ARROWS_MOVE_SELECTION) ? null : 'forward';
    case 'ArrowLeft':
      return target?.closest(ARROWS_MOVE_SELECTION) ? null : 'back';
    case 'r':
    case 'R':
      return 'restart';
    default:
      return null;
  }
}

/**
 * For each frame, the index of the frame whose caption it shows: itself when it has a `say`,
 * else the nearest earlier frame with one (-1: no caption yet, so the intro caption stays).
 * The player resolves captions through this, so jumping or scrubbing to a frame without `say`
 * shows exactly what playing up to it would have shown. Pure, for testing.
 */
export function captionSources(frames: readonly Frame[]): number[] {
  let source = -1;
  return frames.map((f, i) => {
    if (f.say !== undefined) source = i;
    return source;
  });
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

  // The caption comes from the last frame at or before `i` that has one, not from wherever the
  // player was before a jump. Keyed on that source frame, so stepping through frames without
  // `say` doesn't re-set (and re-fade) the caption, and a caption the stage set itself stays.
  const sources = useMemo(() => captionSources(frames), [frames]);
  const captionFrame = frames[sources[i] ?? -1];
  useEffect(() => {
    if (captionFrame) setCaption(captionFrame.say, { quiet: captionFrame.quiet });
  }, [captionFrame, setCaption]);

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
