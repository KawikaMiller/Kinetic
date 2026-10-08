// Damage limitation: suppose a script the page owner never wrote got into the page. What can it
// reach, given which layers are on? The "script" is a labelled placeholder in this model; nothing
// runs. Every row of the table is a decision from the four toggles.

export interface Layers {
  /** A strict Content Security Policy: scripts only from the site itself or carrying the page's one-time nonce. */
  csp: boolean;
  /** The session cookie is HttpOnly: page scripts cannot read it. */
  httpOnly: boolean;
  /** The session cookie is SameSite=Lax or Strict. */
  sameSite: boolean;
  /** Sessions end after a short idle time instead of weeks. */
  shortSession: boolean;
}

export type LayerId = keyof Layers;

export const LAYER_IDS: LayerId[] = ['csp', 'httpOnly', 'sameSite', 'shortSession'];

export const LAYER_LABELS: Record<LayerId, string> = {
  csp: 'CSP (strict, nonce)',
  httpOnly: 'HttpOnly cookie',
  sameSite: 'SameSite cookie',
  shortSession: 'Short sessions',
};

/** Illustrative session lifetimes, in minutes. */
export const SHORT_SESSION_MIN = 15;
export const LONG_SESSION_MIN = 30 * 24 * 60;

export type OutcomeId = 'runs' | 'readsPage' | 'readsCookie' | 'actsAsUser' | 'reuse';

export interface Outcome {
  id: OutcomeId;
  label: string;
  reached: boolean;
  /** The layer that kept it out of reach, or null when it was reached. */
  stoppedBy: LayerId | null;
  /** For `reuse`: how long a copied session would stay valid, in minutes. */
  windowMin?: number;
}

export const OUTCOME_LABELS: Record<OutcomeId, string> = {
  runs: 'The unwanted script runs',
  readsPage: 'It can read what the page shows',
  readsCookie: 'It can read the session cookie',
  actsAsUser: 'It can act as the user on this site',
  reuse: 'A copied session works elsewhere',
};

export const ALL_OFF: Layers = { csp: false, httpOnly: false, sameSite: false, shortSession: false };

/** The reach table: one decision per outcome, each naming the layer responsible when it is blocked. */
export function reach(l: Layers): Outcome[] {
  const runs = !l.csp;
  const cookieReadable = runs && !l.httpOnly;
  const cookieStopper: LayerId | null = !runs ? 'csp' : l.httpOnly ? 'httpOnly' : null;
  return [
    { id: 'runs', label: OUTCOME_LABELS.runs, reached: runs, stoppedBy: l.csp ? 'csp' : null },
    { id: 'readsPage', label: OUTCOME_LABELS.readsPage, reached: runs, stoppedBy: runs ? null : 'csp' },
    { id: 'readsCookie', label: OUTCOME_LABELS.readsCookie, reached: cookieReadable, stoppedBy: cookieStopper },
    // Requests the script makes come from the site itself, so the browser attaches the cookie
    // whatever HttpOnly or SameSite say: only keeping the script from running prevents this.
    { id: 'actsAsUser', label: OUTCOME_LABELS.actsAsUser, reached: runs, stoppedBy: runs ? null : 'csp' },
    {
      id: 'reuse',
      label: OUTCOME_LABELS.reuse,
      reached: cookieReadable,
      stoppedBy: cookieStopper,
      windowMin: cookieReadable ? (l.shortSession ? SHORT_SESSION_MIN : LONG_SESSION_MIN) : undefined,
    },
  ];
}

export const reachedCount = (l: Layers) => reach(l).filter((o) => o.reached).length;

/** The layers that, in this configuration, stopped at least one outcome. */
export const activeStoppers = (l: Layers): LayerId[] => {
  const stoppers = new Set(reach(l).map((o) => o.stoppedBy));
  return LAYER_IDS.filter((id) => stoppers.has(id));
};

export const layersFromMask = (mask: number): Layers => ({
  csp: (mask & 1) !== 0,
  httpOnly: (mask & 2) !== 0,
  sameSite: (mask & 4) !== 0,
  shortSession: (mask & 8) !== 0,
});

export const LAYER_COMBINATIONS = 16;

/** A session window in plain words. */
export const windowText = (min: number) => (min >= 24 * 60 ? `${Math.round(min / (24 * 60))} days` : `${min} minutes`);
