import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, Segmented, TextField, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { makeContract, mismatchText, parsePasted, verify, contractJson } from './contract';
import { providerCaption } from './captions';
import { DEFAULT_CONSUMER, readsOf, type ConsumerOptions } from './consumer';
import { contractOf } from './deploy';
import { CHANGES, FULL_SCHEMA, handle, handlerLines, type ChangeId } from './provider';

type Target = 'provider' | 'pasted';
const TARGETS: { value: Target; label: string }[] = [
  { value: 'provider', label: 'The provider handler' },
  { value: 'pasted', label: 'A response I paste' },
];
const PASTE_START = '{"id":42,"name":"Ada","amount":2500}';

export function VerifyScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [changes, setChanges] = useState<ReadonlySet<ChangeId>>(new Set());
  const [options, setOptions] = useState<ConsumerOptions>(DEFAULT_CONSUMER);
  const [target, setTarget] = useState<Target>('provider');
  const [pasted, setPasted] = useState(PASTE_START);

  const caption = useMemo(() => providerCaption(options, changes), [options, changes]);
  useEffect(() => {
    if (target === 'provider') setCaption(caption, { quiet: true });
  }, [caption, target, setCaption]);

  const contract = contractOf(readsOf(options));
  const parsed = useMemo(() => (target === 'pasted' ? parsePasted(pasted) : null), [target, pasted]);
  const response = target === 'provider' ? handle(changes) : parsed?.ok ? { status: contract.status, body: parsed.value } : null;
  const mismatches = response ? verify(contract, response) : [];
  const full = response ? verify(makeContract(FULL_SCHEMA), response) : [];
  useEffect(() => {
    if (target === 'pasted') {
      setCaption(parsed?.ok ? `Verifying your pasted response: ${plural(mismatches.length, 'mismatch', 'mismatches')}.` : parsed?.error ?? '', { quiet: true });
    }
  }, [target, parsed, mismatches.length, setCaption]);

  const flip = (id: ChangeId) =>
    setChanges((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <StageFrame
      height={540}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'passes' },
            { color: 'var(--bad)', label: 'a mismatch' },
            { color: 'var(--hi)', label: 'the mismatch path' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="ct-chips" role="group" aria-label="Changes to the provider">
            {CHANGES.map((c) => <ChipButton key={c.id} tone="info" on={changes.has(c.id)} onClick={() => flip(c.id)}>{c.label}</ChipButton>)}
          </div>
        </>,
        <>
          <Toggle label="The consumer also shows the email" value={options.showEmail} onChange={(showEmail) => setOptions((o) => ({ ...o, showEmail }))} off="no" on="yes" />
          <Segmented label="Verify against" value={target} onChange={setTarget} options={TARGETS} />
          {target === 'pasted' && <TextField label="Pasted response body (JSON, up to 2 KB)" value={pasted} onChange={setPasted} width={320} spellCheck={false} />}
        </>,
      ]}
    >
      <div className="stage-pad ct">
        <div className="ct-pair">
          <CodePanel title="The provider's handler" lines={handlerLines(changes)} gutter="none" />
          <CodePanel title="The consumer's contract" lines={contractJson(contract)} gutter="none" />
        </div>
        <Box className="ct-card">
          <SectionTitle weight="regular" hint={target === 'provider' ? 'replayed against the real handler' : 'replayed against your paste'}>Verify</SectionTitle>
          {parsed && !parsed.ok && <span className="chip tone-bad wrap" role="alert">{parsed.error}</span>}
          {response && mismatches.length === 0 && <span className="chip tone-ok">passes: every field the consumer reads is there with the right type</span>}
          <ul className="ct-list">
            {mismatches.map((m) => (
              <li key={m.path} className="log-row tone-bad"><b className="ct-path">{m.path}</b>: expected {m.expected}, got {m.got}</li>
            ))}
          </ul>
        </Box>
        <Box className="ct-card">
          <SectionTitle weight="regular" hint="the naive alternative">A full-schema test of the same response</SectionTitle>
          {response && (
            <>
              <span className={`chip tone-${full.length ? 'bad' : 'ok'}`}>{full.length ? `${plural(full.length, 'failure')}` : 'passes'}</span>
              <ul className="ct-list">{full.slice(0, 3).map((m) => <li key={m.path} className="log-row tone-bad">{mismatchText(m)}</li>)}</ul>
              <p className="muted">It asserts every field the provider ever sent, so it fails when something nobody reads is removed: a false alarm that a contract does not raise.</p>
            </>
          )}
        </Box>
        <div className="ct-chips">
          <Provenance kind="toy">a simplified contract format inspired by Pact; real tools do more</Provenance>
          <Provenance kind="real">the handler and the matcher both run here</Provenance>
        </div>
        <Hint block>Extra fields in a response are allowed, and only a response's own keys are looked at.</Hint>
      </div>
    </StageFrame>
  );
}
