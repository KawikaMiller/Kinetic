import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ByteGrid, type ByteField } from '../../components/ByteGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { toneVar, type Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { wrapFacts, wrapFrames } from './captions';
import { WRAP_PAYLOAD, initialWrap } from './init';
import { OUTER_OPTIONS, SUITE_OPTIONS, TUNNEL_OPTIONS } from './options';
import { INNER_DST, INNER_SRC, SIZE, runningOverhead, type Field, type Suite } from './tunnels';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'the inner packet' },
      { color: 'var(--amber)', label: 'outer IP header' },
      { color: 'var(--pink)', label: 'outer UDP or ESP header' },
      { color: 'var(--sky)', label: 'the tunnel\'s own header' },
      { color: 'var(--orange)', label: 'tag' },
      { color: 'var(--hi)', label: 'overhead in bytes' },
    ]}
  />
);

const tint = (t: Tone): CSSProperties => ({ background: `color-mix(in srgb, ${toneVar(t)} 30%, transparent)`, borderColor: toneVar(t) });
const MIN_SEGMENT_PX = 4;

/** The offset each field starts at. */
const layoutStarts = (fields: Field[]): number[] => fields.map((_, i) => fields.slice(0, i).reduce((n, f) => n + f.bytes, 0));

/** The packet as proportional blocks: outer front, the inner packet, outer back. */
function Proportion({ before, after, inner }: { before: Field[]; after: Field[]; inner: number }) {
  const block = (f: Field, i: number, key: string) => (
    <span key={`${key}${i}`} className="vpn-block" style={{ flexGrow: f.bytes, minWidth: f.bytes > 0 ? MIN_SEGMENT_PX : 0, ...tint(f.tone) }} title={`${f.name}: ${f.bytes} bytes`} />
  );
  return (
    <div className="vpn-proportion" role="img" aria-label={`The wrapped packet drawn to scale: ${before.length} outer fields, the ${inner}-byte inner packet, ${after.length} trailer fields`}>
      {before.map((f, i) => block(f, i, 'b'))}
      <span className="vpn-block" style={{ flexGrow: inner, ...tint('info') }} title={`inner packet: ${inner} bytes`} />
      {after.map((f, i) => block(f, i, 'a'))}
    </div>
  );
}

