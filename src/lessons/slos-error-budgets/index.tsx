import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "An SLO is a reliability target (e.g. 99.9% of requests succeed over 30 days). The error budget is the failure it allows, and spending that budget is how you decide between shipping features and fixing reliability.",
    what: "An SLI measures what users experience, such as good requests ÷ total requests. The SLO sets a target for it over a window, and 100% minus the target is the error budget: at 99.9% over 30 days that's 43.2 minutes of full outage, or the equivalent in partial failures. Burn-rate alerts page you when the budget is being spent too fast to last the month, and a budget policy agrees in advance what happens when it runs out.",
    analogy: "A monthly spending allowance for risk. Spend it on fast releases and experiments; if an outage blows through it early, you stop discretionary spending until next month.",
    useCases: [
      "Deciding whether a team ships features this week or pays down reliability work",
      "Alerting on user-facing burn rate instead of noisy CPU or error spikes",
      "Setting realistic targets with product teams and dependencies",
      "Contract SLAs, which should be looser than your internal SLOs",
    ],
    why: "Staff-level engineers set reliability strategy across teams. Error budgets turn \"how reliable should we be?\" from an argument into arithmetic, and make the cost of an extra nine visible: it cuts the allowed downtime by 10×.",
    watch: "The blue line is the budget remaining over the month; the dashed grey line is a steady 1× burn that would use it exactly by day 30. Green, yellow and red bands are the release policy zones. Bars along the bottom are the incidents, each in its own colour (amber, pink, violet, orange); 🔔 marks a page (fast burn, red text) and 🎫 a ticket (slow burn, yellow text). Change the SLO target and replay the same month.",
  },
  tryThis: [
    'Play the month at 99.9%: on which day does the budget run out? The caption tells you.',
    'Switch to 99% and replay. The same incidents use about 12% of the budget, and the region outage is the one page.',
    'Switch to 99.99%: the normal background error rate alone spends the whole budget over the month (a 1× burn), and the incidents empty it by day 4.',
    'Compare the slow memory leak: a ticket at 99.9% (1.4× over 3 days), but a page at 99.99% (16× over 1 hour).',
  ],
  keyIdeas: [
    'Error budget = (100% − SLO) × window: 99.9% over 30 days = 43.2 minutes.',
    'Each extra nine cuts the budget 10×: 7.2 h → 43.2 min → 4.32 min.',
    'Alert on burn rate (how fast budget is being spent), with fast windows paging and slow windows ticketing: 14.4× for 1 hour spends 2% of a 30-day budget.',
    'Agree a budget policy up front: budget left means ship; budget spent means freeze and fix.',
  ],
  quiz: [
    {
      q: 'What is the error budget for a 99.9% availability SLO over 30 days?',
      options: ['4.32 minutes', '43.2 minutes', '7.2 hours', '8.76 hours'],
      answer: 1,
      why: '30 × 24 × 60 = 43,200 minutes, and 0.1% of that is 43.2 minutes.',
    },
    {
      q: 'Requests are failing at 1.44% against a 99.9% SLO. What is the burn rate?',
      options: ['1.44×', '14.4×', '144×', '0.144×'],
      answer: 1,
      why: 'Burn rate = observed error rate ÷ allowed error rate = 1.44% ÷ 0.1% = 14.4×, the classic 1-hour page threshold.',
    },
    {
      q: 'Your team has spent its whole error budget by day 20. What does a usual error-budget policy say?',
      options: [
        'Ignore it, because the budget only matters at quarter end',
        'Lower the SLO right away so the budget looks healthy again',
        'Pause risky launches and put the team on reliability work',
        'Page the whole organisation every hour until it recovers',
      ],
      answer: 2,
      why: 'The budget is the agreed amount of risk; once it is spent, the team shifts effort to reliability until it recovers.',
    },
    {
      q: 'A team proposes a 100% availability SLO "to be safe". What does that do to its error budget?',
      options: [
        'It leaves a budget of zero, so a single failure is a breach',
        'It doubles the budget, because stricter targets get more slack',
        'It cuts the budget by 10×, which a careful team can absorb',
        'It has no effect, because the budget is set by the contract SLA',
      ],
      answer: 0,
      why: 'Budget = (100% − SLO) × window, so a 100% target gives zero. A routine deploy or a dependency blip would break it, which is why teams choose a target below 100% on purpose.',
    },
    {
      q: 'At a 99.9% SLO over 30 days, a 14.4× burn lasting 1 hour spends what share of the budget?',
      options: ['14.4% of the budget', '20% of the budget', '0.2% of the budget', '2% of the budget'],
      answer: 3,
      why: '14.4 × 1 hour ÷ 720 hours in the window = 2%. That is why 14.4× over an hour is a common page threshold.',
    },
  ],
};

export default lesson;
