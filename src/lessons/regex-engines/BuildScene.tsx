import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import { NfaDrawing } from './NfaDrawing';
import { OPENING, PRESETS } from './opening';
import { countParts } from './regexParse';
import { PresetChips, RegexFields } from './RegexFields';
import { constructionOf, placeNfa } from './thompson';
import { useRegexInput } from './useRegexInput';

const BUILD_INTERVAL_MS = 900;

/** Scene 1: a pattern becomes a machine, one fragment at a time. */
export function BuildScene({ picker }: { picker: ReactNode }) {
  const input = useRegexInput(OPENING.build.pattern, OPENING.build.subject, { automaton: true });
  const construction = useMemo(() => constructionOf(input.parsed), [input.parsed]);
  const placement = useMemo(() => placeNfa(construction), [construction]);
  const frames = useMemo(() => buildFrames(input.parsed, construction), [input.parsed, construction]);
  const player = usePlayer(frames, { interval: BUILD_INTERVAL_MS, autoplayOnChange: false });
  const f = player.frame;
  const parts = useMemo(() => countParts(input.parsed.root), [input.parsed]);
  const bound = 2 * (parts.atoms + parts.operators);
  const done = player.atEnd;

  return (
    <StageFrame
      player={player}
      height={360}
      stats={
        <Stats>
          <Stat label="States" value={`${f.states} of ${construction.nfa.states.length}`} color="var(--violet)" sub={`Thompson bound ${bound}: 2 x (${parts.atoms} atoms + ${parts.operators} operators)`} />
          <Stat label="ε arrows" value={f.epsilons} color="var(--dim)" sub="arrows that read no character" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'fragment just built', shape: 'square' },
            { color: 'var(--info)', label: 'arrow that consumes a character', shape: 'line' },
            { color: 'var(--dim)', label: 'ε arrow (dashed)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips presets={PRESETS} input={input} />
        </>,
        <>
          <RegexFields input={input} withSubject={false} />
        </>,
      ]}
    >
      <div className="re-stage stage-pad">
        <NfaDrawing
          construction={construction}
          placement={placement}
          visibleTo={f.built}
          fresh={done ? -1 : f.built}
          ends={done}
          ariaLabel={`NFA for ${input.parsed.source}: ${f.states} of ${construction.nfa.states.length} states built`}
        />
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a small regex dialect: literals, dot, sets, | * + ? and groups; not your browser's engine</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
