import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { shredCaption } from './captions';
import { decryptRecord, type Envelope } from './envelope';
import { OPENING } from './opening';
import type { VaultSceneProps } from './props';
import { TENANTS, destroyTenant, tenantLabel, type TenantId, type Vault } from './vault';

type Reading = { id: string; tenant: string; live: boolean; backup: boolean };

async function readAll(v: Vault): Promise<Reading[]> {
  const ok = async (e: Envelope | undefined) => (e ? (await decryptRecord(v.kms, e)).ok : false);
  return Promise.all(v.records.map(async (r) => ({ id: r.id, tenant: r.tenant, live: await ok(r), backup: await ok(v.backup.find((b) => b.id === r.id)) })));
}

/** Scene 3: destroy a tenant's KEK, and try a record under the wrong key or the wrong context. */
export function ShredScene({ picker, vault, run, reset, busy }: VaultSceneProps) {
  const [tenant, setTenant] = useState<TenantId>(OPENING.tenant);
  const [note, setNote] = useState<string | null>(null);
  const readings = useAsyncValue(() => readAll(vault), vault.rev, { keepPrevious: true });

  const mine = (readings ?? []).filter((r) => r.tenant === tenant);
  const status = { live: mine.filter((r) => r.live).length, liveTotal: mine.length, backup: mine.filter((r) => r.backup).length, backupTotal: mine.length };
  const destroyed = vault.kms.isDestroyed(tenant);
  const first = vault.records.find((r) => r.tenant === tenant);
  const other = TENANTS.find((t) => t.id !== tenant)!;
  const otherRecord = vault.records.find((r) => r.tenant === other.id);

  const attempt = async (e: Envelope | undefined, kekTenant: string, context: string, what: string) => {
    if (!e) return;
    const r = await decryptRecord(vault.kms, e, { kekTenant, context });
    setNote(r.ok ? `${what}: it decrypted.` : `${what}: refused with ${r.errorName} (${r.reason}).`);
  };

  return (
    <StageFrame
      height={720}
      intro={shredCaption(tenant, destroyed, status, note)}
      introKey={`${tenant}|${destroyed}|${status.live}|${status.backup}|${note}`}
      stats={
        <Stats>
          <Stat label="Readable now" value={`${status.live} of ${status.liveTotal}`} color={status.live ? 'var(--ok)' : 'var(--bad)'} sub={`${tenantLabel(tenant)}'s live records`} />
          <Stat label="Readable from backup" value={`${status.backup} of ${status.backupTotal}`} color={status.backup ? 'var(--ok)' : 'var(--bad)'} sub="the backup copy made when the vault was built" />
          <Stat label="Ciphertext bytes" value="unchanged" sub="destroying a key changes no data" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'readable', shape: 'square' }, { color: 'var(--bad)', label: 'unreadable: key gone, or authentication failed', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Tenant" value={tenant} options={TENANTS.map((t) => ({ value: t.id, label: t.label }))} onChange={(t) => { setTenant(t); setNote(null); }} />
          <Button softDisabled={busy || destroyed} onClick={() => { run(async (v) => destroyTenant(v, tenant)); setNote(`${tenantLabel(tenant)}'s KEK is destroyed.`); }}>Destroy {tenantLabel(tenant)}'s KEK</Button>
          <Button softDisabled={busy} onClick={() => { reset(); setNote(null); }}>Rebuild the vault</Button>
        </>,
        <>
          <Button softDisabled={!otherRecord} onClick={() => attempt(otherRecord, tenant, tenant, `${other.label}'s record presented to ${tenantLabel(tenant)}'s key`)}>Present {other.label}'s record to {tenantLabel(tenant)}'s key</Button>
          <Button softDisabled={!otherRecord} onClick={() => attempt(otherRecord, other.id, tenant, `${other.label}'s key with ${tenantLabel(tenant)}'s context`)}>Right key, wrong context</Button>
          <Button softDisabled={!first} onClick={() => attempt(first, tenant, tenant, `${tenantLabel(tenant)}'s own record, honestly`)}>Decrypt {tenantLabel(tenant)}'s first record</Button>
        </>,
      ]}
    >
      <div className="ek-stage stage-pad">
        <Box className="ek-panel" role="region" aria-label="Records, live and in the backup" tabIndex={0}>
          <SectionTitle hint="real decryptions, run on every change">Records</SectionTitle>
          <table className="data-table ek-table">
            <thead><tr><th>Record</th><th>Tenant</th><th>Live</th><th>Backup copy</th></tr></thead>
            <tbody>
              {(readings ?? []).map((r) => (
                <tr key={r.id} className={r.tenant === tenant ? 'ek-current' : undefined}>
                  <td>{r.id}</td>
                  <td>{tenantLabel(r.tenant)}</td>
                  <td style={{ color: r.live ? 'var(--ok)' : 'var(--bad)' }}>{r.live ? 'readable' : 'unreadable'}</td>
                  <td style={{ color: r.backup ? 'var(--ok)' : 'var(--bad)' }}>{r.backup ? 'readable' : 'unreadable'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <p className="ek-note">A shred only protects data that was always encrypted under that key. A copy of the plaintext made anywhere else survives it. A failure here is a real WebCrypto authentication error, not a scripted message; a destroyed key is the KMS having nothing left to try.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">the KMS is a service object in this page, and destroying a key here is immediate</Provenance>
        <Provenance kind="real">each readable or unreadable mark is a real decryption attempt in WebCrypto</Provenance>
        <Provenance kind="from-memory">real services impose a waiting period before a key is deleted (AWS KMS and Google Cloud KMS both do, as far as recalled); check both providers' documentation for the periods</Provenance>
        <ClaimLabel kind="practice">crypto-shredding is used to make deletion cover copies and backups</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
