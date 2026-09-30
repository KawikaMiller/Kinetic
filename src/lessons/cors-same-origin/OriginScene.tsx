import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import { compareOrigins, originOf, type Origin } from './origin';

const PRESETS = [
  { id: 'scheme', label: 'http vs https', a: 'http://shop.example.com/cart', b: 'https://shop.example.com/cart' },
  { id: 'port', label: ':3000 vs :5173', a: 'http://localhost:3000/', b: 'http://localhost:5173/api' },
  { id: 'sub', label: 'www. vs api.', a: 'https://www.example.com/', b: 'https://api.example.com/orders' },
  { id: 'path', label: 'different path', a: 'https://example.com/a/page', b: 'https://example.com/b/data.json?x=1' },
  { id: 'default', label: 'port written out', a: 'https://example.com/', b: 'https://example.com:443/api' },
  { id: 'file', label: 'a file:// page', a: 'file:///C:/site/index.html', b: 'file:///C:/site/data.json' },
];

export function OriginScene({ picker }: { picker: ReactNode }) {
  const [a, setA] = useState(PRESETS[2].a);
  const [b, setB] = useState(PRESETS[2].b);
  const setCaption = useSetCaption();
  const oa = originOf(a);
  const ob = originOf(b);
  const cmp = oa && ob ? compareOrigins(oa, ob) : null;
  // An opaque origin has no parts to compare: grey them out rather than score them.
  const opaque = !!(oa?.opaque || ob?.opaque);

  useIntroCaption(
    <>An <b>origin</b> is three things: scheme, host and port. Two pages share an origin only when all three match. The path never counts.</>,
  );

  const load = (p: (typeof PRESETS)[number]) => {
    setA(p.a);
    setB(p.b);
    const c = compareOrigins(originOf(p.a)!, originOf(p.b)!);
    setCaption(captionFor(p.id, c.same), { quiet: true });
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Verdict" value={cmp ? (cmp.same ? 'same origin' : 'cross-origin') : NA} color={cmp ? (cmp.same ? 'var(--ok)' : 'var(--bad)') : undefined} />
          <Stat label="Origin A" value={oa?.serialized ?? NA} sub="as the Origin header writes it" className="cors-origin-stat" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'matches' }, { color: 'var(--bad)', label: 'differs' }, { color: 'var(--dim)', label: 'ignored (path, query)' }]} />}
      controls={[
        picker,
        <>
          <TextField label="URL A" value={a} onChange={setA} spellCheck={false} className="cors-url" />
          <TextField label="URL B" value={b} onChange={setB} spellCheck={false} className="cors-url" />
        </>,
        <ControlGroup key="presets" label="Try">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={a === p.a && b === p.b} onClick={() => load(p)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad cors">
        <div className="cors-grid" role="table" aria-label="Origin parts compared">
          <div className="cors-grid-row cors-grid-head" role="row">
            <span role="columnheader">Part</span>
            <span role="columnheader">URL A</span>
            <span role="columnheader">URL B</span>
            <span role="columnheader">Match?</span>
          </div>
          <PartRow name="scheme" a={oa?.scheme} b={ob?.scheme} match={cmp?.scheme} opaque={opaque} />
          <PartRow name="host" a={oa?.host || '(none)'} b={ob?.host || '(none)'} match={cmp?.host} opaque={opaque} />
          <PartRow name="port" a={portText(oa)} b={portText(ob)} match={cmp?.port} opaque={opaque} />
          <PartRow name="path + query" a={rest(a)} b={rest(b)} ignored />
        </div>
        <p className={`log-row ${!cmp ? 'tone-dim' : cmp.same ? 'tone-ok' : 'tone-bad'} cors-verdict`}>
          {!oa || !ob ? 'Type two full URLs, including the scheme (https://…).' : cmp!.reason}
        </p>
        <p className="cors-note">
          The browser lets a page freely read responses only from its own origin. Anything else is cross-origin, and the
          server has to opt in with CORS headers (next scene).
        </p>
      </div>
    </StageFrame>
  );
}

function PartRow({ name, a, b, match, ignored, opaque }: { name: string; a?: string; b?: string; match?: boolean; ignored?: boolean; opaque?: boolean }) {
  const tone = ignored || opaque || match === undefined ? 'dim' : match ? 'ok' : 'bad';
  return (
    <div className={`cors-grid-row tone-${tone}`} role="row">
      <span role="cell" className="cors-part">{name}</span>
      <code role="cell">{a ?? NA}</code>
      <code role="cell">{b ?? NA}</code>
      <span role="cell" className="cors-match">{ignored ? 'not part of the origin' : opaque ? "doesn't count" : match === undefined ? NA : match ? '✓ same' : '✗ differs'}</span>
    </div>
  );
}

const portText = (o: Origin | null) => (!o ? undefined : o.opaque ? '(opaque)' : `${o.port}${o.defaultPort ? ' (default)' : ''}`);

function rest(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + u.search || '/';
  } catch {
    return undefined;
  }
}

function captionFor(id: string, same: boolean): ReactNode {
  switch (id) {
    case 'scheme':
      return <>Same host, but <span className="hl bad">http</span> and <span className="hl">https</span> are different schemes (and imply ports 80 vs 443): cross-origin.</>;
    case 'port':
      return <>Two dev servers on one machine: same host, different <span className="hl bad">port</span>. Your front end on :5173 calling an API on :3000 is cross-origin.</>;
    case 'sub':
      return <>Subdomains are different hosts, so <span className="hl bad">cross-origin</span>, even though they&apos;re the same <i>site</i> (that distinction matters for cookies, not here).</>;
    case 'path':
      return <>Different paths and queries don&apos;t matter: <span className="hl ok">same origin</span>.</>;
    case 'default':
      return <>Writing the default port out changes nothing: https means 443 either way, so <span className="hl ok">same origin</span>.</>;
    case 'file':
      return <>Pages opened from <code>file://</code> get an <span className="hl bad">opaque origin</span> ("null"), which equals nothing, even another file.</>;
    default:
      return same ? 'Same origin.' : 'Cross-origin.';
  }
}
