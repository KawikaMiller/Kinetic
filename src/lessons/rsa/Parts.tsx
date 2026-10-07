// Small pieces every RSA lane shows: the toy-key warning and the key readout.
import { Stat, Stats } from '../../components/ui';
import { TOY_WARNING, bitLength, type RsaKey } from './model';
import { group } from './frames';

export function ToyNote() {
  return <p className="rsa-toy" role="note">{TOY_WARNING}</p>;
}

export function KeyStats({ rsaKey }: { rsaKey: RsaKey }) {
  return (
    <Stats>
      <Stat label="Public key (n, e)" value={`(${group(rsaKey.n)}, ${group(rsaKey.e)})`} color="var(--info)" sub={`n is ${bitLength(rsaKey.n)} bits`} />
      <Stat label="Private d" value={<>{group(rsaKey.d)} 🔒</>} color="var(--violet)" sub="owner only" />
    </Stats>
  );
}
