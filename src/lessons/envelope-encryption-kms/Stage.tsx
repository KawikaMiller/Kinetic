import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { Provenance, ProvenanceRow } from '../../components/ui';
import { hasSubtle } from '../../core/crypto';
import { HierarchyScene } from './HierarchyScene';
import { OPENING, type SceneId } from './opening';
import { RotationScene } from './RotationScene';
import { ShredScene } from './ShredScene';
import { WorkloadScene } from './WorkloadScene';
import { buildVault, type Vault } from './vault';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'hierarchy', label: 'Keys and the envelope' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'shred', label: 'Shredding and context' },
  { value: 'workload', label: 'Why not the master key' },
];

/** Shown while the vault is being built, or when WebCrypto is not available (it needs https or localhost). */
function Waiting({ picker, secure }: { picker: ReactNode; secure: boolean }) {
  return (
    <StageFrame height={320} intro={secure ? 'Making the keys for the simulated KMS in your browser.' : 'WebCrypto is not available here: it needs a secure page (https or localhost).'} controls={[<>{picker}</>]}>
      <div className="ek-stage stage-pad">
        <p className="ek-note">{secure ? 'Generating three key-encryption keys and six example envelopes with the real WebCrypto API.' : 'Without crypto.subtle the lesson cannot run its real encryption.'}</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the encryption is real WebCrypto, which only exists on secure pages</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  const [vault, setVault] = useState<Vault | null>(null);
  const [busy, setBusy] = useState(false);
  const secure = hasSubtle();

  // The vault is built once, in an effect, because making keys is asynchronous.
  useEffect(() => {
    if (!secure) return;
    let alive = true;
    buildVault().then((v) => {
      if (alive) setVault(v);
    });
    return () => {
      alive = false;
    };
  }, [secure]);

  const run = useCallback(
    (change: (v: Vault) => Promise<Vault>) => {
      if (busy || !vault) return;
      setBusy(true);
      change(vault)
        .then(setVault)
        .finally(() => setBusy(false));
    },
    [busy, vault],
  );
  const reset = useCallback(() => {
    if (busy) return;
    setBusy(true);
    buildVault()
      .then(setVault)
      .finally(() => setBusy(false));
  }, [busy]);

  if (scene === 'workload') return <WorkloadScene key="workload" picker={picker} />;
  if (!vault) return <Waiting key="waiting" picker={picker} secure={secure} />;
  const props = { picker, vault, run, reset, busy };
  if (scene === 'rotation') return <RotationScene key="rotation" {...props} />;
  if (scene === 'shred') return <ShredScene key="shred" {...props} />;
  return <HierarchyScene key="hierarchy" {...props} />;
}
