import { instrText, type Instr, type Model } from '../../core/memModel';
import { ChipButton, Hint } from '../../components/ui';
import { hasGap, nextTag, tagName, type Base, type Edit, type Tag } from './model';

const bare = (ins: Instr): string => instrText(ins.op === 'fence' ? ins : { ...ins, ord: undefined });

/** The program as editable rows: a full-fence toggle in each gap, and (weak model only) an order tag on each access. */
export function ProgramEditor({ base, edit, model, onFence, onTag }: {
  base: Base;
  edit: Edit;
  model: Model;
  onFence: (t: number, i: number, on: boolean) => void;
  onTag: (t: number, i: number, tag: Tag) => void;
}) {
  const tagsOn = model === 'relaxed';
  return (
    <div className="moa-editor">
      <div className="moa-threads">
        {base.litmus.threads.map((prog, t) => (
          <div key={t} className="moa-card">
            <b className="moa-name">T{t}</b>
            <ul className="moa-rows">
              {prog.map((ins, i) => (
                <li key={i}>
                  <div className="moa-row">
                    <span className="mono">{bare(ins)}</span>
                    <ChipButton
                      tone="violet"
                      size="sm"
                      disabled={!tagsOn}
                      title={tagsOn ? undefined : 'this model orders every access anyway'}
                      ariaLabel={`T${t} ${bare(ins)}: order ${tagName(edit.tags[t][i])}${tagsOn ? ', press to change' : ', not used by this model'}`}
                      onClick={() => onTag(t, i, nextTag(ins, edit.tags[t][i]))}
                    >
                      {tagName(edit.tags[t][i])}
                    </ChipButton>
                  </div>
                  {hasGap(base, t, i) && (
                    <div className="moa-gap">
                      <ChipButton tone="violet" size="sm" on={edit.fences[t][i]} ariaLabel={`T${t}: full fence after ${bare(ins)}`} onClick={() => onFence(t, i, !edit.fences[t][i])}>
                        {edit.fences[t][i] ? 'fence here' : '+ fence'}
                      </ChipButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {!tagsOn && <Hint block>The order tags are switched off: {model === 'sc' ? 'SC' : 'x86-style'} orders every access anyway. Pick Weak to use them.</Hint>}
    </div>
  );
}
