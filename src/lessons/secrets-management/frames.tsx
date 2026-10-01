import type { Frame } from '../../core/types';
import { LEAK_HISTORY } from './model';

export interface LeakFrame extends Frame {
  /** How many commits exist so far. */
  commits: number;
  pushed: boolean;
  found: boolean;
  misused: boolean;
  /** Timeline rows visible so far. */
  events: number;
}

export interface TimelineEvent {
  at: string;
  text: string;
  tone: 'info' | 'bad' | 'dim';
}

export const TIMELINE: TimelineEvent[] = [
  { at: '09:14:02', text: 'Hard-codes the Stripe key in config.js to get payments working.', tone: 'info' },
  { at: '09:14:30', text: 'git commit -m "add payments"', tone: 'info' },
  { at: '09:14:41', text: 'git push → github.com/acme/shop (public)', tone: 'info' },
  { at: '09:15:20', text: 'A scanner bot matched the key\'s pattern in the push.', tone: 'bad' },
  { at: '09:17:05', text: 'The key starts being used: 214 API calls nobody at acme made.', tone: 'bad' },
];

/** The scripted leak, one frame per event. */
export function leakFrames(): LeakFrame[] {
  const blank = { commits: 1, pushed: false, found: false, misused: false };
  return [
    { ...blank, events: 0, say: <>A developer wants payments working today. The secret key is right there in the dashboard…</> },
    { ...blank, events: 1, say: <>It goes straight into <code>config.js</code>. Red is the <span className="hl bad">secret</span>.</> },
    { ...blank, commits: LEAK_HISTORY.length, events: 2, say: <>Committed. The key is now part of the repository&apos;s history, in commit <code>{LEAK_HISTORY[1].id}</code>.</> },
    { ...blank, commits: LEAK_HISTORY.length, pushed: true, events: 3, say: <>Pushed to a <b>public</b> repository. From this moment it&apos;s published.</> },
    { ...blank, commits: LEAK_HISTORY.length, pushed: true, found: true, events: 4, hold: 1.4, say: <>Under a minute later a <span className="hl bad">scanner bot</span> has it. Bots watch public pushes for exactly these patterns.</> },
    { commits: LEAK_HISTORY.length, pushed: true, found: true, misused: true, events: 5, hold: 2, say: <>Minutes later it&apos;s being used. <b>The key you committed is already public</b>: switch to &quot;Fix it&quot; to see what helps.</> },
  ];
}
