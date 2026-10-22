import { Box, SectionTitle } from '../../components/Panel';
import { Provenance } from '../../components/ui';
import { joinList } from '../../core/format';
import type { Model } from '../../core/memModel';
import { MODEL_FULL, NOT_COVERED, RULES, WEAK_LIMITS, scTagNote } from './model';

/** The rules of the chosen model, in the stage, with the persistent "a model, not your CPU" chip (AC-0/T4 #31). */
export function RulesPanel({ model }: { model: Model }) {
  return (
    <Box className="moa-rules">
      <SectionTitle hint={`rules of the ${MODEL_FULL[model]} model`}>The model</SectionTitle>
      <Provenance kind="simulated">a model of memory ordering, not your CPU: it says what the model allows, not what a given chip does</Provenance>
      <ul className="moa-list">
        {RULES[model].map((r) => <li key={r}>{r}</li>)}
      </ul>
      <p className="moa-note">Not covered by any of the three models: {joinList(NOT_COVERED)}.</p>
      {model === 'relaxed' && <p className="moa-note">{WEAK_LIMITS} {scTagNote()}</p>}
    </Box>
  );
}
