import { Toggle } from '../../components/ui';
import type { AppOptions } from './model';

/** The three switches that change what the bundler can do with the fictional app. */
export function OptionToggles({ options, onChange }: { options: AppOptions; onChange: (o: AppOptions) => void }) {
  return (
    <>
      <Toggle label="pages" value={options.splitPages} onChange={(splitPages) => onChange({ ...options, splitPages })} off="import" on="import()" />
      <Toggle label="ui/button" value={options.buttonSideEffects} onChange={(buttonSideEffects) => onChange({ ...options, buttonSideEffects })} off="no side effects" on="side effects" />
      <Toggle label="datelib" value={options.datelibCjs} onChange={(datelibCjs) => onChange({ ...options, datelibCjs })} off="ES module" on="CommonJS" />
    </>
  );
}
