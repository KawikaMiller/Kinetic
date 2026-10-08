import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { factorsCaption, pathsCaption } from './captions';
import {
  DEFAULT_PATHS, FACTORS, FACTOR_PRESETS, KIND_LABEL, KIND_TONE, PATHS, STRENGTH_LABEL, STRENGTH_TONE, isMultiFactor, kindsOf, weakestOf,
  type FactorKind,
} from './factors';

const KINDS: FactorKind[] = ['know', 'have', 'are'];
const DEFAULT_FACTORS = FACTOR_PRESETS[0].ids;

export function FactorsScene({ picker }: { picker: ReactNode }) {
  const [ids, setIds] = useState<string[]>(DEFAULT_FACTORS);
  const setCaption = useSetCaption();
  const multi = isMultiFactor(ids);
  const kinds = kindsOf(ids);

  useIntroCaption(<>Pick the ways someone signs in. Multi-factor needs two different kinds: something you know, something you have, something you are.</>);

  const set = (next: string[]) => {
    setIds(next);
    setCaption(factorsCaption(next), { quiet: true });
  };
  const toggle = (id: string) => set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Factors" value={ids.length} />
          <Stat label="Kinds" value={kinds.length} sub={kinds.map((k) => KIND_LABEL[k].toLowerCase()).join(', ') || 'none yet'} />
          <Stat label="Multi-factor?" value={ids.length === 0 ? '–' : multi ? 'yes' : 'no'} color={ids.length === 0 ? undefined : multi ? 'var(--ok)' : 'var(--bad)'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--sky)', label: 'know' }, { color: 'var(--amber)', label: 'have' }, { color: 'var(--pink)', label: 'are' }]} />}
      controls={[
        picker,
        <ControlGroup key="p" label="Presets">
          {FACTOR_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={ids.length === p.ids.length && p.ids.every((x) => ids.includes(x))} onClick={() => set(p.ids)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad mfa">
        <div className="mfa-kinds">
          {KINDS.map((k) => (
            <Box key={k} className={`mfa-kind tone-${KIND_TONE[k]}`}>
              <SectionTitle>Something you {k}</SectionTitle>
              <div className="mfa-chips">
                {FACTORS.filter((f) => f.kind === k).map((f) => (
                  <ChipButton key={f.id} tone={KIND_TONE[k]} size="md" on={ids.includes(f.id)} onStyle="solid" onClick={() => toggle(f.id)}>{f.label}</ChipButton>
                ))}
              </div>
            </Box>
          ))}
        </div>
        <p className={`log-row ${ids.length === 0 ? 'tone-dim' : multi ? 'tone-ok' : 'tone-bad'} mfa-verdict`}>
          {ids.length === 0
            ? 'Nothing chosen yet.'
            : multi
              ? `${kinds.length} different kinds: stealing one factor does not give the attacker the other.`
              : 'One kind only: a second password-like secret is still the same kind of thing to steal or guess.'}
        </p>
        <Hint block>This panel counts kinds, not factors: two of the same kind add little. Which factors survive phishing is the next scene.</Hint>
      </div>
    </StageFrame>
  );
}

export function PathsScene({ picker }: { picker: ReactNode }) {
  const [ids, setIds] = useState<string[]>(DEFAULT_PATHS);
  const setCaption = useSetCaption();
  const weakest = weakestOf(ids);

  useIntroCaption(<>Every way in that is enabled is a way for an attacker too, so the account is only as strong as the weakest one, recovery paths included.</>);

  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    setCaption(pathsCaption(next), { quiet: true });
  };

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Enabled ways in" value={ids.length} />
          <Stat
            label="Real strength"
            value={weakest ?? 'locked out'}
            color={weakest === null ? undefined : `var(--${STRENGTH_TONE[weakest]})`}
            sub={weakest ? 'the weakest enabled path' : 'no way in at all'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'phishing-resistant' },
            { color: 'var(--orange)', label: 'phishable' },
            { color: 'var(--bad)', label: 'weak' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="stage-pad mfa">
        {(['sign-in', 'recovery'] as const).map((role) => (
          <Box key={role}>
            <SectionTitle hint="click to enable or disable">{role === 'sign-in' ? 'Signing in' : 'Recovering the account'}</SectionTitle>
            <ul className="mfa-paths">
              {PATHS.filter((p) => p.role === role).map((p) => (
                <li key={p.id} className={`mfa-path ${ids.includes(p.id) ? 'is-on' : 'is-off'}`}>
                  <ChipButton tone={STRENGTH_TONE[p.strength]} size="md" on={ids.includes(p.id)} onStyle="solid" onClick={() => toggle(p.id)}>{p.label}</ChipButton>
                  <span className="mfa-risk"><b>{STRENGTH_LABEL[p.strength].split(':')[0]}.</b> {p.risk}</span>
                </li>
              ))}
            </ul>
          </Box>
        ))}
        <Hint block>Simplified: three strength levels and a weakest-link rule. Real recovery flows add waiting periods, notifications and identity checks.</Hint>
      </div>
    </StageFrame>
  );
}
