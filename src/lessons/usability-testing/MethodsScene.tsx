import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { methodCaption } from './captions';
import { CURVE_PARTICIPANTS, methodResults, runSessions, type MethodResults } from './model';

type Method = 'survey' | 'analytics' | 'test';
const METHODS: { value: Method; label: string }[] = [
  { value: 'survey', label: 'Survey' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'test', label: 'Moderated test' },
];

interface Card {
  kind: string;
  headline: (r: MethodResults) => string;
  tells: string;
  cannot: string;
}
const CARDS: Record<Method, Card> = {
  survey: {
    kind: 'What people say',
    headline: (r) => `${r.surveyYes} of ${r.n} said "easy to find"`,
    tells: 'How people feel and what they remember or believe about the product.',
    cannot: 'What they actually did. People answer politely, and nobody was watched.',
  },
  analytics: {
    kind: 'What happened',
    headline: (r) => `Coupon box clicked in ${r.couponClicks} of ${r.n} sessions; ${r.paid} paid`,
    tells: 'How many people did what, at scale, with no one in the room.',
    cannot: 'Why. A click in the coupon box could be a coupon or a card number.',
  },
  test: {
    kind: 'Why it happened',
    headline: (r) => (r.quotes.length ? `${r.quotes.length} of ${r.n} typed a card number into it` : `Nobody met the coupon box in ${r.n} sessions`),
    tells: 'What a person was trying to do, where they got stuck and the words they used.',
    cannot: 'How common it is: a handful of people cannot give you a percentage.',
  },
};

export function MethodsScene({ picker }: { picker: ReactNode }) {
  const [method, setMethod] = useState<Method>('survey');
  const r = useMemo(() => methodResults(runSessions(CURVE_PARTICIPANTS)), []);
  useIntroCaption(methodCaption(method, r), [method]);
  const card = CARDS[method];

  return (
    <StageFrame
      height={400}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'what it can tell you', shape: 'square' },
            { color: 'var(--bad)', label: 'what it cannot', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Method" value={method} onChange={setMethod} options={METHODS} />
        </>,
      ]}
    >
      <div className="ut stage-pad">
        <SectionTitle>The question: will people find the coupon box?</SectionTitle>
        <Box className="ut-method">
          <p className="ut-kind">{card.kind}</p>
          <p className="ut-headline">{card.headline(r)}</p>
          {method === 'test' && r.quotes.map((q) => <p key={q.participant} className="log-row tone-info">P{q.participant}: “{q.say}”</p>)}
          <p className="ut-tells"><b>Tells you</b> {card.tells}</p>
          <p className="ut-cannot"><b>Cannot tell you</b> {card.cannot}</p>
        </Box>
        <Hint block>
          The same {CURVE_PARTICIPANTS} simulated participants answer all three. Survey answers are drawn independently of what each participant did, to show that stated and actual behaviour can differ; real surveys are not that disconnected.
        </Hint>
      </div>
    </StageFrame>
  );
}