export function WrapScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialWrap);
  const facts = useMemo(() => wrapFacts(st.tunnel, st.opts, st.payload), [st.tunnel, st.opts, st.payload]);
  const frames = useMemo(() => wrapFrames(st.tunnel, st.opts, st.payload), [st.tunnel, st.opts, st.payload]);
  const player = usePlayer(frames, { interval: 1500, autoplay: true });
  const { shown, opened } = player.frame;
  const { layout, wrapped, inner, overhead } = facts;
  const fields = [...layout.before, ...layout.after];
  const running = runningOverhead(layout);

  // The outer front bytes revealed so far, as ByteGrid fields.
  const frontSegments = wrapped.segments.slice(0, layout.before.length);
  const frontBytes = frontSegments.flatMap((s) => s.bytes);
  const shownFront = Math.min(shown, layout.before.length);
  const frontShown = frontSegments.slice(0, shownFront).reduce((n, s) => n + s.bytes.length, 0);
  const starts = layoutStarts(layout.before);
  const byteFields: ByteField[] = layout.before.slice(0, shownFront).map((f, i) => ({ from: starts[i], to: starts[i] + f.bytes - 1, tone: f.tone, label: f.name }));
  const tagField = layout.after.find((f) => f.tone === 'orange');
  const tagShown = tagField !== undefined && shown >= fields.indexOf(tagField) + 1;
  const tagBytes = tagField ? Array.from(wrapped.bytes.slice(wrapped.bytes.length - tagField.bytes)) : [];
  const total = wrapped.bytes.length;

  return (
    <StageFrame
      height={640}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Inner packet" value={`${inner.length} bytes`} color="var(--info)" sub={`${SIZE.innerIpv4} header + ${st.payload} payload`} />
          <Stat label="Overhead" value={`${overhead} bytes`} color="var(--hi)" sub={`${fields.length} fields, ${running[running.length - 1].total} by the table`} />
          <Stat label="On the wire" value={`${total} bytes`} sub={`${Math.round((overhead / total) * 100)}% of it is overhead`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Tunnel" value={st.tunnel} options={TUNNEL_OPTIONS} onChange={(tunnel) => setSt((s) => ({ ...s, tunnel }))} />
          <Segmented label="Outer header" value={st.opts.outer} options={OUTER_OPTIONS} onChange={(outer) => setSt((s) => ({ ...s, opts: { ...s.opts, outer } }))} />
        </>,
        <>
          <Slider label="Inner payload" value={st.payload} min={WRAP_PAYLOAD.min} max={WRAP_PAYLOAD.max} format={(n) => `${n} bytes`} onChange={(payload) => setSt((s) => ({ ...s, payload }))} />
          {st.tunnel === 'esp' && (
            <>
              <Segmented<Suite> label="Cipher suite" value={st.opts.suite} options={SUITE_OPTIONS} onChange={(suite) => setSt((s) => ({ ...s, opts: { ...s.opts, suite } }))} />
              <Toggle label="NAT traversal" value={st.opts.natT} off="no UDP" on="UDP, 8 bytes" onChange={(natT) => setSt((s) => ({ ...s, opts: { ...s.opts, natT } }))} />
            </>
          )}
        </>,
      ]}
    >
      <div className="vpn-stage stage-pad">
        <Box>
          <SectionTitle hint={`${INNER_SRC} to ${INNER_DST}, fictional`}>The packet, drawn to scale</SectionTitle>
          <Proportion before={layout.before.slice(0, shownFront)} after={layout.after.slice(0, Math.max(0, shown - layout.before.length))} inner={inner.length} />
          <p className="vpn-note">{opened ? 'Opened at the far side: the outer fields are gone and the inner packet is back.' : shown === 0 ? 'Only the inner packet so far.' : `${shown} of ${fields.length} outer fields added.`}</p>
        </Box>
        <div className="vpn-split">
          <Box>
            <SectionTitle hint="the outer bytes added in front of the inner packet">Outer headers, byte by byte</SectionTitle>
            {frontShown === 0 ? (
              <p className="vpn-note">No outer byte yet.</p>
            ) : (
              <ByteGrid bytes={frontBytes.slice(0, frontShown)} fields={byteFields} ariaLabel="The outer header bytes added so far" />
            )}
            {tagShown && (
              <>
                <p className="vpn-note">The last {tagBytes.length} bytes of the packet: the {tagField?.name} (a toy fingerprint here).</p>
                <ByteGrid bytes={tagBytes} fields={[{ from: 0, to: tagBytes.length - 1, tone: 'orange', label: tagField?.name ?? 'tag' }]} ariaLabel="The authentication tag bytes" />
              </>
            )}
          </Box>
          <Box>
            <SectionTitle hint="sizes from the table">Fields and running overhead</SectionTitle>
            <div className="vpn-scroll" role="region" aria-label="The fields the tunnel adds" tabIndex={0}>
              <table className="data-table vpn-table">
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Bytes</th>
                    <th scope="col">Overhead so far</th>
                  </tr>
                </thead>
                <tbody>
                  {running.map(({ field, total: sofar }, i) => (
                    <tr key={`${field.name}${i}`} className={i < shown ? 'is-on' : 'is-off'}>
                      <td>
                        <span className="vpn-swatch" style={tint(field.tone)} /> {field.name}
                      </td>
                      <td>{field.bytes}</td>
                      <td className="vpn-total">{i < shown ? sofar : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="from-memory">every size and layout is recalled from the formats (WireGuard whitepaper, ESP, GRE, VXLAN): verify against them. ESP sizes depend on the cipher suite; two are shown</Provenance>
          <Provenance kind="toy">the bytes are built for real, but the cipher is a toy keystream with a made-up key and a fake tag: not secure, and not the real ciphers</Provenance>
          <Provenance kind="simulated">no packet is sent: the far side is a function that reads the bytes back</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
