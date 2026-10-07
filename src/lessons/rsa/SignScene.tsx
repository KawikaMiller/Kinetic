import { useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, TextField, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { group, pow, signCaption, type SignResult } from './frames';
import { KEY_ROLES, edited, parseMessage, sign, unsign, type RsaKey } from './model';
import { KeyStats, ToyNote } from './Parts';

function check(k: RsaKey, m: bigint, tampered: boolean): SignResult {
  const s = sign(k, m);
  const received = tampered ? edited(m, k.n) : m;
  const recovered = unsign(k, s);
  return { m, s, received, recovered, valid: recovered === received };
}

export function SignScene({ picker, rsaKey }: { picker: ReactNode; rsaKey: RsaKey }) {
  const [text, setText] = useState('1234');
  const [m, setM] = useState(1234n);
  const [tampered, setTampered] = useState(false);
  const setCaption = useSetCaption();
  // A smaller key (from Make a key) can put the message out of range: reduce it into 0 … n − 1.
  const msg = m % rsaKey.n;
  const r = check(rsaKey, msg, tampered);
  const typed = parseMessage({ mode: 'number', text }, rsaKey.n);

  useIntroCaption(signCaption(rsaKey, r), [rsaKey]);

  const apply = () => {
    if (!typed.ok) return;
    const next = typed.value[0].m;
    setM(next);
    setCaption(signCaption(rsaKey, check(rsaKey, next, tampered)));
  };
  const flip = (t: boolean) => {
    setTampered(t);
    setCaption(signCaption(rsaKey, check(rsaKey, msg, t)));
  };

  return (
    <StageFrame
      height={360}
      stats={<KeyStats rsaKey={rsaKey} />}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'message' },
            { color: 'var(--violet)', label: 'private d and the signature it makes 🔒' },
            { color: 'var(--info)', label: 'public e' },
            { color: 'var(--ok)', label: 'valid' },
            { color: 'var(--bad)', label: 'rejected' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Message m" value={text} onChange={setText} onEnter={apply} width={120} spellCheck={false} />
          <Button variant="primary" onClick={apply} disabled={!typed.ok}>Sign</Button>
          <Toggle label="Verifier receives" value={tampered} onChange={flip} off="m as signed" on="m edited by one" />
          {!typed.ok && <Hint className="rsa-error">{typed.error} Still signing {group(msg)}.</Hint>}
          {msg !== m && <Hint className="rsa-error">{group(m)} isn't below this key's n = {group(rsaKey.n)}, so this signs {group(m)} mod n = {group(msg)}.</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad rsa-sign">
        <div className="rsa-sign-row">
          <Box className="rsa-card tone-violet">
            <b>Owner signs 🔒</b>
            <p>m = <span className="tone-hi">{group(r.m)}</span></p>
            <p>s = {pow(r.m, rsaKey.d)} mod {group(rsaKey.n)}</p>
            <p className="rsa-big tone-violet">s = {group(r.s)}</p>
          </Box>
          <span className="rsa-arrow" aria-hidden>→</span>
          <Box className={`rsa-card ${r.valid ? 'tone-ok' : 'tone-bad'}`}>
            <b>Anyone verifies (public e)</b>
            <p>received m = <span className={tampered ? 'tone-bad' : 'tone-hi'}>{group(r.received)}</span>{tampered && ' (edited)'}</p>
            <p>{pow(r.s, rsaKey.e)} mod {group(rsaKey.n)} = {group(r.recovered)}</p>
            <p className="rsa-big">{r.valid ? '✓ valid' : '✕ rejected'}</p>
          </Box>
        </div>
        <table className="data-table rsa-table rsa-roles">
          <caption>Same key pair, used both ways round</caption>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Key</th>
              <th>Who can do it</th>
            </tr>
          </thead>
          <tbody>
            {KEY_ROLES.map((row) => (
              <tr key={row.op}>
                <td>{row.op}</td>
                <td className={row.key.startsWith('public') ? 'tone-info' : 'tone-violet'}>{row.key}{row.key.startsWith('private') && ' 🔒'}</td>
                <td>{row.who}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Hint block>
          Real signatures sign a hash of the message with randomised padding (RSA-PSS), or use ECDSA or Ed25519. Raw textbook
          signatures are malleable: two valid ones can be combined into a valid signature on a message the owner never signed.
        </Hint>
        <ToyNote />
      </div>
    </StageFrame>
  );
}
