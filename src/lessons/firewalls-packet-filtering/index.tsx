import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A packet filter checks each packet against an ordered list of rules, and the first rule that matches decides; if none does, the default policy does. Order matters more than how specific a rule is.',
    what: 'Each rule matches on fields like source address (a CIDR block), destination port, protocol and connection state, and has an action: ACCEPT lets the packet in, DROP throws it away silently, REJECT throws it away and tells the sender. Rules are checked top to bottom and checking stops at the first match. A default-deny policy drops anything no rule allowed. A stateful firewall also keeps a connection table (conntrack), so a reply to a connection the host opened itself is recognised as ESTABLISHED and let back in without opening ports to everyone.',
    analogy: 'A bouncer with a numbered list of instructions who reads from the top and acts on the first line that fits you. If line 2 says "no hoodies" and line 3 says "let the band in", the drummer in a hoodie stays outside.',
    useCases: [
      'Locking SSH down to the office range on a cloud VM (iptables, nftables, ufw)',
      'A default-deny web server: 80 and 443 open, everything else dropped',
      'Debugging "it times out" versus "connection refused" when a port seems blocked',
      'Reviewing a rule set for shadowed rules that can never fire',
    ],
    why: "Firewall rules are some of the first infrastructure you'll edit, and the classic mistakes are all here: a broad rule above a specific one, a stateless rule set that opens every high port to let replies in, and DROP where REJECT would have made debugging obvious. Knowing first-match order and what conntrack does lets you read a rule set and predict it. It builds on `subnetting-cidr`, `ip-ports`, `tcp-udp` and `security-principles`.",
    watch: 'The rule list has one row per rule: number, chain, source CIDR, destination port, protocol, state and action; the action word is always coloured green (ACCEPT), red (DROP) or orange (REJECT), and the selected rule\'s number is purple. While a packet walks the list, the rule being checked has a yellow tint and bar, rules it has passed turn faint grey with a dim bar, and the rule that matched is tinted green, red or orange for its action; rules below it fade (never reached), and switched-off rules are faded too. An orange "shadowed by rule n" chip marks a rule an earlier one hides, and grey italic notes say what each rule is for. The violet dashed line is the default policy, filled in when it decides. The client lane shows the remote host, the firewall (lit while checking) and our server as grey boxes: a blue pill is the packet, green when it is let through to the server, an orange RST pill bounces back for a REJECT, and a red ✕ marks a DROP, with the client\'s view written underneath in the same colour. The connection table lists tracked flows with their state in blue, and the row a packet just created or updated is tinted blue. The orange chip adds the broad return rule in stateless mode.',
  },
  tryThis: [
    'Load The shadowed rule and play: why is the office SSH packet dropped? Select rule 3 and press Move up, then play again.',
    'In SSH from the office only, switch Connection tracking to Stateless and play to the update server\'s reply.',
    'Still stateless, add the broad return rule and watch what happens to the unrelated host aiming at the same port.',
    'In Default-deny web server, compare the database client (REJECT) with the remote-desktop client (default DROP) in the client lane.',
    'Select rule 2 in SSH from the office only and change its source to 192.0.2.0/24, then play.',
  ],
  keyIdeas: [
    'Rules are checked top to bottom and the first match wins, so order beats specificity.',
    'Default-deny: when nothing matches, drop it. Open only what you mean to.',
    'DROP is silent (the client times out); REJECT answers (the client gets "connection refused" at once).',
    'Stateful filtering lets replies in as ESTABLISHED without opening high ports to the whole internet.',
  ],
  quiz: [
    {
      q: 'Rule 2 drops all SSH. Rule 3, below it, accepts SSH from the office. An office SSH packet arrives. What happens?',
      options: [
        'Rule 2 drops it: the first matching rule decides',
        'Rule 3 accepts it: the more specific rule wins',
        'Both apply, and the later ACCEPT overrides it',
        'The default policy decides between the two',
      ],
      answer: 0,
      why: 'iptables-style filters stop at the first match, so rule 3 can never fire for SSH: it is shadowed. "The most specific rule wins" is the tempting answer, and it is how routing tables work, not packet filters. Moving rule 3 above rule 2 fixes it.',
    },
    {
      q: 'A client trying a firewalled port gets "connection refused" straight away. Which action did the matching rule use?',
      options: ['REJECT', 'DROP', 'ACCEPT', 'LOG'],
      answer: 0,
      why: 'REJECT discards the packet but answers with a TCP RST or an ICMP "port unreachable", so the client fails fast. DROP sends nothing back, so the client waits and reports a timeout instead. LOG only records the packet and lets checking carry on.',
    },
    {
      q: "Your server's INPUT policy is DROP. On a stateful firewall, why do replies to its own outbound HTTPS calls get in?",
      options: [
        'Conntrack knows the flow, so the replies match ESTABLISHED',
        'Replies coming from port 443 are allowed in by default',
        'An outbound call opens the same port inbound for everyone',
        'The firewall only ever filters packets that carry a SYN',
      ],
      answer: 0,
      why: 'The outbound packet created a conntrack entry, and the reply is that flow\'s exact reversed 4-tuple, so it matches the ESTABLISHED,RELATED rule. A packet from any other host to the same port is still NEW and dropped, which is why "open for everyone" is wrong.',
    },
    {
      q: 'On a stateless firewall, you let return traffic in with "ACCEPT tcp to ports 1024-65535". What is the catch?',
      options: [
        'Anyone can now reach any service on a high port',
        "Replies to the server's own calls still get dropped",
        'Incoming SSH on port 22 stops working for everyone',
        'Outbound connections can no longer choose a port',
      ],
      answer: 0,
      why: "The rule can't tell a reply from a stranger's packet, so every high port is open to the whole internet, including databases and admin consoles that listen there. The replies do get in, which is why people write it, and port 22 is untouched.",
    },
    {
      q: 'What does a default-deny INPUT policy (DROP) give a web server that only opens 80 and 443?',
      options: [
        'Only the ports opened on purpose can be reached from outside',
        'Every port stays reachable until some rule blocks it by name',
        'Outgoing connections are blocked unless a rule allows them',
        'Other hosts can no longer look up the server\'s IP address',
      ],
      answer: 0,
      why: "With default-deny, anything no rule allowed is dropped, so a forgotten service on 5432 or 3389 isn't exposed. Default-allow is the opposite (open until blocked). An INPUT policy says nothing about outgoing traffic, and DNS lookups of the server's name don't touch its firewall at all.",
    },
  ],
};

export default lesson;
