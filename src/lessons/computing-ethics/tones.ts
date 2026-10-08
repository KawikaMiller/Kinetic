import type { Tone } from '../../core/tone';
import type { ImpactTone } from './cases';

/** The chip colour and the words for each kind of authored effect, shared by the case scene and the reasoning scene. */
export const IMPACT_TONE: Record<ImpactTone, Tone> = { harm: 'bad', handled: 'ok', benefit: 'muted', open: 'orange' };

export const IMPACT_WORD: Record<ImpactTone, string> = {
  harm: 'harm',
  handled: 'risk raised and handled',
  benefit: 'benefit or cost saved',
  open: 'trade-off still open',
};
