import type { ReactNode } from 'react';
import type { Outcome } from './server';

/** The caption for what the fake API just did. */
export function explain(o: Outcome): ReactNode {
  switch (o.kind) {
    case 'rateLimited':
      return <>You've sent too many requests. The server is <b>rate limiting</b> you; <code>Retry-After</code> says when to come back.</>;
    case 'overloaded':
      return <>The server is overloaded (or in maintenance). <b>503</b> means "temporarily unavailable": try again later.</>;
    case 'crash':
      return <>The server hit a bug while handling this. <b>5xx = the server's fault</b>, not yours. Your request was fine.</>;
    case 'adminUnauthenticated':
      return <><b>401 Unauthorized</b> really means <i>unauthenticated</i>: "who are you?" No credentials were sent.</>;
    case 'adminForbidden':
      return <><b>403 Forbidden</b>: the server knows who you are (a normal user) but you're <i>not allowed</i> here. Logging in again won't help.</>;
    case 'adminOk':
      return <>Admin token accepted: <b>200 OK</b>. Same URL, different answer depending on who's asking.</>;
    case 'listed':
      return <><b>GET</b> the collection: <b>200 OK</b> with every user. GET only reads, so it's <b>safe</b>.</>;
    case 'createBadBody':
      return <><b>400 Bad Request</b>: the body must be JSON with a <code>name</code>. The client sent something the server can't use.</>;
    case 'created':
      return <><b>POST</b> created user #{o.id}: <b>201 Created</b>, with a <code>Location</code> header. POST again and you get <i>another</i> one: it isn't idempotent.</>;
    case 'collectionMethod':
      return <><b>405 Method Not Allowed</b>: you can't {o.method} the whole collection. Try a single user like /users/1.</>;
    case 'itemMethod':
      return <><b>405 Method Not Allowed</b>: you can't {o.method} to a single user. To create one, POST to the collection, /users.</>;
    case 'noRoute':
      return <><b>404 Not Found</b>: there's nothing at <code>{o.path}</code>. 4xx = the <i>client</i> asked for something wrong.</>;
    case 'noUser':
      return <>No user #{o.id}: <b>404 Not Found</b>. The server is fine; the thing you asked for doesn't exist.</>;
    case 'notModified':
      return <>Your cached copy (<code>{o.etag}</code>) is still current: <b>304 Not Modified</b>, no body. Saves re-sending data you already have.</>;
    case 'refreshed':
      return <>Your cached copy (<code>{o.etag}</code>) is out of date, so the server sends user #{o.id} again: <b>200 OK</b> with the new <code>ETag</code> to cache.</>;
    case 'found':
      return <>Found user #{o.id}: <b>200 OK</b>. The <code>ETag</code> is a version tag your client can send back later to skip re-downloading.</>;
    case 'putBadBody':
      return <><b>400 Bad Request</b>: PUT needs the <i>whole</i> resource, e.g. <code>{'{"name":"…"}'}</code>.</>;
    case 'replaced':
      return <><b>PUT</b> replaces user #{o.id} with exactly what you sent. Send it again: same end state. That's <b>idempotent</b>.</>;
    case 'putCreated':
      return <><b>PUT</b> to an id that didn't exist creates it: <b>201 Created</b>. Repeat it and nothing new appears.</>;
    case 'patchMissing':
      return <>Can't PATCH user #{o.id}: it doesn't exist. <b>404</b>.</>;
    case 'patchBadBody':
      return <><b>400 Bad Request</b>: that body isn't valid JSON.</>;
    case 'patched':
      return <><b>PATCH</b> changes only the fields you send. It <i>can</i> be idempotent, but isn't guaranteed to be (think <code>{'{"op":"increment"}'}</code>).</>;
    case 'deleteMissing':
      return <>Already gone: <b>404</b>. The reply differs, but the server ends in the same state, so DELETE still counts as <b>idempotent</b>.</>;
    case 'deleted':
      return <>Deleted user #{o.id}: <b>204 No Content</b>, meaning success with nothing to send back.</>;
  }
}
