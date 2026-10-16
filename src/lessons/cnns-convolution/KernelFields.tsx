import { useState } from 'react';
import { TextField } from '../../components/ui';
import { decimal } from '../../core/format';
import { parseEntry } from './kernelEntry';
import { KERNEL_SIZE, type Kernel } from './convolve';

const asText = (v: number) => decimal(v, 3);
const cells = Array.from({ length: KERNEL_SIZE * KERNEL_SIZE }, (_, i) => [Math.floor(i / KERNEL_SIZE), i % KERNEL_SIZE] as const);

/**
 * Nine number fields for the 3 x 3 kernel. A typed entry that is not a number in range is refused
 * with a message and the old value stays in the kernel; leaving the field puts that value back.
 * Remount (change `key`) to load a different kernel into the fields.
 */
export function KernelFields({ initial, onChange }: { initial: Kernel; onChange: (kernel: Kernel) => void }) {
  const [kernel, setKernel] = useState<Kernel>(initial);
  const [texts, setTexts] = useState(() => initial.flat().map(asText));
  const [error, setError] = useState<string | null>(null);

  const type = (index: number, [y, x]: readonly [number, number], text: string) => {
    setTexts((t) => t.map((old, i) => (i === index ? text : old)));
    const parsed = parseEntry(text);
    if (!parsed.ok) {
      setError(`Row ${y + 1}, column ${x + 1}: ${parsed.error} Keeping ${asText(kernel[y][x])}.`);
      return;
    }
    setError(null);
    const next = kernel.map((row, r) => row.map((v, c) => (r === y && c === x ? parsed.value : v)));
    setKernel(next);
    onChange(next);
  };

  return (
    <div className="cn-kernel">
      <div className="cn-kernel-grid" role="group" aria-label="Kernel entries">
        {cells.map(([y, x], i) => (
          <TextField
            key={i}
            ariaLabel={`Kernel row ${y + 1}, column ${x + 1}`}
            value={texts[i]}
            width={64}
            spellCheck={false}
            onChange={(t) => type(i, [y, x], t)}
            onBlur={() => {
              setTexts((all) => all.map((old, k) => (k === i ? asText(kernel[y][x]) : old)));
              setError(null);
            }}
          />
        ))}
      </div>
      {error && <span className="cn-refusal" role="status">{error}</span>}
    </div>
  );
}
