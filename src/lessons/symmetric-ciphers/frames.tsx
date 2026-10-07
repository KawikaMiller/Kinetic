// Captions for each lane, computed from the real ciphertexts on screen.
import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { ChainMode, Mode } from './model';

export const HONESTY = "Real AES in your browser via WebCrypto. ECB isn't offered by WebCrypto; we build it one block at a time to show why you should never use it.";

export function pictureCaption(repeats: Record<Mode, number>, total: number, picked: { block: number; same: number; othersMax: number } | null): ReactNode {
  if (picked) {
    return picked.same > 1
      ? <>Block {picked.block + 1}: in ECB, <span className="hl bad">{picked.same} blocks</span> have exactly this ciphertext, because they
        had exactly the same pixels.{picked.othersMax === 1 ? ' In CBC, CTR and GCM it appears once.' : ''}</>
      : <>Block {picked.block + 1} is unique in ECB too: its 16 pixels don't repeat anywhere in the picture.</>;
  }
  return <>Same key, same picture. ECB repeats <span className="hl bad">{repeats.ECB} of {total}</span> blocks, so the outline survives;
    CBC, CTR and GCM repeat {repeats.CBC + repeats.CTR + repeats.GCM === 0 ? 'none' : `${repeats.CBC}, ${repeats.CTR} and ${repeats.GCM}`}.
    Hover a block (or focus the ECB picture and use the arrow keys).</>;
}

export function chainCaption(mode: ChainMode, bits: number, blocks: number[], bytes: number): ReactNode {
  if (bits === 0) return <>Four plaintext blocks, encrypted with {mode}. Pick a plaintext byte and flip one of its bits.</>;
  const which = blocks.length === 1 ? <>block {blocks[0] + 1}</> : <>blocks {blocks[0] + 1}–{blocks.at(-1)! + 1}</>;
  const why: Record<typeof mode, ReactNode> = {
    ECB: <>ECB encrypts each block alone, so only the flipped blocks change.</>,
    CBC: <>CBC feeds each ciphertext block into the next, so a change carries to the end.</>,
    CTR: <>CTR XORs a keystream onto the data, so only the flipped bytes change: no diffusion at all.</>,
  };
  const flipped = bits === 1 ? 'One flipped plaintext bit' : `${bits} flipped plaintext bits`;
  return <>{flipped} changed <span className="hl">{plural(bytes, 'ciphertext byte')}</span> in {which}. {why[mode]}</>;
}

export function reuseCaption(mode: 'CBC' | 'CTR', reuse: boolean, equalBlocks: number, zeroBytes: number): ReactNode {
  if (!reuse) {
    return <>A fresh random {mode === 'CBC' ? 'IV' : 'nonce'} for each message: the two ciphertexts share nothing, even though the
      messages start the same.</>;
  }
  if (mode === 'CBC') {
    return <>Same key, same IV: the shared first block encrypts to <span className="hl bad">{plural(equalBlocks, 'identical block')}</span>,
      so anyone can see where the two messages start the same.</>;
  }
  return <>Same key, same nonce, same keystream: XOR the two ciphertexts and the keystream cancels out, leaving P1 ⊕ P2,
    the XOR of the two plaintexts. <span className="hl bad">{plural(zeroBytes, 'byte')}</span> come out as 00, exactly where the messages match.</>;
}

/** Bits that differ between two equal-length byte arrays. */
export const bitDistance = (a: Uint8Array, b: Uint8Array) =>
  Array.from(a).reduce((n, v, i) => n + [...(v ^ b[i]).toString(2)].filter((c) => c === '1').length, 0);

export interface TamperResult {
  cbcChanged: number;
  /** CBC also flipped exactly the same bit one block later (false when the flip was in the last block). */
  cbcNextBitFlipped: boolean;
  ctrChanged: number;
  gcmRefused: boolean;
}

export function tamperCaption(flipped: boolean, byte: number, r: TamperResult): ReactNode {
  if (!flipped) return <>Untouched ciphertexts: all three modes decrypt the message correctly. Pick a byte and flip one bit.</>;
  return <>One bit of byte {byte} flipped in transit. CBC decrypts to <span className="hl bad">{plural(r.cbcChanged, 'changed byte')}</span>{' '}
    without complaint{r.cbcNextBitFlipped ? ': a garbled block, and exactly that bit flipped in the next block' : ''}; CTR silently changes <span className="hl bad">{plural(r.ctrChanged, 'byte')}</span>, exactly the bit that was
    flipped; GCM {r.gcmRefused ? <span className="hl ok">refuses to decrypt</span> : 'decrypts it'}. Encryption alone doesn't stop
    tampering: use authenticated encryption.</>;
}
