import { useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useAsyncValue } from '../../core/useAsyncValue';
import { deserCaption } from './captions';
import {
  ALLOWED_TYPES, PRESETS, REGISTRY, TYPE_NAMES, ranUnexpectedType, readDataOnly, readTypeNaming, type BlobPreset, type TypeDefences,
} from './loader';
import { computeSigning } from './signing';

export function DeserScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState<BlobPreset['id']>('swapped');
  const [allowList, setAllowList] = useState(false);
  const [signed, setSigned] = useState(false);
  const setCaption = useSetCaption();
  const signing = useAsyncValue(() => computeSigning(), 'once');
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const defences: TypeDefences = { allowList, signed };
  const signatureValid = signing?.valid[presetId] ?? false;
  const typed = readTypeNaming(preset.typed, defences, signatureValid);
  const json = readDataOnly(preset.json);
  const unexpected = ranUnexpectedType(typed);

  useIntroCaption(<>The same saved cart, read back two ways. The edited blob names a different class: watch which side lets the input pick the code that runs.</>);

  const update = (id: BlobPreset['id'], d: TypeDefences) => {
    setPresetId(id);
    setAllowList(d.allowList);
    setSigned(d.signed);
    setCaption(deserCaption(id, d, signing?.valid[id] ?? false), { quiet: true });
  };

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Type-naming reader" value={typed.constructed ? `built ${typed.constructed}` : 'built nothing'} color={unexpected ? 'var(--bad)' : typed.constructed ? undefined : 'var(--ok)'} sub={unexpected ? 'the input chose the code' : typed.constructed ? 'the type we expected' : (typed.reason ?? undefined)} />
          <Stat label="Data-only reader" value={json.accepted ? 'accepted' : 'refused'} color={json.accepted ? undefined : 'var(--ok)'} sub="never builds a class" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the blob, and data that passed' },
            { color: 'var(--bad)', label: 'a constructor the input chose' },
            { color: 'var(--ok)', label: 'a check that refused it' },
            { color: 'var(--violet)', label: 'a defence that is on' },
            { color: 'var(--dim)', label: 'not reached' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="p" label="Saved cart">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={presetId === p.id} onClick={() => update(p.id, defences)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Toggle label="Allow-list of types" value={allowList} onChange={(v) => update(presetId, { allowList: v, signed })} />
          <Toggle label="Signed blobs (HMAC)" value={signed} onChange={(v) => update(presetId, { allowList, signed: v })} />
        </>,
      ]}
    >
      <div className="stage-pad dpt">
        <div className="dpt-lanes">
          <Box className="dpt-lane">
            <SectionTitle hint="the fix: JSON, then a schema">Data-only format</SectionTitle>
            <pre className="dpt-blob is-data">{preset.json}</pre>
            <div className="dpt-stage is-ok">① Parsed into plain data: objects, lists, strings, numbers. No type names are looked up.</div>
            <div className={`dpt-stage ${json.accepted ? 'is-ok' : 'is-check'}`}>
              ② Checked against the schema:
              <ConsolePanel lines={json.accepted ? ['matches: only items and coupon, each of the right type'] : json.errors.map((e) => ({ text: e, tone: 'ok' as const }))} title="schema" />
            </div>
            <div className="dpt-stage is-ok">③ {json.accepted ? 'Your code gets plain data.' : 'Refused. Nothing was built.'}</div>
          </Box>

          <Box className="dpt-lane">
            <SectionTitle hint="the risky shape">Type-naming format</SectionTitle>
            <pre className="dpt-blob">
              {preset.typed.split('\n').map((line, i) => (
                <span key={i} className={line.startsWith('type:') ? 'dpt-typeline' : ''}>{line}{'\n'}</span>
              ))}
            </pre>
            <div className={`dpt-stage ${signed ? 'is-defence' : 'is-off'}`}>
              ① Signature {signed ? <b>{signing ? (signatureValid ? 'matches the tag stored at save time' : 'does not match: not something our server wrote') : 'computing…'}</b> : 'not checked'}
            </div>
            <div className={`dpt-stage ${allowList ? 'is-defence' : 'is-off'}`}>
              ② Allow-list {allowList ? <b>{typed.stage === 'allow-list' ? `refused ${typed.named}` : `allows only ${ALLOWED_TYPES.join(', ')}`}</b> : 'off: any class the app has can be named'}
            </div>
            <div className="dpt-stage">
              ③ Constructor box: the loader looks the type up and runs its setup code before our code sees the object
              <div className="dpt-registry" role="list" aria-label="Classes in the app">
                {TYPE_NAMES.map((t) => {
                  const ran = typed.constructed === t;
                  return (
                    <span key={t} role="listitem" className={`dpt-class ${ran ? (ALLOWED_TYPES.includes(t) ? 'is-ran' : 'is-ran-bad') : 'is-idle'}`}>
                      {t}
                      <small>{ran ? REGISTRY[t].effect : 'not built'}</small>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className={`dpt-stage ${typed.accepted ? (unexpected ? 'is-bad' : 'is-ok') : 'is-check'}`}>
              ④ {typed.accepted ? (unexpected ? <>The object reaches our code, <b>after</b> the input-chosen constructor ran.</> : 'The object reaches our code.') : <>Refused at {typed.stage}: {typed.reason}.</>}
            </div>
          </Box>
        </div>
        <p className="dpt-note">
          Formats that can name a type to build include Python&apos;s pickle, Java&apos;s built-in serialization and YAML with type tags (named, not shown). Their loaders are not safe for untrusted input: use a data-only format and validate it, and sign what your own server writes.
        </p>
        <Hint block>Fictional classes whose constructors only describe an effect; nothing is executed. The signature is a real HMAC-SHA-256 over the blob text.</Hint>
      </div>
    </StageFrame>
  );
}
