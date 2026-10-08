import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An object store is a flat bucket of whole objects found by key: "folders" are just shared prefixes, and renaming, appending or listing behave nothing like a file system.',
    what: 'Block storage is numbered blocks that a file system maps into files and directories, so a rename or an append touches a block or two. An object store keeps each object whole under one key in a single flat key space: the "/" in a key is only a character, and a list call with a prefix and a delimiter folds keys into fake folders. Objects are replaced as a whole, so appending means uploading again and renaming a folder means copying and deleting every key under it, one request at a time and not atomically. Big objects go up as numbered parts in parallel (multipart upload), a part that fails is retried alone, and a presigned URL lets someone use one object for a while without a credential. Amazon S3 has been strongly consistent for reads after writes since December 2020; other stores differ.',
    analogy: 'A coat check. You hand over a coat (the object) and get a ticket (the key); you can have the whole coat back, or the staff can bring a sleeve, but you cannot stitch a patch onto the coat while it is hanging there. Reorganising the rails means taking every coat off and hanging it again.',
    useCases: [
      'Storing user uploads, backups, logs and build artifacts that are written once and read many times',
      'Serving static files and large downloads, including a byte range of a big file',
      'Uploading multi-gigabyte files reliably with multipart upload and retrying only a failed part',
      'Handing a client a time-limited presigned link instead of a credential',
    ],
    why: 'Engineers reach for object storage by default for blobs, and then trip on the file-system habits they bring: renames that cost a request per key, appends that rewrite everything, listings that need pagination and a bill that counts requests and egress. It builds on `file-systems` (directories and blocks), `storage-devices` (what a block is) and `http-basics` (the PUT, GET, Range and status codes the store speaks). Replication and the data-lake table formats built on top of buckets come later.',
    watch: 'Three stores scene: three columns hold the same 40 MiB file. In Block, each cell is 1 MiB of blocks: blue cells are the file, violet the directory blocks, and the solid yellow cell is the block the operation touches. In File, boxes are directories (violet) and files, and the yellow box is the one touched. In Object, the table is the flat bucket: the violet text at the start of a key is its shared prefix, and a yellow-edged row is a key being created or read. In the cost table, green figures are the cheap side and red the costly one. Multipart upload: blue cells are parts uploading, red a failed part, yellow a part being retried, green finished, dim waiting. Keys & listing: yellow rows are keys on this page and violet rows common prefixes. Access & cost: green means accepted, orange expired, red refused.',
  },
  tryThis: [
    'On Three stores with Rename the folder selected, press play: the object column copies each key and then deletes the old ones, and midway both reports/ and archive/ exist.',
    'Pick Append a line and read the cost table: the block and file stores rewrite one 4 KiB block, the object store uploads all 40 MiB again.',
    'Pick Read bytes 1-100: the object store moves 100 bytes with a Range header, while the others read a whole 4 KiB block.',
    'In Multipart upload, press play, then drag Part size to 4 MiB: the parts are under the 5 MiB minimum and Complete is refused. Back at 8 MiB, set Fail part to 3 and replay: only that part is sent again.',
    'In Keys & listing, keep the prefix reports/ and the / delimiter and press Next page; set the delimiter to none to see every key instead of folders.',
  ],
  keyIdeas: [
    'An object store is a flat key space with whole-object replace: "folders" are shared prefixes, and append and rename are not cheap operations.',
    'Listing is by prefix and delimiter, paginated, with keys and common prefixes counted together.',
    'Multipart upload sends numbered parts in parallel, retries a failed part alone, and Complete joins them in part-number order; every part but the last must reach the store\'s minimum.',
    'The bill counts stored bytes, requests, retrieval and egress, so many small requests and big downloads cost money even when storage is cheap.',
  ],
  quiz: [
    {
      q: 'You rename a "folder" that holds three objects in a bucket. What does the store actually do?',
      options: [
        'Copies each key to a new key, then deletes the old ones',
        'Rewrites one directory entry, as a file system does',
        'Renames the shared prefix in place without any copying',
        'Locks the bucket and swaps the old prefix for the new',
      ],
      answer: 0,
      why: 'There is no folder object to rename, only keys that share a prefix. A rename is a copy and a delete per key, so it takes many requests and is not atomic: for a while both prefixes exist.',
    },
    {
      q: 'You must add one line to a 40 MiB object using the classic S3-style API. What is required?',
      options: [
        'Uploading the whole object again with the line included',
        'Sending a PUT with just the new bytes and a write offset in it',
        'Sending the new line as a Range PUT to the object end',
        'Opening the object and writing at its current end',
      ],
      answer: 0,
      why: 'Objects are replaced whole: there is no partial update, no offset and no append (some services add an append mode of their own). The cost is the full object, not the line.',
    },
    {
      q: 'You only need the first 100 bytes of a very large object. What is the cheap way?',
      options: [
        'A GET that carries a Range header for those bytes',
        'Download the object, then cut out the bytes locally',
        'List the key with a max-keys limit of 100 entries',
        'Open the object and seek to the start like a file',
      ],
      answer: 0,
      why: 'A Range header makes the store return just that slice (a 206 response), so about 100 bytes cross the network. Listing returns keys, not content, and there is no open or seek.',
    },
    {
      q: 'A 40 MiB multipart upload uses 4 MiB parts, and the store\'s minimum part size is 5 MiB (the last part is exempt). What happens at Complete?',
      options: [
        'It is refused, because every part but the last is too small',
        'It succeeds, and the parts are joined in finishing order',
        'It succeeds, because only the last part has its size checked',
        'It is refused unless the parts finished in number order',
      ],
      answer: 0,
      why: 'Ten 4 MiB parts leave nine non-final parts under the minimum, so the store answers EntityTooSmall and creates no object. Order of arrival is irrelevant: parts are joined by part number.',
    },
    {
      q: 'What is true of a presigned URL for an object?',
      options: [
        'Anyone holding it can use it until it expires, but not change it',
        'The holder must send the signer\'s secret key with every request',
        'It stays valid until the object is deleted from the bucket',
        'The holder can extend it by editing the expiry in the URL',
      ],
      answer: 0,
      why: 'The link carries its permission, expiry and a signature made with the signer\'s secret. Editing the key, method or expiry breaks the signature, and the link stops working when it expires; it does not authenticate who is using it.',
    },
  ],
};

export default lesson;
