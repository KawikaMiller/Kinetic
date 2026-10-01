/** A commit as the graph needs it: which lane (row) it sits on and what it points back to. */
export interface GraphCommitShape {
  id: string;
  lane: number;
  parents: readonly string[];
  /**
   * Horizontal slot. Omitted: the commit's position in the list (one column each).
   * Give it to let parallel work share a column, e.g. from depthColumns().
   */
  column?: number;
}

export interface CommitGraphSpacing {
  /** Horizontal distance between consecutive commits. */
  col: number;
  /** Vertical distance between lanes. */
  row: number;
  padX: number;
  padY: number;
  /** Room under the last lane for commit messages. */
  bottomRoom: number;
}

export const DEFAULT_SPACING: CommitGraphSpacing = { col: 66, row: 96, padX: 44, padY: 70, bottomRoom: 40 };

export interface CommitGraphLayout {
  /** Centre of a commit, or undefined for an unknown id. */
  at: (id: string) => { x: number; y: number } | undefined;
  width: number;
  height: number;
}

/**
 * Place commits left to right (oldest first) on their lane's row: in list order, one
 * column each, unless a commit gives its own `column`. `gutter` is extra room on the left
 * (for lane labels). Pure; the drawing lives in components/CommitGraph.
 */
export function layoutCommitGraph(
  commits: readonly GraphCommitShape[],
  s: CommitGraphSpacing = DEFAULT_SPACING,
  gutter = 0,
): CommitGraphLayout {
  const column = new Map(commits.map((c, i) => [c.id, c.column ?? i]));
  const lane = new Map(commits.map((c) => [c.id, c.lane]));
  const maxLane = commits.length ? Math.max(...commits.map((c) => c.lane)) : 0;
  const maxColumn = commits.length ? Math.max(...column.values()) : 0;
  return {
    at: (id) => {
      const i = column.get(id);
      return i === undefined ? undefined : { x: gutter + s.padX + i * s.col, y: s.padY + lane.get(id)! * s.row };
    },
    // Exactly as wide as the commits need: extra width would only make an empty scroll area.
    width: gutter + s.padX * 2 + Math.max(0, maxColumn) * s.col,
    height: s.padY + maxLane * s.row + s.bottomRoom,
  };
}

/**
 * Columns by history depth: each commit sits one column after its latest parent, so work
 * done in parallel (several developers the same day) shares a column instead of each commit
 * taking its own. Parents must come before children in the list.
 */
export function depthColumns(commits: readonly GraphCommitShape[]): Map<string, number> {
  const depth = new Map<string, number>();
  for (const c of commits) {
    const parentDepths = c.parents.map((p) => depth.get(p)).filter((d): d is number => d !== undefined);
    depth.set(c.id, parentDepths.length ? Math.max(...parentDepths) + 1 : 0);
  }
  return depth;
}

/** Approximate width of one character of a commit message (10px Inter). */
export const MESSAGE_CHAR_W = 5.6;

/** With messageFit="truncate", a commit with nobody beside it still stops at this many characters. */
export const MAX_FITTED_MESSAGE_CHARS = 28;

/**
 * Messages cut to the room up to their nearest same-lane neighbour, so they don't run
 * into the next commit's message. Unlike shortMessage() there's no fixed 12-character
 * cap: a message keeps as much as fits, up to MAX_FITTED_MESSAGE_CHARS.
 */
export function fitMessages(
  commits: readonly (GraphCommitShape & { message?: string })[],
  at: (id: string) => { x: number; y: number } | undefined,
): Map<string, string> {
  const byLane = new Map<number, { id: string; x: number }[]>();
  for (const c of commits) {
    const p = at(c.id);
    if (p) byLane.set(c.lane, [...(byLane.get(c.lane) ?? []), { id: c.id, x: p.x }]);
  }
  const room = new Map<string, number>();
  for (const row of byLane.values()) {
    row.sort((a, b) => a.x - b.x);
    row.forEach((c, i) => {
      const gaps = [row[i - 1] && c.x - row[i - 1].x, row[i + 1] && row[i + 1].x - c.x].filter((g): g is number => !!g);
      room.set(c.id, gaps.length ? Math.min(...gaps) : Infinity);
    });
  }
  const out = new Map<string, string>();
  for (const c of commits) {
    if (!c.message) continue;
    const fits = Math.min(MAX_FITTED_MESSAGE_CHARS, Math.floor((room.get(c.id) ?? Infinity) / MESSAGE_CHAR_W));
    out.set(c.id, c.message.length <= fits ? c.message : fits >= 2 ? `${c.message.slice(0, fits - 1)}…` : '');
  }
  return out;
}

/** Path from a parent to its child: a straight line on one lane, an S-curve across lanes. */
export function commitEdgePath(a: { x: number; y: number }, b: { x: number; y: number }, col: number): string {
  if (a.y === b.y) return `M${a.x},${a.y} L${b.x},${b.y}`;
  const bend = col * 0.6;
  return `M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}`;
}

const LANE_COLORS = ['var(--info)', 'var(--violet)', 'var(--t1)', 'var(--t4)', 'var(--t3)'];

/** Ring and edge colour per lane (branch): cycles through five distinct tokens. */
export const defaultLaneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

/** Commit messages longer than this are cut with an ellipsis under the node. */
export const MAX_MESSAGE_CHARS = 12;

export const shortMessage = (msg: string) => (msg.length > MAX_MESSAGE_CHARS ? `${msg.slice(0, MAX_MESSAGE_CHARS - 1)}…` : msg);
