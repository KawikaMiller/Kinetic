import type { LessonModule } from '../../core/types';
import { addRule, editDraft, flowById, initialPlanner, initialRules, setRowText } from './init';
import { carve, DEFAULT_VPC, usableAddresses } from './planner';
import { Stage } from './Stage';
import { FLOWS, asIntended, presetConfig, traceFlow, type PresetId } from './vpc';

const run = (preset: PresetId, flowId: string) => traceFlow(presetConfig(preset), flowById(flowId));
const asIntendedCount = (preset: PresetId) => FLOWS.filter((f) => asIntended(f, traceFlow(presetConfig(preset), f))).length;

const web = run('three-tier', 'user-web');
const webChecks = web.hops.filter((h) => h.verdict === 'pass').length;
const dbOut = run('three-tier', 'db-updates');
const dbOutDrop = dbOut.hops.find((h) => h.verdict === 'drop');
const publicDb = run('all-public', 'user-db');
const publicDbOut = run('all-public', 'db-updates');

const opening = initialRules();
const openingGood = FLOWS.filter((f) => asIntended(f, traceFlow(opening.cfg, f))).length;
const fixed = addRule(editDraft(editDraft(opening, { from: '5432' }), { peer: 'app-sg' }));
const fixedGood = FLOWS.filter((f) => asIntended(f, traceFlow(fixed.cfg, f))).length;
const aclRun = run('acl-replies', 'app-db');
const aclDrop = aclRun.hops.find((h) => h.verdict === 'drop');

