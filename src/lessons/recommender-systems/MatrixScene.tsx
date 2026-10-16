import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { matrixCaption } from './captions';
import { DATA } from './facts';
import { RATING_MAX, RATING_MIN, USERS } from './data';
import { MATRIX_DEFAULT } from './settings';
import { EMPTY_EDITS, NEW_USER, buildProblem, rateNewUser, toggleHidden, type Edits } from './problem';
import { RatingGrid } from './RatingGrid';

const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => ({ value: RATING_MIN + i, label: String(RATING_MIN + i) }));

export function MatrixScene({ picker, edits, setEdits }: { picker: ReactNode; edits: Edits; setEdits: (e: Edits) => void }) {
  const [showTruth, setShowTruth] = useState<boolean>(MATRIX_DEFAULT.showTruth);
  const [rateAs, setRateAs] = useState<number>(MATRIX_DEFAULT.rateAs);
  const problem = useMemo(() => buildProblem(DATA, edits), [edits]);
  const caption = matrixCaption(problem);
  const touched = edits.hidden.length > 0 || Object.keys(edits.newUser).length > 0;
  const press = (u: number, i: number) => setEdits(u === NEW_USER ? rateNewUser(edits, i, rateAs) : toggleHidden(DATA, edits, u, i));

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Ratings the model can see" value={problem.train.length - Object.keys(edits.newUser).length} sub={`of ${USERS * 15} cells, plus ${Object.keys(edits.newUser).length} from the new user`} />
          <Stat label="Held-out cells" value={problem.test.length} color="var(--violet)" sub="their true rating is hidden from the model" />
          <Stat label="Hidden by you" value={edits.hidden.length} color={edits.hidden.length ? 'var(--dim)' : undefined} sub="click an observed rating to hide it" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'an observed rating, deeper blue for higher', shape: 'square' },
            { color: 'var(--dim)', label: 'an observed rating you hid (outline)', shape: 'square' },
            { color: 'var(--muted)', label: 'grey digit: the held-out truth, shown on request', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Held-out truth" value={showTruth} onChange={setShowTruth} off="Hidden" on="Shown (for the test)" />
        </>,
        <>
          <Segmented label="New user rates" value={rateAs} onChange={setRateAs} options={RATINGS} />
          <Button softDisabled={!touched} onClick={() => setEdits(EMPTY_EDITS)}>Reset my edits</Button>
        </>,
      ]}
    >
      <div className="rec-stage stage-pad">
        <Box>
          <SectionTitle hint="12 users x 15 films, invented">Who rated what</SectionTitle>
          <RatingGrid problem={problem} mode={{ kind: 'ratings' }} showTruth={showTruth} onCellClick={press} ariaLabel="Ratings matrix: users down, films across" />
          <Hint tone="muted" block>Click an observed rating to hide it, or click a cell of the bottom row to rate a film as a brand-new user. Blank cells are unknown to the model.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative" seed={DATA.seed}>invented ratings from a hidden rank-2 structure plus noise</Provenance>
          <Provenance kind="toy">a toy: real systems have millions of users, implicit signals and approximate retrieval</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
