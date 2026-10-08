import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { sinkCaption } from './captions';
import { SAMPLES } from './contexts';
import { hrefVerdict, isWebUrl, keptAsData, ROUTES, SINKS, throughSink, type SinkId, type SourceId } from './sinks';

/** Harmless link values for the href sink: a web address, a path, and schemes the app never meant to open. */
const LINK_VALUES = ['https://shop.example/orders', '/orders/42', 'ftp://files.example/readme', 'custom-scheme:anything'];
const DEFAULT_LINK = LINK_VALUES[2];

const FRAMEWORKS: { name: string; auto: string; hatch: string }[] = [
  { name: 'React', auto: '{value}', hatch: 'dangerouslySetInnerHTML' },
  { name: 'Vue', auto: '{{ value }}', hatch: 'v-html' },
  { name: 'Angular', auto: '{{ value }}', hatch: 'bypassSecurityTrustHtml' },
  { name: 'Svelte', auto: '{value}', hatch: '{@html value}' },
  { name: 'Jinja2 (autoescape on)', auto: '{{ value }}', hatch: '| safe' },
  { name: 'Rails ERB', auto: '<%= value %>', hatch: 'raw, html_safe' },
];

export function SinksScene({ picker }: { picker: ReactNode }) {
  const [value, setValue] = useState(SAMPLES[1].value);
  const [sinkId, setSinkId] = useState<SinkId>('innerHTML');
  const [link, setLink] = useState(DEFAULT_LINK);
  const [source, setSource] = useState<SourceId>('stored');
  const setCaption = useSetCaption();
  const sinkIndex = SINKS.findIndex((s) => s.id === sinkId);
  const sink = SINKS[sinkIndex];
  const route = ROUTES.find((r) => r.id === source)!;

  useIntroCaption(<>The same value through different browser calls. Safe ones keep it as text; the unsafe ones read it as markup. Click a line, or pick a sample.</>);

  const update = (next: { value?: string; sink?: SinkId; link?: string }) => {
    const v = next.value ?? value;
    const s = next.sink ?? sinkId;
    const l = next.link ?? link;
    if (next.value !== undefined) setValue(v);
    if (next.sink !== undefined) setSinkId(s);
    if (next.link !== undefined) setLink(l);
    setCaption(sinkCaption(s, v, l), { quiet: true });
  };

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your text, as text' },
            { color: 'var(--bad)', label: 'unsafe sink, or read as markup' },
            { color: 'var(--ok)', label: 'stayed plain data' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="s" label="Comment">
          {SAMPLES.map((s) => (
            <ChipButton key={s.id} tone="info" on={value === s.value} onClick={() => update({ value: s.value })}>{s.value}</ChipButton>
          ))}
        </ControlGroup>,
        <ControlGroup key="r" label="Where it comes from">
          {ROUTES.map((r) => (
            <ChipButton key={r.id} tone="violet" on={source === r.id} onClick={() => setSource(r.id)}>{r.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad xss">
        <Box className="xss-flow" role="group" aria-label={`${route.label} route`}>
          <span className="xss-flow-node is-source">{route.from}</span>
          <span className="xss-flow-arrow" aria-hidden="true">→</span>
          <span className="xss-flow-node">{route.via}</span>
          <span className="xss-flow-arrow" aria-hidden="true">→</span>
          <span className="xss-flow-node is-page">the page</span>
          <p className="xss-flow-fix">Encode where the value is written into the page: {route.fixAt}.</p>
        </Box>

        <div className="xss-sinks">
          <CodePanel
            title="Ways to put a value into a page (click one)"
            lines={SINKS.map((s) => s.code)}
            gutter="none"
            stateOf={(i) => (SINKS[i].safe ? 'done' : 'bad')}
            marker={(i) => (i === sinkIndex ? <span className="xss-pick" aria-hidden="true">▶</span> : null)}
            trailing={(i) => (SINKS[i].safe ? 'safe sink' : <>use <code>{SINKS[i].fix}</code></>)}
            onLineClick={(i) => update({ sink: SINKS[i].id })}
            pressed={(i) => i === sinkIndex}
            lineLabel={(i) => `${SINKS[i].safe ? 'Safe' : 'Unsafe'} sink: ${SINKS[i].code}`}
            roving
          />
          <Box className="xss-result">
            <SectionTitle hint={sink.code}>What lands in the page</SectionTitle>
            {sink.id === 'href' ? <HrefResult link={link} onLink={(l) => update({ link: l })} /> : <PiecesResult id={sink.id} value={value} />}
          </Box>
        </div>

        <Box className="xss-frameworks">
          <SectionTitle hint="from the frameworks' own documentation; names only">Frameworks encode by default, and have a way out</SectionTitle>
          <table className="data-table xss-table">
            <thead>
              <tr><th scope="col">Framework</th><th scope="col">Encodes the value</th><th scope="col">Escape hatch: only for content you trust</th></tr>
            </thead>
            <tbody>
              {FRAMEWORKS.map((f) => (
                <tr key={f.name}>
                  <th scope="row">{f.name}</th>
                  <td className="xss-auto" data-label="Encodes the value"><code>{f.auto}</code></td>
                  <td className="xss-hatch" data-label="Escape hatch"><code>{f.hatch}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Hint block>
          Simulated browser: the sinks are modelled, and the comment is shown as inert pieces. It is never inserted into this page.
        </Hint>
      </div>
    </StageFrame>
  );
}

function PiecesResult({ id, value }: { id: SinkId; value: string }) {
  const result = throughSink(id, value);
  const kept = keptAsData(id, value);
  return (
    <>
      <div className="xss-pieces" role="list" aria-label="Pieces that end up in the page">
        {result.pieces.map((p, i) => (
          <span key={i} role="listitem" className={`xss-piece is-${p.kind}`}>
            {p.kind === 'element' ? `element ${p.text}` : p.text || '(no text)'}
          </span>
        ))}
      </div>
      <p className={`log-row ${kept ? 'tone-ok' : 'tone-bad'} xss-verdict`}>
        {kept ? (result.parsed ? 'Same text, but only because nothing in it looks like a tag.' : 'Exactly what was typed, as text.') : 'Part of the comment became page structure.'}
      </p>
    </>
  );
}

function HrefResult({ link, onLink }: { link: string; onLink: (l: string) => void }) {
  const v = hrefVerdict(link);
  const ok = isWebUrl(link);
  return (
    <>
      <ControlGroup label="Link value">
        {LINK_VALUES.map((l) => (
          <ChipButton key={l} tone="info" on={link === l} onClick={() => onLink(l)}>{l}</ChipButton>
        ))}
      </ControlGroup>
      <div className="xss-pieces">
        <span className="xss-piece is-text">{v.kind === 'relative' ? 'a path on this site' : `scheme ${v.scheme}`}</span>
      </div>
      <p className={`log-row ${ok ? 'tone-ok' : 'tone-bad'} xss-verdict`}>
        {ok ? 'A web address or a path on this site: the allow-list accepts it.' : 'Not a web address. Unchecked, the link would take it; the allow-list refuses it.'}
      </p>
    </>
  );
}
