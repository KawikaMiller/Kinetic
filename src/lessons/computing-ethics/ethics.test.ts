import { describe, expect, it } from 'vitest';
import { findTopic } from '../../core/curriculum';
import { ACM_CODE, principle } from './acm';
import { CASES, THERAC_FACTS, choiceBasis, type CaseNode, type EthicsCase } from './cases';
import { CODE_PRINCIPLES, EFFECTS, LENSES, NOTICED, OPTIONS, STAKEHOLDERS, TENSION } from './lenses';
import { IMPACT_TONE, IMPACT_WORD } from './tones';
import { freshProgress, markEdge, markNode } from './progress';
import { advance, back, edgeKey, isDecision, isEnding, mapOf, nodeOf, pick, startWalk, summarisePath, type Walk } from './walk';

const byId = (id: string) => CASES.find((c) => c.id === id)!;

/** Every complete route through a case, as the list of choices made, found by walking it with the real functions. */
function allRoutes(c: EthicsCase): { walk: Walk; end: string }[] {
  const out: { walk: Walk; end: string }[] = [];
  const visit = (w: Walk) => {
    const node = nodeOf(c, w.at);
    if (isEnding(node)) {
      out.push({ walk: w, end: node.id });
      return;
    }
    for (const ch of node.choices) visit(advance(c, pick(c, w, ch.id)));
  };
  visit(startWalk(c));
  return out;
}

describe('the ACM Code fixture (2018, sections 1-3)', () => {
  it('has the right numbers, once each', () => {
    expect(ACM_CODE.map((p) => p.id)).toEqual([
      '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7',
      '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9',
      '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7',
    ]);
  });

  it('carries the Code headings of the principles the lesson cites', () => {
    expect(principle('1.2').title).toBe('Avoid harm.');
    expect(principle('1.3').title).toBe('Be honest and trustworthy.');
    expect(principle('1.4').title).toBe('Be fair and take action not to discriminate.');
    expect(principle('1.6').title).toBe('Respect privacy.');
    expect(principle('2.3').title).toBe('Know and respect existing rules pertaining to professional work.');
    expect(principle('2.5').title).toBe('Give comprehensive and thorough evaluations of computer systems and their impacts, including analysis of possible risks.');
    expect(principle('2.9').title).toBe('Design and implement systems that are robustly and usably secure.');
    expect(principle('3.1').title).toBe('Ensure that the public good is the central concern during all professional computing work.');
  });

  it('every citation in every case exists in the fixture', () => {
    const ids = new Set(ACM_CODE.map((p) => p.id));
    for (const c of CASES) for (const n of c.nodes) if (isDecision(n)) for (const p of n.principles) expect(ids.has(p), `${c.id}/${n.id} cites ${p}`).toBe(true);
    for (const p of CODE_PRINCIPLES) expect(ids.has(p)).toBe(true);
  });

  it('every decision cites at least one principle', () => {
    for (const c of CASES) for (const n of c.nodes) if (isDecision(n)) expect(n.principles.length).toBeGreaterThan(0);
  });
});

