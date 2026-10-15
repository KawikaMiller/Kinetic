import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A schema changes while old and new code are still running, so the question is who can read whose data; this lesson answers it by writing real bytes with one schema and reading them with another.',
    what: 'Protocol Buffers send field numbers and skip numbers they do not know, so adding a field is cheap, renaming is invisible in the bytes, and reusing a number silently mixes up meanings. Avro sends no names or numbers at all: the reader is handed the writer\'s schema and resolves its own against it, so defaults and type promotions decide what works. A registry applies a compatibility mode to each new version, and a rolling deploy decides which versions meet in production.',
    analogy: 'Two people share a form that gets reprinted. If a new box is added, the old form ignores it; if a box is renumbered or reused for a different question, the old reader files the answer under the wrong heading and nobody notices.',
    useCases: [
      'Event streams where producers and consumers deploy on different days and old messages stay on disk',
      'Service-to-service APIs that send protobuf, where a clean-up of a .proto file reaches production',
      'A schema registry that refuses a new version before it can break a consumer',
      'Rolling deploys of a message format, deciding whether consumers or producers go first',
    ],
    why: 'A schema change that compiles can still corrupt data without raising a single error, and the cheapest place to catch that is a compatibility check and a deploy order, not an incident. It builds on `grpc-protobuf`, which covered the wire format and the rule about field numbers; this lesson covers the other compatibility rules.',
    watch: 'In the byte grids a tag byte is violet, a length byte blue and a value byte plain grey; bytes a reader skipped as unknown are dim. A reading is green when each field comes out as the writer meant, orange when a value is wrong and nothing failed (the worst kind: no error to notice), and red when decoding fails. In the Avro scene a version\'s sample bytes take one colour per field; a green chip means compatible or decoded, a red one refused or an error, and an orange one would mean the rules and the real decode disagree, which cannot happen here. In the rollout, schema 1 is amber, 2 is pink and 3 is sky blue, a green cell is a message that decoded and a red one a message that failed, and the bottom lane marks each state green with no failures or red with their count.',
  },
  tryThis: [
    'Start with Add a field: both cards read cleanly. Switch "Whose message to show" to the v2 writer and find the dim bytes: field 4, which a v1 reader skips as unknown.',
    'Pick Reuse 3 (same type): the v2 reader reads the old qty of 300 as discount, orange, with no error and nothing marked unknown.',
    'Pick Rename name, then flip Encoding to JSON: the bytes never changed, but now both directions fail because JSON goes by name.',
    'In Avro and a registry, switch Registry mode from BACKWARD to BACKWARD_TRANSITIVE: v3 is refused, because data written with v1 has no b.',
    'In A rolling deploy, press play on the first run (add tag, no default, consumers first) and watch messages fail; then pick Producers first and the count drops to 0.',
  ],
  keyIdeas: [
    'Adding a field is safe for readers that skip what they do not know, not for a JSON reader set to reject unknown names.',
    'In protobuf the bytes carry field numbers, so renaming changes no byte, while renumbering or reusing a number changes what old data means.',
    'Avro resolves the reader\'s schema against the writer\'s: a reader field the writer lacks needs a default, and the transitive modes check each earlier version.',
    'Backward-compatible changes (new reader, old data) want consumers upgraded first, forward-compatible ones (old reader, new data) want producers first, and a change that is neither needs several deploys.',
  ],
  quiz: [
    {
      q: 'A v2 schema adds an optional field. Which reader still breaks on v2 data?',
      options: [
        'A JSON reader that rejects names it has not seen',
        'An old binary reader that skips field numbers it lacks',
        'An old Avro reader given the writer\'s schema to resolve',
        'A new reader handed old data that lacks the new field',
      ],
      answer: 0,
      why: 'Binary protobuf skips unknown numbers and Avro resolution skips fields the reader lacks, so those readers cope; a JSON reader configured to reject unknown names does not. Whether a parser rejects them is configuration, which is why "adding is safe" is a claim about tolerant readers.',
    },
    {
      q: 'A team renames `name` to `title` in a .proto file and changes nothing else. What happens to binary messages between old and new services?',
      options: [
        'Nothing changes, because names never travel in the bytes',
        'New readers skip the title field and read it as empty',
        'Old readers fail because the tag byte of the field changed',
        'Both sides report a decode error until all are redeployed',
      ],
      answer: 0,
      why: 'The bytes carry the field number and wire type, and the rename touches neither, so the encoded message is identical. A JSON mapping goes by name, so the same rename breaks a JSON endpoint.',
    },
    {
      q: 'v1 is {a}, v2 adds b with a default, v3 makes b required. Registering v3 under BACKWARD succeeds. Why can a consumer on v3 still fail?',
      options: [
        'It may meet data written with v1, which has no b and v3 gives b no default',
        'It cannot read v2 data, since b lost its default between those versions',
        'BACKWARD compares a new version with the oldest one registered',
        'Avro refuses records that have a second field after the first',
      ],
      answer: 0,
      why: 'BACKWARD compares the new version with the previous one, and v2 data does carry b. Old v1 messages in a topic or on disk do not, so a transitive mode that checks v1 as well catches it.',
    },
    {
      q: 'A change is backward compatible but not forward compatible. Which deploy order avoids decode failures?',
      options: [
        'Consumers first, then producers',
        'Producers first, then consumers',
        'One producer, then one consumer, in turns',
        'Either order works once both sides are on v2',
      ],
      answer: 0,
      why: 'Backward compatible means a new reader can read old data, so a new consumer meeting old producers is fine. Upgrading producers first would hand new data to old readers, which this change does not allow, and alternating mixes both directions.',
    },
    {
      q: 'A team deletes `qty = 3` and later adds `discount` (an int32) as field 3. A v1 message with qty 300 reaches a v2 reader. What does it read?',
      options: [
        'discount = 300, with no error and nothing flagged',
        'discount = 0, because the field names differ',
        'A decode error, since field 3 changed its meaning',
        'Nothing for field 3, which is kept as an unknown field',
      ],
      answer: 0,
      why: 'The reader knows number 3, and the wire type matches (a varint), so it decodes 300 into discount. Nothing on the wire says the meaning changed, which is why a removed number is listed as reserved and not reused.',
    },
  ],
};

export default lesson;
