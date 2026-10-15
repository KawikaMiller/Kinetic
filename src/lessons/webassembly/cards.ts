import type { ClaimKind } from '../../core/provenance';

export interface Card {
  id: string;
  short: string;
  title: string;
  text: string;
  claim: ClaimKind;
  note: string;
}

export const CARDS: readonly Card[] = [
  {
    id: 'target', short: 'Compile target', title: 'A compile target, not a language you write by hand',
    text: 'The modules on this page were assembled by hand to show the format, and the page never compiled any C. In practice code is written in another language and a compiler emits the bytes, usually far more of them than these.',
    claim: 'practice', note: 'how modules are usually produced',
  },
  {
    id: 'speed', short: 'Speed', title: 'Not automatically faster than JavaScript',
    text: 'Whether a WebAssembly version beats a JavaScript one depends on the workload and the engine. This page measures nothing and makes no timing claim, so none of its numbers are speeds.',
    claim: 'view', note: 'a caution, not a measurement',
  },
  {
    id: 'toolchains', short: 'Toolchains', title: 'How Rust and C get there',
    text: 'Compilers such as clang and rustc can target WebAssembly, and wasm-ready toolchains exist for other languages. Which flags and tools you need changes between versions: check each project’s documentation.',
    claim: 'practice', note: 'toolchain names are from memory, not run here',
  },
  {
    id: 'outside', short: 'Beyond browsers', title: 'It also runs outside browsers',
    text: 'The tests behind this page run the same bytes in Node. Other runtimes and embedders exist too, and WASI, the component model, SIMD and threads are separate topics this lesson only names.',
    claim: 'practice', note: 'Node ran this page’s tests; the rest is named, not run',
  },
];

