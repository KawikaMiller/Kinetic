/**
 * One file kept three ways: raw blocks under a file system, a file system's directory tree, and a flat
 * object bucket. Costs are counted from the model: bytes moved and requests made. Sizes are illustrative.
 */

export const KIB = 1024;
export const MIB = 1024 * KIB;

export const FILE_KEY = 'reports/2026/q3.csv';
export const FILE_SIZE = 40 * MIB;
/** The unit a block device reads and writes. */
export const BLOCK = 4 * KIB;
/** The line the "append" operation adds. */
export const LINE_BYTES = 100;
/** "Read bytes 1-100": an inclusive, zero-based byte range, as in an HTTP Range header. */
export const RANGE = { from: 1, to: 100 } as const;
export const RANGE_BYTES = RANGE.to - RANGE.from + 1;
/** A listing page holds at most this many keys. */
export const LIST_PAGE = 1000;
/** Roughly what one listed key costs on the wire. */
export const LIST_ENTRY_BYTES = 100;
export const OLD_PREFIX = 'reports/';
export const NEW_PREFIX = 'archive/';

export interface BucketObject {
  key: string;
  size: number;
}

export const BUCKET: BucketObject[] = [
  { key: 'logs/app.log', size: 6 * MIB },
  { key: 'readme.txt', size: 2 * KIB },
  { key: 'reports/2025/q4.csv', size: 38 * MIB },
  { key: 'reports/2026/q2.csv', size: 41 * MIB },
  { key: FILE_KEY, size: FILE_SIZE },
];

export type OpId = 'append' | 'rename' | 'range' | 'list';
export type StoreId = 'block' | 'file' | 'object';
export const OPS: OpId[] = ['append', 'rename', 'range', 'list'];
export const STORES: StoreId[] = ['block', 'file', 'object'];

export const OP_LABEL: Record<OpId, string> = { append: 'Append a line', rename: 'Rename the folder', range: 'Read bytes 1-100', list: 'List reports/' };
export const STORE_LABEL: Record<StoreId, string> = { block: 'Block', file: 'File', object: 'Object' };

export interface Outcome {
  /** What happens, in plain words. */
  verdict: string;
  /** Bytes moved by the store itself (read, written or copied). */
  bytes: number;
  /** Requests or I/O calls made. */
  requests: number;
  /** What a "request" is in this store. */
  unit: string;
  /** Does a reader ever see it half done? */
  atomic: boolean;
  /** Cheap (ok) or costly (bad), from the numbers. */
  tone: 'ok' | 'bad';
}

/** Costly means: more than a mebibyte moved, or more than two requests. */
export const COSTLY_BYTES = MIB;
export const COSTLY_REQUESTS = 2;

const keysUnder = (prefix: string) => BUCKET.filter((o) => o.key.startsWith(prefix));
export const renamedKey = (key: string) => NEW_PREFIX + key.slice(OLD_PREFIX.length);

function raw(op: OpId, store: StoreId): Omit<Outcome, 'tone'> {
  switch (op) {
    case 'append':
      if (store === 'object') {
        return { verdict: `No partial update: the whole object is uploaded again (${FILE_SIZE / MIB} MiB for ${LINE_BYTES} bytes)`, bytes: FILE_SIZE + LINE_BYTES, requests: 1, unit: 'PUT', atomic: true };
      }
      return {
        verdict: store === 'block' ? 'Rewrites the last block in place' : 'Appends in place: rewrites the last block and the file size',
        bytes: BLOCK,
        requests: 1,
        unit: store === 'block' ? 'block write' : 'write call',
        atomic: true,
      };
    case 'rename': {
      if (store === 'object') {
        const keys = keysUnder(OLD_PREFIX);
        return {
          verdict: `Copies and deletes every key under the prefix: ${keys.length} copies, ${keys.length} deletes, and not atomic`,
          bytes: keys.reduce((n, o) => n + o.size, 0),
          requests: keys.length * 2,
          unit: 'copy or delete request',
          atomic: false,
        };
      }
      return {
        verdict: store === 'block' ? 'The file system rewrites one directory block' : 'One metadata change: a directory entry gets a new name',
        bytes: BLOCK,
        requests: 1,
        unit: store === 'block' ? 'block write' : 'rename call',
        atomic: true,
      };
    }
    case 'range':
      if (store === 'object') {
        return { verdict: `GET with a Range header returns just those ${RANGE_BYTES} bytes`, bytes: RANGE_BYTES, requests: 1, unit: 'GET', atomic: true };
      }
      return {
        verdict: store === 'block' ? 'Reads the one block that holds them' : 'A read call: the file system reads the one block that holds them',
        bytes: BLOCK,
        requests: 1,
        unit: store === 'block' ? 'block read' : 'read call',
        atomic: true,
      };
    case 'list':
      if (store === 'object') {
        const keys = keysUnder(OLD_PREFIX).length;
        const pages = Math.max(1, Math.ceil(keys / LIST_PAGE));
        return { verdict: `Lists keys by prefix, up to ${LIST_PAGE} per page: ${pages} page here`, bytes: keys * LIST_ENTRY_BYTES, requests: pages, unit: 'list request', atomic: true };
      }
      return {
        verdict: store === 'block' ? 'Blocks have no names: the file system reads its directory block' : 'Reads the directory\'s entries',
        bytes: BLOCK,
        requests: 1,
        unit: store === 'block' ? 'block read' : 'readdir call',
        atomic: true,
      };
  }
}

