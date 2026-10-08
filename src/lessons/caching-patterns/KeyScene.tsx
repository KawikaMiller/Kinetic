import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { keyCaption } from './captions';
import { contentFor, DEPENDS_ON, KEY_PARTS, makeRequests, simulateKeys, type KeyChoice, type PageKind } from './keys';

const KINDS: { value: PageKind; label: string }[] = [
  { value: 'catalog', label: 'Product page (same for everyone)' },
  { value: 'account', label: 'Account page (one per user)' },
];
const TABLE_MIN_W = 520;
const HONEST = 'Simulated requests, seeded; users, languages and the deploy are made up. The cache here has no TTL, so only the key decides what is served.';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'hit' },
      { color: 'var(--hi)', label: 'miss' },
      { color: 'var(--orange)', label: 'wrong page served' },
    ]}
  />
);

export function KeyScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<PageKind>('catalog');
  // Start with the locale forgotten: the bug the lesson is about.
  const [choice, setChoice] = useState<KeyChoice>({ user: false, locale: false, version: true });
  const requests = useMemo(() => makeRequests(), []);
  const run = useMemo(() => simulateKeys(kind, choice, requests), [kind, choice, requests]);

  useIntroCaption(keyCaption(kind, choice, run), [kind, choice]);

  const toggle = (part: keyof KeyChoice) => setChoice((c) => ({ ...c, [part]: !c[part] }));
  const needs = DEPENDS_ON[kind];

  return (
    <StageFrame
      height={420}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Wrong pages served" value={run.wrong} color={run.wrong > 0 ? 'var(--orange)' : 'var(--ok)'} sub={`of ${requests.length} requests`} />
          <Stat label="Hit rate" value={pct(run.hitRate, 0)} sub="requests answered by the cache" />
          <Stat label="Cache entries" value={run.entries} sub="distinct keys stored" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Page" value={kind} onChange={setKind} options={KINDS} />
        </>,
        <ControlGroup key="parts" label="The key includes" inline>
          {KEY_PARTS.map((part) => (
            <ChipButton key={part} tone="info" on={choice[part]} onStyle="solid" onClick={() => toggle(part)}>
              {part}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad cp">
        <p className="cp-note">
          The {kind === 'catalog' ? 'product page depends on the locale and the deployed version' : 'account page depends on the user, the locale and the deployed version'}.
          {' '}The key has to name every input the page depends on, and nothing else.
        </p>
        <SectionTitle weight="regular" hint="the first requests, and the first wrong page if it comes later">What the cache saw</SectionTitle>
        <WideRegion minWidth={TABLE_MIN_W} label="Requests table: scroll sideways to see all of it">
          <table className="data-table cp-keys">
            <thead>
              <tr><th scope="col">#</th><th scope="col">Request</th><th scope="col">Key</th><th scope="col">Cache</th><th scope="col">Served</th></tr>
            </thead>
            <tbody>
              {run.sample.map((s) => (
                <tr key={s.n}>
                  <td>{s.n}</td>
                  <td>user {s.request.user} · {s.request.locale} · v{s.request.version}</td>
                  <td className="cp-key">{s.key}</td>
                  <td><span className={`chip ${s.hit ? 'tone-ok' : 'tone-hi'}`}>{s.hit ? 'hit' : 'miss'}</span></td>
                  <td className={s.wrong ? 'cp-wrong' : undefined}>{s.served}{s.wrong && <span className="cp-flag"> wrong: needed {contentFor(kind, s.request)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <p className="cp-note">
          {needs.user ? 'Without the user in the key, one reader gets another reader\'s page.' : 'Putting the user in anyway gives every reader a private copy of a page that is the same for all of them.'}
        </p>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
