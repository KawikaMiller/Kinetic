import { useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { hasSubtle } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { REJECT_TEXT, SIGNATURE_ACTORS, signatureCaption, signatureLadder } from './frames';
import { BODY, SECRET, SIGNED_AT, TOLERANCE_S, inspect, signedDelivery, tamper, type Inspection, type Received } from './signature';

const MAX_AGE_MIN = 10;
const HONEST = 'Signatures are computed for real in your browser (HMAC-SHA-256 through Web Crypto); the provider, the receiver and the secret are simulated, and the 5-minute tolerance is illustrative.';

/** The two hex strings, with the digits that differ marked: a changed byte changes the whole MAC. */
function HexRow({ label, hex, other, tone }: { label: string; hex: string; other: string; tone: 'sent' | 'expected' }) {
  return (
    <div className="wh-hex">
      <span className="wh-hex-label">{label}</span>
      <code className={`wh-hex-digits is-${tone}`}>
        {[...hex].map((c, i) => <span key={i} className={c !== other[i] ? 'is-diff' : ''}>{c}</span>)}
      </code>
    </div>
  );
}

function checkLines(r: Inspection): { lines: string[]; state: (i: number) => LineState } {
  const lines = [
    'signed   = timestamp + "." + body',
    'expected = HMAC_SHA256(secret, signed)',
    'if not constant_time_equal(expected, received): reject 400',
    `if now - timestamp > ${TOLERANCE_S / 60} min: reject 400 (replay)`,
    'accept: answer 200 now, process later',
  ];
  const v = r.verdict;
  const failAt = v.ok ? -1 : v.reason === 'bad-signature' ? 2 : v.reason === 'stale' || v.reason === 'future' ? 3 : 0;
  return {
    lines,
    state: (i) => (v.ok ? 'done' : i < failAt ? 'done' : i === failAt ? 'bad' : 'idle'),
  };
}

export function SignatureScene({ picker }: { picker: ReactNode }) {
  const [edited, setEdited] = useState(false);
  const [ageMin, setAgeMin] = useState(0);
  const res = useAsyncValue<{ rec: Received; r: Inspection } | null>(async () => {
    const d = await signedDelivery();
    if (!d) return null;
    const rec = { ...d, body: edited ? tamper(BODY) : BODY };
    const r = await inspect(SECRET, rec, SIGNED_AT + ageMin * 60);
    return r ? { rec, r } : null;
  }, `${edited}|${ageMin}`);
  const checks = res ? checkLines(res.r) : null;
  const noCrypto = !hasSubtle();
  useIntroCaption(
    res ? signatureCaption(res.r, edited)
      : noCrypto ? <>Signing needs Web Crypto, which browsers only offer on https or localhost. Open the lesson there to see real signatures.</>
        : <>Signing the delivery…</>,
    [res, noCrypto, edited],
  );

  return (
    <StageFrame
      height={560}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'delivery' }, { color: 'var(--ok)', label: 'verified' }, { color: 'var(--bad)', label: 'bad signature / stale / differing digit' },
      ]} />}
      controls={[
        <>{picker}</>,
        <>
          <Toggle label="Body in transit" value={edited} onChange={setEdited} off="Unchanged" on="One character edited" />
          <Slider label="Arrives" value={ageMin} min={0} max={MAX_AGE_MIN} onChange={setAgeMin} format={(m) => (m === 0 ? 'right away' : `${m} min after signing`)} />
        </>,
      ]}
    >
      <div className="stage-pad wh">
        {res ? (
          <>
            <SequenceDiagram actors={SIGNATURE_ACTORS} messages={signatureLadder(res.r, edited, ageMin * 60)} ariaLabel="Signed webhook delivery" />
            <div className="wh-cols">
              <div className="wh-col">
                <SectionTitle weight="regular" hint="what arrives">Request</SectionTitle>
                <CodePanel gutter="none" className="wh-req" lines={[
                  'POST /webhooks HTTP/1.1', `Webhook-Timestamp: ${res.rec.timestampHeader}`, `Webhook-Signature: ${res.rec.signatureHeader.slice(0, 15)}…`, '', res.rec.body,
                ]} stateOf={(i) => (i === 4 && edited ? 'bad' : 'idle')} />
                <HexRow label="signature sent" hex={res.r.given!} other={res.r.expected!} tone="sent" />
                <HexRow label="receiver computes" hex={res.r.expected!} other={res.r.given!} tone="expected" />
                <p className="wh-note">{res.r.differing === 0 ? 'All 64 hex digits match.' : `${res.r.differing} of 64 hex digits differ.`} Secret: <code>{SECRET}</code> (a fake demo value, shared by both sides).</p>
              </div>
              <div className="wh-col">
                <SectionTitle weight="regular" hint={res.r.verdict.ok ? 'accepted' : REJECT_TEXT[(res.r.verdict as { reason: keyof typeof REJECT_TEXT }).reason]}>What the receiver checks</SectionTitle>
                <CodePanel gutter="number" lines={checks!.lines} stateOf={checks!.state} />
                <p className="wh-note">
                  The signature is checked before the timestamp is believed: the timestamp is part of what was signed, so a replayer can't just change it.
                  Age here: {ageMin} min.
                </p>
              </div>
            </div>
          </>
        ) : <p className="empty-note">{noCrypto ? 'Needs Web Crypto (https or localhost).' : 'Signing…'}</p>}
        <Hint block>
          {HONEST} Anyone who learns your URL can send it requests, so an unguessable URL is not security: the signature is. Compare signatures with your
          language's constant-time function (Node's <code>crypto.timingSafeEqual</code>, Python's <code>hmac.compare_digest</code>), as in <code>macs-hmac</code>;
          this page compares plainly because nothing here can measure timing. A replay inside the window still passes the check, which is why consumers also dedupe by event id.
        </Hint>
      </div>
    </StageFrame>
  );
}