describe('every case is a graph with no dead ends', () => {
  it('has unique node ids, a start, and every target exists', () => {
    for (const c of CASES) {
      const ids = c.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(c.start);
      for (const n of c.nodes) if (isDecision(n)) for (const ch of n.choices) expect(ids, `${c.id}/${n.id}/${ch.id}`).toContain(ch.to);
    }
  });

  it('every decision has 2-3 distinct choices that lead to distinct nodes', () => {
    for (const c of CASES) {
      for (const n of c.nodes) {
        if (!isDecision(n)) continue;
        expect(n.choices.length).toBeGreaterThanOrEqual(2);
        expect(n.choices.length).toBeLessThanOrEqual(3);
        expect(new Set(n.choices.map((x) => x.id)).size).toBe(n.choices.length);
        expect(new Set(n.choices.map((x) => x.to)).size).toBe(n.choices.length);
      }
    }
  });

  it('every node is reachable from the start, and ends lead nowhere', () => {
    for (const c of CASES) {
      const seen = new Set<string>();
      const stack = [c.start];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const n = nodeOf(c, id);
        if (isDecision(n)) stack.push(...n.choices.map((x) => x.to));
      }
      expect([...seen].sort()).toEqual(c.nodes.map((n) => n.id).sort());
    }
  });

  it('walking every route (with the real pick/advance) always reaches an end card, in 1-3 decisions', () => {
    for (const c of CASES) {
      const routes = allRoutes(c);
      expect(routes.length).toBeGreaterThan(0);
      for (const r of routes) {
        expect(isEnding(nodeOf(c, r.end))).toBe(true);
        expect(r.walk.path.length).toBeGreaterThanOrEqual(1);
        expect(r.walk.path.length).toBeLessThanOrEqual(3);
      }
      expect(Math.max(...routes.map((r) => r.walk.path.length))).toBeGreaterThanOrEqual(2);
      expect(new Set(routes.map((r) => r.end))).toEqual(new Set(c.nodes.filter(isEnding).map((n) => n.id)));
    }
  });

  it('has the number of routes worked out by hand', () => {
    // therac: A->(A->3 ends | B) , B, C = 3+1+1+1; the others: 2 + 2 + 1
    expect(allRoutes(byId('therac'))).toHaveLength(6);
    expect(allRoutes(byId('dark-pattern'))).toHaveLength(5);
    expect(allRoutes(byId('location'))).toHaveLength(5);
    expect(allRoutes(byId('friday'))).toHaveLength(5);
  });

  it('there is no cycle: no route revisits a node', () => {
    for (const c of CASES) for (const r of allRoutes(c)) expect(new Set(r.walk.path.map((s) => s.decision)).size).toBe(r.walk.path.length);
  });
});

describe('the Therac-25 case matches its source', () => {
  const therac = byId('therac');
  it('records six known accidents between June 1985 and January 1987, from Leveson & Turner (1993)', () => {
    expect(THERAC_FACTS.knownAccidents).toBe(6);
    expect(THERAC_FACTS.firstAccident).toEqual({ month: 'June', year: 1985 });
    expect(THERAC_FACTS.lastAccident).toEqual({ month: 'January', year: 1987 });
    expect(THERAC_FACTS.source).toMatch(/Leveson & Turner/);
    expect(THERAC_FACTS.source).toMatch(/IEEE Computer/);
    expect(THERAC_FACTS.source).toMatch(/1993/);
  });

  it('says so on screen, in the intro and on the history end card', () => {
    expect(therac.honesty).toContain('six known accidents');
    expect(therac.honesty).toContain('June 1985');
    expect(therac.honesty).toContain('January 1987');
    expect(therac.honesty).toContain('Leveson & Turner');
    const history = therac.nodes.find((n) => n.id === 'end-history') as Extract<CaseNode, { kind: 'end' }>;
    expect(history.text).toContain('six known accidents');
    expect(history.text).toContain('June 1985');
    expect(history.text).toContain('January 1987');
  });

  it('exactly one choice per decision is what happened, and following them reaches the history card', () => {
    for (const n of therac.nodes) if (isDecision(n)) expect(n.choices.filter((x) => x.history)).toHaveLength(1);
    let w = startWalk(therac);
    while (isDecision(nodeOf(therac, w.at))) {
      const d = nodeOf(therac, w.at);
      if (!isDecision(d)) break;
      w = advance(therac, pick(therac, w, d.choices.find((x) => x.history)!.id));
    }
    expect(w.at).toBe('end-history');
  });

  it('only that card is history; the rest are labelled what-ifs', () => {
    const bases = Object.fromEntries(therac.nodes.filter(isEnding).map((n) => [n.id, n.basis]));
    expect(bases['end-history']).toBe('history');
    expect(Object.entries(bases).filter(([, b]) => b === 'history')).toHaveLength(1);
    expect(Object.entries(bases).filter(([id]) => id !== 'end-history').every(([, b]) => b === 'what-if')).toBe(true);
  });

  it('labels only the choice as history, and says the consequences on its cards are authored', () => {
    const decisions = therac.nodes.filter(isDecision);
    for (const d of decisions) {
      for (const ch of d.choices) {
        const label = choiceBasis(therac, ch);
        expect(label).not.toBe('This is what actually happened');
        if (ch.history) {
          expect(label).toMatch(/matches what happened/);
          expect(label).toMatch(/written for this lesson/);
        } else {
          expect(label).toMatch(/what-if/);
        }
      }
    }
    expect(therac.honesty).toMatch(/consequences .*written for this lesson/);
  });

  it('does not narrate motives or schedule pressure as history', () => {
    const decisions = therac.nodes.filter(isDecision);
    const text = JSON.stringify(decisions);
    expect(text).not.toMatch(/schedule|In testing|support calls/i);
  });

  it('names no individuals and no company', () => {
    const text = JSON.stringify(therac);
    expect(text).not.toMatch(/AECL|Atomic Energy|Miller|Leveson said|Dr\./);
  });
});

