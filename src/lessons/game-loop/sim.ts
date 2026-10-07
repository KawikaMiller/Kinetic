// A tiny physics box and three game loops around it: variable dt, a fixed step with an
// accumulator (Glenn Fiedler's "Fix Your Timestep!"), and the same with render interpolation.
// Pure: the Stage feeds in real frame times, the tests feed in schedules.
import { lerp } from '../../core/math';

/** The box, in world units (px at scale 1). The thin wall spans the full height. */
export const WORLD = { w: 600, h: 300, r: 8, wallX: 380, wallHalf: 2, gravity: 900 } as const;
/** Half the width of the zone where the ball touches the thin wall: a step longer than 2 × this can jump it. */
export const HIT_HALF = WORLD.r + WORLD.wallHalf;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface World {
  ball: Ball;
  /** The ball before the latest physics step (what interpolation blends from). */
  prev: Ball;
  /** Physics steps taken so far. */
  steps: number;
  /** Times the ball crossed the thin wall without ever touching it. */
  tunnels: number;
  /** Simulated time since the start, in seconds. */
  time: number;
}

export const START: Ball = { x: 120, y: 90, vx: 300, vy: 0 };

export function createWorld(start: Ball = START): World {
  return { ball: { ...start }, prev: { ...start }, steps: 0, tunnels: 0, time: 0 };
}

/**
 * One physics step of dt seconds: semi-implicit Euler under gravity, then collisions checked
 * only where the ball ends up (discrete detection). A step that carries the ball from one side
 * of the thin wall to the other without ever overlapping it is a tunnel.
 */
export function step(w: World, dt: number): void {
  const b = w.ball;
  w.prev = { ...b };
  const side = Math.sign(b.x - WORLD.wallX);
  b.vy += WORLD.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.y + WORLD.r > WORLD.h) {
    b.y = WORLD.h - WORLD.r;
    b.vy = -Math.abs(b.vy);
  }
  if (b.y - WORLD.r < 0) {
    b.y = WORLD.r;
    b.vy = Math.abs(b.vy);
  }
  if (b.x - WORLD.r < 0) {
    b.x = WORLD.r;
    b.vx = Math.abs(b.vx);
  }
  if (b.x + WORLD.r > WORLD.w) {
    b.x = WORLD.w - WORLD.r;
    b.vx = -Math.abs(b.vx);
  }
  if (Math.abs(b.x - WORLD.wallX) < HIT_HALF) {
    // Touching the thin wall: push back to the side it came from and bounce.
    b.x = WORLD.wallX + side * HIT_HALF;
    b.vx = side * Math.abs(b.vx);
  } else if (Math.sign(b.x - WORLD.wallX) !== side) {
    w.tunnels++;
  }
  w.steps++;
  w.time += dt;
}

// ── Loops ───────────────────────────────────────────────────────────

export type LoopMode = 'variable' | 'fixed' | 'interpolated';
/** The fixed physics step: 60 updates per simulated second. */
export const DT = 1 / 60;
/** Longest frame time a capped loop will simulate; anything beyond is dropped (the game slows down). */
export const MAX_FRAME = 0.25;
/** Enough steps for MAX_FRAME plus a leftover just under DT, so a capped frame always empties the accumulator. */
export const MAX_STEPS = Math.floor(MAX_FRAME / DT) + 1;
/** With no max frame time, the lesson still stops here so your tab survives; a real game would keep climbing. */
export const SAFETY_STEPS = 20;

export interface LoopState {
  world: World;
  /** Unsimulated time carried to the next frame. */
  acc: number;
}

export const createLoop = (start?: Ball): LoopState => ({ world: createWorld(start), acc: 0 });

export interface FrameReport {
  /** Physics updates run this frame. */
  steps: number;
  /** Seconds of real time thrown away by the max-frame cap (or left in the backlog when uncapped). */
  dropped: number;
  /** Seconds still waiting to be simulated after this frame (≥ DT only when uncapped and behind). */
  backlog: number;
  /** How far between the last two physics states the render sits: acc / DT. */
  alpha: number;
  /** Where to draw the ball this frame. */
  render: Ball;
  /** The newest physics state. */
  physics: Ball;
}

export const lerpBall = (a: Ball, b: Ball, t: number): Ball => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), vx: b.vx, vy: b.vy });

/**
 * Advance one rendered frame that took `frameDt` seconds of real time. `onUpdate` runs once per
 * physics update (the Stage uses it to spend the "update cost" for real).
 */
