import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Envelope encryption encrypts each record with its own data key and keeps only a wrapped copy of that key, so the master key stays inside a key service, rotation means re-wrapping small keys instead of re-encrypting data, and destroying a key makes every copy of the data unreadable.',
    what: 'Three fictional tenants each get a key-encryption key held by a simulated key service, as a WebCrypto key that the page cannot export. Each record gets a fresh data key, is encrypted with real AES-GCM with its record id as additional data, and the data key is wrapped under the tenant\'s key with the tenant id as its encryption context. You decrypt by running the chain backwards, rotate a key and see which bytes changed, destroy a key and watch the data and its backup become unreadable, present a record under the wrong key or context and watch real authentication fail, and finally count what reaches the key service when every record is sent to it against when only wrapped keys are.',
    analogy: 'A safe-deposit scheme: each box has its own small key, and those small keys are kept in a vault that only the bank can open, so changing the bank\'s lock means re-filing small keys, not emptying every box.',
    useCases: [
      'Encrypting a database, bucket or backup so one key service guards many tenants',
      'Rotating a master key on a schedule without a re-encryption project',
      'Deleting a customer\'s data from backups by destroying their key',
      'Staying under a key service\'s call quota and payload limit at high traffic',
    ],
    why: 'Encryption at rest is mostly a key-management problem: where the keys live, who may ask for them, and what a rotation or a deletion costs. Knowing the hierarchy tells you why a rotation touches tens of bytes per record and why a destroyed key outlives every backup.',
    watch: 'Key levels are coloured by role: the root key violet (--violet, structural), the key-encryption key blue (--info), the data key in use yellow (--hi), data bytes plain grey. A wrapped, protected data key is green (--ok). In the rotation scene the cheap path (re-wrap, or bytes that did not change) is green and the costly one (re-encrypting the data) is red (--bad). A destroyed key, the records it made unreadable and an authentication failure are red. The byte grid colours the IVs sky, the tag orange, the ciphertext grey and the wrapped key green.',
  },
  tryThis: [
    `Keys and the envelope, on the defaults (Acme, rec-1): the record "${F.firstText}" is an envelope of ${F.firstEnvelope} bytes: a ${F.ivBytes}-byte IV, ${F.ciphertextWithTag} bytes of ciphertext with its tag, and a ${F.wrapped}-byte wrapped key. Press "Decrypt the selected record": it decrypts to that text. Type a made-up text and press "Encrypt and store": Acme has ${F.recordsAfterAdd} records.`,
    `Rotation, on the defaults: press "Rotate Acme's KEK". The data hashes read "unchanged" for ${F.recordsPerTenant} of ${F.recordsPerTenant} records and the wrapped keys changed. At ${F.records} records of 8 KiB re-wrapping touches ${F.rewrapText} and re-encrypting the data ${F.reencryptText}, ${F.ratioText} times as much.`,
    `Shredding, from a fresh load: press "Destroy Acme's KEK". Acme's live records and its backup copies are each 0 of ${F.recordsPerTenant} readable, and the ciphertext is unchanged. Press "Rebuild the vault", then "Present Birch's record to Acme's key": real authentication fails with OperationError.`,
    `Why not the master key, on the defaults (${F.rate} records a second, ${F.size} B, ${F.perKey} per key, cache on): direct encryption makes ${F.directCalls} KMS calls a second against an illustrative quota of ${F.quota}, and envelope encryption makes ${F.envelopeCalls}. Raise the record size to 8 KiB: direct encryption is refused, since its limit is ${F.limit}.`,
  ],
  keyIdeas: [
    `Rotating a key-encryption key re-wraps each ${F.wrapped}-byte wrapped key and leaves the data bytes identical: at ${F.records} records of 8 KiB that is ${F.rewrapText} against ${F.reencryptText} to re-encrypt the data.`,
    `Destroying a key does not delete the data, it makes the data unreadable: in this lesson the ciphertext stays, and ${F.unreadable} of ${F.recordsPerTenant} live records and backup copies can be read, which covers only data that was encrypted under that key all along.`,
    'A wrapped key is bound to its encryption context: wrapped for one tenant, it fails real AES-GCM authentication under another, so a mix-up cannot unwrap quietly.',
    `A KMS call per record scales with traffic: at ${F.rate} records a second direct encryption makes ${F.directCalls} calls and envelope encryption ${F.envelopeCalls}, and with one record per key the counts nearly match (${F.perRecordKeyCalls} against ${F.directCalls}) and the bytes are what shrink.`,
  ],
  quiz: [
    {
      q: 'After a key-encryption key rotation, which stored bytes changed?',
      options: [
        'Every ciphertext byte, because the data was decrypted and encrypted again under the new key',
        'The wrapped data keys changed, while the data IVs and the ciphertext are byte-identical',
        'Only the key inside the key service changed, so the stored envelope is the same bytes',
        'The data IVs changed, since a new key needs a new IV, but the wrapped keys stayed put',
      ],
      answer: 1,
      why: `Rotation unwraps each data key under the old version and wraps it under the new one, so the ${F.wrapped}-byte wrapped keys are what change; the lesson hashes the stored data before and after and the hashes match.`,
    },
    {
      q: 'After crypto-shredding a tenant, can its backup be read?',
      options: [
        'Yes, because deleting a key affects the live copies and a backup is a separate file in storage',
        'Yes, as long as the backup was taken before the key was destroyed, since it predates that event',
        'No, because the backup holds the same ciphertext and wrapped keys, and the key that unwraps them is gone',
        'No, because destroying a key also overwrites every backup of the data it protected',
      ],
      answer: 2,
      why: `The backup is a copy of the same envelopes, so it is exactly as unreadable as the live data once the key is gone: in this lesson ${F.unreadable} of ${F.recordsPerTenant} backup copies can be read, and nothing overwrote them.`,
    },
    {
      q: 'Why is the tenant id bound to the wrapped key as its encryption context?',
      options: [
        'So the key service can look up which plaintext record it should return for that tenant when asked',
        'So a wrapped key presented under a different context fails authentication instead of unwrapping',
        'So the context is encrypted together with the data and cannot be read from the envelope',
        'So the wrapped key becomes longer, which makes it harder for anyone to guess its bytes',
      ],
      answer: 1,
      why: 'The context is authenticated, not hidden: a wrap made for one context fails to unwrap under another with a real OperationError, so presenting one tenant\'s record under another\'s context is refused.',
    },
    {
      q: 'Why encrypt records with data keys instead of sending every record to the master key?',
      options: [
        'Data keys encrypt faster than the master key can, which is why the master key is rarely used for data at all',
        'The key service sees only small wrapped keys, so bytes and payload limits shrink, and calls too when keys are shared',
        'A data key is a second copy of the master key, kept so that a lost master key can be rebuilt',
        'Records are too long for any single key, so each record must be split across several data keys',
      ],
      answer: 1,
      why: `In this model direct encryption sends ${F.directBytes} a second to the key service and envelope encryption ${F.envelopeBytes}, and direct encryption refuses a record past ${F.limit}. Calls fall from ${F.directCalls} to ${F.envelopeCalls} because ${F.perKey} records share each data key; with one record per key they stay near ${F.perRecordKeyCalls}.`,
    },
  ],
};

export default lesson;