describe('the fictional cases are labelled as fiction', () => {
  it('cases 2-4 say fictional and illustrative on screen; every ending is illustrative; no choice claims to be history', () => {
    for (const id of ['dark-pattern', 'location', 'friday']) {
      const c = byId(id);
      expect(c.fictional).toBe(true);
      expect(c.honesty.toLowerCase()).toContain('fictional');
      expect(c.honesty.toLowerCase()).toContain('illustrative');
      expect(c.honesty.toLowerCase()).toContain('not predictions');
      for (const n of c.nodes) {
        if (isEnding(n)) expect(n.basis).toBe('illustrative');
        else expect(n.choices.some((x) => x.history)).toBe(false);
      }
    }
    expect(byId('therac').fictional).toBe(false);
  });

  it('every choice shows consequences for users, the team and you, each with a tone', () => {
    for (const c of CASES) {
      for (const n of c.nodes) {
        if (!isDecision(n)) continue;
        for (const ch of n.choices) {
          for (const impact of [ch.users, ch.team, ch.you]) {
            expect(['harm', 'handled', 'benefit', 'open']).toContain(impact.tone);
            expect(impact.text.length).toBeGreaterThan(10);
          }
        }
      }
    }
  });

  it('no case ranks the choices: nothing is marked correct, and no text mentions a score or grade', () => {
    const text = JSON.stringify(CASES).toLowerCase();
    expect(text).not.toMatch(/correct answer|best answer|\bscore\b|\bgrade\b|you failed|you passed/);
  });

  it('every `id` mentioned in case text is a registered lesson', () => {
    const text = JSON.stringify(CASES);
    const ids = [...text.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(findTopic(id), id).toBeDefined();
  });
});

describe('walking, the map and progress', () => {
  const c = byId('dark-pattern');

  it('a pick does not move on; advancing records the path; back undoes the pick, then the step', () => {
    let w = startWalk(c);
    w = pick(c, w, 'A');
    expect(w).toMatchObject({ at: 'request', picked: 'A', path: [] });
    w = pick(c, w, 'B');
    expect(w.picked).toBe('B');
    w = advance(c, w);
    expect(w).toMatchObject({ at: 'reply', picked: null, path: [{ decision: 'request', choice: 'B' }] });
    w = pick(c, w, 'A');
    expect(back(w).picked).toBeNull();
    expect(back(back(w))).toMatchObject({ at: 'request', path: [] });
    expect(back(startWalk(c))).toEqual(startWalk(c));
  });

  it('advance without a pick, or a pick that is not offered, changes nothing', () => {
    const w = startWalk(c);
    expect(advance(c, w)).toEqual(w);
    expect(pick(c, w, 'C').picked).toBe('C');
    const reply = advance(c, pick(c, w, 'B'));
    expect(pick(c, reply, 'C')).toEqual(reply);
  });

  it('the end card summarises the path against its principles', () => {
    const w = advance(c, pick(c, advance(c, pick(c, startWalk(c), 'A')), 'B'));
    expect(nodeOf(c, w.at).id).toBe('end-fixed');
    expect(summarisePath(c, w)).toEqual([
      { decision: 'request', title: 'The request', choice: 'Build it as specified', principles: ['1.3', '1.2'], history: false },
      { decision: 'launched', title: 'After launch', choice: 'Say what you built, propose the clear flow now, and bring the complaints to the team', principles: ['1.3', '2.3'], history: false },
    ]);
  });

  it('the map has a node per node and an edge per choice, with unique edge keys', () => {
    for (const cs of CASES) {
      const m = mapOf(cs);
      expect(m.nodes).toHaveLength(cs.nodes.length);
      const choices = cs.nodes.filter(isDecision).reduce((n, d) => n + d.choices.length, 0);
      expect(m.edges).toHaveLength(choices);
      expect(new Set(m.edges.map((e) => edgeKey(e.from, e.choice))).size).toBe(choices);
    }
  });

  it('progress remembers what was seen, once, across restarts', () => {
    let p = freshProgress(c);
    expect(p.seenNodes).toEqual(['request']);
    p = markEdge(markEdge(markNode(p, 'reply'), edgeKey('request', 'B')), edgeKey('request', 'B'));
    p = markNode(p, 'reply');
    expect(p.seenNodes).toEqual(['request', 'reply']);
    expect(p.seenEdges).toEqual(['request:B']);
    expect({ ...p, walk: startWalk(c) }.seenNodes).toHaveLength(2);
  });
});

describe('the tone of an effect says what the card is', () => {
  const impacts = CASES.flatMap((c) =>
    c.nodes.filter(isDecision).flatMap((d) => d.choices.flatMap((ch) => [ch.users, ch.team, ch.you].map((i) => ({ where: `${c.id}/${d.id}/${ch.id}`, ...i })))),
  );

  it('gives each tone its own words and colour, and never calls a benefit or inaction a handled risk', () => {
    expect(new Set(Object.values(IMPACT_WORD)).size).toBe(4);
    expect(new Set(Object.values(IMPACT_TONE)).size).toBe(4);
    // Doing nothing, holding a date or saving effort is a cost saved, not a risk handled.
    const inaction = /^No (immediate|extra)|carries on|date holds|stays on time|improves|flexibility|most users end up/i;
    for (const i of impacts.filter((x) => x.tone === 'handled')) expect(i.text, i.where).not.toMatch(inaction);
  });

  it('keeps the known benefit and inaction cards on the benefit tone', () => {
    const benefit = impacts.filter((i) => i.tone === 'benefit').map((i) => i.where);
    expect(benefit).toEqual(expect.arrayContaining([
      'dark-pattern/request/A', 'location/collect/A', 'location/review/B', 'location/optin/B', 'friday/blocker/A', 'friday/week-later/B', 'friday/workaround/B',
    ]));
  });

  it('shows a harm or an open trade-off beside every benefit of a choice that leaves a known risk', () => {
    for (const where of ['location/review/B', 'friday/week-later/B', 'friday/workaround/B']) {
      const [c, d, ch] = where.split('/');
      const choice = byId(c).nodes.filter(isDecision).find((n) => n.id === d)!.choices.find((x) => x.id === ch)!;
      expect([choice.users.tone, choice.you.tone]).toContain('harm');
    }
  });
});

describe('the reasoning exercise', () => {
  it('covers every option and stakeholder, and every option through every lens', () => {
    for (const o of OPTIONS) {
      expect(TENSION[o.id].length).toBeGreaterThan(20);
      for (const l of LENSES) expect(NOTICED[o.id][l.id].length).toBeGreaterThan(20);
      for (const s of STAKEHOLDERS) expect(EFFECTS[o.id][s.id].text.length).toBeGreaterThan(10);
    }
    expect(LENSES.map((l) => l.id)).toEqual(['consequences', 'duties', 'virtue', 'code']);
    for (const l of LENSES) expect(l.questions).toHaveLength(3);
  });

  it('is not a verdict machine: no option is uniformly good or uniformly bad for everyone', () => {
    for (const o of OPTIONS) {
      const tones = new Set(STAKEHOLDERS.map((s) => EFFECTS[o.id][s.id].tone));
      expect(tones.size).toBeGreaterThan(1);
    }
  });

  it('is balanced: the option that collects least has a cost, and the one that collects most has a benefit', () => {
    const toneList = (o: string) => STAKEHOLDERS.map((s) => EFFECTS[o as 'all'][s.id].tone);
    expect(toneList('all')).toContain('benefit');
    expect(toneList('minimise')).toContain('open');
    expect(EFFECTS.minimise.company.tone).toBe('open');
  });

  it('does not hand over a verdict: no lens text calls the lenses unanimous or says what people agreed to', () => {
    const text = JSON.stringify({ NOTICED, TENSION });
    expect(text).not.toMatch(/All four lenses lean|all lenses agree/i);
    expect(NOTICED.all.duties).toMatch(/may be hard|would agree to if asked/);
    expect(NOTICED.all.consequences).toMatch(/speculative/);
    expect(TENSION.minimise).toMatch(/may lean/);
  });
});
