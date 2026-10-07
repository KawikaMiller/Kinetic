import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The dot product multiplies two vectors component by component and adds the results; divide by both lengths and you get cos θ, a similarity score that ignores how long the vectors are.',
    what: 'A vector is a list of numbers, drawn as an arrow. Their dot product a·b = aₓbₓ + a_y b_y equals ‖a‖‖b‖ cos θ: how far b reaches along a, times a\'s length. It grows when the arrows point the same way, hits 0 when they\'re perpendicular and goes negative when they point apart. Because length inflates it, search and recommendation systems often divide length back out and rank by cosine similarity (or normalise every vector to length 1 first, which makes the dot product equal the cosine), cos θ = a·b / (‖a‖‖b‖), which runs from −1 to 1.',
    analogy: 'Two people pulling a cart: what counts is how much of each pull points the cart\'s way. A strong pull at a bad angle can move it less than a weaker one straight ahead.',
    useCases: [
      'Search and RAG: rank documents by the cosine between the query\'s embedding and each document\'s',
      'Recommendations: "users like you" compares rating vectors by cosine',
      'Duplicate detection: two texts whose word-count vectors have cosine near 1',
      'Graphics and games: a dot product decides lighting (surface vs light) and whether something faces the camera',
    ],
    why: 'Every vector database, embedding search and recommender ranks by one of these scores, and the choice changes the results. Knowing that the dot product rewards length, and that cosine is undefined for a zero vector, lets you debug "why does this long document always win?" and pick the metric on purpose.',
    watch: 'Dot & cosine: a is a blue arrow and b a violet one, each with a round handle at its tip in its own colour. b\'s shadow on a\'s line is a thick dashed violet segment, the drop line from b\'s tip to it is dashed grey, and θ is a small grey arc at the origin. A pinned candidate b′ is a dashed grey arrow. "undefined" shows in red. Nearest neighbours: the query q is a yellow point; the top 3 documents are green dots with green letters, the others are dark grey dots with grey letters. In cosine mode a dashed grey ray shows q\'s direction; in distance mode a dashed grey circle reaches the third-nearest document. The ranking list for the metric in use has a green border.',
  },
  tryThis: [
    'Load "Perpendicular", then drag b round towards a: the dot product climbs from 0 as the shadow grows.',
    'Flip "Scale b" to 2×: the dot product doubles, cos θ stays exactly where it was.',
    'Load "Long but off-angle vs short and aligned": the dot product prefers the long b′, cosine prefers the short b.',
    'In Nearest neighbours, pick "Short cat question" and switch between Cosine and Distance: the top 3 change completely.',
    'Pick "Empty query (0, 0)": cosine is undefined, but distance still ranks.',
  ],
  keyIdeas: [
    'a·b = aₓbₓ + a_y b_y = ‖a‖‖b‖ cos θ: how far b reaches along a, times a\'s length.',
    'Positive means pointing the same way, 0 means perpendicular, negative means pointing apart.',
    'The dot product grows with length; cosine divides length out, so it compares direction only.',
    'Cosine is undefined for the zero vector, and distance ranks by length as well as direction.',
  ],
  quiz: [
    {
      q: 'A search engine scores documents by the dot product with the query. A very long article keeps beating a short post that is exactly on topic. Why?',
      options: [
        'Its longer vector inflates the dot product',
        'Long articles always point closer to the query',
        'The dot product favours the shorter vector',
        'Dot products ignore every word after the first',
      ],
      answer: 0,
      why: 'a·b = ‖a‖‖b‖ cos θ, so a long vector scores high even at a worse angle. Long articles don\'t point closer to the query by nature; that\'s the tempting mix-up. Cosine divides the lengths out, which is why search usually ranks by it.',
    },
    {
      q: 'a = (3, 1) and b = (−1, 3). What is a·b, and what does it tell you?',
      options: ['0: the arrows are perpendicular', '6: they point the same way', '−6: they point opposite ways', '10: the sum of their lengths'],
      answer: 0,
      why: '3 × (−1) + 1 × 3 = 0. A zero dot product means b casts no shadow on a: the arrows are at 90°. Same direction would give ‖a‖‖b‖ = 10, opposite −10.',
    },
    {
      q: 'You double b and leave a alone. What happens?',
      options: [
        'a·b doubles; cos θ stays the same',
        'a·b and cos θ both double',
        'a·b stays the same; cos θ halves',
        'Both stay the same, since the angle is unchanged',
      ],
      answer: 0,
      why: 'The dot product scales with each length, so it doubles. cos θ = a·b / (‖a‖‖b‖) divides by ‖b‖, which also doubled, so it cancels. That\'s why cosine is called scale-invariant.',
    },
    {
      q: 'Why is the cosine similarity of the zero vector with anything undefined?',
      options: [
        'Its length is 0, so cos θ = a·b / (‖a‖‖b‖) divides by zero',
        'It is perpendicular to every vector, so the cosine is always 0',
        'Its dot product with any vector is 1, which breaks the scale',
        'It points in every direction at once, so all angles apply',
      ],
      answer: 0,
      why: 'The zero vector has no direction, so there\'s no angle to take a cosine of, and the formula becomes 0 / 0. Its dot product with anything is 0, which tempts people to call it perpendicular, but cos θ = 0 would need a real angle of 90°.',
    },
    {
      q: 'A one-line cat tweet and a long cat-care guide use the same mix of words. Which ranks them as near neighbours?',
      options: ['Cosine similarity', 'Euclidean distance', 'Raw dot product', 'Manhattan distance'],
      answer: 0,
      why: 'Their vectors point the same way but differ hugely in length. Cosine compares direction only, so it calls them near-identical. Distance (Euclidean or Manhattan) sees how far apart the tips are, so it calls them far apart; the raw dot product is swayed by length too.',
    },
  ],
};

export default lesson;
