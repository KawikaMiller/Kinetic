import { ClaimLabel } from '../../components/ui';

/** One side of the comparison: who reaches whom, and which credential sits where. */
function Side({ title, from, arrow, to, holder }: { title: string; from: string; arrow: string; to: string; holder: string }) {
  return (
    <div className="go-pp-side">
      <b>{title}</b>
      <div className="go-pp-row">
        <span className="go-pp-box">{from}</span>
        <span className="go-pp-arrow" aria-hidden="true">{arrow}</span>
        <span className="go-pp-box">{to}</span>
      </div>
      <p>{holder}</p>
    </div>
  );
}

/**
 * The two boxes of the pull-versus-push comparison, drawn as boxes with the direction of the connection, with the usual
 * credential placement stated as the usual setup and not as a property of either style.
 */
export function PullPushDiagram() {
  return (
    <div className="go-pp">
      <div className="go-pp-grid">
        <Side
          title="Pull, in the usual setup"
          from="agent inside the cluster"
          arrow="reads →"
          to="git"
          holder="The agent holds read access to git and broad rights inside the cluster; git needs no way in, and the cluster credentials stay inside it."
        />
        <Side
          title="Push, in the usual setup"
          from="CI job outside"
          arrow="applies →"
          to="the cluster"
          holder="CI holds credentials for the cluster, so anyone who can change the pipeline can reach it; the credentials can be short-lived and scoped."
        />
      </div>
      <ClaimLabel kind="practice">where the credentials sit is the common argument for pull, not a property of it: the pull agent is itself a privileged component, and anyone who can merge to the branch it watches can change the cluster</ClaimLabel>
      <ClaimLabel kind="practice">Argo CD and Flux are two examples of the pull style; this lesson does not model either</ClaimLabel>
    </div>
  );
}
