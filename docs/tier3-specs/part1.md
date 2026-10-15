# Tier 3 build specs, part 1: batches T3-B1 to T3-B5 (waves 1 and 2)

Written 2026-10-15 against `main` at `3200660`. Source of truth for scope, order and rules: `docs/tier3-plan.md` (§2 final list, §3 AC-0/T3, §4 kit, §6 batches). Format copied from `docs/rollout-plan.md` §3.1.8. 25 lessons: B1 (5), B2 (5), B3 (5), B4 (5), B5 (5).

## Conventions used by every spec below

- **Rules by number.** "AC-0/T3 #n" is a rule from tier3-plan §3. A spec line that says *(rule 20)* is where that rule bites hardest.
- **Standard seed field.** Wherever a lesson shows a seed it is a `TextField` read with `parseBoundedInt(text, { min: 0, max: SEED_MAX })` (`SEED_MAX = 2³¹ − 1`, a named constant). Anything else is refused with a message and the old seed is kept. The seed is shown beside every seeded run, with a "new seed" button.
- **"Broken seed" procedure (rule 20).** For every lesson that simulates nodes, messages, clocks or transactions, the lesson has a **broken mode** and a **fixed mode**. The builder searches seeds from 1 upward with the K3-8 `forSeeds` helper and writes the **lowest seed that violates the named invariant in broken mode** into the test as `BROKEN_SEED`, and the lesson's default seed *in broken mode* is that seed, so the first thing the learner sees is a real violation with its trace. Where a deterministic hand-built schedule also violates the invariant (all the distributed specs here give one), that schedule is a second, seed-free test, so a regression in the seed search cannot hide the bug. The fixed mode passes ≥ 200 seeds (500 in B4) at every step. Liveness is stated separately and never implied.
- **Provenance chips (K3-7).** `<Provenance kind=…>` appears wherever a number or behaviour is `simulated` (with seed), `illustrative`, `toy`, `scripted`, `from-memory`, `not-run` or `real`. A real-world standard, default or figure that the author is reciting from memory carries a **verify against <source>** note in the spec, and the on-screen chip says `from memory`.
- **Kit availability.** Wave 1 starts after P0-a (K3-1 to K3-7); wave 2 after P0-b (K3-8 to K3-14) and the K3-15 round. Wave-1 lessons therefore use no K3-8 or later piece. Names in **Kit** are existing pieces from `docs/shared-api.md` unless prefixed `K3-n`. **Kit missing** lines are Phase 2 requests (AC-0/T3 #25); the report at the end of this file collects them.
- **Linking.** A lesson links only to lessons that exist, or are earlier in the same batch, or are in an earlier wave (rule 13). Where a later lesson is named it is named in words, not linked.
- **Colour vocabulary.** CLAUDE.md's table applies. Plain categories (variants A and B, hosts, lanes) take `orange`/`amber`/`pink`/`sky`, never `--ok`/`--bad`.

---

##### Batch T3-B1 · Statistics & queues (`math`, `arch`)
Wave 1, **every lesson [domain review]** (two reviewers in wave 1, plan §3). Pilots **K3-1** (distribution samplers, `Area`, `Steps`, `Band`, per-bar tone, `logHistogram`, `ecdf`), **K3-2** (`createTickSim`) and **K3-3** (`Stat` multi-line sub). K3-7 `Provenance` is available. Build in the listed order: `distributions` feeds `percentiles-statistics`, which feeds `queueing-theory`. Every curve, interval and p-value on screen is computed by real code on seeded data (AC-0/T3 #22), and every closed form is checked against a seeded Monte Carlo with a stated tolerance. All randomness is `mulberry32`; tests use fixed seeds and tolerances of at least 3 standard errors, stated in the test.

**`distributions` · Distributions: Normal, Poisson & Long Tails**
Track `math` · *"Your latency is not a bell curve"* · Builds on: `observability` · **[domain review]**
**Starts where Tier 2 stops.** `expected-value`: "Named distributions, percentiles and confidence intervals stay in T3 `distributions` and `percentiles-statistics`; the CLT is named only." This lesson owns the named distributions and shows the CLT working (and failing). `percentiles-statistics` owns how a percentile is computed.
**Spec.**
- **Scene 1 · Pick a shape.** `Segmented`: normal, exponential, log-normal, Pareto (type I). Sliders per shape: normal μ and σ; exponential mean; log-normal μ and σ of the underlying normal; Pareto minimum `xm` and shape α (0.8 to 4). 10,000 seeded draws (K3-1 samplers on `mulberry32`) fill a histogram (`Bars`), with the exact density drawn over it as a `Curve` (scaled to counts).
- Marker lines (`VLine`) for **mean**, **median**, **p99** and **p99.9**, read off the sample. A table beside the plot gives the same four values from the **exact quantile function** (normal: μ + zσ with z₀.₉₉ ≈ 2.326 and z₀.₉₉₉ ≈ 3.090; exponential: −ln(1−p)·mean, so the median is 0.693 of the mean and p99 is 4.605 of it; log-normal: exp(μ + zσ), mean exp(μ + σ²/2), median exp(μ); Pareto: xm·(1−p)^(−1/α), mean α·xm/(α−1) for α > 1). Sample and exact values sit side by side so the learner sees both.
- A **linear / log-spaced bins** toggle (`logHistogram`). Log bins are disabled for the normal (it has non-positive values) with the reason on the button. Bars beyond p99 take the per-bar tone `bad`.
- Presets (`ChipButton`): "Request latency (log-normal)", "Gaps between arrivals (exponential)", "File sizes (Pareto, illustrative)", "Heights (normal)". Each says plainly that the family is a model of that quantity, not a law.
- **Scene 2 · Counts and gaps (Poisson).** λ slider (0.5 to 20 events per window) and a window-length slider. Bars show the exact `poissonPmf(k; λ)` beside seeded counts per window, where the counts are made by **counting arrivals whose gaps are exponential**, so the learner sees that exponential gaps and Poisson counts are the same process. A "bursty arrivals" toggle makes arrivals come in clumps (each arrival event brings a geometric batch with the same overall rate); the **dispersion index** (variance ÷ mean of the counts) reads ≈ 1 for Poisson and well above 1 for clumps, computed, with the sentence "Poisson has variance equal to its mean: check yours".
- **Scene 3 · What the mean hides.** Choose a shape and a sample size n ∈ {1, 10, 100, 1,000}. 2,000 seeded replicate means fill a histogram (the CLT, shown); for finite-variance shapes its spread shrinks like σ/√n and the stat row shows the ratio "spread ÷ (σ/√n)" ≈ 1. For Pareto with α ≤ 2 the variance is infinite and the ratio is *not* ≈ 1 (the stat says "σ is infinite here: the formula does not apply"); with α ≤ 1 the mean itself is infinite and the stat reads "no finite mean" (computed from α, never from the sample).
- **Scene 4 · Which one is mine?** Three seeded mystery datasets (A, B, C) are drawn from different families. The learner sees a linear histogram, a log-binned histogram and a **tail plot** (the complementary CDF on log-log axes, `Steps` on log axes). The learner guesses the family (`Segmented`), then "Reveal" shows the truth and why: log-normal looks symmetric on log bins, exponential is a straight line on a log-y CCDF, Pareto is a straight line on log-log with slope −α.
**Out of scope.** How a percentile is computed from a stream, sampling error and confidence intervals (`percentiles-statistics`); queues (`queueing-theory`); hypothesis tests (`hypothesis-testing-ab`); proving the CLT; goodness-of-fit tests (the mystery game is by eye plus a computed hint, not a test).
**Kit.** K3-1 (`normal/exponential/lognormal/pareto/poisson`, `normalPdf/Cdf`, `poissonPmf`, `quantile`, `Bars` with `tone`, `logHistogram`, `Steps`), `Plot2D` (`Curve`, `VLine`, log axes), `core/stats` (`histogram`, `runningStats`, `variance`), `core/sim` (`percentile`), `core/random` (`mulberry32`), `Segmented`, `Slider`, `ChipButton`, `Toggle`, `useScenePicker`, `Stat` (K3-3 multi-line `sub`: sample vs exact on two lines at 390), `Provenance` (K3-7).
**AC.**
- **Watch:**
  - histogram bars are `muted` grey (a plain count), the tail beyond p99 `--bad` (the costly side);
  - the exact density curve is `--violet` (a reference), the median `--info`, the mean `--hi`, p99 `--orange`, p99.9 `--bad`;
  - Poisson exact bars are outlined `--violet`, simulated bars `--info`;
  - in the mystery game the learner's guess is `--hi` until revealed, then `--ok` or `--bad`.
- **Misconception:** "most values sit near the average". For a log-normal the share of draws below the mean is Φ(σ/2), so at σ = 1 it is 69.1%, and for Pareto the mean can sit far above the median. Quiz question: "A log-normal latency has mean 120 ms and median 80 ms. Roughly what share of requests are faster than the mean?" (more than half; the distractors are 50%, "about 10%" and "exactly 120 ms").
- **Correctness:**
  - each sampler is checked against its own cdf with a Kolmogorov-Smirnov statistic below 1.63/√n (the 1% critical value) at n = 100,000 on three fixed seeds, and sample mean and variance sit within 3 standard errors of the formulas (exponential mean 1/λ and variance 1/λ²; log-normal mean exp(μ + σ²/2); Pareto mean for α > 2);
  - `P(X < mean) = Φ(σ/2)` for the log-normal within 0.01 at n = 200,000;
  - the displayed exact quantile equals the numeric inverse of the cdf (bisection) to 1e-9;
  - Poisson: pmf sums to 1 within 1e-12, mean = variance = λ, and counts made from exponential gaps match the pmf with total variation distance below 0.02 at 20,000 windows;
  - the Pareto tail slope fitted by `core/fit` on the CCDF above its 90th percentile is −α within 0.1 for α ∈ {1.5, 2, 3} at n = 100,000;
  - the dispersion index of the bursty process is > 1.5 and of the plain process within 0.1 of 1;
  - every caption that says "close to", "far above" or "most" is computed from the same numbers as the stat next to it and pinned at the slider extremes (rule 14).
- **Hostile input:** seed field as in the conventions. α below 0.8 or above 4, σ ≤ 0, and a mean ≤ 0 cannot be set (sliders clamp, and the readout says what the bound is). Pareto α ≤ 1 and ≤ 2 show "no finite mean" and "infinite variance" from the parameter, and the running sample mean is shown with a note that it never settles. n above 100,000 is not offered.
- **Honesty:** `Provenance simulated` with the seed on every plot. "Latency is often right-skewed and log-normal is a convenient model, not a law of nature." Parameters are labelled illustrative; no real service's latency is quoted.
**Phone.** `Plot2D` at width 356 with `ticks` thinned; the exact-vs-sample table wraps as two lines per row; scenes stack. No `minWidth`.

**`percentiles-statistics` · Percentiles, Sampling & Confidence Intervals**
Track `math` · *"Never average your p99s"* · Builds on: `distributions`, `observability` · **[domain review]**
**Starts where Tier 2 stops.** `expected-value`: "Named distributions, percentiles and confidence intervals stay in T3 `distributions` and `percentiles-statistics`." This lesson picks up percentiles and intervals. Out of scope: coordinated omission (`benchmarking-methodology`, wave 2), fan-out (`tail-latency`, wave 2).
**Spec.**
- **Scene 1 · Read it off the CDF.** A seeded latency stream (log-normal, 20 to 5,000 samples) builds an empirical CDF (K3-1 `ecdf`, drawn with `Steps`). A `Slider` for the percentile p (50 to 99.99, with `format`) draws a horizontal rule and the value where it hits the curve; the `VLine` is also draggable to read F(x) back.
- **Three definitions side by side** on the same data, since tools disagree on small samples: nearest-rank (⌈p·n⌉-th smallest), the `floor(n·p)` index rule the app's own `core/sim` `percentile` uses, and linear interpolation between order statistics (the common default in numerical libraries; Hyndman and Fan's "type 7": verify against Hyndman & Fan 1996). A preset of 100 values `1…100` gives 50, 99 and 99.9 by nearest-rank = 50, 99, 100 and p50 by linear interpolation = 50.5; a preset of 20 values shows p99 is simply the maximum under two rules and, under the third, 81% of the way from the second-largest value up to the maximum. The stat row says how many samples lie above the chosen percentile ("1 of 20").
- **Scene 2 · Never average your p99s.** 2 to 6 hosts, each with its own seeded stream and a traffic share slider. Per-host p99s are shown, then the **average of per-host p99s** next to the **true p99 of all requests merged**, with the gap in ms and as a percentage.
  - Preset **understates:** host A sends 100 requests (90 at 10 ms, 10 at 100 ms), host B sends 100 requests all at 10 ms. Per-host p99 is 100 and 10, their average is 55 ms, the merged p99 is 100 ms.
  - Preset **overstates:** host A sends 1,000 requests (990 at 10 ms, 10 at 20 ms), host B sends 10 (9 at 10 ms, 1 at 1,000 ms). Per-host p99 is 10 and 1,000, the average is 505 ms, the merged p99 over 1,010 requests is 20 ms.
  - A third panel merges **fixed-bucket histograms** instead (named as the way real systems aggregate: Prometheus-style histograms, HDR histograms and t-digests; verify against each project's docs): merged p99 from buckets is within one bucket width of the true value, computed.
- **Scene 3 · Sampling and confidence intervals.** An n slider (10 to 10,000). Each press draws a fresh seeded sample and shows the mean with a 95% interval (mean ± t·s/√n, with the t quantile from a small exact table, so n = 10 uses 2.262 and large n 1.960), and the **p99 with a percentile-bootstrap interval** (1,000 resamples, seeded). `Band` draws the interval across a sweep of n so it visibly shrinks, like 1/√n for the mean.
- "**Run 1,000 experiments**" repeats the sampling 1,000 times and reports **coverage**: the share of intervals that contained the true value (the distribution's exact mean or exact p99). Shown for a normal source (≈ 95%) and a heavy-tailed log-normal (σ = 1.5) where small-n coverage falls below 95%; the caption sentence is built from the computed coverage (rule 14) and pinned at n = 10, 100 and 10,000.
- A **"how many samples am I really using?"** readout for tail percentiles: n·(1 − p) expected observations above p ("n = 200 at p99 is about 2 requests").
**Out of scope.** Fan-out amplification (`tail-latency`), coordinated omission and benchmark noise (`benchmarking-methodology`), hypothesis tests (`hypothesis-testing-ab`), streaming sketches in depth (named only; `probabilistic-structures` is the registered neighbour).
**Kit.** K3-1 (`ecdf`, `Steps`, `Band`, `quantile`, lognormal sampler), K3-3 (`Stat` with several `sub` lines), `Plot2D` (`VLine` with `onDrag`), `core/sim` (`percentile`), `core/stats`, `core/random`, `Slider`, `Segmented`, `ChipButton`, `.data-table`, `Provenance`.
**AC.**
- **Watch:**
  - the ECDF is a `--info` step line, the chosen percentile rule `--hi`;
  - each host is a plain category (`orange`/`amber`/`pink`/`sky`);
  - the wrong "average of p99s" is `--bad`, the true merged p99 `--ok`;
  - interval bands are `--violet` tint, the true value a `--hi` line, and an interval that missed it is drawn `--bad` in the coverage strip.
- **Misconception:** "the fleet p99 is the average of the hosts' p99s", and "a p99 from a couple of hundred samples is precise". Quiz question: the **understates** vector above ("what is the p99 of all 200 requests?", answer 100 ms, not 55) and a second question on how many requests sit above p99 in a sample of 200.
- **Correctness:**
  - the three percentile definitions are checked on `1…100` (nearest-rank 50 / 99 / 100; linear 50.5 / 99.01 / 99.901) and on 20 values, against hand-worked tables in the test;
  - nearest-rank is checked against sort-and-index on 1,000 seeded arrays;
  - the **understates** and **overstates** vectors reproduce 55 vs 100 and 505 vs 20 exactly;
  - bucket-merged p99 error ≤ bucket width on 200 seeded host mixes;
  - the mean interval's coverage over 10,000 seeded runs of a normal source is 0.95 ± 0.01, and the interval width ratio between n and 4n is 2 ± 10% averaged over seeds;
  - bootstrap is seeded, so the same seed gives the same interval;
  - a **broken variant** (a percentile function that averages host p99s) must fail the "equals the merged percentile" test on the preset.
- **Hostile input:** the sample size slider is bounded, p in (0, 100) never reaches 100 (p = 100 would be the maximum, the slider stops at 99.99), an empty stream shows "no samples yet" not NaN, a one-sample stream says the interval is undefined, and a host with 0% share is dropped from the average with a note. Seed field as in the conventions.
- **Honesty:** `simulated, seed N`. "Real monitoring systems aggregate with histograms or sketches, whose exact merge rules vary by product" is `from memory`. The `core/sim` rule is labelled "the rule this app uses".
**Phone.** One plot at a time per scene; the three-definition table is a 3-row `.data-table` that wraps. No `minWidth`.

**`queueing-theory` · Queueing Theory & Little's Law**
Track `math` · *"Why 90% utilization feels like a traffic jam"* · Builds on: `distributions`, `backpressure` · **[domain review]**
Registered Tier 4 edge (plan §1.5): the builder first reads `backpressure`'s claim ("W = 1/(μ−λ)", "L = λ × W", the 50% to 90% quiz) and this lesson must agree with it everywhere, ticketing any mismatch (rule 25). `backpressure` keeps bounded queues, shedding and what to do about overload; this lesson owns the formulas and why variability builds queues.
**Spec.**
- **Scene 1 · One server.** A `createTickSim` (K3-2, seeded) of one server with rate μ = 10 jobs/s (a named constant). Arrivals are Poisson at λ. **Service-time shape picker:** deterministic (CV² = 0), exponential (CV² = 1), and a high-variance hyper-exponential (CV² = 4). Events are drawn as exact continuous times and handled at the tick that contains them (dt = 5 ms of model time), so tick size changes when the picture updates but not the measured waits. A `Slider` sets utilisation ρ = λ/μ from 5% to 120%.
- The queue is drawn as a row of waiting jobs (capped at 30 icons with "+n more"), the server, and the time-in-system of the last 20 jobs. Stats: ρ, **L** (time-average number in system), **W** (mean time in system), **Lq**, **Wq**, each measured from the run **and** from theory in the same `Stat` (K3-3 two lines: "measured" and "theory"). For ρ ≥ 1 the theory line says "no steady state" and the sim shows the queue still growing; no formula is printed as if it applied.
- Theory shown (verify against a queueing text such as Kleinrock or Harchol-Balter): M/M/1: L = ρ/(1−ρ), W = 1/(μ−λ), Wq = ρ/(μ−λ). General service (M/G/1, Pollaczek-Khinchine): Wq = [ρ/(1−ρ)]·[(1+CV²)/2]·(1/μ). The shape picker shows the P-K factor: deterministic halves the M/M/1 wait, CV² = 4 multiplies it by 2.5.
- **Scene 2 · Little's Law, checked live.** L = λ·W for any stable system. The lesson draws N(t), the jobs in the system, counts the area under it and the sum of each job's time in system, and shows that they are equal. A **system boundary** `Segmented` (whole system, queue only, server only) shows Lq = λ·Wq and L_server = ρ. A **sizing calculator** (two bounded fields: requests/s and seconds each, `parseBoundedDecimal`) gives concurrency = λ·W ("200 req/s × 50 ms = 10 in flight") and a pool-size line (links `connection-pooling` by name).
- **Scene 3 · One fast server or a pool?** Fixed c = 4. Three topologies at the same total capacity: four separate queues with random split (each M/M/1 at λ/4, rate μ), one shared queue with four servers (M/M/4, Erlang C), and one server of rate 4μ. Mean wait and mean time in system for each, with a ρ slider. The learner sees that pooling beats splitting, and that one fast server beats the pool on time-in-system because service itself is faster; join-shortest-queue is named only (`load-balancing` owns it).
- **Scene 4 · The curve.** `Plot2D`: W(ρ) in units of service time, 1/(1−ρ), with a draggable `VLine` at ρ and markers at 50% (2×), 80% (5×), 90% (10×), 95% (20×) and 99% (100×) service times, plus the measured sim point. The caption says there is no corner on the curve: "the knee is wherever you decide the wait stops being acceptable".
**Out of scope.** Bounded queues, shedding and backpressure (`backpressure`), autoscaling policy (`autoscaling`, wave 2), the load-test knee (`capacity-planning`, wave 2), priority and processor-sharing disciplines (named only), networks of queues, `amdahls-law`'s contention model.
**Kit.** K3-2 (`createTickSim`, `useTickSim`), K3-1 (`exponential`, `poisson` samplers), K3-3 (`Stat` two-line sub), `Plot2D` (`Curve`, `VLine` draggable, `Points`), `Bar`, `Segmented`, `Slider`, `PauseButton`, `core/stats`, `core/sim`, `core/format`, `TextField` + `parseBoundedDecimal`, `Provenance`.
**AC.**
- **Watch:**
  - waiting jobs `--info`, the job in service `--hi`, completed jobs fade to `--dim`;
  - a queue past 30 icons gets an overflow chip in `--bad`; ρ ≥ 1 turns the ρ stat `--bad` (no steady state);
  - theory is `--violet`, measured `--info`;
  - in scene 3 the three topologies are plain categories (`amber`/`sky`/`pink`);
  - the cheap side (shorter wait) of each comparison is `--ok`.
- **Misconception:** "80% busy is fine, it's only 20% worse than 60%". From 80% to 90% utilisation the mean time in system doubles (5 to 10 service times). Quiz questions: that one, and Little's Law with a connection pool ("1,200 requests/s, 25 ms each: how many connections are in use on average?" → 30).
- **Correctness:**
  - closed forms vs seeded simulation: at ρ ∈ {0.3, 0.5, 0.7} each of 20 seeds runs 200,000 jobs and the mean of W, Wq, L matches theory within 3% for M/M/1 and M/D/1; at ρ = 0.9 within 10% (autocorrelation, stated in the test);
  - Pollaczek-Khinchine is checked for CV² = 0, 1 and 4 the same way (hyper-exponential built as a two-branch mixture with the stated mean and CV²);
  - **Little's identity is exact**: with arrivals stopped and the system drained to empty, ∫N(t)dt equals the sum of times in system to 1e-9, and a test breaks it by dropping one job from the sum;
  - **Erlang C** (c = 2, λ = 1, μ = 1 gives P(wait) = 1/3, Wq = 1/3, W = 4/3 by hand) vs a brute-force M/M/c sim; the mean **time in system** orders split > pool > one fast server at 20 values of ρ, and the mean **queueing wait** orders split > fast server > pool (Erlang C's P(wait) is below ρ for c > 1), each pinned as its own test because the two orderings differ and the scene states both;
  - theory-line text is derived, not typed (rule 14): "doubles", "5×" come from the numbers.
- **Hostile input:** ρ above 100% is allowed on purpose and shows the unstable state honestly; the calculator refuses 0, negative, over 1e6 requests/s and over 3,600 s with the reason; `1e3`, `Infinity` and text are refused; a seed as in the conventions.
- **Honesty:** `Provenance simulated` with the seed, and the theory labelled "analytic". The stage states "M/M/1 assumes Poisson arrivals and exponential service; real traffic is burstier, so real queues are worse" and that no real system is modelled. μ = 10/s is labelled illustrative.
**Phone.** The queue row shows ≤ 12 icons at 390 with the overflow chip. The curve `Plot2D` at width 356. The two `Stat` lines wrap. No `minWidth`.

**`hypothesis-testing-ab` · Hypothesis Testing & A/B Experiments**
Track `math` · *"Is that 2% lift real or noise?"* · Builds on: `conditional-bayes`, `distributions` · **[domain review]**
**Starts where Tier 2 stops.** `feature-flags`: "Experiment statistics (T3 `hypothesis-testing-ab`)." (That lesson hashes users into a bucket; this one asks whether the difference between buckets is real.)
**Spec.**
- **Scene 1 · Run the experiment.** Two variants, A and B. Controls: baseline conversion (default 10%), **true lift** (−2 to +3 points, including 0 for an A/A test), visitors per arm (100 to 100,000, log slider), seed. "Run" draws seeded Bernoulli outcomes for each arm and shows conversions, the two rates, the **two-proportion z-test** (pooled standard error), the two-sided p-value as a shaded `Area` under the normal curve (both tails), and a 95% interval for the difference (unpooled standard error). Verdict text is computed.
- Hand-worked example the test pins: 100/1,000 vs 130/1,000 gives pooled p̂ = 0.115, SE ≈ 0.01427, z ≈ 2.10, p ≈ 0.036 (verify against any stats table).
- **Scene 2 · Run it 1,000 times.** The same experiment replicated 1,000 times at the current settings. A histogram of the 1,000 p-values: flat when the true lift is 0 (about 5% fall under 0.05, the false-positive rate), piled near 0 when a real lift exists, where the share under 0.05 is the **power**. A **power calculator**: per-arm n = (z₁₋α/₂ + z_power)²·[p₁(1−p₁) + p₂(1−p₂)] / δ², so 10% → 11% at α = 0.05 and 80% power needs ≈ 14,750 visitors per arm (z = 1.960 and 0.842: 7.849 × 0.1879 / 0.0001 = 14,748). The learner moves the minimum detectable effect and watches n explode as it shrinks (n ∝ 1/δ²).
- **Scene 3 · Peeking.** An A/A test (no true effect) with data arriving in 20 looks of 500 per arm. The live p-value trace wanders and the learner presses "**stop when p < 0.05**" (the peeking policy). "Look once at the end" is the control. Replicated 1,000 times: the share of experiments that ever dip below 0.05 across 20 looks is shown next to the 5% promised. Published tables of repeated significance testing (Armitage, McPherson and Rowe, 1969) give roughly 14% for 5 looks, 19% for 10 and 25% for 20 (verify against the paper); the lesson computes its own number and does not paste these. A **Bonferroni** toggle (test each look at α/looks) pulls the rate back to about 5%; a "sequential methods exist" note names them only.
- **Scene 4 · Slice until significant.** 20 seeded segments of A/A data (country, device and so on, all invented). The learner clicks through slices and finds "the segment where B wins". The panel computes P(at least one false positive among 20 tests) = 1 − 0.95²⁰ = 64.2% and shows the share of A/A experiments (2,000 replicates) with ≥ 1 significant slice (≈ 64%). A Bonferroni toggle uses α/20 = 0.0025.
- **Scene 5 · Your own numbers.** Two integer fields (conversions and visitors for each arm) give the same z-test, interval and verdict. Refusals are explicit (below).
**Out of scope.** Bayesian A/B methods, sequential testing in depth, CUPED and variance reduction (all named only); metrics design; feature-flag bucketing (`feature-flags`); effect on revenue; non-binary outcomes (t-tests are named only).
**Kit.** K3-1 (`normalCdf`, `Area`, `Bars`), K3-3 (`Stat` with p, interval and n on separate lines), `Plot2D` (`Area`, `Curve`, `VLine`, `HLine` for α), `core/stats` (`histogram`, `runningMean`), `core/random`, `Slider`, `Segmented`, `Toggle`, `ChipButton`, `TextField` + `parseBoundedInt`, `Provenance`.
**AC.**
- **Watch:**
  - variants are plain categories (A `sky`, B `amber`), never `--ok`/`--bad`;
  - the p-value tail area is `--violet`;
  - the α = 0.05 line is `--dim` dashed;
  - a "significant" verdict is `--ok` only when a real lift exists in the run, `--bad` when it is a false positive on A/A (derived from the true lift, rule 17);
  - the peeking trace is `--hi`, and its first crossing is marked `--bad` on A/A and `--ok` when the effect is real.
- **Misconception:** "p = 0.03 means a 97% chance B is better", and "keep checking and stop when it's significant". Quiz questions on both (the right reading of a p-value; what happens to the false-positive rate when you stop at the first p < 0.05).
- **Correctness:**
  - z, p and the interval vs the 100/1,000 vs 130/1,000 hand values, with p from an **independent** normal cdf (Abramowitz-Stegun erf or numeric integration of the density), not the lesson's own `normalCdf`;
  - when the true lift is 0, the share of p < 0.05 over 5,000 seeded runs is 0.05 ± 0.01; at n = 14,748 per arm for 10% → 11% the empirical power over 4,000 runs is 0.80 ± 0.035;
  - peeking: 1 look gives 0.05 ± 0.01, the rate rises monotonically with the number of looks, 20 looks is above 0.15 and below 0.40, and Bonferroni at 20 looks is ≤ 0.06;
  - 1 − 0.95²⁰ = 0.6415 and the empirical ≥ 1 significant slice rate is within 0.03 of it over 2,000 runs;
  - a **broken variant** (a test that peeks and still claims 5%) must fail the "false-positive rate ≤ nominal" assertion.
- **Hostile input:** conversions greater than visitors, negative values, decimals, `1e3` and values over 1e9 are refused with a reason and the old values kept. 0 conversions in both arms (zero variance) shows "p undefined" and "–", never NaN. Visitors below 30 per arm gets a "too few for a z-test" note rather than a verdict. Seed as in the conventions.
- **Honesty:** `simulated visitors, seed N`. "Frequentist two-proportion z-test at a fixed horizon; assumes independent users and one pre-registered look." The peeking number is the lesson's own simulation; the published figures are `from memory`.
**Phone.** The normal-curve plot and the p-value histogram stack; the peeking trace uses `Plot2D` at 356 wide. Scene 5's four fields wrap. No `minWidth`.

**`back-of-envelope` · Back-of-the-Envelope Capacity Math**
Track `arch` · *"Size the system in five minutes"* · Builds on: `memory-hierarchy` · **[domain review]**
**Spec.**
- **Scene 1 · From users to QPS.** Inputs: daily active users (a `TextField` with thousands separators plus a log slider, 1,000 to 2 billion), actions per user per day, a peak-to-average factor (default 3, labelled illustrative), read:write ratio. Output average and peak requests per second. A **unit strip** shows the arithmetic with units cancelling: "100,000,000 users/day × 10 actions/user ÷ 86,400 s/day = 11,574 /s", with the cancelling pairs struck through. A **round or exact** toggle (86,400 vs 100,000 s/day) shows the shortcut's error (+15.7%).
- **Scene 2 · Storage and bandwidth.** Record size (bytes) × writes per day × retention (days) × replication factor (default 3) × index/overhead factor. A decimal (TB = 10¹²) vs binary (TiB = 2⁴⁰) toggle shows the 10% gap at the TB scale (2⁴⁰ / 10¹² = 1.0995). Bandwidth: payload × QPS gives MB/s, then ×8 for Mbit/s, compared to a 10 Gbit/s NIC (1.25 GB/s). A **unit algebra** (local, pure, tested: a quantity is a number plus a map from unit to exponent) refuses to add bytes to bits and shows the dimension of every result (users/s, B, B/s).
- **Scene 3 · How many servers?** Per-server capacity from cores and CPU-ms per request (8 cores, 5 ms → 1,600 req/s at 100%), a target utilisation (default 60%, links `queueing-theory` since it is earlier in this batch), and N+1 or lose-one-of-three-zones redundancy. Servers = ⌈peak ÷ (capacity × target)⌉ + redundancy.
- **Scene 4 · The latency ladder.** The learner builds a request path from chips (an L1 hit, a memory read, an SSD random read, a same-datacentre round trip, a cross-continent round trip) and sees the summed budget as a stacked `Bar` against a target (e.g. 200 ms). Ladder constants are named, labelled **illustrative orders of magnitude, from memory** (verify against a current latency table; hardware varies).
- **Scene 5 · Guess first.** Before any answer is shown, the learner picks a power of ten for the average QPS (`Segmented` 10² to 10⁷). Then the computed value and the error in orders of magnitude (log₁₀) appear, and the lesson says whether the guess was within 10×.
**Out of scope.** Cost estimation (a later lesson, named only), queueing derivations (`queueing-theory`), autoscaling (`autoscaling`), database sizing in depth, and any design verdict: this is arithmetic, not a design.
**Kit.** `Stat` (K3-3 multi-line, for dimension and value), `Bar` (`segments`), `TextField` + `parseBoundedInt` (`thousands: true`, `underscores: true`), `Slider` with `format`, `Segmented`, `Toggle`, `ChipButton`, `core/format` (`bytes`, `latency`, `humanDuration`, `times`), `useScenePicker`, `Provenance`. **Kit missing:** the latency ladder lives in `memory-hierarchy/model.ts` (`LEVELS`), so this is the second user; request an extraction to `src/core/latencyLadder.ts` (plan §4 does not list it), otherwise the builder must not copy it.
**AC.**
- **Watch:** inputs `--info`, derived quantities `--hi`, the unit being cancelled struck in `--dim`, a unit mismatch refusal `--bad`, a result inside the budget `--ok` and over it `--bad`, redundancy servers `--violet`.
- **Misconception:** "10 Gbit/s is 10 GB/s" (bits vs bytes), "peak = average", and "the latency table is exact". Quiz questions: average QPS from 100M DAU × 10 actions (≈ 11.6k/s; the distractors are 1.16k, 116k and 11.6M) and "a 10 Gbit/s link carries about how many bytes per second?" (1.25 GB/s).
- **Correctness:** three hand-worked vectors pinned in the test:
  - 100,000,000 DAU × 10 ÷ 86,400 = 11,574.07 /s average, 34,722 /s at a peak factor of 3;
  - 1,000,000 writes/day × 1,000 B × 365 days × 3 replicas = 1.095 × 10¹² B (1.095 TB decimal, 0.996 TiB);
  - 50,000 /s peak, 8 cores × 1,000 ms ÷ 5 ms = 1,600 /s, ×0.6 = 960 /s, ⌈50,000 / 960⌉ = 53 servers, 54 with N+1.
  - The unit algebra's result dimension for each scene's final quantity is asserted; adding B to bit throws; 2⁴⁰/10¹² = 1.0995.
- **Hostile input:** DAU and counts through `parseBoundedInt` (`1,000,000`, `1_000_000`, `5k` refused with "type the digits"); 0, negative, above 1e12 and decimals refused with the reason; zero cores or zero ms per request refused (division by zero); results above 1e21 print as powers of ten. A guess is only accepted from the picker.
- **Honesty:** `Provenance illustrative` on every default (peak factor, record size, ladder), `from memory` on the ladder. "Estimates are for order of magnitude; real capacity comes from measuring." The 86,400 vs 100,000 shortcut states its own error.
**Phone.** The unit strip wraps; the ladder `Bar` fits at 356; fields stack. No `minWidth`.

---

##### Batch T3-B2 · Design docs & craft (`lead`, `craft`)
Wave 1, no domain-review lessons (plan §6). Pilots **K3-6** (the `CodePanel` long-line fix: three lessons here show code or file text) and **K3-7** `Provenance`. `design-docs-rfcs` builds the **decision-simulator grammar locally** (it is the pilot that K3-15 `ScenarioStory` is extracted from after wave 1), so its pure engine is written in K3-15's shape from the start: `Scenario { start, nodes: { id, prompt, choices: { label, to, effects?, because }[] }, meters, endings }` plus a `validateScenario` that checks reachability and bounded meters, so the extraction is a move, not a rewrite. `technical-debt` is an interest-accrual simulation, not a branching story, and does **not** use the grammar. `monorepo-polyrepo` is a judgement topic, so AC-0/T3 #24 applies to it as well as to the two lead lessons: every claim on screen is labelled `standard`, `research finding`, `common practice` or `one view`, invented material says "invented", and the lesson never attributes a practice to a real company. **Kit missing (needed before wave 1, see the report):** two lessons in this batch need the claim labels and K3-7's `Provenance` kinds do not include them; request that K3-7 ship `practice`, `one-view`, `research` and `standard` kinds so the batch does not carry two copies.

**`design-docs-rfcs` · Design Docs, RFCs & ADRs**
Track `lead` · *"Write it down before you build it"* · Builds on: `technical-writing`
**Starts where Tier 2 stops.** `technical-writing`: "Design docs, RFCs and ADRs (T3 `design-docs-rfcs`), and architecture diagrams (`architecture-diagrams-c4`)." That lesson taught sentence-level writing and a trade-off summary; this one is the decision document itself.
**Spec.**
- **Scene 1 · Build the doc.** Nine section chips (Context and problem, Goals, Non-goals, Proposal, Alternatives considered, Trade-offs and risks, Rollout and migration, Open questions, Recommendation). The learner orders them with move-up/move-down buttons and a drag handle (every move has a keyboard button). The sample doc is **invented** ("Move session storage out of the monolith's database", labelled so), with an authored word count per section (e.g. Context 300, Proposal 900, Alternatives 500, Recommendation 60).
- Three **simulated readers** walk the learner's order and read until their budget runs out: a skimmer (150 words), an approver (600 words), an implementer (2,500 words). Budgets are invented and labelled. The view shows exactly which sections each reader reaches, partly reaches, or never reaches; a reader who never reaches the **recommendation** gets a `--bad` "no decision reached" flag. The failing state is the default order (Context, Goals, Proposal, ... Recommendation last), so the first thing the learner does is move the ask to the top.
- A **doc lint** derived from the learner's own arrangement and content: has non-goals; lists at least two alternatives including "do nothing"; each alternative has a stated cost; the recommendation names the decision wanted and by when; open questions are not buried before the proposal. Each check is computed from the arrangement and the alternatives table (it is not scripted).
- **Scene 2 · Alternatives and the decision.** An invented decision (a slow profile page: cache, read replica, or denormalise) as a table of options by criteria (p95 latency, running cost, staleness risk, effort in weeks), with authored numbers. Weight sliders (normalised to sum to 1) and **must-have constraints** (e.g. staleness ≤ 5 s) rank the options; a constraint knocks an option out (shown `--dim` with the reason). The ranking is a weighted sum over min-max-scaled criteria. A "**where does the decision flip?**" panel sweeps one weight and names the weight value at which the winner changes, computed by scanning 0 to 1 in 0.01 steps.
- The chosen option writes an **ADR** (title, status, context, decision, consequences) generated from the option's own data: consequences list the costs of the chosen option as well as its benefits. `Segmented` status: proposed, accepted, superseded. An accepted ADR is read-only: "edit" is refused with "an accepted ADR is superseded by a new one, not edited" and a "supersede" button creates the new record linking the old. The layout follows the widely used template (title, status, context, decision, consequences) from Michael Nygard's 2011 post on documenting architecture decisions (verify against that post); labelled `common practice`.
- **Scene 3 · Your proposal meets review.** A branching scenario (invented): ship a one-page or a twelve-page doc, invite the likely objectors before or after circulation, record dissent in the doc or not. Three meters: **decision clarity**, **days to a decision**, **surprise at implementation time**. Every choice shows its `because`, every ending is reachable, and the **ledger** lists what the learner chose and what it cost. An ending that "succeeds" can still show a meter in the red, so the best path is not free.
- Every statement in the lesson carries a claim label: the nine section names are `common practice`; "put the ask first" is `common practice`; "a design doc is not a spec" is `one view`; RFC processes differ between organisations and are not attributed to any.
**Out of scope.** Sentence-level style (`technical-writing`), diagrams (`architecture-diagrams-c4`), estimation, prioritisation and technical strategy (later lead lessons, named only), any particular company's RFC process.
**Kit.** A local pure `scenario.ts` in K3-15's shape; `ChipButton` (sections, status), `Segmented`, `Slider` (weights), `Toggle`, `.data-table`, `Bar` (reader budgets, stacked by section with `segments`), `CodePanel` (the ADR text, with K3-6), `TextField` (one 80-character ADR title), `Provenance` (K3-7, `illustrative`, plus the claim kinds above), `createRecorder` for the ledger.
**AC.**
- **Watch:**
  - section chips are plain categories (`amber`, `sky`, `pink`, `orange`);
  - words a reader reached are `--ok` tint, partly reached `--hi`, unreached `--dim`;
  - an unreached recommendation is `--bad`;
  - the chosen option `--hi`, a knocked-out option `--dim`, a violated constraint `--bad`;
  - meters are `--info` until they cross their threshold, then `--bad`.
- **Misconception:** "a design doc documents what we built" and "a thorough doc is a long doc". Quiz questions: where the recommendation belongs for a skimmer, and what you do when an accepted ADR's decision is reversed (write a new ADR that supersedes it).
- **Correctness:**
  - reader reach is a pure function of the order and the word counts: for order [Context 300, Proposal 900, Alternatives 500, Recommendation 60] and a 600-word budget the reader gets all of Context and 300 words of Proposal and never reaches the recommendation (hand-worked); moving the recommendation first lets the 150-word skimmer reach it for **every** permutation of the other eight sections (8! = 40,320, exhaustive);
  - the weighted ranking is checked against a brute-force scan on 200 seeded weight vectors, and the reported flip point equals the scan's to within 0.01;
  - weights that are all zero are refused;
  - `validateScenario` proves every node and every ending is reachable, there is no dead end, and the meters stay in bounds on every path (bounded enumeration), and a deliberately broken scenario must fail the validator;
  - the ADR text is rebuilt from state, so changing the option changes the consequences line (tested).
- **Hostile input:** the ADR title is plain text, trimmed, 1 to 80 characters, rendered as text and never as markup (a title with `<b>` shows the characters); an empty title blocks "accept". Reordering by drag has a keyboard twin. Weights cannot all be zero.
- **Honesty:** the doc, the options, the numbers, the reader budgets and the scenario are **invented**, with a `Provenance illustrative` chip and the words "invented scenario" on screen (rule 24). Claim chips follow the vocabulary above.
**Phone.** The section list is one column of full-width chips; reader bars stack; the options table scrolls inside a `WideRegion` (about 520). No `minWidth` on the stage.

**`technical-debt` · Managing Technical Debt**
Track `lead` · *"Debt is fine; unpriced debt isn't"* · Builds on: `refactoring-code-smells`
**Starts where Tier 2 stops.** `refactoring-code-smells`: "Deciding when debt is worth paying belongs to T3 `technical-debt`. Automated codemods and ASTs belong to `parsing-ast`." This lesson is the decision, not the refactoring.
**Spec.**
- **Scene 1 · Interest.** A team over 24 sprints. Model (all named constants, shown): capacity C = 100 points a sprint; debt stock D in points of principal (what it costs to fix); interest rate r per sprint (a slider, 0 to 15%); each sprint the team may add shortcuts s (points of principal added, slider) and spend a share f of capacity on paydown (slider 0 to 40%).
  - velocity v_t = max(0, C − r·D_t − paydown_t) with paydown_t = min(D_t, f·C);
  - D_{t+1} = D_t + s − paydown_t, never below 0;
  - features delivered per sprint = v_t; the cumulative curve is drawn for the learner's plan and, dashed, for "no paydown".
- A **"rush when behind"** toggle makes the team add extra shortcuts whenever velocity falls under a target (a feedback loop that makes the spiral visible). `Plot2D` shows velocity, cumulative features and debt (`Area`). A **break-even sprint** marker appears where the paydown plan's cumulative features overtake the no-paydown plan, or "never within 24 sprints". At r = 1% and a short horizon, paying never breaks even, and the lesson says so: debt is not always wrong.
- **Scene 2 · Price your debt.** A register of six invented items (e.g. "no integration tests around billing", "validation copied into four services"). Each has a fix cost (days), a **touches per month** estimate and **extra days lost per touch** (sliders). Monthly interest = touches × extra days; payback = fix cost ÷ monthly interest. A computed table ranks by payback and, beside it, by size of interest, and the two orders disagree, so the learner sees why "biggest pain" and "best return" differ. Items with payback beyond a horizon slider are labelled "leave it". An item nobody touches has interest 0 and payback "never". A "**say it in business terms**" panel turns the learner's estimates into "weeks of engineering a quarter lost" and "pays back in N months".
- **Scene 3 · Classify the debt.** Six invented scenarios sorted into the four boxes of a debt quadrant (deliberate or inadvertent, reckless or prudent), a **one view** framework popularly credited to Martin Fowler (verify against his article). Arguable cards accept two boxes and say why; the learner's sort is scored against the authored key, with the key labelled opinion.
**Out of scope.** Refactoring mechanics (`refactoring-code-smells`), estimating the cost of work (`estimation`, later), prioritisation frameworks (`prioritization`, later), DORA measurement (`dora-metrics`, wave 2); a guaranteed way to measure interest in a real codebase (it is estimated).
**Kit.** `Plot2D` (`Curve`, `Area`, `VLine`), `Slider` with `format`, `Toggle`, `ChipButton`, `.data-table`, `Stat`, `Bar`, `Segmented`, `Provenance` with the claim kinds above. No `ScenarioStory`: it does not apply here, and if the build finds it does, the lesson waits for K3-15 (plan §4).
**AC.**
- **Watch:**
  - velocity is `--info`, cumulative features with paydown `--ok`, without paydown `--dim` dashed;
  - the debt stock is `--bad` (the costly side) as an area;
  - the break-even marker is `--hi`;
  - register items are plain categories; "leave it" items `--dim`;
  - quadrant boxes are plain tones; a correct sort `--ok`, an incorrect one `--bad`, an arguable card shows both boxes in `--violet`.
- **Misconception:** "all debt is bad and must be paid now" and "interest is the same everywhere". Interest only accrues where you work: a hairy module nobody touches costs nothing. Quiz questions: an item with a 12-day fix and 0 touches a month, and the case where r is 1% over a short horizon.
- **Correctness:**
  - the model is checked against a closed form: with s constant and f = 0, D_t = D₀ + s·t and the cumulative features have a closed-form sum, compared to the loop for 1,000 seeded parameter sets;
  - invariants over those sets: D ≥ 0, v ≥ 0, more paydown never raises debt at any sprint (monotonic), s = 0 and f = 0 gives constant velocity C − r·D₀;
  - the break-even sprint equals a brute-force scan;
  - payback = fix ÷ monthly interest with ties stable, and interest 0 prints "never" not Infinity or NaN;
  - the rush toggle changes the trajectory (tested at one parameter set).
- **Hostile input:** all inputs are sliders or chips; nothing is typed. A zero horizon is not offered. Division by zero is handled as above.
- **Honesty:** `Provenance toy` on the model ("a toy model: real interest is estimated, not measured like this"), `illustrative` on the register, and every claim in the lesson is labelled `one view` or `common practice`. The quadrant is credited as someone's framework, not a standard.
**Phone.** One plot at 356; register table wraps to cards at ≤ 900 px; quadrant boxes stack. No `minWidth`.

**`property-based-testing` · Property-Based Testing & Shrinking**
Track `craft` · *"Let the machine invent the edge cases"* · Builds on: `induction-invariants`
**Starts where Tier 2 stops.** `tdd`: "Property-based testing and shrinking belong to T3 `property-based-testing`. Mutation testing belongs to T3." Coverage and mutation are the next lesson in this batch (named in words, not linked, per rule 13).
**Spec.**
- **Real JavaScript runs here.** A small teaching runner (seeded generators, a `forAll` loop, a shrinker) runs lesson-authored functions under test, with deliberate bugs, and the learner never writes code. The functions are real JS:
  - correct sort (copy, then `sort` with a numeric comparator);
  - the classic bug, `sort()` with **no comparator**, which compares numbers as strings (so `[10, 2]` stays `[10, 2]`);
  - a "dedupe while sorting" bug that drops repeated values;
  - an off-by-one insertion sort that mishandles arrays with a negative first element.
- **Scene 1 · Fire random inputs.** Pick a function and tick **properties**: output is non-decreasing, same length, same multiset (a permutation), idempotent (`sort(sort(x)) == sort(x)`), equals a reference sort. Generator controls: max length (0 to 20), integer range (a `Segmented`: −5..5, 0..100, 0..1,000,000, "edge-biased"), and the seed. "Run 100 cases" lists each case (input → pass or fail) and stops at the first failure, showing the large random counterexample as found.
- **Scene 2 · Shrink.** "Shrink" steps through candidates: drop an element (each position), halve an element toward 0, try the shorter prefix. A candidate that **still fails** is accepted; one that passes is rejected and drawn struck through. It ends when no single candidate fails, with "smallest failing input this shrinker can reach (step limit 500)". For the no-comparator bug the learner watches a long array become a couple of elements (the builder records the actual minimum; the test asserts it still fails and that no single further shrink does, not a hard-coded array). The lesson also shows "**replay**": the same seed reproduces the same failure and the same shrink.
- **Scene 3 · Properties worth writing.** A matrix **bug × property** filled by actually running 500 seeded cases per cell: ✓ "caught (first at case k)", or ✗ "not caught in 500 cases". It shows that "same length" alone misses most bugs, that "sorted + permutation" is a complete spec for sorting, and that "no failure found" is not a proof. The learner toggles properties and watches which bugs survive.
- **Scene 4 · Generator design.** The dedupe bug fails only on arrays with repeated values. With the 0..1,000,000 range the chance of a repeat in 8 draws is about 2.8 × 10⁻⁵ per case, so 100 cases essentially never find it; with −5..5 it is found almost at once. The panel shows the computed probability of a repeat (birthday formula) beside the observed first-failure case.
- **Custom array.** A typed list (`parseIntegers`, up to 20 values) tests the learner's own input against every bug.
**Out of scope.** Stateful or model-based testing, and coverage-guided fuzzing (the security lesson `fuzzing`, wave 9), both named only; the real libraries' internals (fast-check, Hypothesis, QuickCheck; from memory they shrink more cleverly); mutation testing (next lesson).
**Kit.** `CodePanel` (K3-6 fix, for the function and properties, `stateOf` marking the failing line), `ChipButton`, `Segmented`, `Slider`, `TextField` (seed via `parseBoundedInt`; custom array via `parseIntegers`), `createRecorder` for shrink steps, `core/random` (`mulberry32`), `.data-table`, `Stat`, `Provenance` (`real`: real JavaScript; `toy`: the runner).
**AC.**
- **Watch:**
  - passing cases `--ok`, a failing case `--bad`;
  - the case being shrunk `--hi`, an accepted shrink `--ok`, a rejected one `--dim` struck through;
  - the minimal counterexample is `--violet`;
  - ✗ "not caught" cells in the matrix are `--orange` (not caught is not the same as correct), ✓ cells `--ok`.
- **Misconception:** "100 random tests passing means the code is correct", and "random testing is just lots of examples". Quiz questions: what you may conclude from 100 passes (only that these 100 inputs passed), and why failing inputs are shrunk.
- **Correctness:**
  - each property checker is verified against a brute-force check on all arrays up to length 5 over −3..3;
  - the correct sort passes all five properties on 10,000 seeded arrays;
  - every bug fails at least one property within 100 cases on at least one named seed, and the dedupe bug is **not** found with the wide range on a named seed but is with the narrow one (both seeds pinned);
  - after shrinking, the result still fails, is no longer than the original, and no single shrink candidate fails (local minimum) across 200 seeds × all bugs;
  - the shrinker always terminates within its 500-step limit;
  - a **broken variant runner** that never shrinks must fail "shrunk length < original length for at least 90% of failing seeds", proving the test can fail;
  - the no-comparator behaviour is asserted against real `Array.prototype.sort` (`[10, 2].sort()` gives `[10, 2]`).
- **Hostile input:** the seed through `parseBoundedInt`; the custom array is capped at 20 values and |v| ≤ 1e9 and refused otherwise (a 10,000-element paste is refused, not run); no learner-authored code or property is executed (the properties are a fixed menu).
- **Honesty:** `Provenance real`: "real JavaScript runs on every case; the bugs are lesson-authored on purpose". `toy`: "a small teaching runner, not fast-check".
**Phone.** Cases are a wrapping list; the matrix is 5 columns and scrolls inside a `WideRegion` (about 440) with its hint outside the content. `CodePanel` lines scroll inside the panel (K3-6).

**`coverage-mutation-testing` · Code Coverage vs Mutation Testing**
Track `craft` · *"100% coverage can still catch 0% of bugs"* · Builds on: none
**Starts where Tier 2 stops.** `tdd`: "Mutation testing belongs to T3." `test-pyramid` and `flaky-tests` own the suite-level view; this lesson asks only whether a test would notice the code changing.
**Spec.**
- **A tiny language with a hand-written evaluator.** The function under test is data: an expression tree in a documented safe subset (numbers, booleans, variables, comparison, `+ − ×`, `!`, ternary), pretty-printed into the `CodePanel` and run by a hand-written evaluator. There is **no `eval`** and no `new Function` (CLAUDE.md). The function is `cost(weight, express) = (weight > 10 ? base + (weight − 10) × 2 : base)` with `base = express ? 12 : 5`.
- **Scene 1 · Coverage lies.** The learner builds a test suite from a list of cases (input and expected value) or sets an **assertion mode**: exact value, weak ("returns a number"), none ("just call it"). A line-coverage and branch-coverage tracer (counting evaluator node hits) colours the lines. The "no assertions" suite reaches 100% line and branch coverage and checks nothing.
- **Scene 2 · Mutants.** The tool generates mutants from named operator classes (changes to a comparison, an arithmetic operator, a constant by one, a negation, a swapped ternary branch; the class names echo common tools, from memory). Each mutant is a real alternative tree, run against **every** test: **killed** if any test's assertion fails, **survived** otherwise. **Equivalent mutants** are real here: `weight > 10` → `weight >= 10` changes nothing, because at 10 the extra term is `(10 − 10) × 2 = 0`. The lesson finds equivalence by running both versions over the whole input domain (weight 0 to 40 × both values of `express`) and says "equivalent over this domain", then excludes it from the score. **Mutation score** = killed ÷ (total − equivalent).
- Survivors list a **killing input** found by search ("a test at weight 11, express false would kill this one"), so the learner adds that case and watches the survivor die. The side-by-side readout shows line coverage, branch coverage and mutation score for the same suite, for the no-assertion suite (100%, 100%, low) and for a small precise suite.
- **Scene 3 · What it costs.** Mutants × tests run, counted (kills stop at the first failing test), with the ways to cut it named: only the tests that cover the mutated line, sampling mutants, incremental runs.
- A **snapshot trap**: "approve current output as expected" gives a suite that kills every mutant of the *current* code and also locks in a bug if the code was already wrong (a preset with a seeded off-by-one in `cost`).
**Out of scope.** Real mutation tools (Stryker, PIT, mutmut: named, from memory), property-based testing (previous lesson, named in words), flaky tests, branch/path coverage theory beyond one caption.
**Kit.** `CodePanel` (K3-6; `stateOf` for covered, uncovered, mutated), `ChipButton`, a coverage tracer (local, one user) over the lesson's expression tree. **Kit missing:** `debugger-tools` already has a hand-written safe-subset expression evaluator (`src/lessons/debugger-tools/expr.ts`), so this lesson is a **second user**; request its extraction to `src/core/expr.ts` (extended with a ternary and an exposed tree so mutants can be built from it) with `debugger-tools` migrated pixel-identically, instead of writing a second evaluator. The builder reads `expr.ts` first and files the request if the subset is short of what `cost` needs; `Segmented` (assertion mode), `TextField` + `parseBoundedInt` (expected value), `.data-table`, `Stat`, `Provenance`.
**AC.**
- **Watch:**
  - executed lines `--info`, never-reached lines `--dim`;
  - the mutated token `--orange`;
  - killed mutants `--ok`, survivors `--bad`, equivalent mutants `--dim` (ruled out of the score);
  - the killing input suggestion `--hi`.
- **Misconception:** "100% coverage means well tested", and "a surviving mutant always means a missing test" (it may be equivalent). Quiz questions on each.
- **Correctness:**
  - the evaluator equals the real JavaScript version of `cost` over the full domain, compared in the test by running real JS;
  - each mutant, rendered as JS text and run in the test, matches the evaluator on the whole domain;
  - the tracer's covered lines equal a hand-counted table for three suites;
  - the **equivalent mutant is found** and the precise suite scores 100% *after* exclusion, while a **broken variant** that counts it as a survivor must fail "precise suite scores 100%";
  - the killing-input search returns an input that does kill (re-run), or says "none in the domain" exactly when the mutant is equivalent.
- **Hostile input:** expected values are bounded integers (−1e6..1e6); weights outside 0 to 40 are refused with "this toy function is checked on 0 to 40"; at most 12 cases; duplicates collapse to one.
- **Honesty:** `Provenance toy`: "a toy function and a few mutation operators; real tools have dozens and smarter equivalence handling". `real`: "the evaluator runs for real in your browser".
**Phone.** `CodePanel` scrolls inside itself; the mutant table wraps to cards; the three-metric readout is three `Stat`s that wrap. No `minWidth`.

**`monorepo-polyrepo` · Monorepo vs Polyrepo**
Track `craft` · *"One repo to rule them all?"* · Builds on: `dependency-management`
**Starts where Tier 2 stops.** `build-systems`: "Monorepo tooling choices belong to T3 `monorepo-polyrepo`." This is the repository-structure decision and its cost of change, not a tool tour.
**Spec.**
- **Scene 1 · Change a shared library.** An **invented** system: `shared-lib` used by `api`, `web`, `billing` and `worker`, with `web` also depending on `api`. A `GraphView` draws it. The learner picks a change to `shared-lib` from chips: add an optional parameter (compatible), rename a function (breaking), change a return type (breaking). A **monorepo / polyrepo** toggle then plays it out.
  - **Monorepo:** one commit changes the library and every caller; CI runs the **affected set** (the packages that can reach the change through dependencies, computed); the commit lands atomically or not at all.
  - **Polyrepo:** the library releases a new major version; each consumer needs its own pull request to bump; the cascade runs in dependency order (`api` before `web`), each repo with an authored (invented) review latency. The panel counts PRs, the **calendar days until every consumer has moved** (the longest chain, computed), and a **version skew** table of who pins which version during the transition.
- **Scene 2 · The bill.** Repository size 5 to 500 packages (slider) with **affected-set detection** on or off. Each package costs a fixed 2 minutes of CI (named, illustrative); a seeded random dependency graph gives each change its affected set. With detection on, CI minutes per change grow with the average affected fraction; with it off they grow with the whole repo. The learner sees why a monorepo without good tooling is the expensive option, and that the tooling cost is the price of the atomic change.
- **Scene 3 · Ownership.** A file tree (a few dozen paths) and a **CODEOWNERS** rule editor. The learner adds or edits rules (pattern → team) in the lesson's **simplified** syntax (path prefixes and `*.ext`, last matching rule wins as in GitHub's file; verify against GitHub's documentation, and the stage says it is simplified). Four prepared pull requests show which teams must review each; unowned paths are listed in `--bad`, and a PR that needs five teams is flagged.
- **Scene 4 · It depends.** Factor sliders: number of teams, how much code is shared, need for independent release cadence, tooling capacity, access-control needs (some code that must be hidden from most engineers). A **ledger** lists the cost and benefit of **both** options for the current inputs (the option the lesson does not favour at these settings is shown just as fully). Every line is labelled `one view` or `common practice`. The learner can reach settings where each option wins.
**Out of scope.** Build-tool internals (`build-systems`: remote caches are named), git partial clone and large-file handling (named), branching strategy (`branching-workflows`), semantic versioning rules (`dependency-management`), the decisions of any real company (the lesson attributes none).
**Kit.** `GraphView` (`nodeMark` for the affected set; no underlay, so K3-5 is not needed), `CodePanel` (the CODEOWNERS file, K3-6, `onLineClick` to select a rule), `.data-table`, `Segmented`, `Toggle`, `Slider`, `ChipButton`, `TextField` (rule pattern), `Stat`, `GanttLanes` for the cascade timeline in days, `Provenance` with the claim kinds above.
**AC.**
- **Watch:**
  - packages are plain categories; the changed package `--hi`, the affected set `--orange`, untouched packages `--dim`;
  - a landed change `--ok`, a blocked change `--bad`, a pending one `--info`;
  - the cheap side of a comparison `--ok`, the costly side `--bad`;
  - CODEOWNERS teams are plain categories, unowned paths `--bad`.
- **Misconception:** "a monorepo means a monolith everyone can break" and "polyrepo means teams are independent". In a polyrepo the coordination moves into version bumps and skew. Quiz questions on both (who has to touch what when a shared type changes).
- **Correctness:**
  - the affected set equals "every package that can reach the changed one" against a brute-force transitive closure on 200 seeded DAGs;
  - the cascade duration equals the longest path (brute-force DFS) on the same DAGs;
  - semver classification of each chip (rename = breaking = major) agrees with the `dependency-management` rule, asserted in this lesson's test;
  - CODEOWNERS "last match wins" and prefix and extension rules are tested on 20 hand cases, including an unowned file;
  - the ledger is **not rigged**: sweeping the five factors over a grid, both options win somewhere (asserted).
- **Hostile input:** the rule pattern is path characters only, up to 40, rendered as text; an empty owner or empty pattern is refused; a duplicate pattern replaces the old rule with a note; the sliders are bounded.
- **Honesty:** every repo, number and latency is invented (`Provenance illustrative`: "invented repositories and review times"). CODEOWNERS syntax is simplified and labelled so. The decision ledger is `one view`.
**Phone.** `GraphView` at natural size, shrinking; the cascade timeline in a `WideRegion` (about 480); the ledger is two stacked cards. No `minWidth`.

---

##### Batch T3-B3 · Contracts & domains (`arch`, `data`, `craft`)
Wave 1. **[domain review]** for `schema-evolution` and `double-entry-ledgers`. Pilots **K3-4** (`SortTh`, `useSortedRows`, first user `api-versioning`'s compatibility matrix) and **K3-5** (`GraphView` `underlay` and the edge-label halo, first user `domain-driven-design`'s context map). Build order is the listed order: `schema-evolution` before `api-versioning` before `contract-testing`. **Kit missing (needed before wave 1):** `schema-evolution` needs a protobuf wire codec and the only one is local to `src/lessons/grpc-protobuf/model.ts` (`encodeVarint`, `zigzag32`, `tagOf`, `encode`, `readRecords`, `decode`). That is a second user, so the plan's rule (AC-0/T3 #25, "never a copy") means a kit item that extracts it to `src/core/protobuf.ts` and migrates `grpc-protobuf` pixel-identically, before this batch starts. It is not in plan §4.

**`schema-evolution` · Schema Evolution & Serialization Compatibility**
Track `data` · *"Old readers, new writers, nobody breaks"* · Builds on: `grpc-protobuf` · **[domain review]**
**Starts where Tier 2 stops.** `grpc-protobuf`: "Schema evolution rules beyond the one key idea (T3 `schema-evolution`)." That key idea is "never reuse or renumber a field number". This lesson is every other rule, run on real bytes.
**Spec.**
- **Scene 1 · Evolve a message (Protocol Buffers, real bytes).** A v1 schema (`id = 1`, `name = 2`, `qty = 3`) and a structured editor, never free text: **add a field** (pick a new number), **remove a field** (with and without a `reserved` line), **rename a field**, **change a type** (int32 → int64, int32 → string), **change a field number**, **reuse a removed number for a different type**. Both directions run on real bytes: a v1 writer's message read by the v2 reader, and a v2 writer's read by a v1 reader. The result table shows the decoded object, what was dropped or kept as unknown, or the error, each row with a reason computed from the decode (not scripted).
  - Expected outcomes the lesson earns: adding a field is safe both ways; removing is safe if the number is never reused; int32 → int64 is wire-compatible (both are varints; a value outside the narrower range is cut when read as int32); int32 → string is not (wire type changes: the reader skips or errors); reusing a number silently mis-reads old data.
  - A **binary / JSON** toggle shows that renaming a field is invisible in the binary encoding (names are never sent) and **breaks** the JSON mapping (proto3's JSON form uses field names, lowerCamelCase by default; verify against the protobuf language guide).
- **Scene 2 · Avro and a registry (real reader/writer resolution).** Schemas for a record with `int`, `long`, `string` and `boolean` fields. Avro data does not carry its schema, so the reader resolves **its** schema against the **writer's**: fields match by name, a reader field missing from the writer needs a default or it fails, a writer field the reader lacks is skipped, and `int → long → float → double` promotions are allowed (verify against the Avro specification's "Schema Resolution" section). The learner builds a version history (v1, v2, v3 by adding, removing, defaulting fields) and picks a compatibility mode: `NONE`, `BACKWARD`, `FORWARD`, `FULL` and their `_TRANSITIVE` forms (the vocabulary of Confluent Schema Registry, one vendor's names, `from memory`: verify against its docs, including that its default is `BACKWARD`). Each version pair is checked by **encoding sample values with the writer schema and decoding with the reader schema**, and the registry verdict is shown beside the real result. The built-in example is v1 `{a}`, v2 `{a, b default 0}`, v3 `{a, b without default}`: v3 passes plain `BACKWARD` (against v2) and fails `BACKWARD_TRANSITIVE` (against v1), which is the point of the transitive modes.
- **Scene 3 · A rolling deploy.** Three producers and three consumers upgrade one at a time in an order the learner chooses (consumers first, producers first, interleaved). The change is picked from chips (add a field with a default, add one without, remove a field, rename). Every message sent during the rollout is really encoded and decoded (Avro scene's codec), and a counter shows how many decode failures the window produced. The learner discovers that **backward-compatible changes want consumers upgraded first and forward-compatible changes want producers first**, and that a change that is neither needs a two-step rollout (add, migrate, then remove). Links `deployment-strategies` for the rollout shape.
**Out of scope.** The wire format itself (varints, tags: `grpc-protobuf`), HTTP API versioning and deprecation (`api-versioning`, next lesson, named in words), consumer-driven contracts (`contract-testing`, later), database migrations (`zero-downtime-migrations`, wave 6), event-sourcing upcasters (named only), JSON Schema and `oneof`/`map` details.
**Kit.** The new `core/protobuf` extraction (see batch note), `ByteGrid` (`fields` colour tag, length and value bytes; `perRow` 8 on a phone), `CodePanel` (schemas, K3-6), `.data-table` (results), `ChipButton`, `Segmented` (mode, direction), `TextField` + `parseBoundedInt` (field number), `GanttLanes` or `SequenceDiagram` for the rolling deploy (producers and consumers as lanes over time), `core/bytes`, `Provenance`.
**AC.**
- **Watch:**
  - schema fields are plain categories; tag bytes `--violet`, length bytes `--info`, value bytes `muted`;
  - a decode that succeeded with all data `--ok`, one that dropped data silently `--orange` (the worst kind: no error), a decode error `--bad`;
  - an unknown field kept for pass-through `--dim`;
  - in the rollout, a failed message `--bad` and a clean one `--ok`.
- **Misconception:** "adding a field is always safe", "renaming is harmless in protobuf", and "backward-compatible means old and new can both talk to each other". Quiz questions: a v3 schema that passes `BACKWARD` but not `BACKWARD_TRANSITIVE`, and "which deploy order does a backward-compatible change need?".
- **Correctness:**
  - the protobuf codec reproduces the published examples: field 1 varint 150 is `08 96 01`, and field 2 string `"testing"` is `12 07 74 65 73 74 69 6e 67`; `sint32` zigzag gives −1 → 1 and 1 → 2;
  - the Avro codec reproduces the specification's examples: `long 3` is `06`, `long 64` is `80 01`, `string "foo"` is `06 66 6f 6f`;
  - **independent oracle for compatibility**: on 200 seeded random schema pairs the rule-based checker's verdict is compared to the **actual round trip** (encode sample values with the writer, decode with the reader, compare to the expected resolution), and they must agree on every pair;
  - the transitive modes are checked on the v1/v2/v3 history above and on 100 seeded histories;
  - **the rollout invariant** (over every change × every upgrade order, exhaustively): failures = 0 exactly when the change satisfies the direction the order needs (an exhaustive table test, so it is a statement over all orders, not a screenshot);
  - a **broken variant** checker that ignores defaults must disagree with the round trip on the preset.
- **Hostile input:** field numbers through `parseBoundedInt` in 1 to 536,870,911 (2²⁹ − 1), refusing 0 and the implementation-reserved range 19,000 to 19,999 (verify against the protobuf docs) with the reason; names are `[a-z][a-z0-9_]{0,19}` and a duplicate name or number is refused; at most 8 fields; a record with no fields is allowed and shown; no free-text schema is parsed.
- **Honesty:** `Provenance real` ("the encoders and decoders are the lesson's own implementations of the two formats, run here") and `from memory` on the compatibility-mode names, the Confluent default, the reserved range and the JSON naming rule, each with its source to verify.
**Phone.** `ByteGrid` at 8 per row; the result table collapses to one card per row at ≤ 900 px; the rollout lanes sit in a `WideRegion` (about 480). No `minWidth` on the stage.

**`api-versioning` · API Versioning & Backward Compatibility**
Track `arch` · *"An API is a promise you keep for years"* · Builds on: `schema-evolution`, `rest-api-design`
**Starts where Tier 2 stops.** `rest-api-design`: "...versioning and deprecation (T3 `api-versioning`)..." This lesson owns changing an HTTP API that other people's code calls.
**Spec.**
- **Scene 1 · Change the API.** A `GET /users/42` JSON response and a catalogue of changes as chips: add an optional response field; add a **required** request field; remove a response field; rename a field; change a type (`id` number → string); tighten validation; change the default sort order; change an error code; reorder object keys. Four tiny **real** client functions, authored in the lesson, parse the real JSON with `JSON.parse` and use it:
  - a mobile app that reads `name` and `email` and ignores anything else (a *tolerant reader*, a long-standing practice often credited to Postel's law and to Martin Fowler's writing, `common practice`);
  - a partner integration that validates the response against a **closed schema** (unknown fields rejected);
  - a web page that formats `id`, `name` and `created`;
  - a batch job that sends requests and relies on the default sort.
- Applying a change re-runs the four clients against the old and the new responses. The result is a **compatibility matrix** (changes × clients) in a sortable table (K3-4 `SortTh` with `aria-sort`: by change, by number of clients broken, by class) with a per-cell reason from the run ("`user.name` is undefined", "unexpected property `nickname`"). "Breaking" is shown as a property of a **(change, client)** pair: adding a field breaks only the strict client.
- **Scene 2 · Versioning strategies.** Pick a strategy (a version in the URL path, in a request header, in a query parameter, a dated version, or no versions with additive-only evolution) and a change. The lesson builds the real request line and headers for each, and shows the consequences: whether a shared cache can tell versions apart (a header version needs `Vary`), where routing happens, how many versions must be kept alive. A **cost of versions** panel multiplies an illustrative per-version maintenance cost by the versions live, against how long migrations take.
- **Scene 3 · Deprecation and sunset.** `GanttLanes` on a calendar axis: a deprecation announcement, a sunset date, and four clients that migrate at their own authored lags (one never does). The learner sets the window between announcement and sunset (30 to 730 days) and sees who is still on the old version at the sunset date. Choices on a missed client: extend, run a **brownout** (a planned, temporary failure to get attention, `common practice`), or break it; each shows its cost. The `Sunset` header is RFC 8594 (verify); the `Deprecation` header has been standardised more recently (verify the RFC number before quoting it).
**Out of scope.** Wire-level schema rules (`schema-evolution`), consumer-driven contract tests (`contract-testing`, next lesson, named in words), GraphQL's additive-only practice (`graphql`; named), authentication changes.
**Kit.** K3-4 (`SortTh`, `useSortedRows`: the pilot), `GanttLanes` (markers for announce and sunset, `now`), `CodePanel` (request and response, K3-6), `.data-table`, `ChipButton`, `Segmented`, `Slider`, `Toggle`, `core/format`, `Provenance`.
**AC.**
- **Watch:**
  - clients are plain categories (`amber`, `sky`, `pink`, `orange`);
  - a client that still works is `--ok`, one that breaks `--bad`, a client that works but with changed behaviour (the sort-order change) `--orange`;
  - on the timeline, the announcement `--info`, the sunset `--hi`, a client still on the old version past sunset `--bad`, and a migrated client `--ok`;
  - the sorted column header shows the active sort (`aria-sort`).
- **Misconception:** "additive changes are always non-breaking" (a strict reader breaks), and "putting `/v2` in the URL solves versioning". Quiz questions on each.
- **Correctness:**
  - the matrix is recomputed by really running 9 changes × 4 clients, and compared with a hand-authored 36-cell expected matrix in the test (an independent oracle derived by reasoning, not copied from output);
  - a change's class ("breaking for a tolerant reader" versus "breaking for a strict one") is derived from which clients broke;
  - date arithmetic uses UTC day counts: the announce → sunset gap and the clients' lags are tested across a leap day and a year boundary;
  - the clients still on v1 at sunset are exactly those with lag > window (a property over all windows);
  - the sorted table is stable and the `aria-sort` value cycles ascending, descending, none (K3-4's own tests plus one here).
- **Hostile input:** the one typed value is a new field name, `[a-z_]{1,20}`, rendered as text, a duplicate refused; window and rates are sliders; JSON is generated by the lesson, never parsed from the learner.
- **Honesty:** `Provenance illustrative` for the clients, their lags and the maintenance cost ("invented clients"); `real` for the JSON parsing and client functions; `from memory` for header names and RFC numbers.
**Phone.** The matrix scrolls inside a `WideRegion` (about 520), its header buttons keep a 44 px target; the timeline is a `WideRegion` (about 480). Controls wrap.

**`contract-testing` · Consumer-Driven Contract Testing**
Track `craft` · *"Catch breaking API changes before deploy"* · Builds on: `api-versioning`
**Starts where Tier 2 stops.** `test-doubles`: "Contract tests between services belong to T3 `contract-testing`." That lesson replaced a dependency with a double; this one makes sure the double and the real thing still agree.
**Spec.**
- **Scene 1 · The consumer writes down what it uses.** A web app calls `GET /users/42`. The learner ticks which response fields the consumer **actually reads** (`id`, `name`, optionally `email`, `plan`), with type matchers (integer, string, any value). The lesson writes a **contract file** (our own simplified, Pact-inspired JSON; stated on screen as not Pact's real format) listing only the used fields with their matchers, never the values.
- **Scene 2 · The provider verifies.** A small provider handler function (authored, real) is edited with chips: rename `name` to `fullName`, remove `email`, add `nickname`, change `id` to a string, change the status code, change `amount` from cents to dollars. **Verify** replays the contract against the real handler with a hand-written type-matcher and prints a mismatch path per failure (`$.body.name: expected string, got nothing`). Removing a field **no consumer uses** passes (no false alarm), which a full-schema test would not.
- **Scene 3 · Can I deploy?** A matrix of consumer versions × provider versions with each pair's verification result, and a deploy gate computed from it ("provider v2 cannot go out: consumer v5's contract fails"). The learner releases versions and watches the gate. This is the idea behind tools such as Pact's broker and `can-i-deploy` (named, from memory; verify against Pact's docs).
- **Scene 4 · What a contract cannot see.** The `amount` cents → dollars change keeps the **shape** (still a number), so every contract passes and the app charges 100 times too little. This is the lesson's honest failing state: contracts check shape and agreement, not meaning; keep a behaviour test for meaning. A cost panel compares contracts with end-to-end tests: with n services and e dependency edges, n deployed environments for e2e versus e independent verifications for contracts (computed, links `test-pyramid`).
**Out of scope.** Pact's real file format and broker (named), schema compatibility rules (`schema-evolution`), end-to-end test design (`test-pyramid`), provider state management and pending pacts (named only).
**Kit.** `CodePanel` (the contract JSON and the provider handler, K3-6), `.data-table` (matrices), `ChipButton`, `Segmented`, `Toggle`, `TextField` (an optional pasted response), `Stat`, `GraphView` (n services, e edges, optional), `Provenance`.
**AC.**
- **Watch:**
  - used fields `--info`, unused fields `--dim`;
  - a passing interaction `--ok`, a mismatch `--bad`, the mismatch path `--hi`;
  - the can-i-deploy gate open `--ok` and closed `--bad`;
  - the meaning change that slips through is `--orange` (a green check that is wrong).
- **Misconception:** "contract tests replace integration or end-to-end tests", and "the provider owns the contract". Quiz questions on each (the cents-to-dollars case is a quiz question).
- **Correctness:**
  - the type matcher is tested on a table of 30 hand-written cases (null, arrays, nested objects, extra fields allowed, missing fields, numbers vs numeric strings) and its mismatch paths;
  - the can-i-deploy matrix equals a brute-force check over all version pairs on 200 seeded histories;
  - **property:** removing a field the contract does not name never changes a verification result, over 1,000 seeded mutations;
  - the cents-to-dollars change passes verification (asserted) and the lesson text says so, derived from the result (rule 14);
  - a **broken variant** that verifies against the full provider schema must fail "unused removals pass".
- **Hostile input:** a pasted response is real `JSON.parse`d, size ≤ 2 KB, depth ≤ 6; invalid JSON shows the parser message; the matcher walks own keys only, with a test on a JSON body containing a `__proto__` key; nothing is evaluated.
- **Honesty:** `Provenance toy` ("a simplified contract format inspired by Pact; real tools do more") and `real` for the handler and matcher runs; `from memory` for the named tools.
**Phone.** Contract and handler panels stack and scroll inside themselves; the matrices scroll in a `WideRegion` (about 440). No `minWidth` on the stage.

**`domain-driven-design` · Bounded Contexts & Domain-Driven Design**
Track `arch` · *"'Customer' means three different things here"* · Builds on: `monolith-microservices` (**described in words only; link it by id once the R2 retrofit has merged**, plan §5)
**Starts where Tier 2 stops.** `coupling-cohesion`: "Service boundaries belong to `monolith-microservices`. Bounded contexts belong to T3 `domain-driven-design`." and `layered-hexagonal`: "Service splits belong to `monolith-microservices`. Bounded contexts and aggregates belong to T3 `domain-driven-design`." This lesson draws the boundary inside the model, before anyone talks about services.
**Spec.**
- **Scene 1 · One model to rule them all.** A single invented `Customer` with 14 attributes (name, email, billing address, shipping address, tax id, payment terms, credit limit, support tier, ticket history, loyalty points, preferred carrier, delivery notes, marketing opt-in, SLA). A `CellGrid` matrix shows which of four teams (billing, shipping, support, marketing) reads or writes each attribute. Change-request chips ("support renames `tier`", "billing changes the tax-id format") count the teams whose code must change; a **blast radius** bar is computed from the matrix. The default state shows one concept with 14 attributes and every change touching 3 teams.
- **Scene 2 · Draw the boundaries.** `GraphView`, 9 invented concepts (Customer, Order, Invoice, Payment, Shipment, Address, Ticket, Product, LoyaltyAccount) with weighted usage edges, and **context regions as an underlay** (K3-5): Billing, Fulfilment, Support. The learner assigns each concept to a context by selecting it and choosing a region (a keyboard path: select, then press 1 to 3). Computed live: **cross-context edges** (the coupling), the share of edges inside contexts (cohesion), and concepts that serve **two contexts with different meanings**. The learner **splits** `Customer` into one model per context (Payer, Recipient, Requester) joined only by a shared id; after a split, cross-context edges that crossed `Customer` become **translated** edges (a published contract or an adapter layer) and are drawn dashed with a halo label.
  - An edge that still reaches into another context's *internal* model (not through a contract) is flagged "direct dependence on another context's internals".
  - The learner may label each cross-context edge with a relationship pattern (customer/supplier, conformist, anticorruption layer, shared kernel, published language), each with an authored consequence and cost; definitions are those of Eric Evans's *Domain-Driven Design* (2003) as recalled here: **verify against the book** before the build ships them.
- **Scene 3 · Where the boundary of consistency goes.** An **Order** may hold at most 5 lines. Two actors each read the order (4 lines) and add a line. With order lines as independent records, both checks pass and the order ends with 6. With the **Order as an aggregate root** and a version check (optimistic concurrency, `optimistic-pessimistic-locking`), the second writer fails and retries. The lesson **enumerates every interleaving** of the two read-check-write sequences (6 of them) and shows how many violate the rule in each design.
**Out of scope.** Splitting a monolith into services (`monolith-microservices`), event storming and CQRS (named only; `event-sourcing` is the registered neighbour), sagas and cross-aggregate transactions (`distributed-transactions` is registered at Tier 4, not linked), team topologies.
**Kit.** K3-5 (`GraphView` `underlay` for context regions, halo on edge labels, the pilot), `GraphView` (`nodeMark`, `edgeMark`, keyboard assignment), `CellGrid` (attribute × team matrix), `Segmented`, `ChipButton`, `.data-table`, `Stat`, `Bar`, `Provenance`.
**AC.**
- **Watch:**
  - contexts are plain categories (`amber`, `sky`, `pink`) drawn as regions;
  - a concept inside its context takes the region tone, an unassigned concept `muted`;
  - an edge inside a context `--ok`, a raw cross-context edge `--bad`, a translated edge `--violet` dashed, the flagged internal-reach edge `--orange`;
  - a violated invariant in the aggregate scene `--bad`, a prevented one `--ok`.
- **Misconception:** "one shared Customer model is DRY, so it is good", and "a bounded context is the same as a microservice". Quiz questions on each.
- **Correctness:**
  - cross-context edge count, cohesion and blast radius are recomputed from the assignment by a straight loop in the test;
  - **the authored suggested partition is the best one**: the test enumerates all 3⁹ = 19,683 assignments, keeps those where each context has 2 to 5 concepts and the three `Customer` meanings do not share a model, and asserts none has fewer cross-context edges than the lesson's suggestion (if one does, the authored answer is wrong);
  - the aggregate scene's 6 interleavings: without a version check 4 of the 6 (those where both read before either writes) end with 6 lines, and the 2 serial ones end at 5 because the second add is correctly refused; with the version check 0 of 6 violate (the loser retries, sees 5 lines and is refused), all derived by running them;
  - every split concept keeps an identity link (tested), and a split with a dangling reference is flagged.
- **Hostile input:** drag has a keyboard twin (select, then 1 to 3); a concept cannot be in two contexts at once (a split is the only way to be in two); there is no typed input.
- **Honesty:** `Provenance illustrative` ("an invented shop, a toy map") and `from memory` on the relationship-pattern definitions ("as recalled from Evans, 2003; check the book"). The suggested partition is labelled one reasonable answer, not the answer.
**Phone.** `GraphView` at natural size, shrinking (9 nodes), inside a `WideRegion` (about 560) because the regions and halo labels would drop under 8 px; the matrix uses `CellGrid` at `size="sm"`. Controls wrap.

**`double-entry-ledgers` · Money, Ledgers & Double-Entry Bookkeeping**
Track `arch` · *"Every cent has two sides"* · Builds on: `floating-point` · **[domain review]**
**Spec.**
- **Scene 1 · Why not floats.** The learner picks a representation (JavaScript `number` as dollars, integer cents, `BigInt` cents) and a number of payments (10 to 10,000,000) of $0.10. A real loop sums them and a balance check compares the sum to the expected total: the float sum is not equal to 1000 at 10,000 payments, and the drift is printed from the run; integer cents are exact. A **split the bill** preset divides $100.00 three ways: naive rounding loses a cent (33.33 × 3 = 99.99); the **largest-remainder** allocation gives 33.34, 33.33, 33.33 and sums exactly. A **tax rounding** preset applies a per-line vs per-total rounding rule and shows the two totals differ by a cent; the lesson says which step is rounded is a **business rule**, not a maths fact. Adding USD to EUR is refused ("no conversion rate was applied").
- **Scene 2 · Post journal entries.** A tiny chart of accounts (Cash, Accounts Receivable, Inventory, Accounts Payable, Revenue, Expenses, Equity). Entry templates ("customer pays an invoice", "sale on credit", "pay a supplier", "buy supplies with cash") and free-form lines (account, debit or credit, amount typed as `12.34`). **An entry is posted only if its debits equal its credits;** an unbalanced entry is refused with "nothing was posted" and the difference. A **T-account** view and a **trial balance** (total debits = total credits) update on every post, with accounts shown in their normal-balance column (assets and expenses increase with debits; liabilities, equity and revenue with credits, the standard convention).
- A **"bypass validation" (bug)** toggle lets an unbalanced entry in; the trial balance then fails by exactly that difference. The learner **finds the bad entry by bisection**: a subtotal button checks the books up to entry k, and the learner halves the range until the first imbalance appears (the lesson counts steps against ⌈log₂ n⌉).
- **Scene 3 · Append-only.** The ledger rows cannot be edited or deleted: "edit" is refused with the reason, and a correction is a **reversing entry** (debits and credits swapped) followed by the right entry, so history is kept and the balances are correct. Posting the same transaction id twice is refused (links `idempotency-keys`). A small **bank reconciliation** matches bank lines to ledger rows; the unreconciled difference equals the sum of outstanding items, computed.
**Out of scope.** Tax law and accounting standards, multiple currencies beyond the refusal above, period closes and accruals, `event-sourcing` (a ledger is like an event log; `event-sourcing` is linked), distributed transactions (Tier 4).
**Kit.** `.data-table`, `.log-row` (shared kit class) for ledger rows, `TextField` (amounts), `ChipButton` (templates), `Segmented` (representation), `Toggle` (bypass), `Stat`, `CodePanel` for the one-line formulas, `core/format`, `Provenance`.
**AC.**
- **Watch:**
  - debit side `--info`, credit side `--violet` (two plain roles, never ok/bad);
  - a balanced entry or balanced trial balance `--ok`, an imbalance `--bad`;
  - the float drift `--bad` (the costly side) and integer cents `--ok`;
  - the bisection range `--hi`, the culprit entry `--bad`;
  - a reversing entry `--orange`.
- **Misconception:** "double-entry means every transaction is stored twice as a backup", and "debit means decrease and credit means increase". Which one grows depends on the account type. Quiz questions: a customer pays a $100 invoice (debit Cash 100, credit Accounts Receivable 100), and what a debit does to a liability.
- **Correctness:**
  - the real float loop is run in the test: 10,000 × 0.1 does not equal 1000, and 10,000 × 10 cents equals 100,000 cents exactly;
  - largest-remainder allocation sums to the total and is within one cent of the ideal share for 10,000 seeded (total, parts) pairs;
  - **ledger invariant** (property test, 200 seeds, random sequences of accepted entries): total debits equal total credits after every post;
  - with the bypass bug, the trial-balance difference equals the injected entry's imbalance on every seed, and bisection finds it in at most ⌈log₂ n⌉ + 1 steps;
  - the amount parser: `12.34` accepted; `12.345`, `1e3`, `-5`, `12,34`, full-width digits and anything above 1e12 refused;
  - a **broken variant** (a ledger that posts without checking) must fail the invariant test.
- **Hostile input:** amounts go through a strict local money parser that yields `BigInt` cents (never a double); at most 2 decimals; negative amounts refused (a debit or credit side expresses direction); an unknown account, an empty entry and a one-line entry are refused with a reason; the entry count is capped at 500.
- **Honesty:** `Provenance real` for the float arithmetic ("real JavaScript arithmetic runs here"), `simulated` for the company and bank, and a plain note: "Simplified bookkeeping, not accounting or legal advice. Real systems add currencies, tax, periods and controls; many jurisdictions expect an audit trail, so check yours."
**Phone.** T-accounts stack; the entry editor wraps; the ledger is a wrapping list of `.log-row`s. No `minWidth`.

---

##### Batch T3-B4 · Time & consistency (`arch`, `data`)
Wave 2, **every lesson [domain review]**, and the hardest batch of the tier: build it with the most review (two reviewers, plan §3). First pilot of **K3-8 `distSim`** (`createCluster`, `partition`, `crash`, `dropNext`, `checkInvariants`, `forSeeds`, `toSequence`); K3-7 `Provenance` and K3-1 samplers are available; the wave 1 retrofit R1 (`cap-theorem`, `replication`, `isolation-levels`) has merged, so those three may be linked. Build order is the listed order, since each lesson stands on the previous one, and the **history checkers** written in `consistency-models` are reused by `quorums`.

Rules every lesson in this batch follows (AC-0/T3 #20, written once):
- Each simulation has a **broken mode** and a **fixed mode**, and names the **safety invariant** that the broken mode must violate. The harness runs ≥ 500 seeds of the fixed mode with injected delay, loss, duplication, crash and skew, checking the invariant **at every step**, and records `BROKEN_SEED` (the lowest violating seed) as in the conventions at the top of this file. A hand-built schedule that violates the invariant is also tested, so no result depends on a lucky seed.
- Liveness (every operation eventually completes) is stated on its own line in each spec and is never claimed from a safety test.
- The counterexample trace is shown on screen when a violation occurs (`toSequence` into `SequenceDiagram`), with the seed.
- **Kit missing (K3-8 additions to request before wave 2):** (1) **register-history checkers**: `linearizable`, `sequential`, `causal` and a convergence check over a history of reads and writes. `consistency-models` and `quorums` both need them in this batch (and the R1 retrofit of `cap-theorem` and `replication` wants them too), so they belong in `core/distSim/invariants.ts`, not in one lesson. (2) the `latency` callback of `createCluster` should receive `(rnd, from, to)` so a link can be asymmetric, which `physical-clocks-skew` needs for NTP's symmetric-path assumption.

**`physical-clocks-skew` · Physical Clocks, NTP & Clock Skew**
Track `arch` · *"Every server's watch is wrong, differently"* · Builds on: `time-and-timezones` · **[domain review]**
**Starts where Tier 2 stops.** `distributed-id-generation`: "Clock sync and NTP (T3 `physical-clocks-skew`)..." That lesson only assumed a clock; this one is why you cannot.
**Spec.**
- **Scene 1 · Drift.** Five nodes. A node's local clock is `local(t) = offset + t·(1 + drift·10⁻⁶)` (`distSim` `clocks: [{ offsetMs, driftPpm }]`). Per-node sliders: drift ±200 ppm and offset ±1,000 ms. A `Plot2D` of **skew against true time** runs over simulated hours; 1 ppm is 86.4 ms a day, so 50 ppm is 4.32 s a day (printed from the model). Presets: "a good oscillator" and "a bad one" are labelled illustrative (real drift of ordinary quartz clocks is tens of ppm, `from memory`: verify against a datasheet).
- **Sync.** A "sync" control runs NTP's **four-timestamp exchange** through the cluster on real messages: client sends at t₀ (its clock), server receives at t₁ and replies at t₂ (its clock), client receives at t₃. The estimate is θ = ((t₁ − t₀) + (t₂ − t₃)) / 2 and the round-trip delay δ = (t₃ − t₀) − (t₂ − t₁) (the formulas of the NTP specification, RFC 5905; verify). A poll interval slider (1 to 1,024 s) gives a **sawtooth**: error grows at the drift rate between syncs and snaps back, so the worst error is about drift × poll interval (50 ppm × 1,024 s ≈ 51 ms, computed). A **step / slew** toggle shows that a step can move the clock **backwards** (and the lesson shows `Date.now()` going backwards, with the monotonic clock used for durations named), while slewing adjusts the rate gently. Typical thresholds and rates for stepping and slewing differ by implementation and are `from memory`, not shown as constants.
- **Asymmetric paths.** Two sliders set the forward and return delay. The offset estimate is wrong by (d_forward − d_return) / 2 even when both clocks are perfect, because NTP assumes the path is symmetric; the stat shows the error and the formula.
- **Scene 2 · Bugs that time causes.** Three scenarios run on `distSim` with skew injected by the learner.
  - **Last-write-wins loses the later write.** Replica A's clock is 5 s fast. A client writes x = 1 through A at true time 100.0 (stamped 105.0); a second client writes x = 2 through B, accurate, at true time 102.0, after the first was acknowledged. LWW keeps x = 1.
  - **A lease two holders believe in.** A lease expires at absolute time 10 s (server time). The holder's clock is 3 s slow, so it believes it holds the lease until true time 13. Another node is granted it at 10.5. A **margin** toggle makes the holder stop early by a safety margin. Offsets break absolute timestamps and drift breaks durations; both are small, neither is zero. (Pauses and fencing belong to `leases-fencing`, wave 7, named in words.)
  - **The effect before the cause.** A log merged by timestamp shows a reply before its request when the replier's clock is behind.
- **Scene 3 · Intervals instead of instants.** Every timestamp becomes an interval [t − ε, t + ε] (the idea of Google's TrueTime, whose API returns an interval; from the Spanner paper, `from memory`: verify). Two events are ordered only when their intervals are disjoint. A **commit-wait** toggle makes a writer stamp s = now + ε and acknowledge only when its clock minus ε exceeds s, so any write that starts after the acknowledgement gets a larger stamp (the wait is 2ε in this model). The learner moves ε from 0 to 20 ms and sees the share of event pairs with a decidable order against the gap between them, and the write latency that pays for it.
**Out of scope.** Logical and vector clocks (`logical-clocks`, next lesson), consensus, GPS and atomic-clock hardware (named), leap-second handling beyond one chip (UTC has had 27 leap seconds since 1972 and the practice is being retired; `from memory`, verify against IERS/BIPM), and smearing (named as an operational choice).
**Kit.** K3-8 (`createCluster` with `clocks`, `crash`, `forSeeds`, `checkInvariants`, `toSequence`), `SequenceDiagram` (the NTP exchange and the LWW trace), `Plot2D` (`Curve` per node, `VLine`), `GanttLanes` (lease intervals on the true-time axis), `Slider`, `Toggle`, `Segmented`, `Stat` (K3-3), `core/format` (`ms`, `duration`), `Provenance`.
**AC.**
- **Watch:**
  - nodes are plain categories; true time is a `--dim` reference line;
  - a node's skew `--info`, a sync step `--hi`;
  - a write that was acknowledged later but lost `--bad`, the surviving wrong value `--orange`;
  - in the lease scene, the overlap between two believed holdings `--bad`;
  - an interval whose order is decidable `--ok`, ambiguous `--violet`.
- **Misconception:** "NTP makes all clocks agree" and "wall-clock time never goes backwards". Quiz questions: which clock to time a duration with, and what LWW does when the later write has an earlier stamp.
- **Correctness:**
  - the clock model matches hand arithmetic (50 ppm for 86,400 s is 4.32 s);
  - NTP formulas against hand-worked exchanges: t₀ = 100, t₁ = 130, t₂ = 131, t₃ = 161 gives θ = 0 and δ = 60; with the server 50 ahead (t₁ = 180, t₂ = 181) θ = 50; with forward 10 and return 50 and perfect clocks (t₁ = 110, t₂ = 111, t₃ = 161) θ = −20, which is (10 − 50)/2;
  - **invariant (LWW):** "if write 2 starts after write 1 was acknowledged, write 2 wins at every replica once messages are delivered". The broken mode (raw skewed timestamps) violates it on the hand-built schedule above and on `BROKEN_SEED`; the commit-wait mode holds it on ≥ 500 seeds whenever every clock is within ε of true time, and the test also runs seeds where a clock exceeds ε and asserts the violation returns (the guarantee is only as good as the bound, which the lesson says);
  - **invariant (lease):** "at most one node believes it holds the lease at any true time": broken without margin on the schedule above, held with margin ≥ skew;
  - same seed gives the same trace;
  - liveness (every write is acknowledged) is a separate test with a bounded delay, not implied by the safety one.
- **Hostile input:** sliders bounded (drift ±200 ppm, offset ±1,000 ms, ε 0 to 20 ms, poll 1 to 1,024 s); ε = 0 is allowed and shows no commit wait; seed as in the conventions.
- **Honesty:** `Provenance simulated` with seed on every run; `from memory` on drift figures, NTP defaults, leap-second counts and the TrueTime description, each with its source to check; a note that real NTP clients use filtering and multiple servers.
**Phone.** The skew plot at 356; the NTP sequence diagram in its `WideRegion`; the lease timeline is a `WideRegion` (about 440). Sliders wrap.

**`logical-clocks` · Lamport & Vector Clocks**
Track `arch` · *"Ordering events without a shared clock"* · Builds on: `physical-clocks-skew`, `crdts` (registered Tier 4 lesson; soft link, rule 25: read `crdts`' claim about per-replica counters merged by max before writing this one) · **[domain review]**
**Starts where Tier 2 stops.** `relations-orders`: "happens-before as a partial order is T3 `logical-clocks`." That lesson stated partial orders; this one builds the clocks that track one. Merge semantics stay in `crdts`.
**Spec.**
- **Scene 1 · Draw an execution.** Three process lanes on a shared left-to-right axis. The learner adds **events** by clicking a lane or by a button (keyboard: arrows to a lane and position, Enter), and **messages** by choosing a send event and then a later position on another lane (a message cannot point left: "a message can't arrive before it is sent"). Presets: "A causes B through two messages", "two concurrent writes", "a gossip chain". Each event shows its **Lamport** timestamp and its **vector** timestamp as it is assigned, with the rule in force highlighted:
  - Lamport: local event or send, L ← L + 1; receive, L ← max(L, message) + 1;
  - vector: local event or send, V[i] ← V[i] + 1; receive, V ← componentwise max(V, message), then V[i] ← V[i] + 1.
- **Scene 2 · Happened-before or concurrent?** The learner clicks two events. The verdict comes three ways: **ground truth** (reachability through process order and message edges, computed from the graph and independent of any clock), what **Lamport** order implies, and what the **vector** comparison says (V(a) < V(b) means a happened before b; incomparable means concurrent). A "**find me a pair**" button lists pairs with L(a) < L(b) that are in fact concurrent (the converse of the clock condition fails), computed. The two theorems are shown with their direction: a → b implies L(a) < L(b), but not the reverse; a → b if and only if V(a) < V(b).
- **Scene 3 · Use it.** A replicated register on `distSim` (three replicas, clients writing through different ones, seeded delays).
  - **Broken mode:** last-writer-wins on Lamport stamps with ties broken by node id. Two concurrent writes: one is silently thrown away.
  - **Fixed mode:** vector-stamped versions kept as **siblings** when concurrent (the approach of Dynamo-style stores, `from memory`: verify against the Dynamo paper), and a client **resolves** them by picking or merging, which writes a version that dominates both.
  - Safety invariants, checked at every step: **(1)** no write is discarded while it is concurrent with a surviving write; **(2)** the sibling set holds only maximal versions (no causal ancestor of another sibling). A second broken variant (never prune ancestors) violates (2).
  - A "vector size" readout shows the vector grows with the number of writers (mitigations such as dotted version vectors are named only).
**Out of scope.** CRDT merge and convergence (`crdts`), hybrid logical clocks (Tier 4), causal broadcast delivery (named), consensus, clock sync (previous lesson).
**Kit.** K3-8 (`createCluster`, `forSeeds`, `checkInvariants`, `toSequence`), a local editor on `SequenceDiagram`-style lanes (custom SVG that reuses the scene CSS classes; one user), `SceneNode`, `Flyer` for messages, `ChipButton` (presets), `Segmented` (clock type), `.data-table`, `Stat`, `useScenePicker`, `Provenance`.
**AC.**
- **Watch:**
  - process lanes are plain categories; an event the learner selected `--hi`;
  - messages `--info`, vector components that were bumped by this event `--violet`;
  - happened-before `--ok`, concurrent `--orange` (concurrency is a fact, not an error), a clock verdict that is wrong about the ground truth `--bad`;
  - a silently discarded write `--bad`, a kept sibling `--ok`.
- **Misconception:** "if L(a) < L(b) then a happened before b". Quiz question: two events on different processes with Lamport stamps 3 and 5 and no message path between them are concurrent.
- **Correctness:**
  - **ground truth is independent of the clocks:** happened-before is computed as the transitive closure of process order plus message edges; the vector comparison equals it on 300 seeded random executions (and on executions produced by `distSim` traces), and the Lamport clock condition (a → b implies L(a) < L(b)) holds on every one;
  - the converse fails on at least one execution (asserted to exist, so the "find me a pair" button never comes back empty on its preset);
  - a **broken vector clock** that forgets the componentwise max on receive must fail the "vector equals ground truth" test;
  - the two register invariants: broken LWW violates (1) on the hand-built schedule (two clients write before any message is delivered) and on `BROKEN_SEED`; vector mode holds (1) and (2) for ≥ 200 seeds with delay, loss, duplication and crashes; the never-prune variant violates (2);
  - liveness (a resolved write eventually reaches every replica when messages are eventually delivered) is tested apart.
- **Hostile input:** at most 4 lanes and 14 events; a message to an earlier position, to the same event, or a second message from one send event to the same receive event is refused with the reason; no typed input except the seed.
- **Honesty:** `Provenance simulated` (seed) and a credit: "Lamport clocks are from Lamport's 1978 paper, vector clocks from independent work in the late 1980s (Fidge, Mattern); from memory". The register is a teaching model, not a database.
**Phone.** The lanes sit in a `WideRegion` (about 520); timestamps are drawn at ≥ 9 px; the three-way verdict stacks beneath. No `minWidth`.

**`consistency-models` · Linearizability vs Serializability vs Eventual**
Track `arch` · *"Which 'consistent' did you actually mean?"* · Builds on: `cap-theorem`, `logical-clocks`, `isolation-levels` · **[domain review]**
Scope line (plan §1.3): **system-level models for a single register**, checked against histories. Transaction anomalies and the level names stay in `isolation-levels`; the partition trade-off stays in `cap-theorem`.
**Spec.**
- **Scene 1 · Put operations on a timeline.** Three client rows over 20 integer time slots. The learner adds **writes** (`W(x=v)`) and **reads** (`R(x) → v`) as bars with an invocation slot and a response slot (a pointer or keyboard step to set each end; chips for the value). One register `x`, initially 0; every write uses a distinct value; one outstanding operation per client. Four verdict pills update live, each from a real checker:
  - **linearizable:** some total order of all operations respects **real time** (an operation that finished before another began comes first) and the register's behaviour (a read returns the latest preceding write);
  - **sequentially consistent:** some total order respects each client's **own** order and the register's behaviour, with real time across clients ignored;
  - **causally consistent:** each client has a serialisation of its own operations plus all writes that respects causality (program order plus reads-from, closed transitively); verify the formulation against Ahamad et al. (1995) or the Viotti and Vukolić survey (`from memory`);
  - **eventually consistent (converged):** after a final "quiet" read at every client, all clients read the same value.
  For a failing model the lesson highlights a **smallest violating subset** (found by deleting operations until the history passes) and says in words which rule it breaks.
- **Presets** (each pins a distinct verdict profile): **stale read after an acknowledged write** (linearizable ✗, sequential ✓); **read your own write fails** (C1 writes 1 then reads 0: sequential ✗, causal ✗, converged ✓ if the quiet reads agree); **concurrent writes seen in two orders** (W(1) and W(2) concurrent, one observer reads 1 then 2 and another 2 then 1: causal ✓, sequential ✗); **causality broken** (C1 W(1); C2 reads 1 then writes 2; C3 reads 2 then 1: causal ✗, sequential ✗); and **all good**.
- **Scene 2 · How the models relate.** The chain **linearizable ⊂ sequential ⊂ causal** (each model accepts every history the one before it accepts) is drawn, with **eventual** shown *beside* it, not below it: convergence is a promise about the end state, so a history can pass all three order models and still end with two clients disagreeing, and a history can converge and break every order model. The learner drops each preset into the picture. A sortable table (K3-4 `SortTh`) lists the models with: allows a stale read, needs coordination, can stay available on both sides of a partition. The availability column is a **research finding** (named, hedged): causal consistency is, from memory, the strongest model known to stay available under partitions (Mahajan, Alvisi and Dahlin, 2011; verify). **Serializability vs linearizability:** the first is about multi-object transactions with no real-time guarantee, the second about single objects with real time; "strict serializability" has both; they are different axes, not a ladder.
- **Scene 3 · A simulated register service** (`distSim`, three replicas, seeded clients). The learner picks a design: **(a)** reads and writes go through one leader that applies them in order; **(b)** writes go to the leader and are copied to followers **asynchronously**, reads go to a random follower; **(c)** each client keeps a **session cache** updated by its own writes and refreshed forward from the leader. The recorded history, with real invocation and response times, is fed to the **same checkers** as scene 1. The learner sees (a) pass everything, (b) fail linearizability and usually sequential, (c) pass sequential but fail linearizability. The **checker is the safety invariant**.
**Out of scope.** Isolation levels and anomalies (`isolation-levels`), the partition trade-off (`cap-theorem`), multi-register and transactional checking (single register only, stated), consensus protocols, Jepsen-style checkers on real databases (named, `from memory`: they use the same idea on real systems).
**Kit.** K3-8 (`createCluster`, `checkInvariants`, `forSeeds`, `toSequence`) **plus the history checkers requested above** (`linearizable`, `sequential`, `causal`, convergence), K3-4 (`SortTh`), a local timeline editor (custom SVG on the `GanttLanes` look; the lesson lists `GanttLanes` as the read-only twin for scene 3's recorded history), `ChipButton` (presets, values), `Segmented`, `.data-table`, `SequenceDiagram` (counterexample trace), `Provenance`.
**AC.**
- **Watch:**
  - clients are plain categories (`amber`, `sky`, `pink`); writes a solid bar, reads an outlined one;
  - a model that accepts the history `--ok`, one that rejects it `--bad`;
  - the smallest violating subset is ringed `--hi`;
  - an operation currently in the checker's candidate order `--info`;
  - in the chain, the strongest model that holds is `--ok` and the stronger ones `--bad`; the separate "converged" marker is `--info`.
- **Misconception:** "linearizable means serializable" and "strong consistency means you always read the latest value". Quiz questions: which of the two models a history satisfies (the stale-read-after-ack preset), and "which is stronger, serializability or linearizability?" (neither: different guarantees).
- **Correctness:**
  - **independent oracle:** the lesson's pruned search is compared with a brute-force check that tries every permutation of the operations (n ≤ 7, 5,040 orders) for real-time and register rules, on 5,000 seeded random histories, for all three order-based models;
  - **hierarchy property** on those 5,000: linearizable implies sequential implies causal (asserted for every history, so a violation of the chain is a bug in a checker);
  - **strictness and independence:** each implication has a named preset where the converse fails, and a preset exists for each of "causal but not converged" and "converged but not causal", asserted;
  - the smallest violating subset is minimal (removing any single operation makes the history pass; tested on the presets and 500 seeded failures);
  - **distSim invariant:** design (a) is linearizable on ≥ 200 seeds with delay and duplication at every step (the history is checked after every response); design (b) violates linearizability, with the hand-built schedule: write acknowledged at t = 10 and a follower still old at t = 11 returns 0 (minimal pair W(1), R → 0), and on `BROKEN_SEED`; design (c) is sequential on every seed and not linearizable on a named seed;
  - liveness: every operation completes (the scene has no loss and no timeouts, stated, because indeterminate operations are out of scope).
- **Hostile input:** at most 10 operations and times 0 to 20; a response before its invocation, two operations overlapping on one client, or a write value repeated is refused with the reason; a read of a value that was never written is allowed and every model rejects it, with the caption saying why. The seed as in the conventions.
- **Honesty:** `Provenance simulated` (seed) on scene 3, `toy` on the checkers ("exhaustive on tiny histories; real checkers use smarter search"), and `from memory` on the definitions' sources and the availability result. The register has initial value 0 (stated).
**Phone.** The timeline is a `WideRegion` (about 560) with the verdict pills above it; the chain is a vertical list at 390. No `minWidth` on the stage.

**`quorums` · Quorums: R + W > N**
Track `data` · *"Overlap the sets, guarantee the read"* · Builds on: `replication`, `consistency-models` · **[domain review]**
**Starts where Tier 2 stops.** Not fenced at Tier 2; the line is against the retrofitted `replication` ("all writes go through the leader") and `consistency-models` (previous lesson). Leader-based replication and failover stay in `replication`; this lesson is leaderless quorums and what they do and do not guarantee.
**Spec.**
- **Scene 1 · Make the sets overlap.** N replicas (3 to 7) as boxes with a version number each. Sliders W and R (1 to N). A **write** goes to a chosen set of W replicas (click W boxes, or "random"); a **read** polls R chosen replicas and returns the highest version it sees. If R + W > N the two sets **must** intersect (pigeonhole) and the intersection is drawn; if not, the learner can pick disjoint sets and watch a stale read return. The number of write-set and read-set pairs that miss each other is **computed exactly**: C(N, W) × C(N − W, R) of C(N, W) × C(N, R) pairs, and it is zero exactly when R + W > N. A readout gives the probability a random read set misses the write set, C(N − W, R) / C(N, R).
- **Scene 2 · Failures, latency, availability.** Crash replicas (a button each) and drag a partition; a write needs W replies and a read needs R, so a write survives N − W failures and a read N − R (computed). With W = N a single crash blocks every write. A **latency** panel draws seeded replica latencies (log-normal, K3-1) and shows an operation waits for the **W-th (or R-th) fastest** reply, so p50 and p99 rise with W; for exponential latencies the expected k-th fastest of N is (1/λ)·Σᵢ₌₀ᵏ⁻¹ 1/(N − i), checked against the sim (k = 3, N = 5, λ = 1 gives 1/5 + 1/4 + 1/3 = 0.783).
- **Scene 3 · Not the same as linearizable.** A leaderless store on `distSim`: one writer (versions 1, 2, 3 …, so no conflicts to resolve; concurrent writers need `logical-clocks`' version vectors, said on screen), any node can coordinate, optional **read repair** toggle writes the newest version back to stale replicas that answered. The learner runs it with R + W > N and sees reads never go behind an **acknowledged** write, then steps a **write in flight**: it has reached one replica, a first read sees the new value and a later read, hitting two others, sees the old one (the hand-built schedule below). R + W > N guarantees overlap with *acknowledged* writes only.
- **Sloppy quorums.** A toggle lets a coordinator count replies from **stand-in** nodes when some of the key's home replicas are unreachable (hinted handoff, Dynamo-style; `from memory`, verify against the Dynamo paper). With a partition, a write can reach W nodes where one is a stand-in, so a read that contacts the home replicas can miss every node that has it: the overlap guarantee, computed over home replicas, **fails** until the hint is handed off. The lesson shows availability gained and consistency lost.
**Out of scope.** Leader election and failover (`replication`), consensus-based quorums such as Raft's majority (`raft`, registered at Tier 4: named, not linked), version vectors and conflict resolution (`logical-clocks`), anti-entropy repair (`merkle-trees`, wave 6), CRDTs.
**Kit.** K3-8 (`createCluster`, `partition`, `crash`, `forSeeds`, `checkInvariants`, `toSequence`), the register-history `linearizable` checker (requested above), K3-1 (log-normal and exponential samplers, `quantile`), `Plot2D` (latency percentiles against W), `SceneNode` and `Flyer` (replicas and messages), `Slider`, `Toggle`, `Stat` (K3-3), `core/stats` (`choose`), `Provenance`.
**AC.**
- **Watch:**
  - replicas are plain boxes with their version as text; the newest version `--ok`, a stale replica `--orange` (stale is a state, not a failure of the box);
  - the write set is `--violet`, the read set `--info`, their intersection `--hi`, an empty intersection `--bad`;
  - a crashed replica uses the shared dead-node cell (`--cell-dead`), a partition is a `--dim` dashed cut;
  - a stand-in node is outlined `--amber`.
- **Misconception:** "R + W > N makes the store linearizable", and "a bigger W is always better". Quiz questions: N = 5, W = 3, R = 3 guarantees overlap, but does it guarantee that a read concurrent with a write sees it consistently? (no); and what a sloppy quorum trades.
- **Correctness:**
  - the disjoint-pairs formula is checked against a brute-force enumeration of all subsets for every N ≤ 7 and all W, R ≤ N, including that it is 0 exactly when R + W > N;
  - a read returns the maximum version among the R replicas it reached, against a reference, on 1,000 seeded runs;
  - the order-statistic expectation is checked by simulation within 3 standard errors for k = 1 … 5 at N = 5;
  - **invariant (strict quorum):** "every read that begins after a write is acknowledged returns that write's version or a newer one". On ≥ 500 seeds with crashes, partitions, delay, loss and duplication, and strict quorums with R + W > N, it holds at every step. Broken modes: **R + W ≤ N** (hand-built: N = 3, W = 1, R = 1, replica A acknowledges, a read from C returns the old version) and **sloppy quorum under partition**, each with its `BROKEN_SEED`;
  - **non-linearizable example** (hand-built, fixed schedule): N = 3, W = 2, R = 2; a write of version 1 reaches replica A at t = 5 and replicas B and C at t = 50 (acknowledged at 50); a read at t = 10 contacting A and C returns 1; a read at t = 20 contacting B and C returns 0; the `linearizable` checker rejects the history, and with the acknowledged-write invariant above it still holds (so the two statements are consistent);
  - liveness: an operation completes whenever W (or R) replicas are reachable, and otherwise reports "no quorum" at a timeout, tested apart.
- **Hostile input:** R and W cannot exceed N and N ≤ 7; a manual write set must have exactly W members (the button says why it is disabled otherwise); crashing every replica yields "no quorum" at a timeout, never an infinite wait; the seed as in the conventions.
- **Honesty:** `Provenance simulated` with seed; "one writer, no conflict handling"; and `from memory` on Dynamo-style details (hinted handoff, read repair). Real stores' defaults are not shown.
**Phone.** Replicas wrap in two rows at N = 7; the latency plot at 356; the pairs table collapses to a stat line. No `minWidth`.

**`exactly-once-myth` · The Exactly-Once Delivery Myth**
Track `arch` · *"At-least-once plus idempotence is the real trick"* · Builds on: `message-queues`, `idempotency-keys` · **[domain review]**
Includes the merged **Two Generals** problem (plan §1.1), as the lossy-link scene that opens the lesson. If a fifth scene feels crowded, scene 5 moves behind an "advanced" tab (plan §7.1) rather than becoming a lesson.
**Starts where Tier 2 stops.** `idempotency-keys`: "Exactly-once delivery in messaging (T3 `exactly-once-myth`), outbox / dual writes (T3 `transactional-outbox`), and consumer-side dedup (`poison-messages-dlq` and `webhooks` mention it)." This lesson is the impossibility and the resolution; the key mechanics stay in `idempotency-keys`.
**Spec.**
- **Scene 1 · Two Generals.** Two armies agree to attack at dawn, sending messengers over a valley where each may be captured with probability p (slider 0 to 0.95, seeded). The learner chooses the **protocol depth** k (1 to 8 messages: m₁ A → B, m₂ B → A, …). The toy rule: a general attacks if it **received every message the full protocol addresses to it**, or if it **sent the last one**. The lesson **enumerates all 2ᵏ delivery patterns** and shows that only the pattern "everything delivered except the last message" makes the generals disagree. So P(disagree) = p·(1 − p)^(k−1) for every k ≥ 1, P(both attack) = (1 − p)ᵏ, and the rest is "nobody attacks". More messages **lower** the chance of disagreement and **raise** the chance nothing happens; **no k makes disagreement zero** while p > 0. The shortest argument is shown as an interaction: delete the last message and the protocol must still be correct, so it was unnecessary; repeat until none are left. This is the standard impossibility argument; the **toy rule illustrates it and is not the proof** (the lesson says so).
- **Scene 2 · Delivery guarantees on a lossy link.** A producer, a broker and a consumer on `distSim` with loss, duplication and crashes. Three modes: **at most once** (send, never retry), **at least once** (retry until acked; an ack can be lost), and a hopeful **"exactly once delivery"** (acks of acks) that is visibly Two Generals again. Counters: sent, delivered, duplicates, lost.
- **Scene 3 · At least once plus an idempotent consumer.** The consumer applies "balance += 10" for message id m. **Crash points** the learner chooses: before the effect, **between the effect and recording the id**, after recording but before the ack. Two designs: the id recorded **separately** from the effect, and recorded **in the same atomic step** as the effect. The table of 3 crash points × 2 designs is **computed by running** each. The separate design applies the effect twice when the crash falls in the gap; the atomic one never does (links `idempotency-keys`).
- **Scene 4 · Where "exactly-once" is honestly true.** A short table of scopes: processing inside one system where the effect and the input offset commit atomically (what stream engines' transactions advertise, `from memory`: verify against the product docs), versus delivery over a lossy link, versus an effect on an external system. The claim is true only for the first.
**Out of scope.** Idempotency-key mechanics (`idempotency-keys`), dead-letter queues (`poison-messages-dlq`), the outbox (`transactional-outbox`, wave 7, named in words), Kafka transactions in depth (`kafka-partitioned-log`, wave 4, named).
**Kit.** K3-8 (`createCluster` with `loss`, `duplicate`, `crash`, `dropNext`, `forSeeds`, `checkInvariants`, `toSequence`), `SequenceDiagram` (`lost` messages, notes), `SceneNode`, `TravelDot` or `Flyer` (messengers), `Slider`, `Segmented`, `ChipButton` (crash points), `.data-table`, `Stat`, `Plot2D` (P(disagree) and P(both attack) against k), `core/stats` (`binomialPmf` not needed; `choose` for enumeration), `Provenance`.
**AC.**
- **Watch:**
  - a delivered message `--info`, a lost one `--bad` with the ✕ of `SequenceDiagram`;
  - a general who attacks `--hi`, agreement to attack `--ok`, disagreement `--bad`, nobody attacks `--dim` (safe but live-less);
  - a duplicate delivery `--orange`, a duplicate **effect** `--bad`;
  - the crash point is `--violet`.
- **Misconception:** "a broker configured correctly can guarantee exactly-once delivery", and "deduplication always fixes duplicates". Dedup only works if recording the id is atomic with the effect. Quiz questions on each.
- **Correctness:**
  - the closed forms P(disagree) = p(1 − p)^(k−1) and P(both attack) = (1 − p)ᵏ are checked against full enumeration of the 2ᵏ patterns weighted by p, and against 100,000 seeded simulations within 3 standard errors, for k = 1 … 8 and p ∈ {0, 0.1, 0.5, 0.9, 1};
  - **invariants on `distSim`**, checked at every step: at-most-once **never processes a message twice** (holds) but can lose one (the hand-built schedule drops the only message); at-least-once **never loses a message** when delivery eventually succeeds (liveness, separate test) but can duplicate (hand-built: `dropNext` on the first ack gives a duplicate); the separate-write consumer violates "each message's effect is applied at most once" on the crash-in-the-gap schedule and on `BROKEN_SEED`, while the atomic consumer holds it for ≥ 500 seeds with loss, duplication and crashes;
  - at p = 1 and k ≥ 2 the lesson says "nobody attacks", from the numbers (no divide by zero);
  - same seed gives the same trace.
- **Hostile input:** p and k bounded; p = 0 reads "a perfect link needs no protocol, and no real link is perfect" (derived, not typed); a crash point can only be chosen from the chips; the seed as in the conventions.
- **Honesty:** `Provenance simulated` with seed; `toy` on the Two Generals rule ("illustrates the argument; the proof is in the literature"); `from memory` on what named products advertise. No product is shown running.
**Phone.** The valley scene is a `WideRegion` (about 440); the 3 × 2 outcome table fits; `SequenceDiagram` in its own scroller. Controls wrap.

---

##### Batch T3-B5 · Performance & delivery (`ops`)
Wave 2. **[domain review]** for `tail-latency`, `capacity-planning`, `benchmarking-methodology` and `dora-metrics` (`autoscaling` is not flagged but follows the same rules). Pilots **K3-13** `MetricMeter` (first users here), **K3-10** `barAt` and **K3-14** `timeFrames` (both for the timelines), with K3-1 (samplers, `Band`) and K3-2 (`createTickSim`) already proven by wave 1; K3-4 `SortTh` (`dora-metrics`), K3-11 zero-length bars and K3-12 the calendar axis (`dora-metrics`) are used where named. The wave 1 lessons `distributions`, `percentiles-statistics` and `queueing-theory` have merged, so they may be linked. Build in the listed order: `tail-latency` and `capacity-planning` use the queueing results and the percentile definitions of wave 1, and `autoscaling` links `capacity-planning`. Every number is computed from a seeded model or an exact formula (AC-0/T3 #22), and real-world figures are named constants labelled `illustrative` or `from memory`.

**`tail-latency` · Tail Latency at Scale**
Track `ops` · *"Your p99 is someone's every request"* · Builds on: `percentiles-statistics`, `load-balancing` · **[domain review]**
Scope line (plan §1.2): this lesson owns fan-out amplification (1 − 0.99ᴺ), hedged and backup requests, and queueing as a cause of the tail.
**Spec.**
- **Scene 1 · Fan-out.** A request calls N backends in parallel and waits for the slowest. N is a log slider (1 to 1,000). Each backend's latency comes from a `Segmented` distribution (log-normal or exponential) plus a **slow-backend probability** (default 1%) and **slow factor** (default 10×), i.e. a mixture. The panel shows P(a request touches at least one slow backend) = 1 − 0.99ᴺ: **1% at N = 1, 9.6% at 10, 63.4% at 100, 99.996% at 1,000** (the table is a computed row). It also shows the smallest N where the median request is slow: 0.99ᴺ = 0.5 gives N ≈ 69, so at about 69 backends a backend's p99 has become the **median** of the request. A seeded run of 100,000 requests draws the histogram of single-backend latency beside the max-of-N latency with both p99s marked.
- Preset chips for **causes** (illustrative): "1% GC pause (×20)", "noisy neighbour (5%, ×4)", "retry after timeout (2%, ×30)". Each only changes the mixture, and the caption names it as a model of that cause, not a measurement.
- **Scene 2 · Hedged requests.** The request is sent to one replica and, if no reply arrives within a hedge delay h, to a second; the first reply wins and the other is cancelled. A `timeFrames` (K3-14) walk-through and a `barAt` (K3-10) timeline show six sample requests: the primary bar, the hedge firing at h, and the winner. Controls: h as a slider in ms (with a "= p95 of a single request" chip), the number of replicas contacted. A **trade-off row** (K3-3 `Stat`): p99 before and after, and **extra load** = the share of requests that hedged, P(T > h) (about 5% when h is the single-request p95).
  - Exact check: for independent replicas the hedged latency has survival S(t) for t < h and S(t)·S(t − h) for t ≥ h, so the lesson's hedged p99 is read from that formula and compared to the simulation.
  - **Correlation slider** (0 to 1): probability that the second replica is slow *given* the first was, the case where hedging cannot help (a shared dependency, a shared rack). At 1 hedging adds load and no benefit.
- **Scene 3 · When hedging hurts.** The backend is an M/M/1 server at utilisation ρ (slider 10% to 95%). Its time in system is exponential with rate μ(1 − ρ) (the M/M/1 result, linked to `queueing-theory`), so its p99 is ln(100)/(μ(1 − ρ)). Hedges are **not cancelled** in this model (stated) and add load, so ρ′ = ρ·(1 + P(T > h)), solved as a fixed point. The learner sweeps ρ and sees the hedged p99 beat the plain one at low load and **lose** above a crossover ρ, which the lesson computes; if hedging pushes ρ′ to 1 or beyond the stat says "overloaded: the hedge makes it worse than any tail".
**Out of scope.** How a percentile is computed or sampled (`percentiles-statistics`), coordinated omission (`benchmarking-methodology`, later in this batch, named in words), balancing algorithms (`load-balancing`), queueing derivations (`queueing-theory`; only the M/M/1 time-in-system distribution is used and linked).
**Kit.** K3-1 (samplers, `quantile`), K3-14 (`timeFrames`), K3-10 (`barAt`), `GanttLanes`, K3-2 (`createTickSim` for the 100,000-request run, so the same seed gives the same histogram), K3-3 (`Stat` with before/after lines), K3-13 `MetricMeter` (p99 against a target with bands), `Plot2D` (`Bars`, `VLine`, `Curve` for P(slow) against N), `Slider`, `Segmented`, `ChipButton`, `core/sim` (`percentile`), `Provenance`.
**AC.**
- **Watch:**
  - single-backend latencies `--info`, the max-of-N latencies `--violet`;
  - the p99 markers `--orange`, the part of a request's bar spent waiting on the slowest backend `--bad`;
  - the primary request `--info`, the hedge `--violet`, the winner `--ok`, the cancelled one `--dim`;
  - extra load is `--orange` (a cost, not a failure); the MetricMeter bands follow the colour table (`--ok` within target, `--bad` over).
- **Misconception:** "every backend's p99 is 100 ms, so my request's p99 is 100 ms". Quiz questions: with 100 backends each slow 1% of the time, what share of requests touch a slow one (63%)? And "hedging always helps" (it does not near saturation).
- **Correctness:**
  - 1 − 0.99ᴺ for N ∈ {1, 10, 69, 100, 1,000} matches the table (0.01, 0.0956, 0.5, 0.634, 0.99996);
  - the simulated p-quantile of the max of N matches the analytic F⁻¹(p^{1/N}) for each distribution (exponential: −ln(1 − p^{1/N})/λ) within 3 standard errors;
  - the hedged p99 from the survival formula matches simulation within 3% at five hedge delays, and the share that hedged equals S(h) within Monte Carlo error;
  - the fixed point for ρ′ converges (monotone iteration, ≤ 100 steps) or reports overload, and the crossover ρ is the sweep's first ρ where the hedged p99 exceeds the plain one (brute-force scan);
  - a **broken variant** (hedging at delay 0, i.e. always duplicating) must show 100% extra load, and the test asserts the lesson's row says so.
- **Hostile input:** N and h are sliders; h = 0 is allowed (100% extra load, and says so); ρ is capped at 95% (the slider stops there and the caption says why); the seed as in the conventions.
- **Honesty:** `Provenance simulated` with seed. "Backends are independent unless the correlation slider says otherwise." The hedging idea and the "about 5% extra load" figure are credited to *The Tail at Scale* (Dean and Barroso, 2013) and are `from memory`: verify before quoting.
**Phone.** One plot per scene; the timeline in a `WideRegion` (about 480); `MetricMeter` and `Stat` stack. No `minWidth`.

**`capacity-planning` · Load Testing & Capacity Planning**
Track `ops` · *"Find the knee before your users do"* · Builds on: `queueing-theory`, `profiling-flame-graphs` · **[domain review]**
**Starts where Tier 2 stops.** `resource-exhaustion`: "...Capacity planning (T3 `capacity-planning`)..." and `amdahls-law`: "Queueing and contention models (T3 `queueing-theory`)...". The queueing result is wave 1's; this lesson turns it into a number you can plan with.
**Spec.**
- **Scene 1 · A load test.** A service of c identical workers (1 to 64), each with mean service time S (1 to 2,000 ms, exponential), fed by an **open-loop** generator (arrivals do not wait for responses; stated on screen, and the closed-loop trap is `benchmarking-methodology`'s). A request that waits longer than a client timeout T counts as an error. The learner **ramps offered load** (a slider, or a "ramp" button that steps through steady-state levels using `createTickSim`). Live curves: **throughput** (completed per second) against offered load, **p50 and p99 latency**, and **error rate**. Capacity is c/S: past it throughput flattens and latency and errors climb.
- **The "knee" is defined, not eyeballed:** the highest offered load at which p99 stays within the SLO (e.g. 300 ms), found by bisection on the exact p99 below. The marker shows that load, the utilisation there, and the headroom to it. No geometric corner is claimed.
- **Exact model behind the curves (M/M/c).** With a = λ/μ and ρ = a/c, Erlang C gives the probability of waiting C(c, a) = [aᶜ/(c!(1 − ρ))] / [Σₖ₌₀^{c−1} aᵏ/k! + aᶜ/(c!(1 − ρ))]; mean wait Wq = C/(cμ − λ); with θ = cμ − λ the time in system T = wait + service has survival P(T > t) = (1 − C)e^{−μt} + C(μe^{−θt} − θe^{−μt})/(μ − θ) for θ ≠ μ (and (1 + μt)e^{−μt} when θ = μ). The p99 is read off this by bisection. The simulation is drawn over it as a check, not the other way round.
- **Scene 2 · Headroom and forecast.** Current peak requests/s, monthly growth (−20% to +50%, compounding), a seasonal spike factor in a chosen month, target headroom, redundancy (N + 1 or lose-one-of-three-zones, as in `back-of-envelope`'s language), and a **provisioning lead time** in weeks. A forecast line against the capacity line (knee × instances × headroom) shows the **month the forecast crosses capacity** (closed form m = ln(capacity ÷ peak) ÷ ln(1 + g)) and the **order-by date** (that month minus the lead time). A linear vs compound toggle shows why 5% a month is 79.6% a year (1.05¹² = 1.796), not 60%.
- **Scene 3 · What moves the knee.** Toggle "optimise the service time" (the effect of a profiling win, `profiling-flame-graphs`) against "add instances". A third panel shows the **safe utilisation at a fixed SLO grows with the number of workers**: for c = 1, 2, 4, 8, 16, 32 the highest utilisation that still meets the SLO, computed (pooling effect: one big pool tolerates running hotter than many small ones). Capacity is not linear in instances once there are shared limits, so a "shared database limit" slider caps total throughput and the knee stops scaling.
**Out of scope.** Queueing derivations (`queueing-theory`), autoscaling policy (`autoscaling`, next lesson), benchmark validity and coordinated omission (`benchmarking-methodology`), cost optimisation, real load-test tools (named only).
**Kit.** K3-2 (`createTickSim`), K3-1 (`exponential`, `quantile`), K3-13 (`MetricMeter` for utilisation and headroom against bands), K3-3 (`Stat` multi-line), `Plot2D` (`Curve`, `VLine`, `HLine`, `Band`), `Slider`, `Toggle`, `Segmented`, `core/sim`, `core/format`, `Provenance`.
**AC.**
- **Watch:**
  - offered load `--info`, achieved throughput `--ok`, the gap between them past capacity `--bad`;
  - p99 `--orange`, p50 `--info`, the SLO line `--dim` dashed, the knee marker `--hi`;
  - the forecast `--violet`, the capacity line `--ok`, the headroom band a `--info` tint, the order-by date `--hi`, a forecast above capacity `--bad`.
- **Misconception:** "100% CPU is the limit" and "capacity is the maximum throughput". Capacity is the maximum throughput **within the latency target**, which arrives at a lower load. Quiz questions on both, plus "what happens to the safe utilisation if the same total capacity is split across more, smaller servers?" (it falls).
- **Correctness:**
  - Erlang C hand vector: c = 2, λ = 1, μ = 1 gives C = 1/3, Wq = 1/3, mean time in system 4/3;
  - c = 1 reduces to M/M/1: the survival formula equals e^{−(μ−λ)t} (derived in the test);
  - a seeded M/M/c simulation of 200,000 departures agrees with the exact mean (within 3%) and the exact p99 (within 5%) at ρ ∈ {0.5, 0.7, 0.85};
  - the knee found by bisection is monotone in the SLO and c, and the p99 at the knee is within 0.5% of the SLO;
  - the forecast month equals a month-by-month loop for 1,000 seeded parameter sets, with negative growth printing "never crosses";
  - safe utilisation at the SLO is increasing in c for c = 1 … 32 (asserted);
  - the error rate equals the share of requests whose wait exceeds T, from the same simulation.
- **Hostile input:** sliders bounded; offered load up to 1.5× capacity is allowed on purpose and shows the overloaded state; c·S that makes capacity zero cannot occur; the one typed number (peak requests/s) goes through `parseBoundedInt` (1 to 10⁷); the seed as in the conventions.
- **Honesty:** `Provenance simulated` (seed) and `analytic` on the curves. A required note: "Real systems have non-exponential service, bursty arrivals, garbage collection, shared dependencies and warm-up; their knee comes sooner than this model's. Load-test the real thing."
**Phone.** The throughput/latency plot at 356 with one series per toggle; the forecast plot below; meters stack. No `minWidth`.

**`autoscaling` · Autoscaling: Horizontal, Vertical & Predictive**
Track `ops` · *"Add machines before the queue does"* · Builds on: `load-balancing`
**Starts where Tier 2 stops.** `serverless-cold-starts` and the Kubernetes lessons named autoscaling and stopped. This lesson is the control loop and why it lags.
**Spec.**
- **Scene 1 · A reactive loop.** A 24-hour traffic curve (presets: daily wave, **flash spike** ×4 in one minute, sawtooth of batch jobs, noisy) at one-minute ticks (`createTickSim`). The fleet: each instance serves K requests/s, but a new instance takes **warm-up** W minutes (0 to 10) before it counts; only ready instances serve. Policy: **target tracking** on utilisation — desired = ⌈current × metric ÷ target⌉ (the formula Kubernetes' horizontal autoscaler documents; verify against its docs), with a scale-out cooldown, a scale-in cooldown (0 to 30 min, the second defaulting longer, as in common practice), a minimum and a maximum. A toggle chooses whether warming instances count toward "current".
  - Outputs per minute: served and dropped load (load above ready capacity is dropped, stated), utilisation, a latency proxy 1/(1 − ρ) in service times capped (linked to `queueing-theory`, labelled a proxy), instance-minutes, **flapping** (direction reversals), **SLO-violation minutes** (ρ above 90% or drops).
  - The learner reproduces both classic failures: cooldown 0 with noisy load flaps; a long warm-up with a flash spike violates before capacity arrives and then **overshoots**, because the metric stays high while new instances warm up.
- **Scene 2 · Scheduled and predictive.** A policy picker: reactive, **scheduled** (raise the minimum at a set time), **predictive** (provision at t − W for yesterday's load at t). A 3 × 4 table (policy × traffic preset) of violation minutes and instance-minutes is **computed by running all twelve**, so the learner sees predictive win on the daily wave and be useless on the flash spike. Vertical scaling (a bigger instance, usually with a restart) is named only.
- **Scene 3 · The bill.** Instance-hours × an illustrative price against a static fleet sized for the peak: the saving in percent, and the saving's price (violation minutes). Scale-to-zero is named, with `serverless-cold-starts` linked.
**Out of scope.** Queueing derivations (`queueing-theory`), finding the knee (`capacity-planning`, previous lesson, linked), Kubernetes object details (`kubernetes-basics`), cost optimisation as a practice, cloud vendors' policy names.
**Kit.** K3-2 (`createTickSim`, `useTickSim`), K3-13 (`MetricMeter` for utilisation with bands), K3-3 (`Stat`), `Plot2D` (load, capacity and fleet lines; `Band` for the SLO), `GanttLanes` (instance lifetimes with warm-up as a hatched `wait` bar), `Slider`, `Toggle`, `Segmented`, `.data-table`, `core/format`, `Provenance`.
**AC.**
- **Watch:**
  - offered load `--info`, ready capacity `--ok`, warming instances `--violet` hatched (not yet serving), dropped load `--bad`;
  - a scale-out action `--hi`, a scale-in action `--dim`;
  - the MetricMeter bands follow the colour table, the target line `--dim` dashed;
  - the cheaper cell in the policy table `--ok`, the cell with violations `--bad`.
- **Misconception:** "autoscaling reacts instantly and protects you from spikes", and "more aggressive scaling is always better". Quiz questions: a 5-minute warm-up against a one-minute spike, and what causes flapping.
- **Correctness:**
  - the controller is checked on hand traces: 4 instances at 90% against a 60% target gives ⌈4 × 0.9 / 0.6⌉ = 6; the arithmetic runs on **integer percentages**, because the float form `3 × 0.1 / 0.3` evaluates to 1.0000000000000002 and `Math.ceil` would give 2 (a real trap, asserted);
  - cooldown boundaries are tested at 0, at the exact edge and one tick after;
  - **conservation:** served + dropped = offered every minute; the instance count stays within [min, max] every tick; capacity changes only after W ticks (a step load shows an unchanged ready capacity for exactly W minutes);
  - flapping equals an independent reversal counter on 200 seeded traces;
  - **properties:** reactive on a step load violates for at least W minutes; predictive on a perfectly periodic load has zero violations after the first day;
  - the 12 table cells equal 12 separate runs.
- **Hostile input:** minimum cannot exceed maximum (the slider stops, and equal values say "this is a fixed fleet, not an autoscaler"); load comes from presets only; target utilisation is bounded 30% to 95%; the seed as in the conventions.
- **Honesty:** `Provenance simulated` with seed; `illustrative` on the price and on K (requests/s per instance); `from memory` on the policy formula and on the stabilisation-window defaults ("real autoscalers differ by platform; check yours"). The latency number is a proxy and says so.
**Phone.** Plot at 356; the fleet lanes in a `WideRegion` (about 480); the policy table scrolls inside itself. No `minWidth`.

**`benchmarking-methodology` · Benchmarking & Performance Measurement Pitfalls**
Track `craft` · *"Your benchmark is lying"* · Builds on: `profiling-flame-graphs` · **[domain review]**
**Starts where Tier 2 stops.** `profiling-flame-graphs`: "Benchmarking methodology (T3 `benchmarking-methodology`)...". That lesson found where time goes; this one asks whether a measured number is true.
**Spec.**
- **Scene 1 · Warm-up.** Two implementations, A and B, each with an iteration-time model t(i) = steady × (1 + a·e^{−i/τ}) (a simulated JIT-like warm-up, with named constants: A steady 10 µs, a = 4, τ = 20; B steady 8 µs, a = 19, τ = 300) plus seeded noise. The learner chooses the **measurement window**: the first 100 iterations, "discard the first k", or a steady-state window (5,000 to 10,000). Averaged over the first 100 iterations A (about 18 µs) looks about 7.6× faster than B (about 137 µs); in steady state **B is faster** (8 µs against 10 µs): the conclusion **flips** with the window. A "**use the result**" switch shows **dead-code elimination**: with the result unused, the model collapses the time per call toward zero (a simulated effect of an optimiser removing pure work that nothing reads; real compilers can do this, `from memory`, and benchmark harnesses keep results alive on purpose).
- **Opt-in real run.** A separate button, off by default, times a small real function on **this machine** with `performance.now()` in batches and plots the real series, with a note that it varies and that browsers may coarsen timer resolution (`from memory`: verify). A **timer granularity probe** reports the smallest non-zero step it actually observed. Not run by default, smoke or tests; tests use an injected clock.
- **Scene 2 · Noise and confidence intervals.** A noisy benchmark (log-normal noise plus rare outliers, "2% of runs hit a pause") run K times (5 to 200). The panel shows mean, median, minimum, and a **bootstrap interval for the median** (seeded, 1,000 resamples). A/B comparison reports the difference with its interval and the verdict "distinguishable" only when the interval excludes 0; otherwise "cannot tell". Toggles inject common noise sources (illustrative): "another process is running" (makes the histogram **bimodal**, so a mean and interval mislead and the histogram is the honest view), "frequency scaling". The lesson links `hypothesis-testing-ab` for why peeking at a benchmark until it looks different has the same flaw.
- **Scene 3 · Coordinated omission.** A load generator aims for a request every 10 ms against a server that normally replies in 1 ms and **stalls once for 1,000 ms**. A `GanttLanes` timeline with `barAt` shows the intended schedule against what actually happened, for three generators: **open-loop** (sends on schedule whatever happens), **closed-loop** (the next request goes after the previous reply, sending the delayed ones back-to-back once the stall ends), and closed-loop with **correction**. The closed-loop tool records one slow sample and silently omits the ~100 requests that should have been sent during the stall, so its p99 looks fine.
  - Hand-worked vector the test pins: 10-second run, 1,000 intended requests, stall at request 100. Measured against actual send time, 999 samples are 1 ms and one is 1,000 ms, so **p99 = 1 ms**. Measured against the **intended** send time, latencies run 1,000, 991, 982, … (falling 9 ms per request as the generator catches up), so **p99 ≈ 910 ms** and about 10% of requests exceed 100 ms.
  - A second panel applies the **backfill correction** used by HDR-style recorders (when a value exceeds the expected interval, also record value − interval, value − 2 × interval, … while above the interval; `from memory`: verify against HdrHistogram's documentation); on this vector it lands within about 2% of the per-intended-time answer (about 900 ms).
  The learner sets stall length (0 to 10 s), stall time, request rate and generator type, and watches the reported and the true percentile.
**Out of scope.** How percentiles are computed (`percentiles-statistics`), profiling (`profiling-flame-graphs`), finding capacity (`capacity-planning`), significance testing in depth (`hypothesis-testing-ab`), specific benchmark tools (named only).
**Kit.** K3-2 (`createTickSim` for seeded warm-up and noise), K3-10 (`barAt`) with `GanttLanes` for the generator timelines, K3-13 (`MetricMeter` for the reported-vs-true p99 against the SLO), K3-3 (`Stat`), K3-1 (log-normal sampler, `Band`), `Plot2D` (iteration series, histogram), `Segmented`, `Slider`, `Toggle`, `core/sim`, `core/stats`, `Provenance`.
**AC.**
- **Watch:**
  - A is `sky` and B `amber` (plain categories, never ok/bad);
  - the chosen measurement window `--hi`, the discarded warm-up `--dim`;
  - the reported p99 `--bad` when it hides the stall and the corrected p99 `--ok`;
  - intended send times `--info` ticks, actual `--violet`, the omitted requests drawn as hollow `--dim` bars;
  - a bimodal histogram's two modes get two plain tones.
- **Misconception:** "a benchmark that prints a number is a measurement", "the mean is enough", and "the closed-loop tool's p99 is the user's p99". Quiz questions on the third (the stall vector) and on why the first 100 iterations mislead.
- **Correctness:**
  - the warm-up model reproduces the sign flip (A faster in the first 100 iterations, B in steady state) from its named constants (asserted, so changing the constants cannot silently remove the lesson's point);
  - the 95% bootstrap interval for the median covers the true median within 0.95 ± 0.03 over 1,000 seeded repeats on a near-normal source;
  - coordinated omission on the vector above: closed-loop p99 = 1 ms, per-intended-time p99 = 910 ms (hand-worked; the test computes it by simulating the schedule independently of the lesson's code), backfill p99 within 2% of it; the open-loop generator's measured p99 equals the corrected one;
  - the real-timing scene is tested with an injected clock only, and a test asserts the default state never calls `performance.now`;
  - a **broken variant** that omits instead of backfilling must fail "p99 ≥ 800 ms on the stall vector".
- **Hostile input:** stall ≤ 10 s, rate ≤ 10,000/s and runs capped at 100,000 samples (the cap is stated when hit); K 5 to 200; the real run is capped at about a second and cancels on navigation; the seed as in the conventions.
- **Honesty:** `Provenance simulated` on the warm-up, noise and generator timelines ("a made-up JIT-like curve, not V8"), `real` on the opt-in run only, `from memory` on timer-resolution and HDR details.
**Phone.** Plots at 356; the generator timelines in a `WideRegion` (about 520); toggles wrap. No `minWidth`.

**`dora-metrics` · DORA Metrics & Delivery Performance**
Track `ops` · *"Measuring how well you ship"* · Builds on: `ci-pipelines` · **[domain review]**
Claim labels (AC-0/T3 #24 style): the four metrics are the DORA research programme's (Forsgren, Humble and Kim's *Accelerate*, 2018, `research finding`), but their **definitions have been revised** (recovery time has been renamed and a reliability measure added; `from memory`: verify against dora.dev) and the performance bands are revised yearly, so the lesson shows bands only as **illustrative** constants and never as a benchmark to quote.
**Spec.**
- **Scene 1 · A simulated delivery pipeline.** 12 simulated weeks of a team (a seeded `createTickSim`). Controls: merged changes per day r (1 to 20), **batch size b** (release when b changes have accumulated, 1 to 30, or a release-train cadence in days), a **manual QA gate** toggle (adds a fixed 2 days), and **test automation** (0 to 100%).
  - Each change is defective with probability f = 3% (illustrative); automation lowers it by up to 60% (illustrative constant); a release fails if it contains at least one defect, so P(fail) = 1 − (1 − f_eff)ᵇ.
  - **Time to restore** = detection (15 min) + finding the culprit by bisecting the batch (⌈log₂ b⌉ steps of 20 min) + rollback (15 min); a **rollback-first** toggle skips the search (30 min whatever b is), which shows restore time is a decision as well as a size.
  - Four `MetricMeter`s (K3-13): **deployment frequency** (releases a week), **lead time** (median hours from commit to production), **change failure rate**, **time to restore** (median). Band colours are illustrative and labelled.
  - Shrinking b moves all four the good way **in this model by construction**, and a banner says so: "this is the model's assumption, matching what DORA's survey research reports; the simulation does not prove it".
- **Gaming the numbers.** A "team games the metric" toggle splits each change into five tiny deploys (deployment frequency ×5, lead time for *value* unchanged) or counts only rollbacks as failures (change failure rate falls with nothing improved). The lesson computes what moved and what did not.
- **Scene 2 · Measure it from data.** A seeded log of 50 deployments with commit time, merge time, deploy time, outcome, restore time, shown in a sortable table (K3-4 `SortTh`) and a weekly `GanttLanes` on K3-12's calendar axis (UTC, stated) with deploys as zero-length bars (K3-11). The four metrics are computed from the log with **definitions the learner changes**: lead time starting at first commit, PR opened, or merge; a failure meaning rollback only, rollback or hotfix within 24 h, or incident-linked; restore time ending at "service restored" or "fix deployed". The numbers change with each choice (the seeded log guarantees they do: asserted), and the median is shown beside the mean to expose skew.
**Out of scope.** SLOs and error budgets (`slos-error-budgets`), CI mechanics (`ci-pipelines`), incident process (`incident-response`, wave 2, next batch, named in words), developer-productivity frameworks (named only).
**Kit.** K3-13 (`MetricMeter`), K3-2 (`createTickSim`), K3-4 (`SortTh`, `useSortedRows`), K3-12 (`calendar` axis), K3-11 (zero-length `GanttBar`), K3-3 (`Stat`), `GanttLanes`, `Slider`, `Toggle`, `Segmented`, `ChipButton`, `.data-table`, `Provenance`.
**AC.**
- **Watch:**
  - the four gauges use `MetricMeter` bands per the colour table (good `--ok`, poor `--bad`, between `--hi`);
  - successful deploys `--ok` ticks, failed `--bad`, a rollback `--orange`;
  - the gamed metric is `--orange` with the unchanged real measure beside it in `--info`;
  - sorted-column headers show `aria-sort`.
- **Misconception:** "DORA metrics rank teams", "higher deployment frequency is always better", and "make the numbers the target". Quiz questions on each, including what splitting a change into five deploys does.
- **Correctness:**
  - closed forms against 200 seeded runs: change failure rate ≈ 1 − (1 − f_eff)ᵇ, mean lead time ≈ (b − 1)/(2r) working days plus the gates (within 3 standard errors), restore time = detection + ⌈log₂ b⌉ × 20 + 15 minutes exactly;
  - medians and the mean on a hand-worked table of 10 deployments;
  - each definition toggle changes the number on the seeded log (asserted), and the weekly deploy ticks equal the table's rows;
  - the gaming toggles move exactly the metrics the caption says and no others (asserted);
  - a **broken variant** that computes lead time from merge but labels it "commit to production" must fail the label test.
- **Hostile input:** sliders and toggles only; b ≥ 1; r ≥ 1; a log with zero failures shows time to restore as "–" (no failures to restore from), never 0 or NaN; the seed as in the conventions.
- **Honesty:** `Provenance simulated` (seed) and `illustrative` on every default, band and constant, `from memory` on the metric definitions, the renaming and the band history ("check dora.dev for the current ones"). "These measure a team's own delivery over time, not people, and are not for comparing teams."
**Phone.** The four meters wrap two by two; the table scrolls inside itself; the calendar timeline in a `WideRegion` (about 520). No `minWidth`.

---

## Open points from these five batches (for the coordinator)

**New kit needs not in `docs/tier3-plan.md` §4** (each has two users or an existing one, per the §4 rule, and each must land before the batch that needs it):

| Need | Why | Needed before |
|---|---|---|
| `Provenance` claim kinds `practice`, `one-view`, `research`, `standard` (extend K3-7) | `design-docs-rfcs`, `technical-debt` and `monorepo-polyrepo` (same batch) all label claims (AC-0/T3 #24); B31 and others follow | wave 1 (B2) |
| `src/core/protobuf.ts`: extract the wire codec from `grpc-protobuf/model.ts` (`encodeVarint`, `zigzag32`, `tagOf`, `encode`, `readRecords`, `decode`) and migrate `grpc-protobuf` pixel-identically | `schema-evolution` is its second user | wave 1 (B3) |
| `src/core/expr.ts`: extract and extend `debugger-tools/expr.ts` (ternary, exposed tree) | `coverage-mutation-testing` is its second user (and later `compiler-optimisations`, `undefined-behavior` may be) | wave 1 (B2) |
| `src/core/latencyLadder.ts`: extract `LEVELS` from `memory-hierarchy/model.ts` | `back-of-envelope` is its second user | wave 1 (B1) |
| K3-8 addition: **register-history checkers** (`linearizable`, `sequential`, `causal`, convergence) in `core/distSim/invariants.ts` | `consistency-models` and `quorums` in the same batch, plus the R1 retrofit of `cap-theorem` and `replication` | P0-b (wave 2, and R1 in wave 1 if it uses it) |
| K3-8 addition: `latency` callback receives `(rnd, from, to)` | asymmetric links for `physical-clocks-skew` (NTP's symmetric-path assumption), later `wifi-shared-medium`, `quic` | P0-b |
| A small shared **lane editor** (lanes, slot grid, keyboard add/move/select) | `logical-clocks` (events and messages) and `consistency-models` (interval bars) in the same batch both need keyboard-driven timeline editing; they differ in what they draw, so only the lane and keyboard mechanics are shared | P0-b or the wave 1 → 2 round |

**Topics I recommend changing or merging:** none dropped or merged. Notes:
- `exactly-once-myth` carries Two Generals plus three more scenes and is the crowded one; its spec already says scene 4 moves behind an "advanced" tab if it overflows (plan §7.1), never into a separate lesson.
- `consistency-models` is the largest build in the batch (three checkers, a minimal-subset finder, a timeline editor and a simulated service). If the history-checker kit item slips, wave 2 slips with it; build the checkers first and review them on their own.
- `coverage-mutation-testing`'s equivalent-mutant scene needs its tiny language to be small enough to enumerate the whole input domain; the spec fixes the function (`cost`) for that reason.
- `design-docs-rfcs` is the K3-15 pilot: its local `scenario.ts` must be written in the shape in plan §4 so the extraction after wave 1 is a move.
- `dora-metrics` is `nice` but its model builds the "all four improve together" result in by assumption; the spec says so on screen so the simulation never claims to prove a survey finding.

**Tier 4 edges re-read as the plan asks (rule 25):** `queueing-theory` → `backpressure` (its W = 1/(μ − λ) and Little's Law claims are consistent with this spec), `logical-clocks` → `crdts` (per-replica counters merged by max, consistent). The builder still reads each lesson first.

**Verify-against list for reviewers** (every real-world claim written from memory, so each carries a "verify" note above): NTP formulas and defaults (RFC 5905), leap-second count and the TrueTime description, Hyndman and Fan percentile definitions, Armitage et al. repeated-testing table, Confluent compatibility mode names and default, Avro schema resolution, protobuf reserved range and JSON naming, the `Sunset` (RFC 8594) and `Deprecation` header RFC numbers, Pact and `can-i-deploy` descriptions, Evans's context-map pattern definitions, Fowler's debt quadrant, Nygard's ADR template, GitHub CODEOWNERS "last match wins", Ahamad et al. and Mahajan et al. on causal consistency, *The Tail at Scale*, HdrHistogram's expected-interval correction, DORA metric definitions and bands, Kubernetes' horizontal autoscaler formula and stabilisation defaults, browser timer resolution.
