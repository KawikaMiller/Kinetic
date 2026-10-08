import { ms } from '../../core/format';
import { describeScreen } from './frames';
import { REPAINT_MS, screenAt, type Timeline } from './model';

interface Shot {
  id: string;
  label: string;
  at: number;
}

/** What the page looks like at three moments: a mock page, not a screenshot. */
export function Filmstrip({ tl, now }: { tl: Timeline; now: number }) {
  const shots: Shot[] = [
    { id: 'paint', label: 'First paint', at: tl.firstPaintAt },
    { id: 'dcl', label: 'DOMContentLoaded', at: tl.dclAt },
    { id: 'load', label: 'A frame after load', at: tl.loadAt + REPAINT_MS },
  ];
  return (
    <div className="crp-film" role="group" aria-label="The page at first paint, DOMContentLoaded and load">
      {shots.map((shot) => {
        const shown = now >= shot.at;
        const screen = screenAt(tl, shot.at);
        return (
          <figure key={shot.id} className="crp-shot-fig">
            <div className={`crp-shot ${shown ? '' : 'is-pending'}`} role="img" aria-label={shown ? describeScreen(screen) : 'not reached yet'}>
              {shown && screen.painted && (
                <>
                  <div className={`crp-shot-h1 is-${screen.text}`}>Aa</div>
                  <div className={`crp-shot-lines is-${screen.text}`}>
                    <i />
                    <i />
                  </div>
                  {screen.hero && <div className="crp-shot-hero" />}
                </>
              )}
            </div>
            <figcaption>
              <b>{shot.label}</b> {ms(shot.at)}
              <span>{shown ? describeScreen(screen) : 'not reached yet'}</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
