// The "Which one?" quiz: tools, real jobs and their answers.

export type Tool = 'hash' | 'slow' | 'sym' | 'asym' | 'sign';

export const TOOLS: Record<Tool, string> = {
  hash: 'Hash (SHA-256)',
  slow: 'Salted slow hash',
  sym: 'Symmetric encryption',
  asym: 'Asymmetric encryption',
  sign: 'Digital signature',
};
export const TOOL_IDS = Object.keys(TOOLS) as Tool[];

export const SCENARIOS: { q: string; a: Tool; why: string }[] = [
  { q: 'Store user passwords', a: 'slow', why: 'You never need the password back, only to check a guess. Argon2id or bcrypt, unique salt each.' },
  { q: 'Check a 4 GB download isn’t corrupted', a: 'hash', why: 'Hash the file and compare with the published digest. Fast, fixed-size, one bit changes everything.' },
  { q: 'Encrypt a database backup you’ll restore later', a: 'sym', why: 'You need the data back, it’s big, and you hold the key. AES is built for exactly this.' },
  { q: 'Send a secret to someone you’ve never met', a: 'asym', why: 'Lock it with their public key (in practice, to agree on a symmetric key, as TLS does).' },
  { q: 'Prove a software release really came from you', a: 'sign', why: 'Sign with your private key; anyone verifies with your public key. Tampering breaks it.' },
  { q: 'Store credit card numbers you must charge again', a: 'sym', why: 'Hashing is one-way, so you could never charge the card. Encrypt it, and guard the key (ideally in a KMS).' },
];

export const score = (answers: (Tool | null)[]) => answers.filter((a, i) => a === SCENARIOS[i].a).length;

/** Record a pick. Once a job is answered correctly its answer stays locked in. */
export function answer(answers: (Tool | null)[], i: number, t: Tool): (Tool | null)[] {
  if (answers[i] === SCENARIOS[i].a) return answers;
  const next = answers.slice();
  next[i] = t;
  return next;
}
