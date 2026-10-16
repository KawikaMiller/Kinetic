import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Server-side request forgery is a feature that fetches a URL for you being pointed somewhere you did not intend, and broken access control is a server that returns a record without asking whose it is: both are fixed by checking the right thing at the right moment, not by hiding or guessing.',
    what: 'A simulated link-preview server fetches whatever page a user pastes. Six scenarios, described in words, show where a request can end up: a public page, a name that resolves inside the company network, a redirect, an address in an unusual form, a DNS answer that changes between the check and the use, and the metadata service. Nine defences can be turned on, and the pipeline of parse, check, resolve, connect and redirect says where the request finally went. A second scene shows how to make the metadata service worth less, and a third shows an invoices API where stepping an id returns other people\'s records until the server checks ownership.',
    analogy: 'A receptionist who will post any letter you hand over: the danger is not the stamp but the addresses she can reach that you cannot, so you check who she may write to, and what she is allowed to do once there.',
    useCases: [
      'Adding a "paste a link and we preview it" or webhook-test feature',
      'Reviewing a service that fetches images, feeds or documents from user-supplied locations',
      'Deciding what a machine\'s role can do if a request is ever turned against it',
      'Auditing an API where the id in the path picks the record',
    ],
    why: 'These two bugs sit near the top of the usual lists of web risk, and both look fine in a happy-path test: the preview works and the invoice loads. The lesson shows why a deny-list is not enough alone, why a random id is not a check, and which layers do the real work.',
    watch: 'Your own request is blue (--info) and the server\'s own fetch is orange (--orange), a labelled actor and not a failure. A request that reached an internal or metadata service is red (--bad), a blocked request is a green dashed line (--ok), and the server turns violet (--violet) when a layer blocked it. The fake credential is red and says it is fake. In the invoices scene a record that is someone else\'s is red and a refusal or your own record is green. The company network is the violet dashed box.',
  },
  tryThis: [
    `Preview, on the defaults (the public page, no defences): the preview ${F.defaultStatus === 'public' ? 'reaches a public page' : 'ends elsewhere'}. Pick the second card, the hostname that resolves inside: it reaches the internal wiki. Turn on "Block private and link-local ranges": blocked. Pick the redirect card: the wiki again, because the first hop looked public. Turn on "Re-check every redirect hop": blocked.`,
    `Preview, on the defaults: press the preset "Deny-list only": ${F.unsafeDeny} of ${F.scenarios} scenarios still reach inside. Press "Allow-list, pinning, re-check": ${F.unsafeTrio} of ${F.scenarios} do, and the public page card still reaches a public page.`,
    `Metadata hardening, on the defaults: a fake credential comes back and its role could do ${F.broad} things. Turn on "Least-privilege role": ${F.narrow} thing. Turn on "Session token required": the request is refused and it is ${F.tokenRefused}.`,
    `Invoices, on the defaults (no ownership check, invoice ${F.stepTo.id - 2}): press + twice. Invoice ${F.stepTo.id} comes back although it is not Alice's, and ${F.noneReach} of ${F.others} other invoices are reachable. Pick "Owner check": ${F.ownerReach}, and the same id answers 404. Pick "Unguessable ids only": ${F.unguessableReach}, and "An id from a shared link" returns an invoice again.`,
  ],
  keyIdeas: [
    `A deny-list of address ranges alone is beaten by ${F.unsafeDeny} of the ${F.scenarios} scenarios in this model: a redirect, an unusual address form and a changed DNS answer each get past it.`,
    `An allow-list, pinning and a re-check of redirect hops leave ${F.unsafeTrio} of the ${F.scenarios} scenarios reaching an internal or metadata service in this model, and the public page still works.`,
    `Metadata hardening shrinks the prize: a session token makes the request refused, and a least-privilege role makes a leaked credential do ${F.narrow} thing instead of ${F.broad}.`,
    `A random id is not an ownership check: in this model unguessable ids leave ${F.unguessableReach} of ${F.others} other invoices reachable to someone who holds their ids, and an owner check leaves ${F.ownerReach}.`,
  ],
  quiz: [
    {
      q: 'A deny-list checks the hostname, then the DNS answer changes before the server connects. Which control closes that gap?',
      options: [
        'Add more address ranges to the deny-list so a wider set of answers is refused',
        'Resolve once and connect to the address that was checked, so there is no second lookup',
        'Restrict the scheme to web schemes, so the second lookup is ignored by the server',
        'Normalise the address text before the check, so the second answer reads the same',
      ],
      answer: 1,
      why: `The gap is two lookups with two answers; using the checked address removes the second one. In this model the deny-list alone leaves ${F.unsafeDeny} of ${F.scenarios} scenarios reaching inside, and the changed DNS answer is one of them.`,
    },
    {
      q: 'GET /invoices/9f3a… returns someone else\'s invoice because the owner check is missing. Is the random id a defence?',
      options: [
        'Yes, because nobody can guess an id, so nobody else can ever ask for that particular invoice at all',
        'No, because anyone who holds the id gets the invoice, so the server must still compare the owner',
        'Yes, as long as the id is long enough that a request for it takes a long time',
        'No, because a random id can be repeated by a second user and then collides',
      ],
      answer: 1,
      why: `An id that is hard to guess still gets returned to anyone who has it, from a log or a shared link: in this model the unguessable mode leaves ${F.unguessableReach} of ${F.others} invoices reachable, and only the owner check leaves ${F.ownerReach}.`,
    },
    {
      q: 'Why is the metadata service called the prize in a server-side request forgery?',
      options: [
        'It can hand the machine\'s temporary role credentials to a request made from that machine',
        'It stores every customer\'s data in plain text, so one request returns the whole database',
        'It is the one service the preview server is always allowed to contact over the internet',
        'It runs on a public address, so a deny-list of private ranges cannot stop a request to it',
      ],
      answer: 0,
      why: `A credential is only worth what its role can do: in this model an unrestricted role could do ${F.broad} things and a least-privilege one ${F.narrow}, and a session token makes the request refused (${F.tokenRefused}).`,
    },
    {
      q: 'Which scenario does an allow-list of hosts on its own fail to stop in this lesson?',
      options: [
        'The metadata service asked for directly, since it is not a host the list holds',
        'A public page that redirects to an internal one, since only the first host is checked',
        'A hostname that resolves to an internal address, since the name looks ordinary to the list and passes',
        'An internal address in an unusual numeric form, since the list compares only names',
      ],
      answer: 1,
      why: `The first host is allowed and the hop is not re-checked, so the redirect gets inside: this is the one scenario the allow-list alone does not stop (${F.allowOnlyDefeatedBy.join(', ')}); add the re-check and it does.`,
    },
  ],
};

export default lesson;
