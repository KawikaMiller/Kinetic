import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Slider } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { fakeSecret } from '../../core/fakeSecret';
import { CLASSES, monthlyBill, presign, readAfterWrite, toUrl, verify, type ConsistencyModel, type Method, type Presigned, type StorageClass, type Usage, type Verdict } from './access';
import { FILE_KEY } from './store';

const SECRET = fakeSecret('demo-', 'signing-', 'key');
const ISSUED_AT = 1_800_000_000;
const KEYS = [FILE_KEY, 'reports/2026/q2.csv'];
type Tamper = 'none' | 'key' | 'expiry' | 'method';

const money = (d: number) => `$${d.toFixed(2)}`;
const VERDICT_TEXT: Record<Verdict, string> = {
  ok: 'The store honours it: 200 OK',
  expired: 'The store refuses it: the link has expired (403)',
  'bad-signature': 'The store refuses it: the signature does not match what was asked for (403)',
};
const VERDICT_TONE: Record<Verdict, string> = { ok: 'os-ok', expired: 'os-warn', 'bad-signature': 'os-bad' };

function tampered(link: Presigned, how: Tamper): Presigned {
  switch (how) {
    case 'key':
      return { ...link, key: KEYS.find((k) => k !== link.key) ?? link.key };
    case 'expiry':
      return { ...link, expires: link.expires + 24 * 3600 };
    case 'method':
      return { ...link, method: link.method === 'GET' ? 'PUT' : 'GET' };
    default:
      return link;
  }
}

function PresignPanel() {
  const [method, setMethod] = useState<Method>('GET');
  const [minutes, setMinutes] = useState(15);
  const [after, setAfter] = useState(5);
  const [tamper, setTamper] = useState<Tamper>('none');
  const link = presign(SECRET, method, FILE_KEY, ISSUED_AT, minutes * 60);
  const used = tampered(link, tamper);
  const verdict = verify(SECRET, used, ISSUED_AT + after * 60);
  return (
    <Box className="os-panel">
      <SectionTitle hint="a link that carries its own permission">Presigned URL</SectionTitle>
      <code className="os-url">{toUrl(used)}</code>
      <div className="os-row">
        <Segmented label="Grants" value={method} onChange={setMethod} options={[{ value: 'GET', label: 'GET' }, { value: 'PUT', label: 'PUT' }]} />
        <Slider label="Valid for" value={minutes} min={1} max={60} onChange={setMinutes} format={(v) => `${v} min`} />
        <Slider label="Opened after" value={after} min={0} max={90} onChange={setAfter} format={(v) => `${v} min`} />
      </div>
      <Segmented
        label="Someone edits the link"
        value={tamper}
        onChange={setTamper}
        options={[
          { value: 'none', label: 'no' },
          { value: 'key', label: 'another key' },
          { value: 'expiry', label: 'later expiry' },
          { value: 'method', label: 'other method' },
        ]}
      />
      <p className={`os-verdict ${VERDICT_TONE[verdict]}`}>{VERDICT_TEXT[verdict]}</p>
      <p className="hint">The signature covers the method, the key and the expiry, and is made with a secret only the signer holds, so a holder can use the link but not change it. Anyone who has it can use it until it expires.</p>
    </Box>
  );
}

function ConsistencyPanel() {
  const [model, setModel] = useState<ConsistencyModel>('strong');
  const [reads, setReads] = useState<('new' | 'old')[] | null>(null);
  const overwrite = () => setReads([]);
  const read = () => setReads((r) => [...(r ?? []), readAfterWrite(model, (r ?? []).length)]);
  return (
    <Box className="os-panel">
      <SectionTitle hint="what a read sees right after an overwrite">Consistency</SectionTitle>
      <Segmented
        label="Store"
        value={model}
        onChange={(m) => {
          setModel(m);
          setReads(null);
        }}
        options={[
          { value: 'strong', label: 'strongly consistent' },
          { value: 'eventual', label: 'eventually consistent' },
        ]}
      />
      <div className="os-row">
        <Button onClick={overwrite}>PUT v2 over v1</Button>
        <Button disabled={reads === null} onClick={read}>
          GET it
        </Button>
      </div>
      <ul className="os-keylist">
        {reads === null && <li className="is-off">Overwrite the object first.</li>}
        {reads?.map((r, i) => (
          <li key={i} className={r === 'new' ? 'is-listed' : 'is-stale'}>
            GET {i + 1} returns {r === 'new' ? 'v2 (the new version)' : 'v1 (stale)'}
          </li>
        ))}
      </ul>
      <p className="hint">
        Amazon S3 has been strongly consistent for reads after writes, overwrites, deletes and listings since December 2020. Some other stores, caches and older systems are only eventually consistent,
        so check the one you use.
      </p>
    </Box>
  );
}

function CostPanel() {
  const [cls, setCls] = useState<StorageClass>('standard');
  const [usage, setUsage] = useState<Usage>({ storedGb: 100, writes: 10_000, reads: 1_000_000, readBackGb: 10, egressGb: 20 });
  const set = (patch: Partial<Usage>) => setUsage((u) => ({ ...u, ...patch }));
  const bill = monthlyBill(cls, usage);
  return (
    <Box className="os-panel">
      <SectionTitle hint="illustrative prices, not any provider's">A month's bill</SectionTitle>
      <Segmented label="Storage class" value={cls} onChange={setCls} options={CLASSES.map((c) => ({ value: c, label: c }))} />
      <div className="os-row">
        <Slider label="Stored" value={usage.storedGb} min={1} max={1000} onChange={(v) => set({ storedGb: v })} format={(v) => `${v} GB`} />
        <Slider label="Writes" value={usage.writes / 1000} min={0} max={1000} onChange={(v) => set({ writes: v * 1000 })} format={(v) => `${v}k`} />
        <Slider label="Reads" value={usage.reads / 1000} min={0} max={10_000} step={100} onChange={(v) => set({ reads: v * 1000 })} format={(v) => `${v}k`} />
        <Slider label="Read back" value={usage.readBackGb} min={0} max={100} onChange={(v) => set({ readBackGb: v })} format={(v) => `${v} GB`} />
        <Slider label="Sent to internet" value={usage.egressGb} min={0} max={100} onChange={(v) => set({ egressGb: v })} format={(v) => `${v} GB`} />
      </div>
      <table className="data-table">
        <tbody>
          <tr><td>Storage</td><td>{money(bill.storage)}</td></tr>
          <tr><td>Requests</td><td>{money(bill.requests)}</td></tr>
          <tr><td>Retrieval from the class</td><td>{money(bill.retrieval)}</td></tr>
          <tr><td>Egress to the internet</td><td>{money(bill.egress)}</td></tr>
          <tr className="os-total"><td>Total per month</td><td>{money(bill.total)}</td></tr>
        </tbody>
      </table>
      <p className="hint">Colder classes cost less to keep and more to read; storing is rarely the whole bill. Real prices also add minimum storage periods and per-region differences.</p>
    </Box>
  );
}

export function AccessScene({ picker }: { picker: ReactNode }) {
  useIntroCaption(<>Three things beyond the keys: who may fetch an object, what a read sees after a write, and what it all costs.</>);
  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'accepted, or the new version' },
            { color: 'var(--orange)', label: 'expired' },
            { color: 'var(--bad)', label: 'refused: signature mismatch, stale read' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="os stage-pad">
        <PresignPanel />
        <ConsistencyPanel />
        <CostPanel />
        <Hint block>Simulated store. The signature is a toy hash, not a real signing algorithm, and no real credential is involved; prices are made up.</Hint>
      </div>
    </StageFrame>
  );
}
