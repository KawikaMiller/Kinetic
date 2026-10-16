import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { invoiceCaption } from './captions';
import { FIRST_ID, INVOICES, KNOWN_FOREIGN, LAST_ID, MODES, SIGNED_IN, adminExport, ownerName, reachable, respond, type Mode, type Role } from './invoices';
import { OPENING } from './opening';

const OTHERS = INVOICES.filter((i) => i.ownerId !== SIGNED_IN.id).length;

/** Scene 3: a simulated invoices API, an id you step, and the three server modes. */
export function InvoiceScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>(OPENING.invoices.mode);
  const [key, setKey] = useState<number | string>(OPENING.invoices.id);
  const [role, setRole] = useState<Role>(OPENING.invoices.role);
  const [roleCheck, setRoleCheck] = useState(OPENING.invoices.roleCheck);
  const r = respond(mode, SIGNED_IN.id, key);
  const ex = adminExport(role, roleCheck);
  const reach = reachable(mode, SIGNED_IN.id);
  const step = (d: number) => setKey((k) => (typeof k === 'number' ? Math.min(LAST_ID, Math.max(FIRST_ID, k + d)) : FIRST_ID));
  const numeric = typeof key === 'number' ? key : null;

  return (
    <StageFrame
      height={720}
      intro={invoiceCaption(mode, key, role, roleCheck)}
      introKey={`${mode}|${key}|${role}|${roleCheck}`}
      stats={
        <Stats>
          <Stat label="Other people's invoices reachable" value={`${reach} of ${OTHERS}`} color={reach ? 'var(--bad)' : 'var(--ok)'} sub={mode === 'unguessable' ? 'only the ids already held' : 'by stepping the id'} />
          <Stat label="This request" value={r.status} color={r.status === 200 && r.invoice && r.invoice.ownerId !== SIGNED_IN.id ? 'var(--bad)' : 'var(--ok)'} sub={r.body} />
          <Stat label="Admin export" value={ex.status} color={ex.status === 200 && role === 'member' ? 'var(--bad)' : 'var(--ok)'} sub={ex.status === 200 ? `${ex.rows} rows to a ${role}` : 'refused'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'someone else\'s record returned', shape: 'square' }, { color: 'var(--ok)', label: 'refused, or your own record', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Server mode" value={mode} options={MODES.map((m) => ({ value: m.id, label: m.label }))} onChange={setMode} />
        </>,
        <>
          <span className="ssrf-label">Invoice id</span>
          <Button softDisabled={numeric === null || numeric <= FIRST_ID} onClick={() => step(-1)} className="ssrf-step" aria-label="Previous invoice id">−</Button>
          <b className="ssrf-id">{numeric ?? 'opaque id'}</b>
          <Button softDisabled={numeric === null || numeric >= LAST_ID} onClick={() => step(1)} className="ssrf-step" aria-label="Next invoice id">+</Button>
          <ChipButton tone="orange" on={key === KNOWN_FOREIGN[0].token} onClick={() => setKey(KNOWN_FOREIGN[0].token)}>An id from a shared link</ChipButton>
          <ChipButton tone="orange" on={key === KNOWN_FOREIGN[1].token} onClick={() => setKey(KNOWN_FOREIGN[1].token)}>An id from a log line</ChipButton>
        </>,
        <>
          <Segmented label="Signed in as, for the export" value={role} options={[{ value: 'member', label: 'a member' }, { value: 'admin', label: 'an admin' }]} onChange={setRole} />
          <Toggle label="Role check on the admin export" value={roleCheck} onChange={setRoleCheck} off="off" on="on" />
        </>,
      ]}
    >
      <div className="ssrf-stage stage-pad">
        <p className="ssrf-note">{MODES.find((m) => m.id === mode)!.text} Alice Example is signed in and owns invoices {FIRST_ID} and {FIRST_ID + 1}. Every invoice, name and amount here is fictional.</p>
        <Box className="ssrf-panel">
          <SectionTitle>Request and response</SectionTitle>
          <code className="ssrf-request">GET /invoices/{typeof key === 'number' ? key : key}</code>
          <code className={`ssrf-response ${r.status === 200 && r.invoice && r.invoice.ownerId !== SIGNED_IN.id ? 'is-leak' : ''}`}>{r.status} {r.body}</code>
        </Box>
        <Box className="ssrf-panel ssrf-scroll" role="region" aria-label="Invoices and who can read them in this mode" tabIndex={0}>
          <table className="data-table ssrf-table">
            <thead><tr><th>Id</th><th>Owner</th><th>Readable by stepping the id</th></tr></thead>
            <tbody>
              {INVOICES.map((i) => {
                const readable = respond(mode, SIGNED_IN.id, i.id).status === 200;
                const foreign = i.ownerId !== SIGNED_IN.id;
                return (
                  <tr key={i.id} className={i.id === numeric ? 'ssrf-current' : undefined}>
                    <td>{i.id}</td>
                    <td>{ownerName(i.ownerId)}</td>
                    <td style={{ color: readable && foreign ? 'var(--bad)' : undefined }}>{readable ? (foreign ? 'yes: not theirs' : 'yes: their own') : 'no'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <p className="ssrf-note">Deny by default, check on every request, and do the check in one place: see the authorization models lesson. A random id is harder to guess, and it is not a check.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">a fictional invoices API with fake users and amounts; the ids that look random come from a seeded generator and are illustrative</Provenance>
        <Provenance kind="from-memory">broken access control has ranked at or near the top of recent OWASP Top 10 lists, and server-side request forgery has been listed separately or folded in depending on the edition; check the current list before quoting a rank</Provenance>
        <ClaimLabel kind="practice">the same "not found" for a missing and a forbidden record keeps existence from leaking</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