const plan0 = carve(DEFAULT_VPC, initialPlanner().rows);
const plan1 = carve(DEFAULT_VPC, setRowText(initialPlanner(), 1, '10.0.1.128/25').rows);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A cloud network is a few lists: route tables say where a packet may go, security groups and network ACLs say whether it is let through, and a subnet is public only because its route says so.',
    what: 'A VPC is a private address range cut into subnets. Each subnet has a route table (longest prefix wins, and the VPC range is always local), and the gateways it points at decide what reaches the internet: an internet gateway for instances with a public address, a NAT gateway for outbound-only. On top, a security group at each instance holds allow rules and is stateful, so a reply needs no rule. A network ACL at each subnet is numbered, can deny, and is stateless, so the reply needs its own rule. This lesson uses AWS-style names and behaviour from memory; no account or network is touched.',
    analogy: 'An office building. The route table is the signage on each floor, the security group is the badge reader on each door, and the network ACL is the guard at the floor entrance who checks the list in both directions: coming in and going out.',
    useCases: [
      'Working out why one service cannot reach another when "the security group looks right"',
      'Designing public, private and database subnets so only the load balancer faces the internet',
      'Sizing subnets and CIDR ranges so a later peering or VPN connection does not clash',
      'Reviewing a Terraform or console change by asking which list it edits and what it opens',
    ],
    why: 'Most "it works from here but not from there" cloud tickets are one of four things: a missing route, a missing public address, a rule that is allowed one way, or an ACL that forgot the reply. Knowing the order of the checks tells you which list to open first.',
    watch:
      'Three tinted boxes inside a dashed VPC are the subnets: sky is the one named public, amber private, pink isolated, plain categories and not verdicts. Boxes are the internet, the two gateways and the instances. In the trace, a green box is a check the packet passed, a yellow box is the check happening now, a red box and a red subnet outline are the check that dropped it, and the small blue pill is the packet. Grey links are not used by this flow, green links are the way it walked. In the planner each counted subnet has its own tint and row number, and the grey squares are unused addresses. Chips say what is simulated, shown but not run, or from memory.',
  },
  tryThis: [
    `In "Trace a packet" press play (or restart) on "internet to web:443": ${webChecks} checks pass, the reply included, and the flow is delivered. Switch Flow to "db to the internet": it drops at ${dbOutDrop?.title}, because the isolated table has no 0.0.0.0/0 route.`,
    `Press the design chip "everything public (the mistake)" and pick "internet to db:5432": it is ${publicDb.delivered ? 'delivered' : 'dropped'}, although the design wants it stopped, and "db to the internet" is ${publicDbOut.delivered ? 'delivered' : 'dropped'} too. Only ${asIntendedCount('all-public')} of ${FLOWS.length} flows are as intended.`,
    `In "Edit the rules" the design opens broken: ${openingGood} of ${FLOWS.length} flows are as intended and "app to db:5432" is dropped at the db-sg inbound check. With Security groups, db-sg and inbound already selected, type 5432 in Port from, app-sg in Source and press Add rule: it reads ${fixedGood} of ${FLOWS.length}.`,
    `Press the chip "ACL blocks replies" in "Edit the rules": "app to db:5432" now drops at ${aclDrop?.title}, although tcp 5432 is allowed both ways. Choose Network ACLs, isolated, outbound, press "fill ephemeral ports 1024-65535", type 110 as the rule number and 10.0.2.0/24 as the Destination, and press Add rule: it passes.`,
    `In "Plan the CIDRs" the three rows give ${plan0.usable} usable addresses (${usableAddresses(24)} each). Change row 2 to 10.0.1.128/25: it overlaps row 1 at 10.0.1.128 to 10.0.1.255 and is not counted, so usable falls to ${plan1.usable}. The two VPC ranges below start equal and overlap: press "B = 10.1.0.0/16" and the overlap message goes away.`,
  ],
  keyIdeas: [
    'A security group sits at the instance, holds allow rules and is stateful: the reply to an allowed request needs no rule. A network ACL sits at the subnet, can allow or deny, takes the lowest-numbered match and is stateless, so the reply needs its own rule for the ephemeral ports.',
    'A subnet is public because its route table sends 0.0.0.0/0 to an internet gateway, not because of its name; in this model an instance also needs a public address to use that gateway.',
    'A private subnet can start connections outward through a NAT gateway that lives in a public subnet, and a connection that started outside is not forwarded in.',
    'Longest prefix wins in a route table, so the local route covers the VPC range; sizing is arithmetic with a reserve (a /24 gives 251 usable addresses under the five-address rule), and ranges that are to be connected need to be disjoint.',
  ],
  quiz: [
    {
      q: 'An instance\'s security group allows tcp 5432 in, and its subnet\'s network ACL allows tcp 5432 in and out. Clients still get no replies. What explains it?',
      options: [
        'The ACL is stateless: the reply goes to an ephemeral port and needs its own outbound rule',
        'The security group is stateless: the reply goes to an ephemeral port and needs its own rule too',
        'The ACL takes the highest rule number first, so the outbound allow is overridden by another rule',
        'The security group blocks replies until a rule lists the client\'s ephemeral port as a source',
      ],
      answer: 0,
      why: 'A network ACL does not remember the request, so the reply (to a port in 1024-65535) is checked against the outbound rules on its own. A security group is stateful and lets the reply out without a rule.',
    },
    {
      q: 'The app instance sits in a subnet named "private" whose table sends 0.0.0.0/0 to a NAT gateway. What can it do?',
      options: [
        'Start connections to the internet and receive the replies, but nothing outside can start one to it',
        'Nothing outside the VPC, because a subnet with the word private in its name has no internet path',
        'Receive connections started on the internet as well, because the NAT gateway forwards them inward',
        'Reach the internet after its security group is opened to 0.0.0.0/0 inbound and not before',
      ],
      answer: 0,
      why: 'The route to the NAT gateway gives outbound reach, and the gateway translates replies to connections the instance opened; it forwards no connection that started outside.',
    },
    {
      q: 'A subnet is named "public", but its table has no route to an internet gateway. What does it behave as?',
      options: [
        'A subnet with no internet path: the route table decides, not the name',
        'A public subnet, because the name tells the gateway to attach to it',
        'A public subnet for inbound traffic and a private one for outbound',
        'A public subnet until its network ACL is changed to deny the internet',
      ],
      answer: 0,
      why: 'A subnet is public when its table sends 0.0.0.0/0 to an internet gateway. Names are labels for people, and the drawing in the trace shows what the table does.',
    },
    {
      q: 'A table has 0.0.0.0/0 to the internet gateway and 203.0.113.0/24 to the NAT gateway. A packet goes to 203.0.113.50. Where does it go?',
      options: [
        'To the NAT gateway, because the longer prefix wins the lookup',
        'To the internet gateway, because 0.0.0.0/0 matches the address',
        'To the internet gateway, because the default route is tried first',
        'To both gateways, and the first one to answer carries the flow',
      ],
      answer: 0,
      why: 'Both routes match, and the route with the longest prefix wins whichever way the table is ordered: a /24 is more specific than a /0.',
    },
    {
      q: 'A subnet is a /28. Under this lesson\'s five-address reserve, how many addresses can instances use?',
      options: ['11', '16', '14', '9'],
      answer: 0,
      why: 'A /28 holds 16 addresses and five are reserved, which leaves 11. The 14 comes from the older network-and-broadcast subtraction of two.',
    },
  ],
};

export default lesson;
