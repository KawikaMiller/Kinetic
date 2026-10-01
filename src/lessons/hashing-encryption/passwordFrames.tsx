// Lane ② script: three ways to store a password, and what each leak gives away.
import type { ReactNode } from 'react';
import { FAST_S, PASSWORD, SLOW_DAYS, type PwFrame } from './passwordModel';

export function buildPasswordFrames(): PwFrame[] {
  const f = (p: Partial<PwFrame> & { say: ReactNode }): PwFrame => ({
    storage: 'plain', breach: false, cracked: [], lookup: null, race: 'none', ...p,
  });
  return [
    f({ say: <>Alice and Bob sign up. By coincidence both pick the password <span className="hl">{PASSWORD}</span>.</> }),
    f({ say: <>Version 1 stores the password <b>as typed</b>. Works fine, until…</> }),
    f({ breach: true, cracked: ['alice', 'bob'], hold: 1.3,
      say: <><span className="hl bad">The database leaks.</span> The attacker just reads every password. Game over, instantly.</> }),
    f({ storage: 'hash',
      say: <>Version 2 stores <span className="hl info">SHA-256(password)</span>. At login, hash what they typed and compare. No plaintext anywhere.</> }),
    f({ storage: 'hash', breach: true, lookup: 'hit', cracked: ['alice', 'bob'], hold: 1.4,
      say: <>Leak again. Two rows share <b>the same hash</b>, so the attacker looks it up in a precomputed <span className="hl bad">lookup table</span> of common passwords' hashes: {PASSWORD}. Both cracked.</> }),
    f({ storage: 'salt',
      say: <>Version 3 adds a random <span className="hl violet">salt</span> per user and stores SHA-256(salt + password). Same password, <b>different hashes</b>.</> }),
    f({ storage: 'salt', breach: true, lookup: 'miss', hold: 1.3,
      say: <>Leak again. The lookup table is useless: it was built without these salts. Now each password must be guessed <b>one user at a time</b>.</> }),
    f({ storage: 'salt', breach: true, lookup: 'miss', race: 'fast', hold: 1.5,
      say: <>But SHA-256 is built to be <span className="hl bad">fast</span>. A GPU tries ~10 billion guesses a second: every 8-letter lowercase password in ~{Math.round(FAST_S)} s.</> }),
    f({ storage: 'salt', breach: true, lookup: 'miss', race: 'slow', hold: 1.5,
      say: <>So passwords use deliberately <span className="hl ok">slow</span> hashes: <b>bcrypt, scrypt or Argon2</b>, with a tunable cost. The same search now takes ~{Math.round(SLOW_DAYS)} days, per user.</> }),
    f({ storage: 'salt', breach: false, lookup: null, race: 'slow', hold: 2,
      say: <>Recipe: <span className="hl violet">unique salt</span> + <span className="hl ok">slow hash</span> (Argon2id or bcrypt). Never plaintext, never plain fast hashes, never encryption you can reverse.</> }),
  ];
}
