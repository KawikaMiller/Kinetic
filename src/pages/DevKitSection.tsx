import type { ReactNode } from 'react';
import { Box, SectionTitle } from '../components/Panel';

/** One showcase block on the dev-only kit page. */
export function DevKitSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box className="devkit-section">
      <SectionTitle>{title}</SectionTitle>
      <div className="devkit-body">{children}</div>
    </Box>
  );
}
