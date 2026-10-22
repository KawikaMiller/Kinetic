import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { provenanceCaption } from './captions';
import { shortHash } from './integrity';
import { MAX_NAME_CHARS, parseName } from './names';
import { INSTALL_DAY, initialProvenance } from './opening';
import { SCENARIO_LABEL, SCENARIO_ORDER, buildCase, passes, verify, type Check, type ScenarioId } from './provenance';
import { COMPROMISED_PACKAGE, COMPROMISED_VERSION } from './registry';
import { installAll } from './resolve';
import { holders, sbomOf } from './sbom';

interface Result {
  checks: Check[];
  artifactHash: string | null;
  signature: string | null;
}

/** Scene 4: verify a build attestation, and ask the SBOM which services contain a package. */
export function ProvenanceScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialProvenance);
  const { scenario, query } = state;
  const result = useAsyncValue<Result | null>(async () => {
    const c = await buildCase(scenario);
    if (c === null) return null;
    return { checks: await verify(c), artifactHash: c.attestation?.artifactHash ?? null, signature: c.attestation?.signature ?? null };
  }, scenario);
  const sboms = useMemo(() => sbomOf(installAll('ranges', 'before', { day: INSTALL_DAY, cooldown: 0 })), []);
  const parsed = parseName(query);
  const held = parsed.ok && parsed.value !== '' ? holders(sboms, parsed.value) : [];
  const ok = result ? passes(result.checks) : false;

  return (
    <StageFrame
      height={450}
      intro={provenanceCaption(result?.checks ?? null, ok, parsed.ok ? parsed.value : '', held, parsed.ok ? null : parsed.error)}
      introKey={[scenario, result ? String(ok) : 'pending', query]}
      stats={
        <Stats>
          <Stat label="Attestation" value={result === null ? 'checking' : ok ? 'verified' : 'rejected'} color={result === null ? 'var(--muted)' : ok ? 'var(--ok)' : 'var(--bad)'} sub={SCENARIO_LABEL[scenario]} />
          <Stat label="In the SBOM" value={held.length} color={held.some((h) => h.compromised) ? 'var(--bad)' : 'var(--info)'} sub={parsed.ok && parsed.value !== '' ? `services with ${parsed.value}` : 'type a package name'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a check passed', shape: 'square' },
            { color: 'var(--bad)', label: 'a check failed, or the compromised release', shape: 'square' },
            { color: 'var(--info)', label: 'a service that contains the package', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<ScenarioId> label="The artifact arrives as" value={scenario} onChange={(v) => setState((s) => ({ ...s, scenario: v }))} options={SCENARIO_ORDER.map((s) => ({ value: s, label: SCENARIO_LABEL[s] }))} />
        </>,
        <>
          <TextField label={`Which services contain (up to ${MAX_NAME_CHARS}: a-z 0-9 - @ /)`} value={query} onChange={(v) => setState((s) => ({ ...s, query: v }))} width={260} spellCheck={false} maxLength={MAX_NAME_CHARS + 8} />
          <Hint tone="muted" block>
            <span role="status" className="sc-status">
              {parsed.ok ? null : <span className="sc-error">{parsed.error}</span>}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="sc-stage stage-pad">
        <div className="sc-two">
          <div className="sc-block">
            <SectionTitle>Build attestation: artifact, builder and commit, chained and signed</SectionTitle>
            <table className="data-table">
              <tbody>
                {(result?.checks ?? []).map((c) => (
                  <tr key={c.id}>
                    <td style={{ color: c.ok ? 'var(--ok)' : 'var(--bad)' }}>{c.ok ? 'pass' : 'fail'}</td>
                    <td>{c.label}</td>
                  </tr>
                ))}
                {result === null && (
                  <tr>
                    <td colSpan={2}>Checking…</td>
                  </tr>
                )}
              </tbody>
            </table>
            {result?.artifactHash && <p className="sc-note">Attested artifact hash {shortHash(result.artifactHash)}; the signature is an HMAC under a fake demo key, standing in for a public-key signature.</p>}
            <p className="sc-note">Real systems of this kind include SLSA build levels, Sigstore signing and npm provenance (see the note below the scene).</p>
            <p className="sc-note">A passing attestation says who built the artifact from which commit. It does not say the code is benign.</p>
          </div>
          <div className="sc-block">
            <SectionTitle>The SBOM: every component and version, per service (resolved on day {INSTALL_DAY} with ranges)</SectionTitle>
            {sboms.map((s) => (
              <p key={s.service} className="sc-note">
                <b>{s.service}</b> ({s.components.length}):{' '}
                {s.components.map((c, i) => (
                  <span key={c.name} style={{ color: c.name === COMPROMISED_PACKAGE && c.version === COMPROMISED_VERSION ? 'var(--bad)' : held.some((h) => h.service === s.service) && c.name === query ? 'var(--info)' : undefined }}>
                    {i > 0 ? ', ' : ''}
                    {c.name}@{c.version}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the artifact hash and the HMAC are real crypto.subtle computations in your browser</Provenance>
        <Provenance kind="simulated">fictional builders, commits and keys; no package contains anything</Provenance>
        <Provenance kind="from-memory">SLSA, Sigstore and npm provenance are named, not reproduced: verify the current level definitions at slsa.dev</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
