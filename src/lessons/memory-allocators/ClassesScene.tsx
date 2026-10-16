import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import { barsFromHistogram } from '../../core/plot';
import { logHistogram } from '../../core/stats';
import { classesCaption, n } from './captions';
import {
  MAX_REQUEST, MIN_REQUEST, REQUEST_SEED, SPACINGS, SPACING_LABELS, classTable, internalWaste, requestSizes, spacingOpening, worstCaseWaste,
} from './classes';

const OPTIONS = SPACINGS.map((s) => ({ value: s, label: SPACING_LABELS[s] }));
const HISTOGRAM_BINS = 24;

export function ClassesScene({ picker }: { picker: ReactNode }) {
  const [spacing, setSpacing] = useState(spacingOpening);
  const requests = useMemo(() => requestSizes(), []);
  const histogram = useMemo(() => logHistogram(requests, { bins: HISTOGRAM_BINS, min: MIN_REQUEST, max: MAX_REQUEST }), [requests]);
  const all = useMemo(
    () => SPACINGS.map((s) => ({ spacing: s, classes: classTable(s).length, waste: internalWaste(classTable(s), requests), worst: worstCaseWaste(classTable(s)) })),
    [requests],
  );
  const current = all.find((a) => a.spacing === spacing)!;
  const caption = classesCaption(spacing, current.classes, current.waste, current.worst);
  const peak = Math.max(...histogram.counts);
  const maxWaste = Math.max(...all.map((a) => a.waste));

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Size classes" value={n(current.classes)} sub="finer spacing needs more classes to keep" />
          <Stat label="Internal waste" value={pct(current.waste, 1)} color="var(--violet)" sub="(class - request) summed over the requests, as a share of the classes" />
          <Stat label="Worst single request" value={pct(current.worst, 1)} color="var(--violet)" sub="for requests of 128 bytes and up" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'internal waste: inside a class', shape: 'square' },
            { color: 'var(--sky)', label: 'requests, log-uniform', shape: 'square' },
            { color: 'var(--dim)', label: 'other spacings', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Class spacing" value={spacing} onChange={setSpacing} options={OPTIONS} />
        </>,
      ]}
    >
      <div className="ma-stage stage-pad">
        <div className="ma-plots">
          <Box>
            <SectionTitle hint={`${n(requests.length)} seeded requests, ${MIN_REQUEST}-${n(MAX_REQUEST)} bytes`}>The request sizes</SectionTitle>
            <Plot2D
              x={{ domain: [MIN_REQUEST, MAX_REQUEST], log: true, label: 'request (bytes)' }}
              y={{ domain: [0, Math.ceil(peak * 1.1)], label: 'count' }}
              width={356}
              height={190}
              ariaLabel="Histogram of the seeded request sizes on a log axis"
            >
              <Bars bars={barsFromHistogram(histogram)} tone="sky" />
            </Plot2D>
          </Box>
          <Box>
            <SectionTitle hint="the same requests under each spacing">Internal waste by spacing</SectionTitle>
            <Plot2D
              x={{ domain: [0, SPACINGS.length], tickValues: SPACINGS.map((_, i) => i + 0.5), format: (v) => SPACING_LABELS[SPACINGS[Math.floor(v)]] ?? '', label: 'class spacing' }}
              y={{ domain: [0, Math.ceil(maxWaste * 110) / 100], label: 'waste', format: (v) => pct(v) }}
              width={356}
              height={190}
              ariaLabel="Internal waste for each class spacing"
            >
              <Bars bars={all.map((a, i) => ({ x0: i + 0.1, x1: i + 0.9, y: a.waste, tone: a.spacing === spacing ? ('violet' as const) : ('dim' as const) }))} />
            </Plot2D>
          </Box>
        </div>
        <Hint tone="muted" block>
          Requests are rounded up to a size class, so finer classes waste less and need more classes (and more partly filled slabs). Slab and size-class allocators work this way in spirit; the class table here is illustrative, not any real library&apos;s.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">a made-up size-class table; real allocators are far more elaborate</Provenance>
          <Provenance kind="simulated" seed={REQUEST_SEED}>requests are log-uniform draws</Provenance>
          <Provenance kind="from-memory">jemalloc, tcmalloc and glibc malloc are reported to use size classes or bins in spirit; verify against each allocator&apos;s documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
