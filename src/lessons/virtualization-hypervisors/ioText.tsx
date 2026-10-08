import type { ReactNode } from 'react';
import { deviceExits, EXITS_PER_PACKET, HOST_GB, overcommit, VIRTIO_BURST, VM_GB, type Device } from './model';

export function ioCaption(device: Device, packets: number): ReactNode {
  const e = deviceExits('emulated', packets);
  const v = deviceExits('virtio', packets);
  return device === 'emulated' ? (
    <>
      An emulated NIC looks like real hardware, so the guest driver pokes its registers: {EXITS_PER_PACKET} accesses per packet here, each a VM exit. {packets}{' '}
      {packets === 1 ? 'packet costs' : 'packets cost'} {e} exits; virtio would need {v} {v === 1 ? 'exit' : 'exits'}.
    </>
  ) : (
    <>
      virtio: the guest knows it is virtualised. It puts packets in a ring of descriptors in memory it shares with the hypervisor, then notifies once per burst of up to{' '}
      {VIRTIO_BURST}. {packets} {packets === 1 ? 'packet costs' : 'packets cost'} {v} {v === 1 ? 'exit' : 'exits'} instead of {e}.
    </>
  );
}

export const ratioText = (r: number) => `${Number.isInteger(r) ? r : r.toFixed(1)}×`;

export function overcommitCaption(vms: number, used: number): ReactNode {
  const o = overcommit(vms, used);
  if (o.ratio <= 1) {
    return (
      <>
        {vms} × {VM_GB} GB = {o.committed} GB promised on a {HOST_GB} GB host: no overcommit, every VM's memory really exists.
      </>
    );
  }
  if (o.short === 0) {
    return (
      <>
        {o.committed} GB promised on a {HOST_GB} GB host: {ratioText(o.ratio)} overcommitted. It works because the guests only touch {o.used} GB between them, and pages a guest
        never touches usually never get host memory (preallocated, hugepage and device-passthrough guests are exceptions).
      </>
    );
  }
  return (
    <>
      The guests now touch {o.used} GB, <span className="hl orange">{o.short} GB more</span> than the host has. The hypervisor inflates a balloon driver inside each guest: the
      balloon grabs guest memory, so the guest frees its caches, and the hypervisor reuses those pages. Past that, the host swaps guest memory to disk and everything slows down.
    </>
  );
}
