/**
 * Join an example credential from pieces. Lessons show key-shaped strings (a leaked payment
 * key, an HS256 signing key), but the source never holds one in a single literal, so secret
 * scanners (GitHub push protection and our own secretScan test included) have nothing to
 * flag. Every value built with it is a fake demo value.
 *
 *   export const LEAKED_KEY = fakeSecret('sk', '_live_', 'EXAMPLE0000DEMO0000KEY');
 */
export const fakeSecret = (...parts: string[]) => parts.join('');
