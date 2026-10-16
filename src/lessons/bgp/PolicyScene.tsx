import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { AsMap } from './AsMap';
import { CandidateTable } from './CandidateTable';
import { GRAPH, ORIGIN, ORIGIN_PREFIX, asName, edgeId, neighboursOf } from './asgraph';
import { PREF_RANGE, finalRound, pathLinks } from './bgp';
import { policyIntro } from './captions';
import { changedFromDefault, initialPolicy, pickAs, policyRun, preferProvider, prefFor, setPref } from './init';
import { AS_OPTIONS } from './options';

const EDITABLE = AS_OPTIONS.filter((o) => o.value !== ORIGIN);

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: "the link each AS sends through (its chosen next hop); the highlighted AS is the one being edited" },
      { color: 'var(--violet)', label: 'solid link: customer to provider (arrow at the provider); dashed link: peers', shape: 'line' },
    ]}
  />
);

export function PolicyScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialPolicy);
  const run = useMemo(() => policyRun(st), [st]);
  const last = finalRound(run);
  const chosen = last.candidates[st.as].find((c) => c.status === 'chosen');
  const changed = useMemo(() => changedFromDefault(st), [st]);
  const tree = new Set(GRAPH.ases.flatMap((a) => pathLinks(a, last.best[a]).slice(0, 1)).map(([x, y]) => edgeId(x, y)));
  const edited = Object.keys(st.prefs).length > 0;
  const neighbours = neighboursOf(GRAPH.edges, st.as);

  return (
    <StageFrame
      height={600}
      legend={LEGEND}
      intro={policyIntro(st.as, last.candidates[st.as], edited)}
      introKey={[st.as, JSON.stringify(st.prefs)]}
      stats={
        <Stats>
          <Stat label={`${asName(st.as)} sends through`} value={chosen ? asName(chosen.from) : 'nobody'} sub={chosen ? `AS_PATH ${chosen.path.join(' ')}` : 'no usable route'} />
          <Stat label="Paths changed by your edits" value={changed.length} sub={changed.length > 0 ? changed.map(asName).join(', ') : 'none: the default preferences apply'} />
          <Stat label="Rounds to converge" value={run.settled ? run.roundsToConverge : `over ${run.roundsToConverge}`} color={run.settled ? undefined : 'var(--bad)'} sub={run.settled ? 'every AS holds its final route' : 'the preferences never settled'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Edit AS" value={st.as} options={EDITABLE} onChange={(as) => setSt((s) => pickAs(s, as))} />
        </>,
        <>
          {neighbours.map((n) => (
            <Slider
              key={n.asn}
              label={`Pref for ${n.asn} (my ${n.rel})`}
              value={prefFor(st, n.asn)}
              min={PREF_RANGE.min}
              max={PREF_RANGE.max}
              step={PREF_RANGE.step}
              onChange={(v) => setSt((s) => setPref(s, n.asn, v))}
            />
          ))}
        </>,
        <>
          <ChipButton tone="info" onClick={() => setSt(preferProvider())}>
            AS64499 prefers its provider
          </ChipButton>
          <Button onClick={() => setSt(initialPolicy())}>Reset</Button>
          <Hint tone="muted">By default a customer route gets 300, a peer route 200 and a provider route 100. Raise one and watch who follows.</Hint>
        </>,
      ]}
    >
      <div className="bgp-stage stage-pad">
        <Box>
          <SectionTitle hint={`every AS's chosen next hop toward ${ORIGIN_PREFIX}`}>Who sends through whom</SectionTitle>
          <AsMap
            edgeMark={(e) => (tree.has(edgeId(e.a, e.b)) ? { tone: 'hi', dashed: e.kind === 'p2p', width: 5 } : null)}
            nodeMark={(a) => (a === st.as ? { tone: 'hi', fill: 'tint' } : a === ORIGIN ? { tone: 'ok', fill: 'solid' } : null)}
            onNodeClick={(as) => as !== ORIGIN && setSt((s) => pickAs(s, as))}
            ariaLabel="Each autonomous system's chosen next hop toward the prefix; press one to edit its local preferences"
          />
        </Box>
        <Box>
          <SectionTitle hint="simplified decision: Pref (local preference), then Len (AS_PATH length), then lowest neighbour">Routes {asName(st.as)} chooses among</SectionTitle>
          <CandidateTable candidates={last.candidates[st.as]} caption={`Routes ${asName(st.as)} chooses among, and the decision`} />
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">decision steps after the first three (origin type, MED, eBGP over iBGP, IGP cost, router ID) are named, not run: see RFC 4271 section 9.1.2 (verify)</Provenance>
          <Provenance kind="simulated">eight made-up ASes, one prefix</Provenance>
          <Provenance kind="illustrative">preference numbers 100, 200 and 300 are a common convention, not a standard (from memory)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
