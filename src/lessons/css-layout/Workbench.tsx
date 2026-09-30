import type { ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { ResizablePane } from '../../components/ResizablePane';

export interface Fact {
  label: string;
  value: ReactNode;
  tone?: string;
}

/** Every tab's layout: the draggable sandbox on top, the generated CSS and the measurements under it. */
export function Workbench({
  width, onWidth, min, max, height, children, css, activeLine, facts,
}: {
  width: number;
  onWidth: (w: number) => void;
  min: number;
  max: number;
  height: number;
  children: ReactNode;
  css: string[];
  activeLine: number | null;
  facts: Fact[];
}) {
  return (
    <div className="stage-pad cl">
      <ResizablePane min={min} max={max} value={width} onChange={onWidth} label="Container width" height={height} className="cl-pane">
        {children}
      </ResizablePane>
      <div className="cl-below">
        <CodePanel title="Generated CSS" lines={css} active={activeLine} gutter="none" className="cl-code" />
        <Box className="cl-facts">
          <SectionTitle hint="from the real elements">Measured</SectionTitle>
          <table className="data-table">
            <tbody>
              {facts.map((f) => (
                <tr key={f.label}>
                  <td>{f.label}</td>
                  <td className={`cl-fact ${f.tone ? `tone-${f.tone}` : ''}`}>{f.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cl-honest">Every number is read from the browser (getBoundingClientRect, getComputedStyle), not worked out by hand.</p>
        </Box>
      </div>
    </div>
  );
}
