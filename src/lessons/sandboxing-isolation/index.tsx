import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A sandbox is layers, not one wall: a process boundary, a system call filter, private views, resource limits and a separate kernel each stop different things, and a container shares the host kernel.',
    what: `Untrusted code is contained by stacking boundaries. A seccomp filter allows or denies system calls by name; namespaces give a process private views of processes, files, network, names and ids; cgroups cap memory, process count and CPU share; a microVM puts a guest kernel behind a hypervisor. In this lesson's model, with ${F.ringsOn} on, ${F.blockedOutright} of ${F.actionCount} abstract actions are blocked outright, and the one that reaches the kernel is ${F.kernelBugVerdict}. No code runs here: the plugin is a labelled token and every rule is a table.`,
    analogy: 'It is a building with a locked room, a guard at the door, a meter on the water and a separate foundation: each stops a different problem, and only the separate foundation survives a flaw in the main one.',
    useCases: [
      'Running third-party plugins or user-supplied code next to your own services',
      'Choosing between a container, a hardened container and a microVM for a multi-tenant platform',
      'Writing a seccomp profile for a service that only needs a few system calls',
      'Reading a security review that says "defence in depth" and asking what each layer really covers',
    ],
    why: 'Isolation failures come from believing one boundary covers everything. Knowing what each layer controls, what it cannot see and where the kernel is shared lets you pick layers on purpose and judge what an incident would have reached.',
    watch: 'The untrusted plugin is orange, turning grey and dim when an action is blocked. A ring that stopped the action is green (--ok), a ring that limited it is violet (--violet), a ring switched off is grey and dashed (--dim), and an action nothing stopped is red (--bad). In the system call replay an allowed call is green, a denied call red and a call never reached grey; a risky call in the list is orange. A private namespace view is violet and the host view grey. In the surface bars red is the shared host kernel, orange a narrowed list of calls and green a guest kernel in between.',
  },
  tryThis: [
    `Concentric boundaries, on the defaults (${F.ringsOn} on, the action is to read a file outside its folder): the result is ${F.fileVerdict}. Pick "trigger a kernel bug (abstract)": it is ${F.kernelBugVerdict}, since nothing switched on stands between the plugin and the host kernel. Then switch microVM on: ${F.kernelBugWithMicrovm}.`,
    `A seccomp allow-list, on the defaults (${F.listSize} of ${F.catalogue} calls allowed): the toy resizer is killed at call ${F.deniedCall} of ${F.traceLength}, ${F.deniedName}. Tick mmap and munmap: it runs to the end, and the stage says the list is the smallest that still works. Then press Everything: it still runs, now granting ${F.everythingExtras} capabilities it never uses.`,
    `Namespaces and cgroups, on the defaults (${F.namespaceCount} of ${F.namespaceKinds} namespaces on): uid 0 inside the sandbox is uid 0 on the host too. Turn user on: uid 0 inside becomes uid ${F.userOutside} on the host (map ${F.userMap}). Allocating ${F.allocate} MiB against the ${F.memoryLimit} MiB limit kills the plugin at byte ${F.killedAtByte}, and ${F.forks} forks against the limit of ${F.pidsLimit} processes start ${F.started}.`,
    `What is shared, on the defaults (a process or plain container): the plugin faces ${F.host} system calls (illustrative, 300 or more in practice) with the host kernel under them. Pick With a seccomp filter: ${F.filter} calls, same kernel. Pick In a microVM: ${F.hypervisor} interfaces and a guest kernel in between.`,
  ],
  keyIdeas: [
    `No single boundary blocks everything: in this model the best one ring blocks ${F.bestSingleBlocked} of ${F.actionCount} actions outright. The microVM alone lets none through but limits ${F.microvmLimited} of them (a limit caps an action, it does not stop it), and even with ${F.ringCount} rings on the kernel-bug action is ${F.allSixKernelBugVerdict}.`,
    `A seccomp filter judges calls, not files: it blocks ${F.seccompBlocks} of ${F.actionCount} actions in this model, but reading a file outside the folder is not one of them, because that is a job for a private view of files.`,
    `Root inside a container has the host root's user id unless a user namespace maps it away (a runtime may also drop its capabilities): with user on, uid 0 inside is uid ${F.userOutside} outside (map ${F.userMap}), and with it off the two are the same id.`,
    `A container is a process on the host kernel with restricted views, so in this model a kernel bug sits under every ring except the microVM, at the price of trusting a hypervisor interface of ${F.hypervisor} instead.`,
  ],
  quiz: [
    {
      q: 'How does a container differ from a virtual machine?',
      options: [
        'A container is a smaller VM that boots a stripped-down guest kernel faster than a full machine does',
        'A container runs its own kernel too, but it shares the host disk so that it can start more quickly',
        'A container is a process on the host kernel with restricted views; a VM runs its own kernel',
        'A container isolates by hardware features while a VM isolates by the filters that a kernel provides',
      ],
      answer: 2,
      why: `The kernel under a plain container is the host's, so in this model its kernel-bug action is ${F.kernelBugVerdict} until a microVM is switched on. A microVM adds a guest kernel, and its surface is ${F.hypervisor} interfaces against ${F.host} calls.`,
    },
    {
      q: 'A service runs as root inside its container. Is that root on the host?',
      options: [
        'No, a container always maps root to an ordinary user, whichever way it was started',
        'Yes, a container cannot hide the host id from the process, so root inside is always root outside',
        'No, because seccomp rewrites the user id of every system call that the process makes',
        'It depends on the user namespace: without one the ids are the same, with one root maps to an unprivileged id',
      ],
      answer: 3,
      why: `With user off, root inside is root on the host; with user on, uid 0 maps to uid ${F.userOutside} (map ${F.userMap}). Many default container setups do not use a user namespace: verify against your runtime's documentation.`,
    },
    {
      q: 'Why is a seccomp filter alone not a complete sandbox?',
      options: [
        'It slows every call so much that a plugin cannot do useful work, which is why other layers exist',
        'It judges calls by name, so it leaves actions such as a file read outside the folder to other layers',
        'It only works when the plugin runs as root, and a plugin that runs as a user escapes the filter',
        'It cannot deny a call, only log it, so another layer must do the stopping when something is wrong',
      ],
      answer: 1,
      why: `In this model seccomp blocks ${F.seccompBlocks} of ${F.actionCount} actions but not the file read, and the best single ring blocks ${F.bestSingleBlocked}. The microVM alone blocks ${F.microvmBlocked} and limits ${F.microvmLimited}, and a limit is not a stop. Stacked rings cover different actions.`,
    },
    {
      q: 'The allow-list is too tight and omits mmap. What happens to the toy resizer?',
      options: [
        'It skips the call and carries on, so the rest of the script still runs to the end',
        'It is killed at the end of the script, once every call has been tried and counted',
        'It is killed at the first mmap, call 3, and the later calls never run',
        'It runs normally, because mmap is a call the kernel itself makes for the process',
      ],
      answer: 2,
      why: `The first call not on the list ends the run: call ${F.deniedCall} of ${F.traceLength} (${F.deniedName}) with the default list of ${F.listSize}. With the other action the call returns an error the toy does not handle, and it stops there too.`,
    },
  ],
};

export default lesson;
