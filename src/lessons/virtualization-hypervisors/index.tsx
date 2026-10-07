import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A hypervisor runs whole guest operating systems side by side; ordinary guest instructions run straight on the CPU, and only the privileged ones are caught and handled by the hypervisor.',
    what: 'A virtual machine gets virtual CPUs, memory and devices from a hypervisor, and boots its own kernel. Guest code is not emulated instruction by instruction: ordinary instructions run directly on the real CPU. When the guest kernel does something only the real machine owner may do (turn interrupts off, switch page tables, talk to a device), the CPU traps to the hypervisor, which emulates the effect on that guest\'s virtual state and resumes it. Early x86 had sensitive instructions that didn\'t trap, so VMware rewrote guest code on the fly (binary translation), Xen changed the guest to ask on purpose (paravirtualisation), and Intel VT-x and AMD-V added a guest mode to the CPU. Memory gets a second translation (EPT / NPT), and fast virtual devices (virtio) share queues with the hypervisor instead of imitating real hardware.',
    analogy: 'A hotel. Guests do almost everything in their own rooms without calling the front desk (direct execution). Only some requests, like changing the building\'s heating, go to the front desk, which handles them so they affect that guest\'s room only (a trap). Containers are flats in one building sharing its plumbing: one kernel.',
    useCases: [
      'Every cloud server: EC2, GCE and Azure VMs run on hypervisors (KVM, Xen, Hyper-V)',
      'Running Windows on a Mac, or a Linux VM on a laptop, with VirtualBox or VMware',
      'Choosing VMs or containers: separate kernels and stronger isolation vs speed and density',
      'Why cloud images ship virtio drivers, and why memory overcommit can hurt performance',
    ],
    why: 'Most production code runs inside a VM, often with containers inside that. Knowing what costs extra in a VM (exits, I/O, nested page walks) explains cloud performance surprises, and knowing how VMs differ from `containers` helps you pick the right isolation. It builds on `syscalls-kernel-mode` (rings) and `interrupts-context-switch` (traps).',
    watch: 'Trap & emulate: the code panel highlights the instruction running now in yellow and tags each one once it has run: green "direct", violet for a trap, hypercall or rewrite, red "wrong!". In the layer picture the instruction pill is yellow while it is checked, green when it runs directly (the CPU layer turns green), violet when the hypervisor rewrote it, and red when a sensitive instruction slips past; a violet packet is a trap or VM exit going down to the blue hypervisor layer and back, or a hypercall. Stacks: the hypervisor is blue, the guest kernels amber (VM 1) and sky blue (VM 2), and hardware, host kernels and apps grey. Memory & I/O: the guest\'s translation is amber and the hypervisor\'s blue; the nested-walk readout is violet; the exit bars are red for the emulated NIC (costly) and green for virtio (cheap), to scale, with the chosen device\'s row tinted yellow. Overcommit: memory promised within host RAM is grey, memory used within it blue, anything beyond physical RAM orange, and the light line marks the host\'s RAM.',
  },
  tryThis: [
    'In Trap & emulate, play "Trap only (classic x86)" and watch popf go silently wrong.',
    'Switch Technique to Hardware assist (VT-x / AMD-V) and compare how many instructions the hypervisor handled.',
    'In Stacks, flip Show to Containers: the guest kernels and the hypervisor disappear.',
    'In Memory & I/O, switch between Emulated NIC (e1000) and virtio-net with Packets sent at 64.',
    'In Overcommit, keep 4 VMs and drag Each VM really uses up to 5 GB: read what the hypervisor does.',
  ],
  keyIdeas: [
    'Guest code mostly runs directly on the CPU; only privileged or sensitive instructions are trapped.',
    'Classic x86 had sensitive instructions that didn\'t trap, fixed by binary translation, paravirtualisation and VT-x / AMD-V.',
    'Memory is translated twice (guest page tables, then EPT / NPT), and virtio replaces emulated hardware with shared queues.',
    'A VM boots its own kernel; a container is an isolated process on the host\'s kernel.',
  ],
  quiz: [
    {
      q: 'How does a VM run its guest\'s ordinary instructions, such as add or mov?',
      options: [
        'Directly on the real CPU, at full speed',
        'Emulated one by one in software',
        'Translated to bytecode, then interpreted',
        'Sent to the hypervisor one at a time',
      ],
      answer: 0,
      why: 'Only privileged or sensitive instructions need the hypervisor. Emulating every instruction is what a pure emulator such as QEMU without KVM does, and it is many times slower.',
    },
    {
      q: 'Why couldn\'t classic x86 be virtualised just by trapping privileged instructions?',
      options: [
        'Some sensitive ones, like popf, didn\'t trap',
        'x86 had no privileged instructions at all',
        'Traps were too slow to be used even once',
        'The CPU had no memory protection back then',
      ],
      answer: 0,
      why: 'Run outside ring 0, popf silently ignored the interrupt flag instead of faulting, so the hypervisor never saw it and the guest went wrong. Traps worked; they just didn\'t catch everything.',
    },
    {
      q: 'Are containers just lightweight VMs?',
      options: [
        'No: they are processes sharing the host kernel',
        'Yes: each one runs a small guest kernel',
        'Yes: they are VMs without virtual devices',
        'No: they are VMs that run in user space',
      ],
      answer: 0,
      why: 'A VM boots its own kernel on virtual hardware. A container has no kernel of its own; the host kernel isolates it with namespaces and cgroups, which is why it starts fast and why its isolation is lighter.',
    },
    {
      q: 'With nested paging, a TLB miss walks a 4-level guest table through a 4-level host table. How many memory reads can it take?',
      options: ['24', '8', '16', '4'],
      answer: 0,
      why: 'Each of the 4 guest table reads, and the final address, is a guest-physical address that needs its own 4-read host walk: (4 + 1) × (4 + 1) − 1 = 24. That is why TLB misses cost more in a VM.',
    },
    {
      q: 'Which hypervisor runs as an application on a normal desktop OS (type 2)?',
      options: ['VirtualBox', 'VMware ESXi', 'Xen', 'Hyper-V'],
      answer: 0,
      why: 'VirtualBox runs on Windows, macOS or Linux like any other app. ESXi, Xen and Hyper-V run directly on the hardware (type 1). KVM blurs the line: Linux itself becomes the hypervisor.',
    },
  ],
};

export default lesson;
