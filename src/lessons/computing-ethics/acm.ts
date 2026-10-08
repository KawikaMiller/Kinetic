/**
 * The principles of the ACM Code of Ethics and Professional Conduct (2018), by number. `title` is the
 * Code's own heading for the principle; `gist` is a one-line paraphrase in this lesson's words, not a quotation.
 * Only sections 1-3 are listed (the general, professional and leadership principles).
 */
export interface Principle {
  id: string;
  /** The short label on a chip. */
  short: string;
  /** The Code's heading for this principle. */
  title: string;
  /** A paraphrase, labelled as one on screen. */
  gist: string;
}

export const ACM_CODE = [
  { id: '1.1', short: 'Contribute to society', title: 'Contribute to society and to human well-being, acknowledging that all people are stakeholders in computing.', gist: 'Computing work should benefit people, and everyone it touches counts as a stakeholder.' },
  { id: '1.2', short: 'Avoid harm', title: 'Avoid harm.', gist: 'Weigh the harms your work could cause, and try to prevent or reduce them.' },
  { id: '1.3', short: 'Be honest', title: 'Be honest and trustworthy.', gist: 'Do not deceive the people who rely on you or your product.' },
  { id: '1.4', short: 'Be fair', title: 'Be fair and take action not to discriminate.', gist: 'Do not exclude or disadvantage people unjustly, and act to prevent it.' },
  { id: '1.5', short: 'Respect creators', title: 'Respect the work required to produce new ideas, inventions, creative works, and computing artifacts.', gist: "Credit and respect other people's work." },
  { id: '1.6', short: 'Respect privacy', title: 'Respect privacy.', gist: 'Collect and use personal information only as needed, and protect it.' },
  { id: '1.7', short: 'Honor confidentiality', title: 'Honor confidentiality.', gist: 'Keep confidences you have taken on.' },
  { id: '2.1', short: 'Aim for quality', title: 'Strive to achieve high quality in both the processes and products of professional work.', gist: 'Care about how work is done as well as what ships.' },
  { id: '2.2', short: 'Keep high standards', title: 'Maintain high standards of professional competence, conduct, and ethical practice.', gist: 'Keep learning and act professionally and ethically.' },
  { id: '2.3', short: 'Know the rules', title: 'Know and respect existing rules pertaining to professional work.', gist: 'Know the laws and rules that apply to your work.' },
  { id: '2.4', short: 'Accept review', title: 'Accept and provide appropriate professional review.', gist: 'Seek and give honest review of work.' },
  { id: '2.5', short: 'Evaluate risks', title: 'Give comprehensive and thorough evaluations of computer systems and their impacts, including analysis of possible risks.', gist: 'Assess systems and their impacts thoroughly, risks included, and say so when it matters.' },
  { id: '2.6', short: 'Stay in competence', title: 'Perform work only in areas of competence.', gist: 'Take on work you are qualified for, and say when you are not.' },
  { id: '2.7', short: 'Foster awareness', title: 'Foster public awareness and understanding of computing, related technologies, and their consequences.', gist: 'Help the public understand what the technology does.' },
  { id: '2.8', short: 'Access only if authorized', title: 'Access computing and communication resources only when authorized or when compelled by the public good.', gist: 'Use systems only with permission, or when the public good compels it.' },
  { id: '2.9', short: 'Secure by design', title: 'Design and implement systems that are robustly and usably secure.', gist: 'Build security in, and make it usable.' },
  { id: '3.1', short: 'Public good first', title: 'Ensure that the public good is the central concern during all professional computing work.', gist: 'Keep the public good at the centre of the work.' },
  { id: '3.2', short: 'Social responsibility', title: 'Articulate, encourage acceptance of, and evaluate fulfillment of social responsibilities by members of the organization or group.', gist: 'Help the group spell out and meet its social responsibilities.' },
  { id: '3.3', short: 'Quality of working life', title: 'Manage personnel and resources to enhance the quality of working life.', gist: 'Manage people and resources so work life is better.' },
  { id: '3.4', short: 'Support the Code', title: 'Articulate, apply, and support policies and processes that reflect the principles of the Code.', gist: 'Build policies and processes that reflect the Code.' },
  { id: '3.5', short: 'Grow professionals', title: 'Create opportunities for members of the organization or group to grow as professionals.', gist: 'Create chances for colleagues to grow.' },
  { id: '3.6', short: 'Care when changing systems', title: 'Use care when modifying or retiring systems.', gist: 'Take care when changing or retiring systems people depend on.' },
  { id: '3.7', short: 'Care for infrastructure', title: 'Recognize and take special care of systems that become integrated into the infrastructure of society.', gist: 'Take special care of systems society has come to rely on.' },
] as const satisfies readonly Principle[];

export type PrincipleId = (typeof ACM_CODE)[number]['id'];

export const principle = (id: PrincipleId): Principle => ACM_CODE.find((p) => p.id === id)!;

export const ACM_ATTRIBUTION = 'ACM Code of Ethics and Professional Conduct (2018), Association for Computing Machinery';
