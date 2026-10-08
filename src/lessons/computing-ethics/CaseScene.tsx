import { useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { InlineText } from '../../components/InlineText';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useMediaQuery } from '../../components/useMediaQuery';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { principle, type PrincipleId } from './acm';
import { choiceBasis, type Choice, type CaseNode, type EthicsCase, type Impact } from './cases';
import { PrincipleChips } from './PrincipleChips';
import { IMPACT_TONE, IMPACT_WORD } from './tones';
import { markEdge, markNode, type Progress } from './progress';
import { advance, back, edgeKey, isDecision, mapOf, nodeOf, pick, startWalk, summarisePath } from './walk';

const MAP_LAYER_GAP = 150;
const MAP_PAD = 60;
const MAP_BOX = { w: 122, h: 36 };
const MAP_TEXT_PX = 10;
const WIDE_QUERY = '(max-width: 900px)';

const WHO = [['users', 'Users'], ['team', 'The team'], ['you', 'You']] as const;

function ImpactCard({ who, impact }: { who: string; impact: Impact }) {
  return (
    <div className={`ce-impact tone-${IMPACT_TONE[impact.tone]}`}>
      <span className="ce-impact-who">{who}</span>
      <span className="chip">{IMPACT_WORD[impact.tone]}</span>
      <span>{impact.text}</span>
    </div>
  );
}

function endBasisLabel(node: Extract<CaseNode, { kind: 'end' }>) {
  return node.basis === 'history' ? 'History' : node.basis === 'what-if' ? 'What-if, not a prediction' : 'Illustrative, not a prediction';
}

