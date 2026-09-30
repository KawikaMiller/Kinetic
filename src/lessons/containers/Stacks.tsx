import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';

const APPS = ['web', 'api', 'worker', 'cron'];
const VM_OS_GB = 2;
const APP_GB = 0.2;
const MB_PER_GB = 1000;
/** Boot-bar animation lengths: a whole guest OS vs a process on a running kernel. */
const VM_BOOT = '4s';
const CONTAINER_BOOT = '0.25s';
const COLUMN_SPRING = { type: 'spring', stiffness: 260, damping: 24 } as const;

/** The same apps as VMs (a guest OS each) and as containers (one shared kernel). */
export function Stacks({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(3);
  const [boot, setBoot] = useState(0);
  const setCaption = useSetCaption();

  useIntroCaption(
    <>
      Each VM carries a <b>whole guest operating system</b>. Containers share the host's kernel and only package the
      app and its libraries. Add apps and hit <b>Boot</b>.
    </>,
  );

  const apps = APPS.slice(0, n);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="VM disk" value={`${(n * (VM_OS_GB + APP_GB)).toFixed(1)} GB`} color="var(--bad)" sub="rough, typical" />
          <Stat label="Container disk" value={`${(n * APP_GB * MB_PER_GB).toFixed(0)} MB`} color="var(--ok)" sub="rough, typical" />
          <Stat label="Guest OSes" value={n} color="var(--bad)" sub="vs 0 for containers" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'hardware' },
            { color: 'var(--bad)', label: 'guest OS (one per VM)' },
            { color: 'var(--info)', label: 'shared host kernel' },
            { color: 'var(--violet)', label: 'libs + app' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Slider label="Apps" value={n} min={1} max={APPS.length} onChange={setN} />
          <Button
            variant="primary"
            onClick={() => {
              setBoot((b) => b + 1);
              setCaption(<>Booting… a VM has to start a whole OS (tens of seconds). A container is just a process starting on an already-running kernel (well under a second).</>);
            }}
          >
            ▶ Boot everything
          </Button>
        </Controls>
      }
    >
      <div className="ct-stacks">
        {(['vm', 'ct'] as const).map((kind) => (
          <div key={kind} className={`ct-side ${kind}`}>
            <h4>{kind === 'vm' ? 'Virtual machines' : 'Containers'}</h4>
            <div className="ct-tower">
              <div className="ct-apps">
                <AnimatePresence initial={false}>
                  {apps.map((a) => (
                    <motion.div
                      key={a}
                      layout
                      className="ct-col"
                      initial={{ opacity: 0, y: -30 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -30 }}
                      transition={COLUMN_SPRING}
                    >
                      <div className="ct-block app">
                        <b>{a}</b>
                        <span>libs + app</span>
                      </div>
                      {kind === 'vm' && (
                        <div className="ct-block guest">
                          <b>guest OS</b>
                          <span>own kernel</span>
                        </div>
                      )}
                      <div className="ct-boot">
                        <i key={boot} className={boot ? 'run' : ''} style={{ animationDuration: kind === 'vm' ? VM_BOOT : CONTAINER_BOOT }} />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className={`ct-block layer ${kind === 'vm' ? 'hyper' : 'kernel'}`}>
                {kind === 'vm' ? 'Hypervisor' : 'Host OS kernel · container runtime'}
              </div>
              <div className="ct-block layer hw">Hardware</div>
            </div>
            <p className="ct-note">{kind === 'vm' ? 'boot ≈ 30–60 s each · strong isolation (separate kernels)' : 'start ≈ under 1 s · lighter isolation (shared kernel)'}</p>
          </div>
        ))}
      </div>
    </StageFrame>
  );
}
