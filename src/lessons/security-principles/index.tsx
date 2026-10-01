import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Security is layers, not a wall: assume any one defence can fail, so put several in a row, give everything only the access it needs, and watch for what gets through.',
    what: 'The CIA triad names what you protect: confidentiality (only the right people read it), integrity (nobody changes it wrongly) and availability (it\'s there when needed). Defense in depth stacks independent controls (network filtering, strong identity, authorisation, safe application code, encryption) so a single failure isn\'t a breach. Least privilege gives every person and service the minimum access that still works, which limits the damage when one is compromised. Detection (logging and alerting) catches what the layers miss.',
    analogy: 'A bank doesn\'t rely on the front door: there are locks, ID checks at the counter, a vault that only some staff can open, cameras, and cash in a time-locked safe. A thief who gets past one still faces the rest.',
    useCases: [
      'Requiring MFA even inside the company network',
      'Giving each microservice its own narrowly scoped credentials',
      'Encrypting laptops and database backups',
      'Deciding what a design review should ask: "what if this layer fails?"',
    ],
    why: 'Most breaches come through one weakness that nothing else caught: a phished password, an over-privileged service, an unencrypted backup. Even as a junior you make these calls daily (what permissions a service gets, whether to log something), and thinking in layers is how you avoid being that one weakness.',
    watch: 'Five rings surround the customer data, network outermost. Switched-on layers are blue, a switched-off one is grey and dashed, and the layer that stops the attack turns green. The red dot is the attack travelling inward; if nothing stops it, the data box fills red. The dashed outer ring is detection. CIA chips below turn red when that property is violated and green when it was protected. In the least privilege panel, blue cells are granted, green dots mark what the job needs, and compromising the service turns every granted cell red.',
  },
  tryThis: [
    'Send "A phished password", then switch Identity off and send it again: least privilege becomes the last line.',
    'Leave only Network on and try each attack: a perimeter alone stops just two of the six.',
    'Try "A stolen laptop": the network and logins don\'t matter at all, only encryption.',
    'In Least privilege, compromise the service, then press "Trim to what\'s needed" and watch the blast radius shrink.',
  ],
  keyIdeas: [
    'Protect confidentiality, integrity and availability (the CIA triad).',
    'Defense in depth: several independent layers, so one failure isn\'t a breach.',
    'Least privilege: the minimum access that still works limits the blast radius.',
    'Detection matters too: you can\'t respond to what you don\'t notice.',
  ],
  quiz: [
    {
      q: 'An attacker phishes an employee\'s password. Which layer is designed to stop them logging in?',
      options: ['The firewall', 'Multi-factor authentication', 'Disk encryption', 'Input validation'],
      answer: 1,
      why: 'The login itself looks like normal traffic, so the firewall lets it through. MFA needs something the attacker doesn\'t have, like the employee\'s phone.',
    },
    {
      q: 'Why give a background service only the permissions its job needs?',
      options: [
        'It makes the service run faster',
        'If its credentials leak, the attacker can only do what the service could',
        'Cloud providers require it',
        'It removes the need for authentication',
      ],
      answer: 1,
      why: 'Least privilege caps the blast radius of a compromise: a stolen key for an "invoice-mailer" shouldn\'t be able to delete payment data.',
    },
    {
      q: 'A flood of traffic takes the site offline, but no data is stolen. Which CIA property was violated?',
      options: ['Confidentiality', 'Integrity', 'Availability', 'None of them'],
      answer: 2,
      why: 'Availability means the system is there when it\'s needed. Denial-of-service attacks target it directly.',
    },
  ],
};

export default lesson;
