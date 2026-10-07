import { motion } from 'motion/react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { Box, SectionTitle } from '../../components/Panel';
import { SPRING } from '../../core/motion';
import { hex } from './frames';
import { REG_NAMES, type Regs, type Script, type Step, type ThreadId } from './model';

/**
 * One thread's register set. It has a single layoutId, so when a step moves it between the
 * CPU and a PCB card, motion flies it across: that's the save or the restore. In flight it's
 * --info.
 */
function RegBlock({ owner, regs, flying }: { owner: ThreadId; regs: Regs; flying: boolean }) {
  return (
    <motion.div layoutId={`ics-regs-${owner}`} transition={SPRING.soft} className={`ics-regs ${flying ? 'is-flight' : ''}`}>
      <span className="ics-regs-owner">{owner}'s registers</span>
      {REG_NAMES.map((k) => (
        <div key={k} className="ics-reg">
          <span className="ics-reg-name">{k.toUpperCase()}</span>
          <AnimatedValue value={hex(regs[k])} variant="flip" className="ics-reg-value" />
        </div>
      ))}
    </motion.div>
  );
}

const STATE_TONE = { running: 'hi', ready: 'dim', blocked: 'muted' } as const;

function PcbCard({ id, step, sc }: { id: ThreadId; step: Step; sc: Script }) {
  const info = sc.threads[id];
  const regs = step.pcb[id];
  const state = step.states[id];
  return (
    <Box className="ics-card" role="group" aria-label={`Thread ${id}'s PCB`}>
      <SectionTitle>
        {id} · PCB <span className="keep-case">(task_struct)</span>
      </SectionTitle>
      <p className="ics-card-meta">
        process <b>{info.process}</b> · address space {info.asid} · <span className={`chip tone-${STATE_TONE[state]}`}>{state}</span>
      </p>
      {regs ? <RegBlock owner={id} regs={regs} flying={step.flight === id} /> : <p className="empty-note ics-empty">registers are in the CPU</p>}
    </Box>
  );
}

export function RegisterCards({ step, sc }: { step: Step; sc: Script }) {
  const owner = step.cpu?.owner;
  const space = Object.values(sc.threads).find((t) => t.asid === step.asid)!;
  return (
    <div className="ics-machine">
      <PcbCard id="A" step={step} sc={sc} />
      <Box className="ics-card ics-cpu" role="group" aria-label="CPU core">
        <SectionTitle>CPU core</SectionTitle>
        <p className="ics-card-meta">
          mode{' '}
          <span className={`chip ${step.mode === 'kernel' ? 'tone-violet' : 'tone-muted'}`}>{step.mode === 'kernel' ? 'kernel · ring 0' : 'user · ring 3'}</span>
        </p>
        <p className={`ics-card-meta ${step.phase === 'mm' ? 'ics-space-now' : ''}`}>
          page tables <b>{space.process}</b> (address space {step.asid})
        </p>
        {step.cpu && owner ? <RegBlock owner={owner} regs={step.cpu.regs} flying={step.flight === owner} /> : <p className="empty-note ics-empty">no thread loaded</p>}
      </Box>
      <PcbCard id="B" step={step} sc={sc} />
    </div>
  );
}
