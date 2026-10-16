import { useState } from 'react';
import { ByteGrid, type ByteField } from '../../components/ByteGrid';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { bytes } from '../../core/format';
import { hierarchyCaption, envelopeBytes } from './captions';
import { decryptRecord, type DecryptResult, type Envelope } from './envelope';
import { OPENING } from './opening';
import type { VaultSceneProps } from './props';
import { MAX_TEXT, TENANTS, addRecord, checkText, tenantLabel, type TenantId } from './vault';

/** A single drawing column keeps the hierarchy readable on a phone. */
const HIERARCHY_MIN_WIDTH = 340;

function fieldsOf(e: Envelope): { data: number[]; fields: ByteField[] } {
  const parts = [
    { bytes: e.iv, tone: 'sky' as const, label: 'data IV' },
    { bytes: e.ciphertext.slice(0, e.ciphertext.length - 16), tone: 'muted' as const, label: 'ciphertext' },
    { bytes: e.ciphertext.slice(e.ciphertext.length - 16), tone: 'orange' as const, label: 'data tag' },
    { bytes: e.wrapped.iv, tone: 'sky' as const, label: 'wrap IV' },
    { bytes: e.wrapped.bytes, tone: 'ok' as const, label: 'wrapped DEK and tag' },
  ];
  const data: number[] = [];
  const fields: ByteField[] = [];
  for (const p of parts) {
    if (p.bytes.length === 0) continue;
    fields.push({ from: data.length, to: data.length + p.bytes.length - 1, tone: p.tone, label: p.label });
    data.push(...p.bytes);
  }
  return { data, fields };
}

