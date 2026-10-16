import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { funnelCaption } from './captions';
import { DEFAULT_SEED, FILM_TITLES, ITEMS, USERS } from './data';
import { DATA, referenceFor } from './facts';
import { CANDIDATES, SHOWN, candidates, itemFeatures, rank } from './funnel';
import { buildProblem, type Edits } from './problem';
import { FUNNEL_DEFAULT } from './settings';

export function FunnelScene({ picker, edits }: { picker: ReactNode; edits: Edits }) {
  const [user, setUser] = useState<number>(FUNNEL_DEFAULT.user);
  const [weightPct, setWeightPct] = useState<number>(FUNNEL_DEFAULT.popularityPct);
  const problem = useMemo(() => buildProblem(DATA, edits), [edits]);
  const run = useMemo(() => referenceFor(problem), [problem]);
  const features = useMemo(() => itemFeatures(DEFAULT_SEED), []);
  const cands = useMemo(() => candidates(problem, run, user), [problem, run, user]);
  const ranked = useMemo(() => rank(cands, features, weightPct / 100), [cands, features, weightPct]);
  const plain = useMemo(() => rank(cands, features, 0).map((r) => r.item), [cands, features]);
  const shown = ranked.map((r) => r.item);
  const caption = funnelCaption(user, shown, plain, weightPct);

  return (
    <StageFrame
      height={450}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Catalogue" value={ITEMS} color="var(--dim)" sub="films here; millions in a real system (illustrative)" />
          <Stat label="Candidates" value={cands.length} color="var(--info)" sub={`the best ${CANDIDATES} unrated by dot product; thousands in practice (illustrative)`} />
          <Stat label="Shown" value={SHOWN} color="var(--hi)" sub="tens in practice (illustrative)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'candidate generation: exact dot product', shape: 'square' },
            { color: 'var(--violet)', label: 'ranker: model plus invented popularity and freshness', shape: 'square' },
            { color: 'var(--hi)', label: 'the films shown', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="User" value={user + 1} min={1} max={USERS} onChange={(v) => setUser(v - 1)} />
          <Slider label="Weight on popularity" value={weightPct} min={0} max={100} step={10} onChange={setWeightPct} format={(v) => `${v}%`} />
        </>,
      ]}
    >
      <div className="rec-stage stage-pad">
        <div className="rec-funnel">
          <Box>
            <SectionTitle hint="stage 1">Candidates by dot product</SectionTitle>
            <ol className="rec-list">
              {cands.map((c) => (
                <li key={c.item} className="rec-row is-info">{FILM_TITLES[c.item]} <span>{c.dot.toFixed(2)}</span></li>
              ))}
            </ol>
          </Box>
          <Box>
            <SectionTitle hint="stage 2">Ranker's order</SectionTitle>
            <ol className="rec-list">
              {ranked.map((r, n) => (
                <li key={r.item} className={`rec-row ${n < SHOWN ? 'is-shown' : 'is-violet'}`}>
                  {FILM_TITLES[r.item]} <span>{r.score.toFixed(2)}{n < SHOWN && !plain.slice(0, SHOWN).includes(r.item) ? ' moved up' : ''}</span>
                </li>
              ))}
            </ol>
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="illustrative" seed={DATA.seed}>invented ratings; popularity and freshness are invented numbers, not measured</Provenance>
          <Provenance kind="toy">15 films: the exact dot-product search here is approximate nearest-neighbour search at scale; counts like millions are illustrative</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
