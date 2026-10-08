import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { CONTEXTS, tally, verdict } from './contexts';
import { activeStoppers, LAYER_LABELS, reach, reachedCount, windowText, type Layers } from './defence';
import { hrefVerdict, isWebUrl, keptAsData, SINKS, throughSink, type SinkId } from './sinks';

/** The contexts where the value, pasted in as typed, stops being plain data. */
export const brokenRaw = (value: string) => CONTEXTS.filter((c) => !verdict(c.id, 'raw', value).reading.intact).map((c) => c.label);

export function contextsCaption(value: string): ReactNode {
  const t = tally(value);
  const broken = brokenRaw(value);
  return (
    <>
      <b>{value}</b> pasted as typed stays data in {t.raw} of {CONTEXTS.length} places
      {broken.length ? <>, and changes the page&apos;s structure in <span className="hl bad">{broken.join(', ').toLowerCase()}</span></> : <>, only because of what it happens to contain</>}.
      {' '}HTML-escaping it everywhere keeps {t.html}; the encoder for each context keeps <span className="hl ok">{t.right}</span>.
    </>
  );
}

export function sinkCaption(id: SinkId, value: string, link: string): ReactNode {
  const sink = SINKS.find((s) => s.id === id)!;
  if (id === 'href') {
    const v = hrefVerdict(link);
    return isWebUrl(link) ? (
      <>The link value <b>{link}</b> is {v.kind === 'relative' ? 'a path on this site' : 'a web address'}, so the allow-list lets it through.</>
    ) : (
      <>The link value <b>{link}</b> {v.kind === 'other' ? <>uses the <span className="hl bad">{v.scheme}</span> scheme, which your app never meant to open</> : <>is not a web address</>}; the allow-list refuses it. Setting <code>href</code> unchecked would accept it.</>
    );
  }
  const kept = keptAsData(id, value);
  const pieces = throughSink(id, value).pieces.filter((p) => p.kind === 'element');
  if (sink.safe) return <><code>{sink.code}</code> never parses the value, so <b>{value}</b> lands as plain text, whatever it contains.</>;
  return kept ? (
    <><code>{sink.code}</code> parses the value as markup. <b>{value}</b> survives only because nothing in it looks like a tag: luck, not safety.</>
  ) : (
    <><code>{sink.code}</code> parses the value as markup, so <b>{value}</b> turns into {plural(pieces.length, 'element')} <span className="hl bad">{pieces.map((p) => p.text).join(' ')}</span> plus text. The safe line keeps it as text.</>
  );
}

export function damageCaption(l: Layers): ReactNode {
  const n = reachedCount(l);
  const reuse = reach(l).find((o) => o.id === 'reuse')!;
  const stoppers = activeStoppers(l);
  if (n === 0) return <>The injected script never runs: <span className="hl ok">{LAYER_LABELS.csp}</span> stopped it before it could reach anything. The earlier fix (encoding) is still the first line of defence.</>;
  return (
    <>
      The script ran and reaches {n} of {reach(l).length} things.
      {stoppers.includes('httpOnly') ? <> <span className="hl ok">HttpOnly</span> kept the cookie out of reach, but the script can still act as the user on the page.</> : <> The session cookie is readable{reuse.windowMin ? <>, so a copy would work for {windowText(reuse.windowMin)}</> : null}.</>}
      {' '}SameSite changes nothing here: the script&apos;s requests come from the site itself.
    </>
  );
}
