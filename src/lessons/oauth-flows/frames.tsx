import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { ATTACKER, type Opts, type Step } from './model';
import { runFlow } from './run';

export interface OFrame extends Frame, Omit<Step, 'id'> {
  id: Step['id'];
}

/** The server's reason for refusing a code, in words. */
const REASON_TEXT: Record<string, string> = {
  verifier_missing: 'no code_verifier was sent',
  verifier_mismatch: 'the verifier does not hash to the stored challenge',
  redirect_mismatch: 'the redirect_uri differs from the one the code was issued for',
  code_reused: 'the code was already used',
  client_mismatch: 'the code was issued to another client',
  unknown_code: 'the server has no such code',
  challenge_required: 'this server requires PKCE from PhotoPrint, and the code was issued without a challenge',
};
const reasonText = (reason: string | undefined) => (reason ? REASON_TEXT[reason] ?? reason : 'refused');

const hl = (cls: string, text: ReactNode) => <span className={`hl ${cls}`}>{text}</span>;

/** The caption for one step of a run: what the model decided there, in words. */
function caption(step: Step, o: Opts): ReactNode {
  const { data } = step;
  switch (step.id) {
    case 'intro':
      if (o.attack === 'forge') return <>An attacker wants <b>PhotoPrint</b> to link the attacker's Photos account to <i>your</i> PhotoPrint session. It starts with a connection of its own.</>;
      if (o.attack === 'redirect') return <>An attacker writes its own link to the authorization server and gets you to open it.</>;
      return <><b>PhotoPrint</b> wants to print photos you keep at <b>Photos</b>. Handing it your Photos password would be a bad idea. OAuth lets you grant {hl('', 'limited, revocable access')} instead.</>;
    case 'click': return <>You click <b>Connect Photos</b> in PhotoPrint.</>;
    case 'verifier':
      return <>PKCE: the app invents a one-time secret, the {hl('oa-pkce', 'code_verifier')}, and keeps it. It will send only its SHA-256 hash, the {hl('oa-pkce', 'code_challenge')}.</>;
    case 'redirect-out':
      return (
        <>
          The app <b>redirects your browser</b> to the authorization server. Everything rides in the URL: which app, what access ({hl('oa-scope', 'scope')}), the {hl('oa-redirect', 'redirect_uri')} the code
          should come back to{o.state ? <>, a {hl('oa-state', 'state')} value</> : null}{o.pkce ? <>, and the challenge</> : null}.
        </>
      );
    case 'arrive':
      return (
        <>
          Your browser lands on <b>accounts.photos</b>. These redirects are the {hl('info', 'front channel')}: visible, and easy to tamper with. The server checks the{' '}
          <code>redirect_uri</code> against the registered one: {data.redirectMatch === 'exact' ? <>the whole string has to match <b>exactly</b>.</> : <>this server is set to accept <b>any URL under photoprint.app</b>, a loose setting.</>}
        </>
      );
    case 'login': return <>You log in <b>on accounts.photos itself</b>. PhotoPrint doesn't see your password.</>;
    case 'consent': return <>Consent screen: "PhotoPrint wants to <b>view your photos</b>." That is what the scope asked for. You click Allow.</>;
    case 'code-back':
      return <>The auth server redirects to the registered redirect_uri with a short-lived, single-use {hl('oa-code', 'authorization code')}{o.state ? <>, and echoes your <code>state</code></> : null}. Not a token yet.</>;
    case 'callback':
      return o.state
        ? <>PhotoPrint receives the code and checks that <code>state</code> matches what it sent: this callback belongs to the browser session that started the flow.</>
        : <>PhotoPrint receives the code. The State check is off, so it has nothing to compare: it cannot tell whose connection attempt this callback belongs to.</>;
    case 'token':
      return <>Now the {hl('violet', 'back channel')}: a direct server-to-server call swaps the code for tokens{o.pkce ? <>, proving it's the same app with the {hl('oa-pkce', 'code_verifier')}</> : null}.</>;
    case 'verified': return <>The auth server hashes the verifier: SHA-256(verifier) equals the challenge it stored with the code. {hl('ok', '✓ Same app.')}</>;
    case 'tokens':
      return <>Tokens: a short-lived {hl('oa-token', 'access_token')} (scope photos.read) and a {hl('oa-token', 'refresh_token')} to get new ones later{o.oidc ? <>, plus an {hl('oa-token', 'id_token')}</> : null}.</>;
    case 'id-token':
      return <>The {hl('oa-token', 'id_token')} is OIDC: a signed JWT saying <b>who you are</b> (sub, email). That's <i>authentication</i>, and the app has to check its signature, issuer, audience and expiry (and the <code>nonce</code> it sent, if it sent one) before it trusts it. The access token is only <i>authorization</i>.</>;
    case 'api-call': return <>PhotoPrint calls the Photos API with the access token.</>;
    case 'api-ok': return <>The API checks the token and that its scope includes <b>photos.read</b>. {hl('ok', '200.')}</>;
    case 'api-delete': return <>Could PhotoPrint delete a photo?</>;
    case 'api-403': return <>{hl('bad', '403.')} You granted <b>read</b>, not delete. That's the point of scopes.</>;
    case 'summary':
      return <>OAuth 2 is <b>delegated authorization</b> ("this app may read my photos"). OIDC adds <b>authentication</b> ("this is Ada"). You can revoke PhotoPrint's access without changing your password. Pick an attacker to see what <code>state</code>, the <code>code_verifier</code> and the <code>redirect_uri</code> each bind.</>;

    case 'grab':
      return <>But a {hl('bad', 'malicious app')} on the device can read the redirect and <b>grabs the code</b> first (scripted: how this can happen depends on the platform). PhotoPrint never gets it.</>;
    case 'race':
      return <>The attacker races to swap the code for tokens. PhotoPrint is a public client with no client secret, so the attacker needs only the public <code>client_id</code> and <code>redirect_uri</code> plus the code…</>;
    case 'blocked-token':
      return o.attack === 'redirect'
        ? <>{hl('ok', 'Blocked.')} The server refused the code at /token ({reasonText(data.reason)}).</>
        : <>{hl('ok', 'Blocked at /token.')} The server stored a challenge with the code, so it demands the matching <code>code_verifier</code>. The attacker never had it: it never left PhotoPrint ({reasonText(data.reason)}).</>;
    case 'leak-tokens':
      return <>{hl('bad', 'Tokens issued to the attacker.')} Nothing tied the code to the app instance that started the flow.</>;
    case 'leak-call': return <>The attacker calls the Photos API with the token…</>;
    case 'leak-photos':
      return o.attack === 'redirect'
        ? <>{hl('bad', 'Your photos leak.')} PKCE did not help: the attacker picked the challenge and kept the verifier, so the code was bound to the attacker. Only an exact <code>redirect_uri</code> match stops this before a code exists.</>
        : <>{hl('bad', 'Your photos leak.')} Turn PKCE on and replay this.</>;

    case 'att-start': return <>The attacker starts a connection from its own browser, as itself ({ATTACKER}), through PhotoPrint's real <code>client_id</code>. It writes the request, so it leaves the <code>code_challenge</code> out: whatever PhotoPrint does, the code will have no challenge stored with it.</>;
    case 'att-code': return <>It logs in and approves. The server issues a code for the {ATTACKER} account, but the attacker does not follow the redirect. It <b>keeps the code</b>.</>;
    case 'att-lure': return <>Then it gets <i>you</i> to open PhotoPrint's callback link with the attacker's code in it (a link, an image, a redirect).</>;
    case 'forged-callback': return <>Your browser delivers the attacker's code to PhotoPrint. You never started this connection.</>;
    case 'state-reject':
      return <>{hl('ok', 'Rejected at the callback.')} PhotoPrint has no connection attempt of its own in progress, so the <code>state</code> in this callback matches nothing it sent. No /token call is made.</>;
    case 'forged-token':
      return <>With no state check PhotoPrint trusts the callback and swaps the code for tokens{o.pkce ? <>, but it has no <code>code_verifier</code> for this code</> : null}.</>;
    case 'forge-blocked':
      return <>{hl('ok', 'Blocked at /token, because this server insists on PKCE.')} The attacker's code has no challenge stored with it, and the server refuses to redeem such a code for a client that uses PKCE ({reasonText(data.reason)}). Turn "Server requires PKCE" off and the same code is redeemed.</>;
    case 'hijacked':
      return (
        <>
          {hl('bad', 'Account hijacked.')} PhotoPrint now holds tokens for the <b>{data.account}</b> account, tied to <i>your</i> session. What you print or save from here goes to the attacker's library.
          {o.pkce ? <> PhotoPrint uses PKCE, but this server accepts a code issued without a challenge, so the attacker simply left it out: PKCE only helps here when the server insists on it.</> : null}
        </>
      );

    case 'crafted-link':
      return <>The attacker writes its own <code>/authorize</code> link: PhotoPrint's <code>client_id</code>, a <code>redirect_uri</code> on photoprint.app that forwards elsewhere, and a {hl('oa-pkce', 'code_challenge')} the attacker picked itself, so PhotoPrint's own PKCE and state settings are out of the picture here.</>;
    case 'crafted-arrive':
      return <>You open the link. The server checks the <code>redirect_uri</code>: {data.redirectMatch === 'exact' ? <>it has to equal the registered string <b>exactly</b>.</> : <>it only has to sit under photoprint.app (loose matching).</>}</>;
    case 'redirect-error':
      return <>{hl('ok', 'Refused at /authorize.')} That <code>redirect_uri</code> is not the registered one, so the server shows an error and sends no code anywhere. The attack is stopped before a code exists.</>;
    case 'code-to-attacker':
      return <>The server accepted the <code>redirect_uri</code> and sent the code to the forwarding URL, which hands it on to the {hl('bad', 'attacker')}.</>;
    case 'redeem':
      return <>The attacker redeems the code with the verifier for the challenge <i>it</i> chose.</>;
  }
}

/** Every frame of one run, with its caption. */
export function buildFrames(o: Opts): OFrame[] {
  return runFlow(o).map((step) => ({ ...step, say: caption(step, o) }));
}