export function advanceFrame(s: LoopState, frameDt: number, mode: LoopMode, capFrame: boolean, onUpdate?: () => void): FrameReport {
  const dt = capFrame ? Math.min(frameDt, MAX_FRAME) : frameDt;
  const cut = frameDt - dt;
  if (mode === 'variable') {
    step(s.world, dt);
    onUpdate?.();
    return { steps: 1, dropped: cut, backlog: 0, alpha: 1, render: { ...s.world.ball }, physics: { ...s.world.ball } };
  }
  s.acc += dt;
  const limit = capFrame ? MAX_STEPS : SAFETY_STEPS;
  let steps = 0;
  while (s.acc >= DT && steps < limit) {
    step(s.world, DT);
    onUpdate?.();
    s.acc -= DT;
    steps++;
  }
  const alpha = Math.min(s.acc / DT, 1);
  const physics = { ...s.world.ball };
  const render = mode === 'interpolated' ? lerpBall(s.world.prev, s.world.ball, alpha) : physics;
  return { steps, dropped: cut, backlog: s.acc >= DT ? s.acc : 0, alpha, render, physics };
}

// ── Lag spikes ──────────────────────────────────────────────────────

/** A spike is injected at most this often (seconds of real time)... */
export const SPIKE_EVERY = 3;
/** ...and only while the ball is heading at the thin wall and this close to touching it (world units). */
export const SPIKE_GAP = 40;

/** The worst moment for a spike: the ball is about to reach the thin wall. */
export function spikeReady(b: Ball): boolean {
  const heading = Math.sign(WORLD.wallX - b.x) === Math.sign(b.vx);
  const gap = Math.abs(WORLD.wallX - b.x) - HIT_HALF;
  return heading && gap > 0 && gap < SPIKE_GAP;
}

/** The tunnelling preset's spike: 250 ms carries the ball 75 units, far past the 20-unit contact zone. */
export const TUNNEL_SPIKE = 0.25;

// ── Frame timing, for the spiral of death ───────────────────────────

export interface TimingModel {
  /** Display refresh interval: a frame never takes less (seconds). */
  refresh: number;
  /** Render cost per frame (seconds). */
  render: number;
  /** Real cost of one physics update (seconds). */
  cost: number;
}

/**
 * Run `frames` frames where each frame's real duration is what the previous frame actually
 * spent (its updates × cost + render, at least one refresh) plus any injected spike.
 * Returns the updates per frame.
 */
export function runTimed(mode: LoopMode, capFrame: boolean, t: TimingModel, frames: number, spikeAt: (i: number) => number = () => 0): number[] {
  const s = createLoop();
  const counts: number[] = [];
  let lastSteps = 1;
  for (let i = 0; i < frames; i++) {
    const frameDt = Math.max(t.refresh, lastSteps * t.cost + t.render) + spikeAt(i);
    lastSteps = advanceFrame(s, frameDt, mode, capFrame).steps;
    counts.push(lastSteps);
  }
  return counts;
}

// ── Simulated displays ──────────────────────────────────────────────

export interface Machine {
  hz: number;
  loop: LoopState;
  frames: number;
  /** The ball after every physics update, in order: with fixed steps, the same code gives the same list on any display. */
  stepHistory: Ball[];
  /** The ball at each common instant every 1/COMMON_HZ s (both 30 and 144 Hz have a frame there). */
  common: Ball[];
  /** Rendered positions over the last TRAIL_SECONDS, for the trail. */
  trail: { x: number; y: number }[];
  last: FrameReport | null;
}

/** 30 Hz and 144 Hz frames line up every 1/6 s (5 and 24 frames). */
export const COMMON_HZ = 6;
/** Both trails cover the same span of simulated time, so equal physics draws equal trails. */
export const TRAIL_SECONDS = 2;

export function createMachine(hz: number): Machine {
  return { hz, loop: createLoop(), frames: 0, stepHistory: [], common: [], trail: [], last: null };
}

/** One frame of a simulated display: exactly 1/hz seconds, plus an optional injected spike. */
export function machineFrame(m: Machine, mode: LoopMode, spike = 0): void {
  const w = m.loop.world;
  m.last = advanceFrame(m.loop, 1 / m.hz + spike, mode, true, () => m.stepHistory.push({ ...w.ball }));
  m.frames++;
  if ((m.frames * COMMON_HZ) % m.hz === 0) m.common.push({ ...m.last.physics });
  m.trail.push({ x: m.last.render.x, y: m.last.render.y });
  if (m.trail.length > m.hz * TRAIL_SECONDS) m.trail.shift();
}

/**
 * How far apart two machines are. Fixed steps: the largest gap between their states at the same
 * step number. Variable dt: the gap at the latest instant both had a frame.
 */
export function machineGap(a: Machine, b: Machine, mode: LoopMode): { gap: number; compared: number } {
  const dist = (p: Ball, q: Ball) => Math.hypot(p.x - q.x, p.y - q.y);
  if (mode === 'variable') {
    const n = Math.min(a.common.length, b.common.length);
    return { gap: n ? dist(a.common[n - 1], b.common[n - 1]) : 0, compared: n };
  }
  const n = Math.min(a.stepHistory.length, b.stepHistory.length);
  let gap = 0;
  for (let i = 0; i < n; i++) gap = Math.max(gap, dist(a.stepHistory[i], b.stepHistory[i]));
  return { gap, compared: n };
}
