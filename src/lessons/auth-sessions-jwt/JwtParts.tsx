import { motion } from 'motion/react';
import type { Jwt } from './jwt';

/** A JWT as header.payload.signature, each part in its legend colour. */
export function TokenString({ jwt }: { jwt: Jwt | null }) {
  if (!jwt) return <span className="empty-note">signing…</span>;
  return (
    <motion.code className="aj-token" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="h">{jwt.header}</span>.<span className="p">{jwt.payload}</span>.<span className="s">{jwt.signature}</span>
    </motion.code>
  );
}
