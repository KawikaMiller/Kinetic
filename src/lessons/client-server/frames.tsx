// The four scripted scenarios, built on model.ts's frame recorder. Captions live here.
import { backoff, CART, frameRecorder, msg as m, USER_V1, USER_V2, type CsFrame, type Scenario } from './model';

export const RETRY_DELAYS = backoff(2); // [2, 4] seconds

export function script(s: Scenario): CsFrame[] {
  const { frames, push } = frameRecorder();

  if (s === 'request') {
    push({ say: <>Three very different <b>clients</b>, one <b>server</b>. Clients ask, the server answers. Only the server ever touches the <span className="hl violet">database</span>.</> });
    push({ msg: m('browser', 'api1', 'GET /users/42', 'req'), say: <>The web app sends an HTTP request: <span className="hl info">GET /users/42</span>.</> });
    push({ msg: m('api1', 'db', 'SELECT … id=42', 'db'), say: <>The server checks permissions, then queries its database. The client has no idea this happens.</> });
    push({ msg: m('db', 'api1', 'row', 'db'), say: <>The database returns a row…</> });
    push({ msg: m('api1', 'browser', '200 OK + JSON', 'ok'), json: USER_V1, say: <>…and the server turns it into <span className="hl ok">JSON</span>: the shape promised by the API contract.</> }, { browser: { text: 'Hello, Ada', tone: 'ok' } });
    push({ msg: m('mobile', 'api1', 'GET /users/42', 'req'), say: <>The mobile app calls <b>the exact same endpoint</b>.</> });
    push({ msg: m('api1', 'mobile', '200 OK + JSON', 'ok'), json: USER_V1, say: <>Same JSON back. The phone draws it natively; the server neither knows nor cares.</> }, { mobile: { text: 'Ada · ada@ex.com', tone: 'ok' } });
    push({ msg: m('cli', 'api1', 'curl /users/42', 'req'), say: <>Even a script in a terminal can be a client.</> });
    push({ msg: m('api1', 'cli', '200 OK + JSON', 'ok'), json: USER_V1, say: <>That's the point of an API: <b>one contract</b>, any number of clients.</> }, { cli: { text: '{"id":42,"name":"Ada"…', tone: 'ok' } });
    push({ hold: 2, say: <>Clients depend on the <span className="hl">contract</span> (endpoints + JSON shapes), never on how the server works inside. That's what lets each side change independently.</> });
  }

  if (s === 'scale') {
    push({ say: <>Traffic grows, so we run <b>three identical copies</b> of the server behind a <span className="hl">load balancer</span>.</> });
    push({ msg: m('browser', 'lb', 'GET /cart + token', 'req'), say: <>Request 1 carries everything needed, including who you are (a <b>token</b>).</> });
    push({ msg: m('lb', 'api2', 'GET /cart', 'req'), say: <>The load balancer forwards it to <b>api-2</b>.</> });
    push({ msg: m('api2', 'db', 'cart for user 42', 'db'), say: <>api-2 loads the cart from the shared database.</> });
    push({ msg: m('db', 'api2', '3 items', 'db'), say: <>…</> });
    push({ msg: m('api2', 'browser', '200 · 3 items', 'ok'), json: CART, say: <>Answer: 3 items.</> }, { browser: { text: 'Cart: 3 items', tone: 'ok' } });
    push({ msg: m('browser', 'lb', 'GET /cart + token', 'req'), say: <>Request 2, a second later…</> });
    push({ msg: m('lb', 'api3', 'GET /cart', 'req'), say: <>…lands on a <b>different</b> server: api-3. It has never seen this user before.</> });
    push({ msg: m('api3', 'db', 'cart for user 42', 'db'), say: <>Doesn't matter: the state lives in the database, and identity travels in the request.</> });
    push({ msg: m('db', 'api3', '3 items', 'db'), say: <>…</> });
    push({ msg: m('api3', 'browser', '200 · 3 items', 'ok'), json: CART, say: <><span className="hl ok">Same answer.</span></> }, { browser: { text: 'Cart: 3 items', tone: 'ok' } });
    push({ hold: 2, say: <>The servers are <span className="hl">stateless</span>: they remember nothing between requests. So any copy can answer any request, and you scale by adding copies.</> });
  }

  if (s === 'down') {
    const [first, second] = RETRY_DELAYS;
    push({ say: <>Everything's fine… until the server <b>crashes</b>.</> });
    push({ down: true, say: <><span className="hl bad">api-1 is down.</span> Clients can't see that. They only see what happens when they call.</> });
    push({ msg: m('mobile', 'api1', 'GET /users/42', 'req', true), say: <>The mobile app sends a request into the void…</> });
    push({ say: <>…and after a few seconds, a <span className="hl bad">timeout</span>. A good client shows a friendly error, not a blank screen.</> }, { mobile: { text: "Can't connect. Retrying…", tone: 'bad' } });
    push({ msg: { ...m('mobile', 'api1', `retry (after ${first} s)`, 'req', true), call: 'GET /users/42' }, say: <>It <b>retries</b>, waiting longer each time (backoff) so a crowd of clients doesn't hammer a recovering server.</> });
    push({ down: false, say: <>The server comes back up.</> });
    push({ msg: { ...m('mobile', 'api1', `retry (after ${second} s)`, 'req'), call: 'GET /users/42' }, say: <>Next retry, after twice the wait…</> });
    push({ msg: m('api1', 'mobile', '200 OK + JSON', 'ok'), json: USER_V1, say: <><span className="hl ok">Success.</span></> }, { mobile: { text: 'Ada · ada@ex.com', tone: 'ok' } });
    push({ hold: 2, say: <>The network is <b>not</b> reliable. Every client call needs a plan for timeouts, errors and retries.</> });
  }

  if (s === 'breaking') {
    push({ say: <>The team ships API <span className="hl">v2</span> and renames <code>name</code> → <code>fullName</code>. The web app is updated in the same deploy.</> });
    push({ version: 'v2', msg: m('browser', 'api1', 'GET /users/42', 'req'), say: <>The new web app asks for a user…</> });
    push({ version: 'v2', msg: m('api1', 'browser', '200 OK + JSON', 'ok'), json: USER_V2, say: <>…gets <code>fullName</code>, and knows what to do with it. ✓</> }, { browser: { text: 'Hello, Ada', tone: 'ok' } });
    push({ version: 'v2', msg: m('mobile', 'api1', 'GET /users/42', 'req'), say: <>But the mobile app was installed <b>months ago</b>. Many users never update.</> });
    push({ version: 'v2', msg: m('api1', 'mobile', '200 OK + JSON', 'bad'), json: USER_V2, hold: 1.3, say: <>It still reads <code>user.name</code>, which no longer exists: <span className="hl bad">Hello, undefined</span>. You just broke clients you can't redeploy.</> }, { mobile: { text: 'Hello, undefined', tone: 'bad' } });
    push({ version: 'both', say: <>Fix: <b>version the API</b>. The path old apps already call, <span className="hl">/users/42</span>, keeps the old shape; the new shape moves to <span className="hl">/v2</span>. (Or make changes <b>additive</b>: add fullName, keep name.)</> });
    push({ version: 'both', msg: m('browser', 'api1', 'GET /v2/users/42', 'req'), say: <>The web app, which you <b>can</b> redeploy, switches to /v2…</> });
    push({ version: 'both', msg: m('api1', 'browser', '200 OK + JSON', 'ok'), json: USER_V2, say: <>…and still gets <code>fullName</code>. ✓</> }, { browser: { text: 'Hello, Ada', tone: 'ok' } });
    push({ version: 'both', msg: m('mobile', 'api1', 'GET /users/42', 'req'), say: <>The old mobile app sends exactly the request it always has…</> });
    push({ version: 'both', msg: m('api1', 'mobile', '200 OK + JSON', 'ok'), json: USER_V1, say: <>…and gets exactly what it expects. ✓ Nothing on the phone had to change.</> }, { mobile: { text: 'Ada · ada@ex.com', tone: 'ok' } });
    push({ version: 'both', hold: 2, say: <>Once published, an API is a <span className="hl">promise</span>. Adding is safe; renaming or removing breaks every client you don't control.</> });
  }

  return frames;
}
