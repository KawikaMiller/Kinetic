import { CodePanel } from '../../components/CodePanel';
import { LEAKED_KEY } from './model';

const ENV_REF = 'process.env.STRIPE_KEY';

/** A file's lines, with the leaked key in red (or dimmed once it's dead) and env references in green. */
export function ConfigCode({ title, text, keyDead = false }: { title: string; text: string; keyDead?: boolean }) {
  const lines = text.replace(/\n$/, '').split('\n');
  return (
    <CodePanel
      title={title}
      lines={lines}
      className="sm-code"
      renderLine={(line) => {
        const at = line.indexOf(LEAKED_KEY);
        if (at >= 0) {
          return (
            <>
              {line.slice(0, at)}
              <span className={keyDead ? 'sm-dead' : 'sm-secret'}>{LEAKED_KEY}</span>
              {line.slice(at + LEAKED_KEY.length)}
            </>
          );
        }
        const env = line.indexOf(ENV_REF);
        if (env >= 0) {
          return (
            <>
              {line.slice(0, env)}
              <span className="sm-env">{ENV_REF}</span>
              {line.slice(env + ENV_REF.length)}
            </>
          );
        }
        return line;
      }}
    />
  );
}
