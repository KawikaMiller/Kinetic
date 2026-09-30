import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { blobId, byId, rootTreeId, srcTreeId, type Commit, type FileName, type Repo } from './repo';

/** The selected commit's object tree (commit → trees → blobs), marking what's new vs reused from its parent. */
export function ObjectPanel({ repo, c }: { repo: Repo; c: Commit }) {
  const parent = c.parents.length ? byId(repo, c.parents[0]) : null;
  const status = (have: string, had: string | null) => (had === null ? 'new' : have === had ? 'reused' : 'new');
  const root = rootTreeId(c.files);
  const src = srcTreeId(c.files);
  const pRoot = parent ? rootTreeId(parent.files) : null;
  const pSrc = parent ? srcTreeId(parent.files) : null;
  const blob = (f: FileName) => blobId(c.files[f]);
  const pBlob = (f: FileName) => (parent ? blobId(parent.files[f]) : null);

  return (
    <div className="gi-objects">
      <span className="gi-label">inside commit {c.id} · vs its parent</span>
      <Obj kind="commit" id={c.id} st="new" note={c.msg}>
        <div className="gi-meta">parents: {c.parents.length ? c.parents.join(', ') : 'none (root commit)'}</div>
        <Obj kind="tree" id={root} st={status(root, pRoot)} note="/">
          <Obj kind="blob" id={blob('README.md')} st={status(blob('README.md'), pBlob('README.md'))} note="README.md" />
          <Obj kind="tree" id={src} st={status(src, pSrc)} note="src/">
            <Obj kind="blob" id={blob('src/app.js')} st={status(blob('src/app.js'), pBlob('src/app.js'))} note="app.js" />
            <Obj kind="blob" id={blob('src/util.js')} st={status(blob('src/util.js'), pBlob('src/util.js'))} note="util.js" />
          </Obj>
        </Obj>
      </Obj>
      <p className="gi-foot">
        Each object's name <b>is</b> the hash of its content. Unchanged files keep the same hash, so git reuses them
        instead of storing copies.
      </p>
    </div>
  );
}

function Obj({ kind, id, st, note, children }: { kind: 'commit' | 'tree' | 'blob'; id: string; st: 'new' | 'reused'; note: string; children?: ReactNode }) {
  return (
    <div className={`gi-obj ${kind}`}>
      <motion.div key={id} className={`gi-obj-row ${st}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <span className="gi-kind">{kind}</span>
        <code>{id}</code>
        <span className="gi-note">{note}</span>
        {kind !== 'commit' && <span className="gi-st">{st === 'new' ? 'NEW' : 'reused'}</span>}
      </motion.div>
      {children && <div className="gi-children">{children}</div>}
    </div>
  );
}
