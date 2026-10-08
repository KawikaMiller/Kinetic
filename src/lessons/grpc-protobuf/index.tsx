import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Protocol Buffers turn a typed message into a few compact bytes that carry field numbers instead of names, and gRPC sends those messages, one or many, over a single HTTP/2 stream.',
    what: 'A .proto file declares each field with a type and a permanent number. On the wire, every field is a tag, its number shifted left three bits with a 3-bit wire type, followed by its value: a varint (7 bits per byte, with a continuation bit) or a length-delimited run such as a string. Plain proto3 fields left at their default are not sent at all (optional, message and oneof fields can still tell "absent" from "zero"), and a reader skips any field number it doesn\'t know by its length, which is how old and new versions keep talking. gRPC wraps each message in a 5-byte length prefix inside HTTP/2 DATA frames, with the outcome as `grpc-status` in the trailers.',
    analogy: 'A form where each box has a printed number and you only fill in the boxes that apply. The recipient reads "box 3: 5" using their own copy of the form; if you add box 6, they ignore it, but if you quietly renumber box 3, they read your answers into the wrong boxes.',
    useCases: [
      'Service-to-service calls inside a microservice system, with typed clients generated in many languages',
      'Mobile apps on slow or metered links where every byte of JSON counts',
      'Streaming telemetry, chat or log shipping over one long-lived connection',
      'Public APIs that must keep working with years-old clients while the schema grows',
    ],
    why: 'Interviews and design reviews ask why gRPC is smaller and faster than JSON over REST, and the answer is field numbers, varints and HTTP/2 streams. Knowing the one hard rule, never reuse or renumber a field number, prevents the silent data corruption that comes from "tidying" a schema while old clients are still deployed. It builds on `bit-manipulation`, `endianness`, `data-formats` and `http-versions`.',
    watch: 'Bytes on the wire: each byte is a cell in the hex grid. Violet bytes are the framing: a tag (field number and wire type) and, for strings and lists, a length. The value bytes take their field\'s colour, matching the dot beside its line in the .proto: id sky blue, item amber, qty orange, delta pink, tags grey. A fainter .proto line is a field left at its default, which takes 0 bytes. Bytes the chosen reader skips are dim, with a "skipped" label, and a yellow ring marks the bytes of the varint being expanded; its bit strip shows each byte\'s first bit in yellow (the continuation bit) and the other seven in blue (payload), set bits filled and clear ones outlined. Beside it, whichever encoding is smaller for the message is green and the larger red (protobuf is usually the smaller, but not for twelve -1 tags). In the reader table, a skipped field is grey italic. gRPC calls: the ladder\'s blue arrows go from client to server and violet ones back, a green grpc-status is OK, red an error, and an orange RST_STREAM is the client giving up; the message being explained now is yellow. The three readouts above it show the stream\'s state (from the client\'s side), the HTTP status, and the grpc-status (orange when the client made it).',
  },
  tryThis: [
    'Read the default message in the byte grid: the first byte 08 is the tag for field 1 (a varint), and 96 01 after it is 150.',
    'Switch "delta is declared" to int32: the −1 grows from 1 byte to 10, while sint32 keeps it at 1.',
    'Set "Who reads the bytes" to older: no field 5: the dim bytes labelled "skipped: field 5" are skipped by their length and every other field still reads.',
    'Pick "writer renumbered qty": the reader skips the moved field and reads qty as 0, with no error at all.',
    'In gRPC calls, play Bidirectional, then set How it ends to deadline missed and see who sends the status.',
  ],
  keyIdeas: [
    'A field travels as a tag, (field number << 3) | wire type, then its value: names are never sent.',
    'Varints use 7 payload bits per byte; sint32 zigzag keeps small negatives short, while a negative int32 always takes 10 bytes.',
    'Never reuse or renumber a field number: readers skip unknown ones safely, but a changed number silently loses data.',
    'gRPC is length-prefixed protobuf messages in HTTP/2 DATA frames on one stream, with grpc-status in the trailers.',
  ],
  quiz: [
    {
      q: 'What identifies the field `qty = 3` in the encoded bytes?',
      options: [
        'Its field number, 3, packed into a tag byte with a wire type',
        'The string "qty", written before the value in every message',
        'Its position in the .proto file, counted from the first field',
        'A hash of its name and type, stored in the first byte of it',
      ],
      answer: 0,
      why: 'Only the field number and a wire type travel, as (3 << 3) | 0 = 0x18, which is why renumbering breaks old clients. Names never appear on the wire, and position in the file means nothing: you can reorder the lines freely.',
    },
    {
      q: 'The value -1 is stored in a field. How many bytes does the value take as int32 and as sint32?',
      options: [
        '10 bytes as int32, and 1 byte as sint32',
        '1 byte as int32, and 1 byte as sint32 too',
        '4 bytes as int32, and 4 bytes as sint32 too',
        '5 bytes as int32, and 2 bytes as sint32',
      ],
      answer: 0,
      why: 'A negative int32 is sign-extended to 64 bits, so all ten 7-bit groups are needed. sint32 zigzags -1 to 1, which fits in one byte. "Both 1 byte" is the tempting one, since -1 looks small, but plain int32 pays for its sign bits.',
    },
    {
      q: 'A new schema adds field 6. A client built from the old .proto receives a message that has it. What happens?',
      options: [
        'It skips field 6 by its length and reads the rest as usual',
        'It rejects the whole message because it contains an unknown field',
        'It reads field 6 as the nearest field number it knows',
        'It crashes unless it was rebuilt from the new .proto file',
      ],
      answer: 0,
      why: 'Every wire type says how long its value is, so a reader can step over a field it doesn\'t know, and modern libraries keep it for re-serialising. Rejecting the message would make every added field a breaking change.',
    },
    {
      q: 'A team renumbers `qty` from field 3 to field 6 to tidy the file, while old clients are still running. What do those clients do?',
      options: [
        'Skip field 6 and read qty as 0, silently losing the value',
        'Match the field by its name, so nothing changes for them',
        'Fail to parse the message and return an error each time',
        'Read field 6 as qty, since the library remaps numbers on read',
      ],
      answer: 0,
      why: 'Old clients know qty as 3 and have never heard of 6, so they skip it and fall back to the default, with no error to notice. Names aren\'t on the wire to match by, and nothing remaps numbers on read, which is why a field number is permanent.',
    },
    {
      q: 'A gRPC server cannot find the order asked for. What does the client see on the HTTP/2 response?',
      options: [
        'HTTP status 200, with grpc-status 5 (NOT_FOUND) in the trailers',
        'HTTP status 404, with the error text in the response body',
        'HTTP status 500, because the handler returned an error',
        'No response at all: the stream is reset with RST_STREAM',
      ],
      answer: 0,
      why: 'gRPC reports its own status in the trailers, and the HTTP status stays 200 once the server has answered. A client that gives up on a deadline is the one that sends RST_STREAM, and it makes DEADLINE_EXCEEDED itself (a server that is told the deadline can return it too).',
    },
  ],
};

export default lesson;
