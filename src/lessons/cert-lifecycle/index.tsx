import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A TLS certificate has a start and an end date, and just after the end every handshake fails at once, in every time zone. Renew by automation, watch the certificate the server actually presents, and expect the allowed lifetimes to keep shrinking.',
    what: 'A certificate is valid from notBefore through notAfter, judged in UTC against the clock of whoever is checking it, and every certificate in the chain has to be inside its own dates. Renewed by hand it is an outage on a calendar: the one person who knew leaves, the reminder goes nowhere, and one year later everything breaks together. Renewed by an ACME client it is a routine job that starts when a third of the life is left, retries daily, and typically raises alerts at 30, 14 and 7 days. Automation has its own traps: a stale intermediate, a client clock that is days off, a renewed file the server never loaded, a pinned old certificate. Revocation (OCSP and CRLs) is a separate mechanism and is not covered here.',
    analogy: 'A passport: valid from the issue date to the expiry date, checked at the border against the border\'s clock, and the day it lapses nobody asks why you did not renew it. An automated renewal is an assistant who files the paperwork at two thirds of the way through.',
    useCases: [
      'Automating renewals with an ACME client and a reload hook instead of a calendar reminder',
      'Monitoring days left on the certificate the server really presents, not the file on disk',
      'Debugging "certificate has expired" errors: leaf, intermediate, or the client clock',
      'Planning for shorter public certificate lifetimes, which make manual renewal impractical',
    ],
    why: 'Expired certificates are among the most common avoidable outages, and they arrive on a date known a year in advance. It builds on `digital-signatures-pki` (what a chain is and why it is checked), `tls-handshake` (where the check happens) and `time-and-timezones` (an instant is the same everywhere; only its wall-clock reading differs). The public lifetime limit falls from 398 days to 47 by 2029, so renewals by hand stop being an option.',
    watch: 'Green bars and green handshake cells are valid certificates and successful handshakes. The yellow hatched bar is the renewal window, and yellow markers are reminders and monitoring alerts. Orange marks a failed renewal try, which is a different kind of failure from expiry. Red bars, markers and cells are expiry and failed handshakes. A violet dashed bar is a certificate renewed on disk but not loaded by the server. The vertical line is Today: drag it, and the log below lists everything that has happened up to it.',
  },
  tryThis: [
    'In Manual, leave "Left the team" on and drag Today across notAfter: every handshake turns red at once. Read the Los Angeles and Tokyo clocks at that moment, then switch the person to "Still on the team".',
    'In Automated, the default has a broken DNS challenge fixed on day 93: watch the three alerts and the three-day outage. Drag "Problem fixed on day" down to 75 and the outage disappears.',
    'In Gotchas, try each chip in turn. Under "Wrong client clock" drag the slider to 0 and the second row turns green; under "Renewed, never reloaded" turn the reload hook on.',
    'In Shorter lifetimes drag the issue date from 1 March to 15 March in 2026, 2027 and 2029 (the limits change on the 15th) and watch the renewals per year climb.',
  ],
  keyIdeas: [
    'Validity is notBefore through notAfter in UTC, checked by the client, and the whole chain has to be inside its dates. Time zones change what the clock shows, never when it fails.',
    'A reminder to a person is not a renewal. Automate it, make the job renew early (a third of the life left is a common convention), and alert well before expiry.',
    'Monitor the certificate the server presents. A renewed file that was never loaded looks fine on disk and still fails in production.',
    'Public lifetimes are shrinking on a published schedule, so any manual step in the renewal path will eventually be missed.',
  ],
  quiz: [
    {
      q: 'A certificate\'s notAfter is 00:00 UTC on 15 September. When do clients in Los Angeles (UTC-7 then) start failing?',
      options: [
        'At 5 pm on 14 September, local time',
        'At 00:00 on 15 September, local time',
        'At 7 am on 15 September, local time',
        'At 5 pm on 15 September, local time',
      ],
      answer: 0,
      why: 'Validity is judged on the instant, not on anyone\'s local midnight: 00:00 UTC is 17:00 the day before in Los Angeles, and 09:00 the same day in Tokyo, as the lesson\'s readout shows. Everyone starts failing at the same moment, just after it (the end time itself is still valid).',
    },
    {
      q: 'The renewal job reported success and a fresh certificate is on disk, yet clients still get expiry errors. What is the likely cause?',
      options: [
        'The running server still holds the old certificate in memory',
        'The new certificate was issued with the wrong time zone inside',
        'Clients cache every certificate they have ever seen for a year',
        'The CA only activates a renewal after the old one has expired',
      ],
      answer: 0,
      why: 'A server loads its certificate when it starts or reloads, so new files change nothing until it does. In the lesson the outage begins at the old notAfter even though a valid certificate had been on disk for 30 days, and monitoring that probes the endpoint alerts while a file check stays quiet.',
    },
    {
      q: 'A 90-day certificate is renewed when a third of its life is left, and the renewal job is broken. On which day of the certificate\'s life does the 14-days-left alert fire?',
      options: [
        'Day 76',
        'Day 60',
        'Day 83',
        'Day 14',
      ],
      answer: 0,
      why: 'The alert is computed from the dates: 90 days minus 14 is day 76. The 30-day alert fires on day 60, as the renewal window opens, and the 7-day alert on day 83.',
    },
    {
      q: 'Under the CA/Browser Forum schedule, what is the longest a public TLS certificate issued on 1 June 2027 can be valid?',
      options: [
        '100 days',
        '200 days',
        '398 days',
        '47 days',
      ],
      answer: 0,
      why: 'The limit fell to 200 days for certificates issued from 15 March 2026 and to 100 days from 15 March 2027; it reaches 47 days for certificates issued from 15 March 2029. That is only for publicly trusted CAs.',
    },
    {
      q: 'A phone with a clock three days slow rejects a certificate that was issued this morning, while laptops connect fine. Why?',
      options: [
        'On the phone\'s clock, the certificate\'s notBefore is still in the future',
        'The phone\'s clock reaches the certificate\'s expiry date three days early',
        'Phones refuse every certificate that is less than three days old',
        'The CA issues certificates that only work from three days later on',
      ],
      answer: 0,
      why: 'The client judges the dates on its own clock, so a certificate issued after that clock\'s "now" is not yet valid: in the lesson the slow-clock client fails for the first three days after each renewal. Many CAs backdate notBefore by about an hour, which does not help a clock that is days off.',
    },
  ],
};

export default lesson;
