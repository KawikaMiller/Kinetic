/** Queueing formulas shared by the lessons that model a pool of servers. */

/** Erlang C: the chance an arrival must wait in an M/M/c queue with c servers and offered load a = λ/μ (needs a < c). */
export function erlangC(c: number, a: number): number {
  if (!(a < c)) return 1;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < c; k++) {
    term *= a / k;
    sum += term;
  }
  const top = ((term * a) / c) * (c / (c - a));
  return top / (sum + top);
}
