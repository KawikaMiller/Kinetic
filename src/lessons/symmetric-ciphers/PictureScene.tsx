import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useAsyncValue } from '../../core/useAsyncValue';
import { BLOCK, cbcEncrypt, ctrCrypt, ecbEncrypt, gcmEncrypt, randomBytes } from './ciphers';
import { cipherColour, paintBytes, plainColour } from './draw';
import { HONESTY, pictureCaption } from './frames';
import { BLOCKS_PER_ROW, SIDE, mascot, repeatedBlocks, sameAs, type Mode } from './model';

type Bytes = Uint8Array<ArrayBuffer>;
const MODES: Mode[] = ['ECB', 'CBC', 'CTR', 'GCM'];
const IMAGE = mascot();
const TOTAL = IMAGE.length / BLOCK;
const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -BLOCKS_PER_ROW, ArrowDown: BLOCKS_PER_ROW };

async function encryptAll(key: Bytes): Promise<Record<Mode, Bytes> | null> {
  const [ecb, cbc, ctr, gcm] = await Promise.all([
    ecbEncrypt(key, IMAGE),
    cbcEncrypt(key, randomBytes(16), IMAGE),
    ctrCrypt(key, randomBytes(16), IMAGE),
    gcmEncrypt(key, randomBytes(12), IMAGE),
  ]);
  if (!ecb || !cbc || !ctr || !gcm) return null;
  // GCM's 16-byte tag follows the ciphertext; only the picture's bytes are drawn.
  return { ECB: ecb, CBC: cbc, CTR: ctr, GCM: gcm.slice(0, IMAGE.length) };
}

function Pixels({ bytes, colour }: { bytes: Uint8Array; colour: typeof plainColour }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paintBytes(ctx, bytes, colour);
  }, [bytes, colour]);
  return <canvas ref={ref} width={SIDE} height={SIDE} aria-hidden />;
}

/** Outlines over a picture: every block equal to the picked one, in this lane's bytes. */
function Outlines({ bytes, picked }: { bytes: Uint8Array; picked: number | null }) {
  if (picked === null) return null;
  const same = sameAs(bytes, picked);
  return (
    <svg className="sc-overlay" viewBox={`0 0 ${SIDE} ${SIDE}`} aria-hidden>
      {same.map((j) => (
        <rect
          key={j}
          className={same.length > 1 ? 'is-repeat' : 'is-picked'}
          x={(j % BLOCKS_PER_ROW) * BLOCK}
          y={Math.floor(j / BLOCKS_PER_ROW)}
          width={BLOCK}
          height={1}
        />
      ))}
    </svg>
  );
}

/** The block under the pointer, or null off the picture. */
function blockAt(e: PointerEvent<HTMLElement>): number | null {
  const r = e.currentTarget.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIDE);
  const y = Math.floor(((e.clientY - r.top) / r.height) * SIDE);
  if (x < 0 || y < 0 || x >= SIDE || y >= SIDE) return null;
  return y * BLOCKS_PER_ROW + Math.floor(x / BLOCK);
}

export function PictureScene({ picker, aesKey }: { picker: ReactNode; aesKey: Bytes }) {
  const enc = useAsyncValue(() => encryptAll(aesKey), 'picture');
  const [picked, setPicked] = useState<number | null>(null);
  const setCaption = useSetCaption();
  const repeats = enc ? (Object.fromEntries(MODES.map((m) => [m, repeatedBlocks(enc[m])])) as Record<Mode, number>) : null;

  useIntroCaption(repeats ? pictureCaption(repeats, TOTAL, null) : <>Encrypting the picture four ways…</>, [repeats === null]);

  const pick = (block: number | null) => {
    setPicked(block);
    if (enc && repeats) {
      const info = block === null
        ? null
        : { block, same: sameAs(enc.ECB, block).length, othersMax: Math.max(...MODES.slice(1).map((m) => sameAs(enc[m], block).length)) };
      setCaption(pictureCaption(repeats, TOTAL, info), { quiet: true });
    }
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      pick(null);
      return;
    }
    if (!(e.key in MOVES)) return;
    e.preventDefault();
    pick(picked === null ? 0 : Math.min(TOTAL - 1, Math.max(0, picked + MOVES[e.key])));
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          {MODES.map((m) => (
            <Stat key={m} label={`${m} repeats`} value={repeats ? `${repeats[m]} / ${TOTAL}` : '–'} color={repeats && repeats[m] > 0 ? 'var(--bad)' : undefined} />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'picture: background' },
            { color: 'var(--amber)', label: 'picture: figure' },
            { color: 'var(--violet)', label: 'ciphertext byte (brighter = higher)' },
            { color: 'var(--bad)', label: 'outline: same ciphertext as the picked block' },
            { color: 'var(--hi)', label: 'outline: the picked block, unique' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="stage-pad sc-picture">
        {!enc ? (
          <p className="sc-muted">Encrypting…</p>
        ) : (
          <div className="sc-lanes">
            <figure className="sc-lane is-plain">
              <div className="sc-pixels">
                <Pixels bytes={IMAGE} colour={plainColour} />
                <Outlines bytes={IMAGE} picked={picked} />
              </div>
              <figcaption>Plaintext · 1 byte per pixel</figcaption>
            </figure>
            {MODES.map((m) => (
              <figure key={m} className="sc-lane">
                <div
                  className="sc-pixels"
                  onPointerMove={(e) => pick(blockAt(e))}
                  onPointerLeave={() => pick(null)}
                  {...(m === 'ECB'
                    ? { tabIndex: 0, role: 'group', 'aria-label': 'ECB ciphertext picture: arrow keys pick a 16-byte block', onKeyDown: onKey }
                    : {})}
                >
                  <Pixels bytes={enc[m]} colour={cipherColour} />
                  <Outlines bytes={enc[m]} picked={picked} />
                </div>
                <figcaption>{m === 'GCM' ? 'GCM (tag not drawn)' : m}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="sc-muted">
          Each row of 48 pixels is three 16-byte blocks. {HONESTY} Use AES-GCM (or ChaCha20-Poly1305); never ECB.
        </p>
      </div>
    </StageFrame>
  );
}
