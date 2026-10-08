/** The compute spectrum: who looks after each concern in four common ways to run code. A generalisation: real services differ. */

export type Owner = 'you' | 'split' | 'provider';

export interface Column {
  id: string;
  title: string;
  example: string;
}

export const COLUMNS: Column[] = [
  { id: 'vm', title: 'Bare metal or VM', example: 'you rent a machine, or a slice of one' },
  { id: 'container', title: 'Container on a VM', example: 'you run the VMs and the orchestrator' },
  { id: 'managed', title: 'Managed containers', example: 'you ship an image, they run it' },
  { id: 'function', title: 'Functions', example: 'you ship a handler, they run one per request' },
];

export interface Cell {
  owner: Owner;
  note: string;
}

export interface Row {
  id: string;
  title: string;
  /** One cell per column, in COLUMNS order. */
  cells: [Cell, Cell, Cell, Cell];
}

export const ROWS: Row[] = [
  {
    id: 'patching',
    title: 'OS patching',
    cells: [
      { owner: 'you', note: 'the whole OS' },
      { owner: 'you', note: 'the VM OS and each image' },
      { owner: 'split', note: 'they patch the host, you rebuild the image' },
      { owner: 'provider', note: 'they patch the OS under the runtime' },
    ],
  },
  {
    id: 'runtime',
    title: 'Runtime and language version',
    cells: [
      { owner: 'you', note: 'install what you want' },
      { owner: 'you', note: 'chosen in the image' },
      { owner: 'you', note: 'chosen in the image' },
      { owner: 'split', note: 'they offer versions and retire old ones, you pick and upgrade' },
    ],
  },
  {
    id: 'scaling',
    title: 'Scaling',
    cells: [
      { owner: 'you', note: 'add machines yourself or script it' },
      { owner: 'you', note: 'you run the autoscaler and the VMs' },
      { owner: 'split', note: 'you set min, max and rules; they add instances' },
      { owner: 'provider', note: 'one instance per concurrent request, up to your limit' },
    ],
  },
  {
    id: 'capacity',
    title: 'Capacity planning',
    cells: [
      { owner: 'you', note: 'size and order the machines' },
      { owner: 'you', note: 'size the VM fleet' },
      { owner: 'split', note: 'you size CPU and memory per instance' },
      { owner: 'split', note: 'you pick memory size and concurrency limit' },
    ],
  },
  {
    id: 'idle',
    title: 'Who carries idle cost',
    cells: [
      { owner: 'you', note: 'billed while it runs, busy or not' },
      { owner: 'you', note: 'you pay for the VMs, busy or not' },
      { owner: 'split', note: 'depends on min instances; some can scale to zero' },
      { owner: 'provider', note: 'nothing while idle, unless you provision' },
    ],
  },
  {
    id: 'runtime-limit',
    title: 'Who sets the maximum run time',
    cells: [
      { owner: 'you', note: 'no limit' },
      { owner: 'you', note: 'no limit from the platform' },
      { owner: 'split', note: 'varies by service: some cap a request or a job' },
      { owner: 'provider', note: 'a hard cap, minutes on many platforms' },
    ],
  },
];

export const OWNER_LABEL: Record<Owner, string> = { you: 'you', split: 'split', provider: 'the provider' };

/** How many columns put this row's concern on each side. Pure, so the caption is computed from the table. */
export function ownerCounts(row: Row): Record<Owner, Column[]> {
  const out: Record<Owner, Column[]> = { you: [], split: [], provider: [] };
  row.cells.forEach((cell, i) => out[cell.owner].push(COLUMNS[i]));
  return out;
}