/** Scene 1: three tenants, one KEK each, a fresh data key per record, and the envelope that is stored. */
export function HierarchyScene({ picker, vault, run, reset, busy }: VaultSceneProps) {
  const [tenant, setTenant] = useState<TenantId>(OPENING.tenant);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [last, setLast] = useState<{ id: string; result: DecryptResult; text: string | null } | null>(null);

  const mine = vault.records.filter((r) => r.tenant === tenant);
  const selected = mine.find((r) => r.id === pick) ?? mine[0];
  const kek = vault.kms.describe(tenant);
  const decrypted = last && selected && last.id === selected.id ? last : null;
  const shown = selected ? fieldsOf(selected) : null;

  const destroyed = vault.kms.isDestroyed(tenant);
  const add = () => {
    if (destroyed) return;
    const c = checkText(text);
    if (!c.ok) {
      setError(c.error);
      return;
    }
    setError(null);
    setText('');
    run((v) => addRecord(v, tenant, c.text));
  };

  const decrypt = async () => {
    if (!selected) return;
    const result = await decryptRecord(vault.kms, selected);
    setLast({ id: selected.id, result, text: result.ok ? result.text : null });
  };

  return (
    <StageFrame
      height={820}
      minWidth={HIERARCHY_MIN_WIDTH}
      intro={hierarchyCaption(tenant, vault.kms.version(tenant), selected, decrypted?.result ?? null)}
      introKey={`${tenant}|${selected?.id}|${selected?.wrapped.version}|${decrypted ? (decrypted.result.ok ? 'ok' : 'fail') : 'none'}|${mine.length}`}
      stats={
        <Stats>
          <Stat label="KEK version" value={kek ? `v${kek.version}` : 'destroyed'} color={kek ? 'var(--info)' : 'var(--bad)'} sub={kek ? (kek.extractable ? 'extractable' : 'WebCrypto will not export it') : 'no key left'} />
          <Stat label="Records" value={mine.length} sub={`${tenantLabel(tenant)}, each with its own data key`} />
          <Stat label="Envelope" value={selected ? bytes(envelopeBytes(selected)) : '–'} sub="IV, ciphertext, tag, wrapped key" />
          <Stat label="KMS calls" value={vault.kms.calls} sub="wraps and unwraps so far" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'root key (named, not modelled)', shape: 'square' },
            { color: 'var(--info)', label: 'KEK', shape: 'square' },
            { color: 'var(--hi)', label: 'DEK in use now', shape: 'square' },
            { color: 'var(--ok)', label: 'wrapped DEK (protected)', shape: 'square' },
            { color: 'var(--muted)', label: 'data bytes', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Tenant" value={tenant} options={TENANTS.map((t) => ({ value: t.id, label: t.label }))} onChange={(t) => { setTenant(t); setPick(null); setLast(null); }} />
        </>,
        <>
          <TextField label="New record" value={text} onChange={setText} onEnter={add} maxLength={MAX_TEXT} width={280} placeholder="made-up text, never a real secret" spellCheck={false} />
          <Button softDisabled={busy || destroyed} onClick={add}>Encrypt and store</Button>
          <Button softDisabled={busy || !selected} onClick={decrypt}>Decrypt the selected record</Button>
          <Button softDisabled={busy} onClick={() => { reset(); setLast(null); setPick(null); setError(null); }}>Rebuild the vault</Button>
        </>,
        <>
          <span className="ek-label">Records of {tenantLabel(tenant)}</span>
          {mine.map((r) => <ChipButton key={r.id} tone="info" on={r.id === selected?.id} onClick={() => setPick(r.id)}>{r.id}</ChipButton>)}
        </>,
      ]}
    >
      <div className="ek-stage stage-pad">
        {error && <p className="ek-error" role="alert">{error}</p>}
        <div className="ek-levels" role="group" aria-label="Key hierarchy">
          <div className="ek-level is-root"><b>Root key</b><span>in hardware at a real service (named here, not modelled)</span></div>
          <div className="ek-arrow" aria-hidden="true">wraps ↓</div>
          <div className="ek-level is-kek"><b>KEK for {tenantLabel(tenant)}, {kek ? `version ${kek.version}` : 'destroyed'}</b><span>a non-extractable CryptoKey inside the simulated KMS</span></div>
          <div className="ek-arrow" aria-hidden="true">wraps ↓</div>
          <div className={`ek-level is-dek${decrypted?.result.ok ? ' is-live' : ''}`}><b>DEK, one per record</b><span>256 bits, stored only wrapped; the plaintext key is dropped after use</span></div>
          <div className="ek-arrow" aria-hidden="true">encrypts ↓</div>
          <div className="ek-level is-data"><b>Data</b><span>{selected ? `${selected.id}: ${bytes(selected.ciphertext.length)} of ciphertext` : 'no record selected'}</span></div>
        </div>
        {shown && selected && (
          <Box className="ek-panel">
            <SectionTitle hint="what is stored for the selected record">Envelope</SectionTitle>
            <ByteGrid bytes={shown.data} fields={shown.fields} perRow={8} ariaLabel={`Stored envelope of ${selected.id}`} />
          </Box>
        )}
        {selected && (
          <ol className="ek-steps">
            <li>Read the envelope for {selected.id}: the context is "{selected.context}".</li>
            <li>Ask the KMS to unwrap the data key with {tenantLabel(selected.tenant)}'s KEK version {selected.wrapped.version}, bound to that context.</li>
            <li>Decrypt with AES-GCM, with "{selected.id}" as additional data: a changed byte or a different id fails authentication.</li>
          </ol>
        )}
        <ConsolePanel lines={decrypted ? [decrypted.result.ok ? { text: `decrypted: ${decrypted.text}`, tone: 'ok' } : { text: `refused (${decrypted.result.errorName}): ${decrypted.result.reason}`, tone: 'bad' }] : []} title="decrypt" empty="press Decrypt" />
        <p className="ek-note">The page stores nothing: records live in memory until you reload. Type made-up text only.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">the KMS is a service object in this page; a real KMS keeps keys in hardware and enforces access policy</Provenance>
        <Provenance kind="real">the AES-GCM encryption and the key wrapping are real WebCrypto, run in your browser</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