export function outcome(op: OpId, store: StoreId): Outcome {
  const o = raw(op, store);
  return { ...o, tone: o.bytes > COSTLY_BYTES || o.requests > COSTLY_REQUESTS ? 'bad' : 'ok' };
}

// ---------- what the object store holds, step by step ----------

export type RowState = 'normal' | 'new';
export interface ObjectRow extends BucketObject {
  state: RowState;
}

export interface RenameStep {
  /** The request this step sends. */
  request: string;
  /** The bucket after that request has completed; the key just created is marked 'new'. */
  rows: ObjectRow[];
}

/**
 * The bucket during a rename of the reports/ prefix to archive/: a CopyObject for each key under the old prefix (the new
 * key appears while the old one is still there), then a DeleteObject for each old key. Step 0 is before any request.
 */
export function renameSteps(): RenameStep[] {
  const moving = keysUnder(OLD_PREFIX);
  let settled: ObjectRow[] = BUCKET.map((o) => ({ ...o, state: 'normal' }));
  const steps: RenameStep[] = [{ request: '(nothing sent yet)', rows: settled }];
  for (const o of moving) {
    const rows: ObjectRow[] = [...settled, { key: renamedKey(o.key), size: o.size, state: 'new' }];
    steps.push({ request: `PUT /${renamedKey(o.key)}  x-amz-copy-source: /${o.key}`, rows });
    settled = rows.map((r) => ({ ...r, state: 'normal' }));
  }
  for (const o of moving) {
    settled = settled.filter((r) => r.key !== o.key);
    steps.push({ request: `DELETE /${o.key}`, rows: settled });
  }
  return steps;
}

/** How many steps an operation takes to play: the object rename is the only one with more than one. */
export const stepCount = (op: OpId) => (op === 'rename' ? renameSteps().length - 1 : 1);

/** The HTTP exchange an operation sends to the object store (fictional bucket; S3-compatible shape). */
export function httpLines(op: OpId): string[] {
  switch (op) {
    case 'append':
      return [
        `PUT /${FILE_KEY} HTTP/1.1`,
        'Host: example-reports.objects.example',
        `Content-Length: ${FILE_SIZE + LINE_BYTES}`,
        '',
        '200 OK  (the old version is replaced as a whole)',
      ];
    case 'rename':
      return renameSteps().slice(1).map((s) => s.request);
    case 'range':
      return [
        `GET /${FILE_KEY} HTTP/1.1`,
        'Host: example-reports.objects.example',
        `Range: bytes=${RANGE.from}-${RANGE.to}`,
        '',
        '206 Partial Content',
        `Content-Range: bytes ${RANGE.from}-${RANGE.to}/${FILE_SIZE}`,
        `Content-Length: ${RANGE_BYTES}`,
      ];
    case 'list':
      return [
        'GET /?list-type=2&prefix=reports%2F&delimiter=%2F HTTP/1.1',
        'Host: example-reports.objects.example',
        '',
        '200 OK',
        'CommonPrefixes: reports/2025/, reports/2026/',
        'IsTruncated: false',
      ];
  }
}
