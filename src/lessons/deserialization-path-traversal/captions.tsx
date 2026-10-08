import type { ReactNode } from 'react';
import { PRESETS, REGISTRY, ranUnexpectedType, readDataOnly, readTypeNaming, type BlobPreset, type TypeDefences } from './loader';

/** One caption for the whole deserialization scene, from what both readers actually did with the preset. */
export function deserCaption(id: BlobPreset['id'], d: TypeDefences, signatureValid: boolean): ReactNode {
  const p = PRESETS.find((x) => x.id === id)!;
  const typed = readTypeNaming(p.typed, d, signatureValid);
  const json = readDataOnly(p.json);

  let first: ReactNode;
  if (ranUnexpectedType(typed)) {
    first = <>In the type-naming format the input named <b>{typed.named}</b>, so its <span className="hl bad">constructor ran</span> ({REGISTRY[typed.named!].effect}) before any of our code saw the object: the input chose which code ran.</>;
  } else if (typed.constructed) {
    first = <>The type-naming loader built a <b>{typed.constructed}</b>, as intended{typed.keptFields.length ? <>, and copied {typed.keptFields.length} unchecked field onto it ({typed.keptFields.join(', ')})</> : null}.</>;
  } else {
    first = <>The type-naming loader <span className="hl ok">stopped at {typed.stage}</span>: {typed.reason}.</>;
  }
  const second = json.accepted
    ? <>The data-only reader accepted it as plain data that matches the schema.</>
    : <>The data-only reader refused it: <span className="hl ok">{json.errors.join('; ')}</span>. It cannot build anything, whatever the text says.</>;
  return <>{first} {second}</>;
}
