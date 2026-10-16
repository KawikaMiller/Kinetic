/** Events as log rows, with the colour meanings the lesson's `watch` text names. */
import type { LogRow } from '../../components/logRows';
import type { Tone } from '../../core/tone';
import type { AgentEvent, Phase } from './agent';
import { UNTRUSTED_MARKER } from './data';

export const PHASE_LABEL: Record<Phase, string> = { system: 'system', think: 'think', act: 'act', observe: 'observe', answer: 'answer', guard: 'guard' };

export const isUntrusted = (e: AgentEvent): boolean => e.phase === 'observe' && e.text.includes(UNTRUSTED_MARKER);

export function eventTone(e: AgentEvent): Tone {
  if (isUntrusted(e)) return 'orange';
  switch (e.phase) {
    case 'think': return 'info';
    case 'act': return 'hi';
    case 'observe': return e.ok === false ? 'bad' : 'ok';
    case 'answer': return 'violet';
    case 'guard': return /^waiting/.test(e.text) ? 'orange' : /^(rejected|denied|stopped)/.test(e.text) ? 'bad' : /^approved/.test(e.text) ? 'ok' : 'violet';
    case 'system': return 'muted';
  }
}

export const eventRows = (events: readonly AgentEvent[]): LogRow[] =>
  events.map((e) => ({
    id: e.id,
    at: `step ${e.step}`,
    tone: eventTone(e),
    source: isUntrusted(e) ? 'observe, untrusted' : PHASE_LABEL[e.phase],
    sourceTone: eventTone(e),
    text: e.text,
  }));

/** The loop phase an event lights in the diagram: guard events belong to the act phase. */
export const loopPhase = (e: AgentEvent | undefined): 'think' | 'act' | 'observe' | 'answer' | null =>
  !e ? null : e.phase === 'guard' || e.phase === 'system' ? 'act' : e.phase;
