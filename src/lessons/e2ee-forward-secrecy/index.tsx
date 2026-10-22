import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A ratchet turns one key into a fresh key per message, so a stolen key opens later traffic until the other side replies with a new Diffie-Hellman key, and in this model it does not open what was sent before.',
    what: `Two fictional users, Alice and Bob, talk through a relay that stores headers and ciphertext and nothing else. Each message key comes from a chain key by a one-way function, so a copy of the sender's state opens later messages and no earlier ones. A reply that carries a fresh ratchet public key mixes in a secret the thief did not hold, which is how a theft heals. The page uses real HMAC, HKDF and AES-GCM from Web Crypto, and it is a simplified ratchet in the spirit of the Signal Double Ratchet: not that protocol, not compatible with it, and a model of a theft, not a tool.`,
    analogy: 'A padlock that is replaced after each letter and whose old pieces are melted down: whoever steals the lock today cannot open yesterday\'s letters, and the new lock is out of reach once the other side sends a fresh one.',
    useCases: [
      'Messaging apps whose servers relay encrypted messages they cannot read',
      'Limiting the damage of a stolen phone or a leaked session key to a window of messages',
      'Understanding what end-to-end encryption does and does not promise, such as metadata staying visible',
      'Reading about forward secrecy in TLS handshakes, where fresh keys per connection play a similar role',
    ],
    why: 'Key theft is a question of when, not just whether, so the useful property is how much a stolen key opens. It builds on `diffie-hellman`, `symmetric-ciphers`, `macs-hmac` and `digital-signatures-pki`, and it is the lesson that shows forward secrecy in action, which `tls-handshake` just mentions in one caption.',
    watch: 'A green mark is a message sealed to the thief and a red mark a message the thief can read; a grey card is a message sent before the theft. The chain strip is violet with the message key in use in yellow, the ratchet key on the wire is blue, and the healing point is yellow. Alice is sky blue and Bob amber, and a refused tag check is red text on a red edge.',
  },
  tryThis: [
    `Open The chain (default: symmetric ratchet only, with the theft after message 2) and slide the theft to message 4: messages 5 to 8 turn red and 1 to 4 stay sealed, and the page prints "${F.symmetricTries} tries, 0 opened" for each of the earlier four.`,
    `Still in The chain, switch the protection to One fixed key: the same theft opens ${F.fixedOpens}, past and future.`,
    `Open Healing (default AABBAB with the full ratchet) and steal Alice's state after message 1: ${F.readableDefault} read, ${F.sealedDefault} stay sealed, and the healing point is message ${F.healingDefault}.`,
    `In Healing press clear, add six messages from Alice and steal after message 3: every later message reads. Add one from Bob and one more from Alice: Bob's message still reads, and Alice's message after it is sealed.`,
  ],
  keyIdeas: [
    `Each message key comes from a chain key by a one-way HMAC, so a state copied after message 4 opens later messages of that chain and none before it: the page tries ${F.symmetricTries} derivable keys on each earlier message in this model and opens 0.`,
    `After a theft in AABBAB, one fixed key opens ${F.modeFixed}, a symmetric ratchet opens ${F.modeSymmetric} and the full ratchet opens ${F.modeFull}. Forward secrecy comes from the chain, and healing from the Diffie-Hellman step.`,
    `Healing needs a reply: in a one-way chat a copied state reads each later message because no fresh key is ever made, while alternating messages heal after one.`,
    `End-to-end encryption hides content from the relay and not who talks, when or how much, and one flipped bit, even in the authenticated header, makes AES-GCM refuse the message.`,
  ],
  quiz: [
    {
      q: 'A key is stolen from a chat that only ever goes one way. Which later messages can the thief read?',
      options: [
        'All of them: forward secrecy protects earlier messages, and healing needs the other side to reply',
        'None of them, because each message has a key of its own that the thief cannot derive in advance from the state',
        'Only the next one, because the chain key is replaced as soon as that message is sent',
        'Only the ones sent before the theft, because the stolen key was fixed at that moment',
      ],
      answer: 0,
      why: 'Without a reply no new ratchet key is made, so the stolen chain keeps producing the keys the sender uses. What the chain protects is the past: earlier keys cannot be recomputed from later ones.',
    },
    {
      q: 'What does end-to-end encryption hide from the relay?',
      options: [
        'The content of the messages, while the relay still sees who is talking, when and how much',
        'The content, the sender and the timing alike, so the relay learns nothing at all about the chat',
        'Only the timing of the messages, since the content is already visible to the relay in this design',
        'Nothing, because the relay holds the keys and can read each message before passing it on',
      ],
      answer: 0,
      why: 'The relay forwards ciphertext and headers, so it sees sender, size, time and the public ratchet key, but it holds no message key. The claim "the server learns nothing" overreaches.',
    },
    {
      q: 'Why can a thief with the chain key after message 4 not open message 2?',
      options: [
        'Message 2 was sent by the other party, whose chain the thief cannot reach from the copied state, so it stays sealed',
        'The thief\'s copy of the chain key was reset to zero right after message 2',
        'AES-GCM refuses any key that was not used in the order it was issued',
        'Each chain key comes from the previous one by a one-way function, so earlier keys cannot be computed back',
      ],
      answer: 3,
      why: 'Going forward is one HMAC call and going back would mean inverting it. The page tries each key derivable from the copied state on message 2 with real AES-GCM and none opens it.',
    },
    {
      q: 'In ABABAB a key is stolen after message 1. Why is message 3 sealed?',
      options: [
        'Message 3 was sent before the theft, so the copied state never held its key',
        'The ratchet only turns on every tenth message, so message 3 is still covered by an older chain of keys that is intact',
        'The reply carried a fresh ratchet key made after the theft, and the new chain depends on its private half',
        'The thief\'s key expired the moment the reply arrived, so every later message is refused',
      ],
      answer: 2,
      why: 'Alice\'s message 3 follows Bob\'s reply, which brought a new key pair whose private half the thief did not hold. The healing point is the first message whose chain depends on a key generated after the theft.',
    },
    {
      q: 'The thief tries a derived key on an older message and AES-GCM fails. What does the failure show?',
      options: [
        'The message was tampered with in transit, so the tag no longer matches',
        'The key is wrong for that message, because the tag does not authenticate under it',
        'The key is right but the message is corrupted in transit, so only the body failed to decode properly',
        'GCM refuses to decrypt old messages, whatever key is offered for them',
      ],
      answer: 1,
      why: 'Authentication fails when the key, the nonce, the header or the ciphertext differ from what the sender used. For an earlier message the cause here is the key, since the traffic was not altered.',
    },
  ],
};

export default lesson;
