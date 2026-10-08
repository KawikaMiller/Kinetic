import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { listingCaption } from './frames';
import { DEMO_KEYS, listObjects, listRequest, MAX_PREFIX_CHARS, type Entry } from './listing';

type Delimiter = 'none' | 'slash';
const DEFAULT_PREFIX = 'reports/';
const DEFAULT_MAX_KEYS = 3;

export function ListingScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(DEFAULT_PREFIX);
  const [delimiter, setDelimiter] = useState<Delimiter>('slash');
  const [maxKeys, setMaxKeys] = useState(DEFAULT_MAX_KEYS);
  const [pages, setPages] = useState<Entry[]>([]);
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const setCaption = useSetCaption();
  useIntroCaption(<>Keys are one flat list. A prefix and a delimiter ask the store to fold it into folders, a page at a time.</>);

  const tooLong = text.length > MAX_PREFIX_CHARS;
  const delim = delimiter === 'slash' ? '/' : null;
  const after = pages.at(-1) ?? null;
  const page = useMemo(() => listObjects(DEMO_KEYS, { prefix, delimiter: delim, maxKeys, after }), [prefix, delim, maxKeys, after]);
  const matching = DEMO_KEYS.filter((k) => k.startsWith(prefix)).length;

  const restart = (next: { prefix?: string; delimiter?: Delimiter; maxKeys?: number }) => {
    const p = next.prefix ?? prefix;
    const d = (next.delimiter ?? delimiter) === 'slash' ? '/' : null;
    const m = next.maxKeys ?? maxKeys;
    setPages([]);
    setCaption(listingCaption(p, d, listObjects(DEMO_KEYS, { prefix: p, delimiter: d, maxKeys: m, after: null })), { quiet: true });
  };

  const onText = (t: string) => {
    setText(t);
    if (t.length <= MAX_PREFIX_CHARS) {
      setPrefix(t);
      restart({ prefix: t });
    }
  };
  const next = () => {
    if (!page.next) return;
    setPages((p) => [...p, page.next as Entry]);
    setCaption(listingCaption(prefix, delim, listObjects(DEMO_KEYS, { prefix, delimiter: delim, maxKeys, after: page.next })), { quiet: true });
  };

  const shown = new Set(page.entries.filter((e) => e.kind === 'key').map((e) => e.name));
  const folders = page.entries.filter((e) => e.kind === 'prefix').map((e) => e.name);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Keys in the bucket" value={DEMO_KEYS.length} />
          <Stat label="Under the prefix" value={matching} />
          <Stat label="On this page" value={page.entries.length} />
          <Stat label="Truncated" value={page.truncated ? 'yes' : 'no'} color={page.truncated ? 'var(--hi)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'key listed on this page' },
            { color: 'var(--violet)', label: 'common prefix (a fake folder)' },
            { color: 'var(--dim)', label: 'outside the prefix' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="Prefix" value={text} onChange={onText} width={220} spellCheck={false} />
          <Segmented
            label="Delimiter"
            value={delimiter}
            onChange={(d) => {
              setDelimiter(d);
              restart({ delimiter: d });
            }}
            options={[
              { value: 'slash', label: '/' },
              { value: 'none', label: 'none' },
            ]}
          />
          <Slider
            label="Max keys per page"
            value={maxKeys}
            min={1}
            max={6}
            onChange={(m) => {
              setMaxKeys(m);
              restart({ maxKeys: m });
            }}
          />
        </>,
        <>
          <Button variant="primary" disabled={!page.next} onClick={next}>
            Next page
          </Button>
          <Button disabled={pages.length === 0} onClick={() => restart({})}>
            First page
          </Button>
          <Hint>{pages.length === 0 ? 'Page 1' : `Page ${pages.length + 1}`}</Hint>
        </>,
      ]}
    >
      <div className="os stage-pad">
        {tooLong && (
          <p className="os-error" role="alert">
            A prefix is at most {MAX_PREFIX_CHARS} characters here, so this one is not used. Still listing {JSON.stringify(prefix)}.
          </p>
        )}
        <div className="os-cols os-two">
          <Box>
            <SectionTitle hint="the whole bucket, sorted">Keys</SectionTitle>
            <ul className="os-keylist">
              {[...DEMO_KEYS].sort().map((k) => {
                const slash = k.lastIndexOf('/');
                const under = k.startsWith(prefix);
                const listed = shown.has(k);
                return (
                  <li key={k} className={listed ? 'is-listed' : under ? '' : 'is-off'}>
                    {slash >= 0 && <span className="os-prefix">{k.slice(0, slash + 1)}</span>}
                    {k.slice(slash + 1)}
                  </li>
                );
              })}
            </ul>
          </Box>
          <Box>
            <SectionTitle hint={page.truncated ? 'truncated' : 'complete'}>This page</SectionTitle>
            <ul className="os-keylist">
              {page.entries.length === 0 && <li className="is-off">nothing matches</li>}
              {page.entries.map((e) => (
                <li key={`${e.kind}:${e.name}`} className={e.kind === 'key' ? 'is-listed' : 'is-folder'}>
                  {e.kind === 'prefix' ? <>{e.name} <em>common prefix</em></> : e.name}
                </li>
              ))}
            </ul>
            <p className="hint">
              {folders.length > 0 ? `${plural(folders.length, 'folder')} here are only a shared prefix: nothing was created.` : 'No delimiter folding on this page.'}
              {page.next ? ` Next page starts after ${page.next.name}.` : ''}
            </p>
          </Box>
        </div>
        <CodePanel title="HTTP request" lines={[listRequest(prefix, delim, maxKeys, after)]} gutter="none" active={0} />
        <Hint block>
          Simulated bucket with fictional keys. Real stores sort keys by their UTF-8 bytes, return at most 1,000 keys per page, and count keys and common prefixes together towards that limit, as here.
        </Hint>
      </div>
    </StageFrame>
  );
}
