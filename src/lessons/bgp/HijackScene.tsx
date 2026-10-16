import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { AsMap } from './AsMap';
import { ASES, GRAPH, ORIGIN, asName } from './asgraph';
import { hijackIntro, ipText, reachCounts } from './captions';
import { VALIDATOR_MAX, hijackResult, prefixLabel, type Kind } from './hijack';
import { announcePrefix, announcedOf, initialHijack, type HijackState } from './init';
import { AS_OPTIONS } from './options';

const ANNOUNCERS = AS_OPTIONS.filter((o) => o.value !== ORIGIN);
const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'hijack', label: 'a hijacker (not in the ROA)' },
  { value: 'anycast', label: 'a second site (listed in the ROA)' },
];
const PREFIX_CHIPS = ['203.0.113.0/24', '203.0.113.0/25', '203.0.113.0/26'];
const LEGEND_BASE = [
  { color: 'var(--ok)', label: 'packets end at the real origin' },
  { color: 'var(--dim)', label: 'packets are lost (a loop or no route)' },
  { color: 'var(--violet)', label: 'solid link: customer to provider (arrow at the provider); dashed link: peers', shape: 'line' as const },
];

export function HijackScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<HijackState>(initialHijack);
  const s = st.setup;
  const result = useMemo(() => hijackResult(s, announcedOf(s)), [s]);
  const counts = reachCounts(result);
  const hijack = s.kind === 'hijack';
  const patch = (p: Partial<typeof s>) => setSt((x) => ({ ...x, setup: { ...x.setup, ...p } }));
  const tone = hijack ? 'bad' : 'info';

  return (
    <StageFrame
      height={640}
      legend={<Legend items={[LEGEND_BASE[0], { color: hijack ? 'var(--bad)' : 'var(--info)', label: hijack ? 'packets end at the hijacker' : 'packets end at the second site' }, ...LEGEND_BASE.slice(1)]} />}
      intro={hijackIntro(s, result)}
      introKey={[s.announcer, s.kind, s.prefixText, s.forged, s.validators]}
      stats={
        <Stats>
          <Stat label="End at the real origin" value={counts.origin} sub={`of ${ASES.length} ASes, the origin itself included`} color="var(--ok)" />
          <Stat label={hijack ? 'End at the hijacker' : 'End at the second site'} value={counts.second} color={counts.second > 0 && hijack ? 'var(--bad)' : undefined} sub={`${asName(s.announcer)} itself included`} />
          <Stat label="Lost" value={counts.lost} sub="a loop or no route at some AS" />
          <Stat label="Origin validation says" value={result.validity} color={result.validity === 'invalid' ? 'var(--bad)' : undefined} sub={`for ${prefixLabel(result.announced)} from ${s.forged && hijack ? asName(ORIGIN) : asName(s.announcer)}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Second announcer" value={s.announcer} options={ANNOUNCERS} onChange={(announcer) => patch({ announcer })} />
        </>,
        <>
          <Segmented label="It is" value={s.kind} options={KIND_OPTIONS} onChange={(kind) => patch({ kind })} />
          {hijack && <Toggle label="Forge the origin" value={s.forged} off="no" on={`end the path with ${asName(ORIGIN)}`} onChange={(forged) => patch({ forged })} />}
        </>,
        <>
          <ControlGroup label="Announces" inline>
            {PREFIX_CHIPS.map((p) => (
              <ChipButton key={p} on={s.prefixText === p} onClick={() => setSt((x) => announcePrefix(x, p))}>
                {p.split('/')[1] === '24' ? '/24, the same prefix' : `/${p.split('/')[1]}, inside it`}
              </ChipButton>
            ))}
          </ControlGroup>
          <TextField label="Prefix" value={st.field} onChange={(field) => setSt((x) => ({ ...x, field }))} onEnter={() => setSt((x) => announcePrefix(x))} width={150} spellCheck={false} />
          <Button onClick={() => setSt((x) => announcePrefix(x))}>Announce</Button>
          <Hint tone="muted">
            <span role="status">{st.note ?? 'A prefix inside 203.0.113.0/24, from /24 to /28.'}</span>
          </Hint>
        </>,
        <>
          <Slider label="ASes that validate origins" value={s.validators} min={0} max={VALIDATOR_MAX} format={(k) => `${k} of ${VALIDATOR_MAX}`} onChange={(validators) => patch({ validators })} />
          <Button onClick={() => setSt(initialHijack())}>Reset</Button>
        </>,
      ]}
    >
      <div className="bgp-stage stage-pad">
        <Box>
          <SectionTitle hint={`where a packet for ${ipText(result.destination)} ends up, from each AS`}>Who reaches whom</SectionTitle>
          <AsMap
            nodeMark={(a) => {
              const r = result.reach[a];
              const fill = a === ORIGIN || a === s.announcer ? 'solid' : 'tint';
              if (r.outcome === 'origin') return { tone: 'ok', fill };
              if (r.outcome === 'other') return { tone, fill };
              return { tone: 'dim', fill };
            }}
            ariaLabel="Where a packet for the announced prefix ends up, from each autonomous system"
          />
        </Box>
        <Box>
          <SectionTitle hint="the ROA says who may announce the prefix, and how long a prefix">Origin validation (shown, not run)</SectionTitle>
          <div className="bgp-scroll" role="region" aria-label="ROAs and where each AS sends the packet" tabIndex={0}>
            <table className="data-table bgp-table">
              <thead>
                <tr>
                  <th scope="col">ROA prefix</th>
                  <th scope="col">Max length</th>
                  <th scope="col">Origin</th>
                </tr>
              </thead>
              <tbody>
                {result.roas.map((r) => (
                  <tr key={r.origin}>
                    <td>203.0.113.0/{r.prefix}</td>
                    <td>/{r.maxLength}</td>
                    <td>{asName(r.origin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="data-table bgp-table bgp-reach">
              <thead>
                <tr>
                  <th scope="col">AS</th>
                  <th scope="col">Validates</th>
                  <th scope="col">Packet ends at</th>
                  <th scope="col">Route taken</th>
                </tr>
              </thead>
              <tbody>
                {GRAPH.ases.map((a) => (
                  <tr key={a} className={`bgp-row is-${result.reach[a].outcome}`}>
                    <td>{asName(a)}</td>
                    <td>{result.validating.includes(a) ? 'yes' : 'no'}</td>
                    <td>{result.reach[a].at === null ? 'nowhere' : asName(result.reach[a].at as number)}</td>
                    <td>{result.reach[a].hops.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="bgp-note">
            A validator drops an announcement whose origin the ROA does not list, or whose prefix is longer than the ROA allows, and keeps one that no ROA covers. It reads the last AS in the path, so a forged origin passes the origin check; the length check still catches a longer prefix. Signing the path itself (BGPsec, ASPA) is named, not shown.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">eight made-up ASes; the real internet has many tens of thousands (from memory)</Provenance>
          <Provenance kind="not-run">shown, not run: no ROA is fetched and no BGP session exists here</Provenance>
          <Provenance kind="from-memory">origin validation follows the idea of RFC 6811; an equal-length second origin splitting the map is also how anycast works (verify)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
