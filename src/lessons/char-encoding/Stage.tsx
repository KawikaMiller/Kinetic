import { useState } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import {
  PRESETS, codePoints, counts, decodeAs, encodeCodePoint, formatCodePoint, graphemes, hexByte, normalisation, utf8,
  type EncodedCodePoint,
} from './model';
import './styles.css';

type Decoding = 'utf-8' | 'windows-1252';

const MAX_LENGTH = 24;
const START = PRESETS[0].text;

export function Stage() {
  const [text, setText] = useState(START);
  const [selected, setSelected] = useState(3);
  const [decoding, setDecoding] = useState<Decoding>('utf-8');
  const setCaption = useSetCaption();

  const chars = graphemes(text);
  const pick = Math.min(selected, chars.length - 1);
  const c = counts(text);
  const decoded = decodeAs(utf8(text), decoding);
  const norm = normalisation(text);

  useIntroCaption(
    <>Every character is a number (a code point), and UTF-8 turns each code point into 1 to 4 bytes. Click a character to see
      its bytes, or type your own.</>,
  );

  const choose = (i: number, g: string) => {
    setSelected(i);
    const cps = codePoints(g);
    const bytes = utf8(g).length;
    setCaption(
      <><span className="hl">{g}</span> is {cps.map(formatCodePoint).join(' + ')}: {plural(cps.length, 'code point')},{' '}
        {plural(bytes, 'byte')} of UTF-8{cps.length > 1 ? ', but one character on screen' : ''}.</>,
      { quiet: true },
    );
  };

  const load = (next: string) => {
    setText(next);
    setSelected(0);
  };

  const switchDecoding = (d: Decoding) => {
    setDecoding(d);
    setCaption(
      d === 'windows-1252' ? (
        <>Same bytes, wrong decoder. Windows-1252 reads every byte as its own character, so each multi-byte sequence turns into{' '}
          <span className="hl bad">mojibake</span>: that's how "é" becomes "Ã©".</>
      ) : (
        <>Decoded as UTF-8 again: the multi-byte sequences reassemble and the text is back.</>
      ),
    );
  };

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Characters you see" value={c.graphemes} color="var(--hi)" sub="graphemes" />
          <Stat label="Code points" value={c.codePoints} />
          <Stat label=".length" value={c.utf16} color="var(--violet)" sub="UTF-16 code units" />
          <Stat label="UTF-8 bytes" value={c.utf8Bytes} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'selected character' },
            { color: 'var(--dim)', label: 'prefix bits' },
            { color: 'var(--info)', label: 'payload bits' },
            { color: 'var(--bad)', label: 'mojibake' },
          ]}
        />
      }
      controls={[
        <>
          <TextField label="Type any text" value={text} onChange={(v) => load(v)} maxLength={MAX_LENGTH} width={220} spellCheck={false} />
          <Segmented label="Decode the bytes as" value={decoding} onChange={switchDecoding} options={[{ value: 'utf-8', label: 'UTF-8' }, { value: 'windows-1252', label: 'Windows-1252' }]} />
        </>,
        <ControlGroup key="presets" label="Try">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} size="md" on={text === p.text} onClick={() => load(p.text)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad ce">
        {chars.length === 0 ? (
          <Hint block>Type something above.</Hint>
        ) : (
          <>
            <div className="ce-chars" role="radiogroup" aria-label="characters">
              {chars.map((g, i) => (
                <button key={`${i}-${g}`} type="button" role="radio" aria-checked={i === pick} className={`ce-char ${i === pick ? 'is-on' : ''}`} onClick={() => choose(i, g)}>
                  <span className="ce-glyph">{g}</span>
                  <span className="ce-cps">{codePoints(g).map(formatCodePoint).join(' ')}</span>
                  <span className="ce-bytes">{[...utf8(g)].map(hexByte).join(' ')}</span>
                </button>
              ))}
            </div>
            <Box className="ce-detail">
              <SectionTitle hint="code point → UTF-8 bytes">
                {/* the title is uppercase by CSS; the character itself must not be (é is not É) */}
                <span className="ce-sel">{chars[pick]}</span>
              </SectionTitle>
              {codePoints(chars[pick]).map((cp, k) => (
                <CodePointBytes key={`${cp}-${k}`} e={encodeCodePoint(cp)} />
              ))}
            </Box>
          </>
        )}
        <Box className="ce-decoded">
          <SectionTitle hint={decoding === 'utf-8' ? 'correct' : 'wrong decoder'}>The same bytes decoded as {decoding === 'utf-8' ? 'UTF-8' : 'Windows-1252'}</SectionTitle>
          <p className="ce-output">
            {[...decoded.text].map((ch, i) => (
              <span key={i} className={decoded.garbled[i] ? 'ce-bad' : ''}>{ch}</span>
            ))}
          </p>
        </Box>
        {!norm.isNfc && (
          <Hint block className="ce-norm">
            This text is not in NFC form: it uses a combining accent. It looks identical to the precomposed version, but{' '}
            <code>s === s.normalize('NFC')</code> is false and the lengths differ ({norm.nfdLength} vs {norm.nfcLength}). Normalise
            before comparing strings.
          </Hint>
        )}
      </div>
    </StageFrame>
  );
}

/** One code point: its binary payload, split into the bytes UTF-8 packs it into. */
function CodePointBytes({ e }: { e: EncodedCodePoint }) {
  const ascii = e.bytes.length === 1;
  return (
    <div className="ce-cp">
      <div className="ce-cp-head">
        <code>{formatCodePoint(e.cp)}</code> = {e.cp.toLocaleString()} ={' '}
        {ascii ? 'fits in 7 bits: plain ASCII, one byte' : `${e.payload.length} payload bits, packed into ${e.bytes.length} bytes`}
      </div>
      <BitStrip
        bits={e.payload}
        size="sm"
        toneOf={() => 'info'}
        groups={e.payloadRuns.map(([from, to], k) => ({ from, to, tone: 'info', label: `→ byte ${k + 1}` }))}
        ariaLabel={`${formatCodePoint(e.cp)} payload bits`}
      />
      <div className="ce-byte-row">
        {e.bytes.map((b, k) => (
          <BitStrip
            key={k}
            bits={b.bits}
            size="sm"
            groups={[
              { from: 0, to: b.prefix - 1, tone: 'dim', label: b.bits.slice(0, b.prefix).join('') },
              { from: b.prefix, to: 7, tone: 'info', label: `byte ${k + 1} = ${hexByte(b.byte)}` },
            ]}
            ariaLabel={`byte ${k + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
