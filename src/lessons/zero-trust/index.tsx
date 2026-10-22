import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Zero trust drops the idea of a trusted internal network. Requests, from a person or a service, are authenticated and authorised on their own merits, each time.",
    what: "The classic 'castle and moat' model protects the edge with firewalls and VPNs, then trusts anything inside. Zero trust assumes the attacker is already in. Users reach apps through an identity-aware proxy and policy engine that checks identity (SSO + MFA), device health and context on each request. Services prove who they are to each other with mutual TLS and workload identities. Access is least-privilege and continuously re-evaluated, and decisions are logged. In the replay, one decision function applies each model's policy to a scripted attacker who follows one stated rule.",
    analogy: "An office where your badge opens just the rooms your job needs, gets re-checked at each door, and stops working the moment security notices something off, versus one where a single front-door guard waves people inside and the doors behind it are unlocked.",
    useCases: [
      "Replacing a VPN with an identity-aware proxy (the BeyondCorp model: Cloudflare Access, Zscaler, Google IAP)",
      "Service meshes giving each workload an identity and mTLS (Istio, Linkerd, SPIFFE/SPIRE)",
      "Device-posture checks before granting access to sensitive apps",
      "Limiting the blast radius of phishing, stolen credentials and ransomware",
    ],
    why: "Many breaches start with a phished laptop or a leaked credential, then move laterally through a network that trusts itself. Staff-level engineers shape the identity, network and service-to-service architecture that decides whether that becomes one bad day or a company-wide incident, and they explain the trade-offs to security and leadership.",
    watch: "Toggle between the two network models and replay the scripted attack. In Castle & moat, the orange bar is the firewall/VPN and the dashed box is the trusted inside. In Zero trust, user requests pass through the yellow access proxy. Blue pills are legitimate user requests, violet ones are service-to-service mTLS, and red ones are the attacker's. Systems glow red when they're breached, and a green ✕ is a request correctly denied. The log below lists each policy decision with the checks that failed (Zero trust only).",
  },
  tryThis: [
    "Play Castle & moat and follow the hops from one phishing email to the customer database: laptop, wiki, payments, database.",
    "Switch to Zero trust and replay: note that Bob still gets phished.",
    "Watch the decision log: which check (identity, device, role, certificate) stopped each step? A denied row lists every check that failed, and the caption names the first.",
    "Compare the Systems breached stat between the two models: 4 of 4 against 0 of 4.",
  ],
  keyIdeas: [
    "In zero trust, being \"inside\" the network grants nothing.",
    "Verify explicitly on each request: identity, device health and context, not just at login.",
    "Least privilege for people and services limits lateral movement.",
    "Assume breach: zero trust shrinks the blast radius; it doesn't prevent the phish.",
  ],
  quiz: [
    {
      q: 'An attacker has phished a laptop that is already on the corporate VPN. In a castle-and-moat network, what stops them reaching internal systems?',
      options: [
        'The firewall, which blocks traffic that comes from inside',
        'Little: the network trusts machines that are already inside',
        'The VPN, because it encrypts the attacker\'s traffic',
        'Each internal system, which checks the laptop\'s device posture',
      ],
      answer: 1,
      why: 'The perimeter guards the edge. Once inside, a flat trusted network allows lateral movement.',
    },
    {
      q: 'How do services prove their identity to each other in a zero-trust design?',
      options: [
        'Mutual TLS with a certificate for each workload',
        'Allow-lists of the IP addresses each service uses',
        'Passwords stored in each service\'s config file',
        'Membership of the same private subnet as the caller',
      ],
      answer: 0,
      why: 'mTLS with workload identities (e.g. SPIFFE) authenticates both sides cryptographically, independent of network location.',
    },
    {
      q: 'Which statement about zero trust is true?',
      options: [
        'It prevents phishing, so a stolen password is never usable',
        'It removes the need to authenticate users inside the office',
        'It limits the damage when an account or device is breached',
        'It blocks remote work, so staff must be in the building',
      ],
      answer: 2,
      why: 'It assumes breach and contains it: least privilege, continuous verification and logging keep one compromise from spreading.',
    },
    {
      q: 'An attacker replays Bob\'s valid MFA session from their own machine. Which check in this lesson\'s policy denies it first?',
      options: [
        'The identity check: the session cookie is expired or invalid',
        'The firewall: the request arrived from outside the network',
        'The certificate check: the laptop has no workload certificate',
        'The device check: the machine is not enrolled or healthy',
      ],
      answer: 3,
      why: 'The stolen session still passes the identity check, because MFA was done. The device check fails next, and for HR the role check would fail as well.',
    },
  ],
};

export default lesson;
