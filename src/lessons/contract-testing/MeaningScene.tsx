import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { costCaption, meaningCaption } from './captions';
import { verify } from './contract';
import { DEFAULT_CONSUMER, EXPECTED_LINE, readsOf, renderCheckout } from './consumer';
import { SERVICES, costOf, maxEdges, serviceEdges } from './cost';
import { contractOf } from './deploy';
import { handle } from './provider';

const GRAPH = { width: 340, height: 300 };

type Part = 'meaning' | 'cost';

export function MeaningScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [dollars, setDollars] = useState(false);
  const [n, setN] = useState(6);
  const [e, setE] = useState(7);
  const [part, setPart] = useState<Part>('meaning');

  const changes = useMemo(() => new Set(dollars ? (['amount-dollars'] as const) : []), [dollars]);
  const response = handle(changes);
  const mismatches = verify(contractOf(readsOf(DEFAULT_CONSUMER)), response);
  const line = renderCheckout(response.body as Record<string, unknown>, DEFAULT_CONSUMER);
  const behaviourOk = line === EXPECTED_LINE;
  const cost = costOf(n, e);
  const edges = serviceEdges(n, e);

  const caption = useMemo(() => (part === 'meaning' ? meaningCaption(dollars, DEFAULT_CONSUMER) : costCaption(n, e)), [part, dollars, n, e]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  return (
    <StageFrame
      height={500}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a check that passes, and is right' },
            { color: 'var(--orange)', label: 'a green check that is wrong' },
            { color: 'var(--bad)', label: 'a check that fails' },
            { color: 'var(--info)', label: 'a dependency edge' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Panel" value={part === 'cost'} onChange={(v) => setPart(v ? 'cost' : 'meaning')} off="What a contract cannot see" on="Contracts against end-to-end" />
        </>,
        part === 'meaning' ? (
          <Toggle key="m" label="The provider ships" value={dollars} onChange={setDollars} off="amount in cents" on="amount in dollars" />
        ) : (
          <div key="c" className="ct-chips">
            <Slider label="Services" value={n} min={SERVICES.min} max={SERVICES.max} onChange={(v) => { setN(v); setE((x) => Math.min(x, maxEdges(v))); }} />
            <Slider label="Dependency edges" value={Math.min(e, maxEdges(n))} min={1} max={maxEdges(n)} onChange={setE} />
          </div>
        ),
      ]}
    >
      <div className="stage-pad ct">
        {part === 'meaning' ? (
          <>
            <Box className="ct-card">
              <SectionTitle weight="regular" hint="the contract: what the page reads, as types">Contract verification</SectionTitle>
              <span className={`chip tone-${mismatches.length ? 'bad' : 'ok'} wrap`}>{mismatches.length ? `${plural(mismatches.length, 'mismatch', 'mismatches')}` : 'passes: amount is still an integer'}</span>
            </Box>
            <Box className="ct-card">
              <SectionTitle weight="regular">What the checkout page renders</SectionTitle>
              <code className={`ct-line tone-${behaviourOk ? 'ok' : 'orange'}`}>{line}</code>
              <p className="muted">The shape is the same whole number, so the contract cannot tell 2500 cents from 25 dollars.</p>
            </Box>
            <Box className="ct-card">
              <SectionTitle weight="regular" hint={`expects "${EXPECTED_LINE}"`}>A behaviour test</SectionTitle>
              <span className={`chip tone-${behaviourOk ? 'ok' : 'bad'} wrap`}>{behaviourOk ? 'passes' : 'fails: the page would charge 100 times too little'}</span>
            </Box>
          </>
        ) : (
          <div className="ct-pair">
            <Box className="ct-card">
              <SectionTitle weight="regular" hint="consumer to provider">The services</SectionTitle>
              <GraphView
                nodes={Array.from({ length: n }, (_, i) => ({ id: i, label: `S${i + 1}` }))}
                edges={edges}
                directed
                layout="circle"
                width={GRAPH.width}
                height={GRAPH.height}
                ariaLabel={`${n} services with ${edges.length} dependency edges`}
              />
            </Box>
            <Box className="ct-card">
              <Stats>
                <Stat label="End-to-end" value={`${cost.e2eDeployed} deployed together`} sub="every service up at once" />
                <Stat label="Contracts" value={`${cost.verifications} checks`} sub="one per edge, each alone" />
              </Stats>
            </Box>
          </div>
        )}
        <div className="ct-chips">
          <Provenance kind="toy">a toy contract; real tools do more</Provenance>
          <Provenance kind="real">the page and the matcher run here</Provenance>
          <Provenance kind="illustrative">the services and edges are an invented, fixed arrangement</Provenance>
        </div>
        <Hint block>Contracts check shape and agreement, not meaning. Keep a behaviour test for what a field means, and a few end-to-end tests for the journeys that matter.</Hint>
      </div>
    </StageFrame>
  );
}
