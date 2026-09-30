import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { chunkGroups } from '../../core/bits';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { BASE64_PRESETS, STANDARD_ALPHABET, URL_ALPHABET, decodeToText, encode, overhead, toBlocks, utf8, type Block, type Variant } from './model';

const MAX_LENGTH = 30;
const MAX_BLOCKS = 12;
const PRINTABLE = /^[\x21-\x7e]$/;

/** A byte's label: the ASCII character when it has one, else its hex. */
const byteLabel = (b: number) => {
  const ch = String.fromCharCode(b);
  return PRINTABLE.test(ch) ? `'${ch}' ${b.toString(16).toUpperCase()}` : b.toString(16).toUpperCase().padStart(2, '0');
};

export function Base64Lane({ lanePicker }: { lanePicker: ReactNode }) {
  const [text, setText] = useState('Man');
  const [variant, setVariant] = useState<Variant>('standard');
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState<string | null>(null);
  const setCaption = useSetCaption();

  const bytes = utf8(text);
  const blocks = toBlocks(bytes, variant);
  const output = encode(bytes, variant);
  const shownBlocks = blocks.slice(0, MAX_BLOCKS);
  const activeBlock = shownBlocks[Math.min(active, shownBlocks.length - 1)];
  const alphabet = variant === 'url' ? URL_ALPHABET : STANDARD_ALPHABET;
  const used = new Set(blocks.flatMap((b) => b.sextets.filter((s): s is number => s !== null)));
  const activeSet = new Set(activeBlock?.sextets.filter((s): s is number => s !== null) ?? []);

  useIntroCaption(
    <>Base64 takes the bytes 3 at a time (24 bits), cuts them into four 6-bit groups, and looks each group up in a 64-character
      alphabet. "Man" becomes "TWFu".</>,
  );

  const load = (next: string) => {
    setText(next);
    setActive(0);
    setRevealed(null);
  };

  const reveal = () => {
    setRevealed(decodeToText(output, variant));
    setCaption(
      <>Decoded instantly, no key needed. Base64 is an <b>encoding</b>, not encryption: it only makes binary safe to send as text.
        Anyone can reverse it.</>,
    );
  };

  const chooseBlock = (i: number, b: Block) => {
    setActive(i);
    const pad = 3 - b.bytes.length;
    setCaption(
      pad === 0 ? (
        <>Block {i + 1}: 3 bytes = 24 bits = four 6-bit groups → <span className="hl">{b.chars.join('')}</span>.</>
      ) : (
        <>Block {i + 1} has only {plural(b.bytes.length, 'byte')}, so it's padded with {b.zeroPadBits} zero bits to fill the last group{variant === 'standard' ? <>, and {pad === 1 ? <>one <code>=</code> marks the missing byte</> : <>two <code>=</code> mark the missing bytes</>}</> : <>; base64url just drops the <code>=</code></>}.</>
      ),
      { quiet: true },
    );
  };

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Input bytes" value={bytes.length} color="var(--info)" />
          <Stat label="Base64 characters" value={output.length} color="var(--violet)" />
          <Stat label="Size" value={bytes.length ? `×${overhead(bytes.length, output.length).toFixed(2)}` : '–'} sub="→ ×1.33 as input grows (padding dominates tiny inputs)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: '8-bit bytes' },
            { color: 'var(--violet)', label: '6-bit groups' },
            { color: 'var(--hi)', label: 'active alphabet cell' },
            { color: 'var(--dim)', label: 'padding' },
          ]}
        />
      }
      controls={[
        <>
          {lanePicker}
          <TextField label="Type text" value={text} onChange={load} maxLength={MAX_LENGTH} width={220} spellCheck={false} />
          <Toggle label="Alphabet" value={variant === 'url'} onChange={(on) => { setVariant(on ? 'url' : 'standard'); setRevealed(null); }} off="Standard" on="base64url (JWT)" />
        </>,
        <>
          <ControlGroup label="Try">
            {BASE64_PRESETS.map((p) => (
              <button key={p.label} type="button" className={`chip tone-violet b64-preset ${text === p.text ? 'is-on' : ''}`} onClick={() => load(p.text)}>
                {p.label}
              </button>
            ))}
          </ControlGroup>
          <Button variant="danger" onClick={reveal} disabled={!output}>Is this encrypted?</Button>
        </>,
      ]}
    >
      <div className="stage-pad b64">
        <div className="b64-output">
          <SectionTitle hint={variant === 'url' ? 'base64url: - and _ instead of + and /, no padding' : 'standard base64'}>Output</SectionTitle>
          <code className="b64-string">
            {output ? [...output].map((ch, i) => <span key={i} className={ch === '=' ? 'b64-pad' : ''}>{ch}</span>) : '(empty)'}
          </code>
          <AnimatePresence>
            {revealed !== null && (
              <motion.p className="b64-revealed" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                Decoded without any key: <b>{revealed}</b>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div className="b64-row">
          <div className="b64-blocks">
            {shownBlocks.map((b, i) => (
              <button key={i} type="button" className={`b64-block ${b === activeBlock ? 'is-on' : ''}`} onClick={() => chooseBlock(i, b)} aria-label={`block ${i + 1}`}>
                <BitStrip
                  bits={b.bits}
                  size="sm"
                  toneOf={(k) => (k >= b.dataBits ? 'dim' : undefined)}
                  groups={chunkGroups(24, 8, { tone: 'info', label: (k) => (k < b.bytes.length ? byteLabel(b.bytes[k]) : 'no byte') })}
                  ariaLabel="bytes"
                />
                <BitStrip
                  bits={b.bits}
                  size="sm"
                  toneOf={(k) => (k >= b.dataBits ? 'dim' : undefined)}
                  groups={chunkGroups(24, 6, {
                    tone: 'violet',
                    label: (k) => (b.sextets[k] === null ? (variant === 'standard' ? '=' : '(dropped)') : `${b.sextets[k]} → ${alphabet[b.sextets[k]!]}`),
                  })}
                  ariaLabel="6-bit groups"
                />
              </button>
            ))}
            {blocks.length > MAX_BLOCKS && <p className="b64-more">…and {blocks.length - MAX_BLOCKS} more blocks (same rule).</p>}
          </div>
          <Box className="b64-alphabet-box">
            <SectionTitle hint="index → character">The 64-character alphabet</SectionTitle>
            <div className="b64-alphabet">
              {[...alphabet].map((ch, i) => (
                <span key={i} className={`cell b64-cell ${activeSet.has(i) ? 'tone-hi is-solid' : used.has(i) ? 'tone-violet is-tint' : ''}`}>
                  <small>{i}</small>
                  {ch}
                </span>
              ))}
            </div>
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}
