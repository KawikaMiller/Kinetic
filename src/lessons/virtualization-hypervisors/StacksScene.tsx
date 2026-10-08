import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';

const GUESTS = [
  { name: 'VM 1', kernel: 'Linux kernel', tone: 'amber', apps: ['nginx', 'app'] },
  { name: 'VM 2', kernel: 'Windows kernel', tone: 'sky', apps: ['SQL Server'] },
] as const;

function Vm({ vm }: { vm: (typeof GUESTS)[number] }) {
  return (
    <div className="vh-vm">
      <span className="vh-vm-name">{vm.name}</span>
      <div className="vh-apps">
        {vm.apps.map((a) => (
          <span key={a} className="vh-box is-app">
            {a}
          </span>
        ))}
      </div>
      <span className={`vh-box is-guest tone-${vm.tone}`}>{vm.kernel}</span>
    </div>
  );
}

export function StacksScene({ picker }: { picker: ReactNode }) {
  const [containers, setContainers] = useState(false);
  const [hosted, setHosted] = useState(false);
  useIntroCaption(
    containers ? (
      <>Containers, as a recap of <code>containers</code>: one host kernel, and each container is an ordinary process it isolates. There is no guest kernel and no hypervisor, so a container is not a small VM.</>
    ) : hosted ? (
      <>Type 2 (hosted): the hypervisor is an application on a normal host OS, next to your other apps. VirtualBox and VMware Workstation work this way. Each VM still boots its own kernel.</>
    ) : (
      <>Type 1 (bare metal): the hypervisor runs straight on the hardware and each VM boots its own guest kernel on top. ESXi, Xen and Hyper-V work this way.</>
    ),
    [containers, hosted],
  );

  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={
            containers
              ? [{ color: 'var(--muted)', label: 'host kernel, container processes, hardware' }]
              : [
                  { color: 'var(--info)', label: 'hypervisor' },
                  { color: 'var(--amber)', label: 'guest kernel, VM 1' },
                  { color: 'var(--sky)', label: 'guest kernel, VM 2' },
                  { color: 'var(--muted)', label: 'host kernel, apps, hardware' },
                ]
          }
        />
      }
      controls={[
        picker,
        <>
          <Toggle label="Show" value={containers} onChange={setContainers} off="Virtual machines" on="Containers" />
          {!containers && <Toggle label="Hypervisor" value={hosted} onChange={setHosted} off="Type 1 (bare metal)" on="Type 2 (hosted)" />}
        </>,
      ]}
    >
      <div className="vh stage-pad">
        <div className="vh-stack" aria-label="Layer stack, hardware at the bottom">
          {containers ? (
            <>
              <div className="vh-row">
                {['web', 'worker', 'db'].map((c) => (
                  <div key={c} className="vh-vm is-container">
                    <span className="vh-vm-name">container</span>
                    <span className="vh-box is-app">{c} process</span>
                  </div>
                ))}
              </div>
              <span className="vh-box is-host">one host Linux kernel (namespaces + cgroups isolate each process)</span>
            </>
          ) : hosted ? (
            <>
              <div className="vh-row">
                <div className="vh-hosted">
                  <div className="vh-row">
                    {GUESTS.map((g) => (
                      <Vm key={g.name} vm={g} />
                    ))}
                  </div>
                  <span className="vh-box is-hyper">hypervisor app (VirtualBox, VMware Workstation)</span>
                </div>
                <div className="vh-vm is-host-apps">
                  <span className="vh-vm-name">host apps</span>
                  <span className="vh-box is-app">browser</span>
                  <span className="vh-box is-app">editor</span>
                </div>
              </div>
              <span className="vh-box is-host">host OS kernel (Windows, macOS, Linux)</span>
            </>
          ) : (
            <>
              <div className="vh-row">
                {GUESTS.map((g) => (
                  <Vm key={g.name} vm={g} />
                ))}
              </div>
              <span className="vh-box is-hyper">type 1 hypervisor (ESXi, Xen, Hyper-V)</span>
            </>
          )}
          <span className="vh-box is-hw">hardware: CPU (with VT-x / AMD-V), RAM, disks, NICs</span>
        </div>
        <Hint block>
          {containers
            ? 'Containers start fast and share one kernel, so their isolation is lighter than separate kernels in VMs. How the kernel isolates them is the containers lesson.'
            : 'The type 1 / type 2 line is blurry. KVM turns Linux itself into the hypervisor (a kernel module), with QEMU in user space emulating devices: usually called type 1, yet the same host also runs ordinary Linux programs.'}
        </Hint>
      </div>
    </StageFrame>
  );
}
