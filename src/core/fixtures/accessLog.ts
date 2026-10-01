/**
 * A small web-server access log in Common Log Format: shared sample data for lessons that
 * search or pipe text (regex-basics matches it, command-line greps it). Twelve lines, from
 * four documentation IP ranges (RFC 5737), with a mix of 200s, 404s, 500s and one 201.
 * Lines are joined with "\n", with no trailing newline.
 */
export const ACCESS_LOG = [
  '203.0.113.7 - - [08/Mar/2026:09:15:02 +0000] "GET /api/users HTTP/1.1" 200 512',
  '198.51.100.4 - - [08/Mar/2026:09:15:04 +0000] "POST /api/orders HTTP/1.1" 500 87',
  '203.0.113.7 - - [08/Mar/2026:09:15:09 +0000] "GET /index.html HTTP/1.1" 200 2048',
  '192.0.2.33 - - [08/Mar/2026:09:15:11 +0000] "GET /api/orders/42 HTTP/1.1" 404 64',
  '198.51.100.4 - - [08/Mar/2026:09:15:15 +0000] "POST /api/orders HTTP/1.1" 500 87',
  '203.0.113.7 - - [08/Mar/2026:09:15:21 +0000] "GET /api/users/7 HTTP/1.1" 500 91',
  '192.0.2.33 - - [08/Mar/2026:09:15:24 +0000] "GET /index.html HTTP/1.1" 200 2048',
  '198.51.100.4 - - [08/Mar/2026:09:15:30 +0000] "POST /api/orders HTTP/1.1" 500 87',
  '203.0.113.50 - - [08/Mar/2026:09:15:33 +0000] "GET /api/health HTTP/1.1" 200 15',
  '192.0.2.33 - - [08/Mar/2026:09:15:38 +0000] "POST /api/login HTTP/1.1" 500 120',
  '203.0.113.7 - - [08/Mar/2026:09:15:41 +0000] "GET /favicon.ico HTTP/1.1" 404 0',
  '198.51.100.4 - - [08/Mar/2026:09:15:47 +0000] "POST /api/orders HTTP/1.1" 201 87',
].join('\n');
