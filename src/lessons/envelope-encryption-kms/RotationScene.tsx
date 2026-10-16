import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { sha256Hex, toHex } from '../../core/crypto';
import { bytes, integer, ratioText } from '../../core/format';
import { rotationCaption, type RotationReport } from './captions';
import type { Envelope } from './envelope';
import { WRAPPED_BYTES } from './envelope';
import { OPENING } from './opening';
import type { VaultSceneProps } from './props';
import { TENANTS, rotateDek, rotateTenant, tenantLabel, type TenantId } from './vault';

const SHORT = 12;
/** The records slider is an exponent: 10 to the power of it. */
const RECORD_EXPONENT = { min: 0, max: 6 } as const;
const SIZE_KIB = { min: 1, max: 64 } as const;
const KIB = 1024;

const concatHex = (e: Envelope) => toHex(e.iv) + toHex(e.ciphertext);
const hash = async (hex: string) => (await sha256Hex(hex))!.slice(0, SHORT);

async function snapshot(records: readonly Envelope[]) {
  return Promise.all(records.map(async (e) => ({ id: e.id, data: await hash(concatHex(e)), wrap: await hash(toHex(e.wrapped.bytes)), version: e.wrapped.version })));
}

/** Scene 2: rotate a KEK, and see which bytes changed and which did not. */
export function RotationScene({ picker, vault, run, reset, busy }: VaultSceneProps) {
  const [tenant, setTenant] = useState<TenantId>(OPENING.tenant);
  const [exponent, setExponent] = useState<number>(OPENING.rotation.exponent);
  const [kib, setKib] = useState<number>(OPENING.rotation.kib);
  const [report, setReport] = useState<RotationReport | null>(null);

  const mine = vault.records.filter((r) => r.tenant === tenant);
  const records = 10 ** exponent;
  const recordBytes = kib * KIB;
  const rewrap = records * WRAPPED_BYTES;
  const reencrypt = records * recordBytes;

  const rotate = (kind: 'kek' | 'dek') => {
    const before = vault.records.filter((r) => r.tenant === tenant);
    const target = before[0];
    if (!target) return;
    run(async (v) => {
      const pre = await snapshot(kind === 'kek' ? before : [target]);
      const next = kind === 'kek' ? await rotateTenant(v, tenant) : await rotateDek(v, target.id);
      const after = await snapshot(next.records.filter((r) => pre.some((p) => p.id === r.id)));
      setReport({
        kind,
        rows: pre.map((p, i) => ({ id: p.id, dataBefore: p.data, dataAfter: after[i].data, wrapBefore: p.wrap, wrapAfter: after[i].wrap, versionBefore: p.version, versionAfter: after[i].version })),
      });
      return next;
    });
  };

  return (
    <StageFrame
      height={760}
      intro={rotationCaption(report, records, recordBytes)}
      introKey={`${report ? report.kind + report.rows.map((r) => r.dataAfter + r.wrapAfter).join() : 'none'}|${exponent}|${kib}`}
      stats={
        <Stats>
          <Stat label="Re-wrap touches" value={bytes(rewrap, { iec: true })} color="var(--ok)" sub={`${integer(records)} records x ${WRAPPED_BYTES} bytes`} />
          <Stat label="Re-encrypt touches" value={bytes(reencrypt, { iec: true })} color="var(--bad)" sub={`${integer(records)} records x ${bytes(recordBytes, { iec: true })}`} />
          <Stat label="Ratio" value={`${ratioText(reencrypt / rewrap)} x`} sub="re-encrypting against re-wrapping" />
          <Stat label="KEK version" value={`v${vault.kms.version(tenant)}`} color="var(--info)" sub={tenantLabel(tenant)} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'the cheap path: re-wrap, or bytes that did not change', shape: 'square' }, { color: 'var(--bad)', label: 'the costly path: re-encrypt the data', shape: 'square' }, { color: 'var(--info)', label: 'KEK', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Tenant" value={tenant} options={TENANTS.map((t) => ({ value: t.id, label: t.label }))} onChange={(t) => { setTenant(t); setReport(null); }} />
          <Button softDisabled={busy || mine.length === 0} onClick={() => rotate('kek')}>Rotate {tenantLabel(tenant)}'s KEK</Button>
          <Button softDisabled={busy || mine.length === 0} onClick={() => rotate('dek')}>Rotate one record's DEK</Button>
          <Button softDisabled={busy} onClick={() => { reset(); setReport(null); }}>Rebuild the vault</Button>
        </>,
        <>
          <Slider label="Records in the tenant" value={exponent} min={RECORD_EXPONENT.min} max={RECORD_EXPONENT.max} onChange={setExponent} format={(e) => integer(10 ** e)} />
          <Slider label="Average record size" value={kib} min={SIZE_KIB.min} max={SIZE_KIB.max} onChange={setKib} format={(k) => bytes(k * KIB, { iec: true })} />
        </>,
      ]}
    >
      <div className="ek-stage stage-pad">
        <Box className="ek-panel" role="region" aria-label="Hashes before and after the last rotation" tabIndex={0}>
          <SectionTitle hint={report ? (report.kind === 'kek' ? 'KEK rotation' : 'one record re-encrypted') : 'press a rotate button'}>What changed</SectionTitle>
          {report ? (
            <table className="data-table ek-table">
              <thead><tr><th>Record</th><th>Data (IV and ciphertext)</th><th>Wrapped DEK</th><th>KEK</th></tr></thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td style={{ color: r.dataBefore === r.dataAfter ? 'var(--ok)' : 'var(--bad)' }}>{r.dataBefore === r.dataAfter ? `unchanged ${r.dataAfter}` : `${r.dataBefore} to ${r.dataAfter}`}</td>
                    <td style={{ color: r.wrapBefore === r.wrapAfter ? undefined : 'var(--ok)' }}>{r.wrapBefore === r.wrapAfter ? `unchanged ${r.wrapAfter}` : `${r.wrapBefore} to ${r.wrapAfter}`}</td>
                    <td>v{r.versionBefore} to v{r.versionAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ek-note">{mine.length} records of {tenantLabel(tenant)}. The table shows the first {SHORT} hex digits of a SHA-256 of the stored bytes, taken before and after.</p>
          )}
        </Box>
        <p className="ek-note">Re-wrapping unwraps each data key under the old KEK version inside the KMS and wraps it under the new one; the data is not decrypted and not touched. Re-encrypting is the only way to change a data key itself.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">hashes of the real stored bytes, before and after a real re-wrap in WebCrypto</Provenance>
        <Provenance kind="illustrative">the records and size sliders scale the measured {WRAPPED_BYTES}-byte wrapped key; no real tenant is this size</Provenance>
        <Provenance kind="from-memory">AWS KMS has a ReEncrypt operation that moves ciphertext to a new key without showing the caller the plaintext; check the AWS documentation</Provenance>
        <ClaimLabel kind="practice">rotating a KEK by re-wrapping is how envelope schemes keep rotation cheap</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
