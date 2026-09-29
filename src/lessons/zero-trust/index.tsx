import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Zero trust drops the idea of a trusted internal network. Every request, from a person or a service, is authenticated and authorised on its own merits, every time.",
    what: "The classic 'castle and moat' model protects the edge with firewalls and VPNs, then trusts anything inside. Zero trust assumes the attacker is already in. Users reach apps through an identity-aware proxy and policy engine that checks identity (SSO + MFA), device health and context on each request. Services prove who they are to each other with mutual TLS and workload identities. Access is least-privilege and continuously re-evaluated, and every decision is logged.",
    analogy: "An office where your badge opens only the rooms your job needs, gets re-checked at every door, and stops working the moment security notices something off, versus one where a single front-door guard waves everyone inside and every door behind it is unlocked.",
    useCases: [
      "Replacing a VPN with an identity-aware proxy (the BeyondCorp model: Cloudflare Access, Zscaler, Google IAP)",
      "Service meshes giving every workload an identity and mTLS (Istio, Linkerd, SPIFFE/SPIRE)",
      "Device-posture checks before granting access to sensitive apps",
      "Limiting the blast radius of phishing, stolen credentials and ransomware",
    ],
    why: "Most serious breaches start with one phished laptop or leaked credential, then move laterally through a network that trusts itself. Staff-level engineers shape the identity, network and service-to-service architecture that decides whether that becomes one bad day or a company-wide incident, and they need to explain the trade-offs to security and leadership.",
    watch: "Toggle between the two network models and replay the same attack. In Castle & moat, the orange bar is the firewall/VPN and the dashed box is the trusted inside. In Zero trust, every user request passes through the yellow access proxy. Blue pills are user requests, violet ones are service-to-service mTLS, and red ones are the attacker. Systems glow red when they're breached, and a green ✕ is a request correctly denied. The log below lists each policy decision.",
  },
  tryThis: [
    "Play Castle & moat and count the hops from one phishing email to the customer database.",
    "Switch to Zero trust and replay: note that Bob still gets phished.",
    "Watch the decision log: which check (identity, device, role, certificate) stopped each step?",
    "Compare the Systems breached stat between the two models.",
  ],
  keyIdeas: [
    "Never trust the network: being \"inside\" grants nothing.",
    "Verify explicitly on every request: identity, device health and context, not just at login.",
    "Least privilege for people and services limits lateral movement.",
    "Assume breach: zero trust shrinks the blast radius; it doesn't prevent the phish.",
  ],
  quiz: [
    {
      q: 'An attacker has phished a laptop that is already on the corporate VPN. In a castle-and-moat network, what stops them reaching internal systems?',
      options: ['The firewall', 'Very little: the network trusts insiders', 'The VPN encrypts their traffic', 'Internal systems check device posture'],
      answer: 1,
      why: 'The perimeter only guards the edge. Once inside, flat trusted networks allow lateral movement.',
    },
    {
      q: 'How do services prove their identity to each other in a zero-trust design?',
      options: ['By IP address allow-lists', 'Mutual TLS with workload certificates', 'Shared passwords in config files', 'By being in the same subnet'],
      answer: 1,
      why: 'mTLS with workload identities (e.g. SPIFFE) authenticates both sides cryptographically, independent of network location.',
    },
    {
      q: 'Which statement about zero trust is true?',
      options: ['It prevents phishing', 'It removes the need for authentication', 'It limits the damage when an account or device is compromised', 'It means blocking all remote work'],
      answer: 2,
      why: 'It assumes breach and contains it: least privilege, continuous verification and logging keep one compromise from spreading.',
    },
  ],
};

export default lesson;