export function CaseScene({ picker, c, progress, onProgress }: { picker: ReactNode; c: EthicsCase; progress: Progress; onProgress: (p: Progress) => void }) {
  const [openPrinciple, setOpenPrinciple] = useState<PrincipleId | null>(null);
  const [showMap, setShowMap] = useState(false);
  const narrow = useMediaQuery(WIDE_QUERY);
  const setCaption = useSetCaption();
  useIntroCaption(<>{c.fictional ? 'A fictional case.' : 'A case from history.'} Choose what a responsible engineer would push for; the outcome shows authored, labelled consequences. There is no score.</>, [c.id]);

  const { walk } = progress;
  const node = nodeOf(c, walk.at);
  const map = mapOf(c);
  const step = walk.path.length + 1;
  const picked = isDecision(node) && walk.picked ? node.choices.find((x) => x.id === walk.picked) : undefined;

  const update = (next: Progress) => onProgress(next);
  const choose = (choice: Choice) => {
    if (!isDecision(node)) return;
    update(markEdge({ ...progress, walk: pick(c, walk, choice.id) }, edgeKey(node.id, choice.id)));
    setCaption(<>You chose <b>{choice.id}</b>: {choice.label}. {choiceBasis(c, choice)}.</>);
  };
  const next = () => {
    const w = advance(c, walk);
    update(markNode({ ...progress, walk: w }, w.at));
    setOpenPrinciple(null);
    const n = nodeOf(c, w.at);
    setCaption(isDecision(n) ? <>Decision point: <b>{n.title}</b>.</> : <>End card: <b>{n.title}</b> ({endBasisLabel(n).toLowerCase()}).</>);
  };
  const stepBack = () => {
    update({ ...progress, walk: back(walk) });
    setOpenPrinciple(null);
  };
  const restart = () => {
    update({ ...progress, walk: startWalk(c) });
    setOpenPrinciple(null);
    setCaption(<>Starting over. Everything you have seen stays marked on the map.</>);
  };
  const togglePrinciple = (id: PrincipleId) => setOpenPrinciple(openPrinciple === id ? null : id);

  const seen = new Set(progress.seenNodes);
  const seenEdges = new Set(progress.seenEdges);
  const unseenBranches = map.edges.filter((e) => !seenEdges.has(edgeKey(e.from, e.choice))).length;
  const mapWidth = MAP_PAD * 2 + MAP_LAYER_GAP * 3;

  const mapView = (
    <WideRegion minWidth={minWidthForText(mapWidth, MAP_TEXT_PX)} label="Branch map: scroll sideways to see all of it">
      <GraphView
        nodes={map.nodes.map((n) => ({ id: n.id, shape: 'box' as const, label: n.end && !seen.has(n.id) ? 'end' : n.label }))}
        edges={map.edges.map((e) => ({ from: e.from, to: e.to, label: e.choice }))}
        directed
        layout="layered"
        spacing={{ direction: 'right', layerGap: MAP_LAYER_GAP, nodeGap: 46, padMain: MAP_PAD, padCross: 26 }}
        box={MAP_BOX}
        ariaLabel={`Branch map of the ${c.title} case: ${progress.seenNodes.length} of ${map.nodes.length} points seen`}
        nodeMark={(id) => (id === walk.at ? { tone: 'hi', fill: 'solid' } : seen.has(id) ? { tone: 'info', fill: 'tint' } : { tone: 'dim', fill: 'tint', tint: 8 })}
        edgeMark={(e) => (seenEdges.has(edgeKey(e.from, e.label as Choice['id'])) ? { tone: 'info', width: 3 } : { tone: 'dim', dashed: true, width: 2 })}
      />
    </WideRegion>
  );

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Decision" value={isDecision(node) ? step : 'end card'} />
          <Stat label="Map seen" value={`${progress.seenNodes.length}/${map.nodes.length}`} color="var(--info)" />
          <Stat label="Branches left" value={unseenBranches} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'you are here' },
            { color: 'var(--info)', label: 'seen / taken' },
            { color: 'var(--dim)', label: 'not yet explored' },
            { color: 'var(--bad)', label: IMPACT_WORD.harm },
            { color: 'var(--ok)', label: IMPACT_WORD.handled },
            { color: 'var(--muted)', label: IMPACT_WORD.benefit },
            { color: 'var(--orange)', label: IMPACT_WORD.open },
            { color: 'var(--violet)', label: 'ACM principle' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Hint>One case at a time. Reasoning exercise, not a test: no score, no right answer.</Hint>
        </>,
        <ControlGroup key="nav" label="Your path" inline>
          <Button onClick={stepBack} disabled={walk.path.length === 0 && walk.picked === null}>
            ← Back one step
          </Button>
          <Button onClick={restart}>Start over</Button>
          {narrow && <Button onClick={() => setShowMap(!showMap)}>{showMap ? 'Hide map' : 'Show map'}</Button>}
        </ControlGroup>,
      ]}
    >
      <div className="ce-stage stage-pad">
        <Box variant="sunken" className="ce-honesty" role="note">
          <b>{c.title}</b> <span className="chip tone-muted">{c.subtitle}</span>
          <p>
            <InlineText text={c.honesty} />
          </p>
        </Box>

        {(!narrow || showMap) && <Box className="ce-map">{mapView}</Box>}

        <div className="ce-story">
          <div className="ce-story-inner">
            {isDecision(node) ? (
              <Box>
                <SectionTitle hint={`decision ${step}`}>{node.title}</SectionTitle>
                <p className="ce-text">
                  <InlineText text={node.setup} />
                </p>
                <PrincipleChips ids={node.principles} open={openPrinciple} onToggle={togglePrinciple} />
                <div className="ce-choices" role="group" aria-label="What would a responsible engineer push for?">
                  {node.choices.map((ch) => (
                    <ChipButton key={ch.id} tone="info" size="md" on={walk.picked === ch.id} onStyle="solid" className="ce-choice" onClick={() => choose(ch)}>
                      <b>{ch.id}</b> {ch.label}
                    </ChipButton>
                  ))}
                </div>
                {picked && (
                  <div className="ce-outcome" aria-live="polite">
                    <SectionTitle hint={choiceBasis(c, picked)}>What follows</SectionTitle>
                    <div className="ce-impacts">
                      {WHO.map(([key, who]) => (
                        <ImpactCard key={key} who={who} impact={picked[key]} />
                      ))}
                    </div>
                    <Button variant="primary" onClick={next}>
                      Continue →
                    </Button>
                    <Hint>Or pick a different choice above to compare. Nothing is locked in until you continue.</Hint>
                  </div>
                )}
              </Box>
            ) : (
              <Box className="ce-end">
                <SectionTitle hint={endBasisLabel(node)}>End card · {node.title}</SectionTitle>
                <p className="ce-text">{node.text}</p>
                <SectionTitle weight="regular">Your path, against the principles</SectionTitle>
                <ol className="ce-path">
                  {summarisePath(c, walk).map((s) => (
                    <li key={s.decision}>
                      <b>{s.title}:</b> {s.choice}
                      {s.history && <span className="chip tone-muted">what happened</span>}{' '}
                      {s.principles.map((id) => (
                        <span key={id} className="chip tone-violet">
                          {id} {principle(id).short}
                        </span>
                      ))}
                    </li>
                  ))}
                </ol>
                <p className="ce-question">
                  <b>To carry away:</b> {node.question}
                </p>
                <Hint>This card describes your choices. It does not grade you.</Hint>
              </Box>
            )}
          </div>
        </div>
      </div>
    </StageFrame>
  );
}
