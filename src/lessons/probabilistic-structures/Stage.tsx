import { useState } from 'react';
import { Segmented } from '../../components/ui';
import { BloomView } from './BloomView';
import { HllView } from './HllView';
import { DEFAULT_SEED } from './sketches';
import './styles.css';

type View = 'bloom' | 'hll';

export function Stage() {
  const [view, setView] = useState<View>('bloom');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const switcher = (
    <Segmented
      label="Structure"
      value={view}
      onChange={setView}
      options={[
        { value: 'bloom', label: 'Bloom filter' },
        { value: 'hll', label: 'HyperLogLog' },
      ]}
    />
  );
  return view === 'bloom' ? <BloomView switcher={switcher} seed={seed} onSeed={setSeed} /> : <HllView switcher={switcher} seed={seed} onSeed={setSeed} />;
}
