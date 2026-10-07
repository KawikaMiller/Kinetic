import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'k-means finds k groups in unlabelled data by alternating two steps (assign each point to its nearest centre, move each centre to the mean of its points) until nothing changes. It always converges, but only to a local optimum that depends on where it started.',
    what: 'Unsupervised learning looks for structure without labels. k-means picks k starting centroids, then repeats Lloyd\'s two half-steps: assign every point to its nearest centroid, then move every centroid to the mean of its assigned points. Each half-step can only lower (or keep) the inertia, the sum of squared distances from points to their centroids, so it must stop. Where it stops depends on the start, so libraries run several starts (often seeded with k-means++) and keep the lowest inertia. You choose k yourself, helped by heuristics like the elbow of the inertia curve or the silhouette score.',
    analogy: 'Opening k pizza shops in a town: every customer goes to the nearest shop, then each shop moves to the middle of its own customers, and you repeat until nobody switches shop. Start two shops on the same street and you may settle on a layout that serves the town worse than it could.',
    useCases: [
      'Customer or user segmentation from behaviour data',
      'Colour quantisation: replacing an image\'s colours with k representative ones',
      'Anomaly detection: points far from every centroid are worth a look',
      'Grouping embeddings (documents, products) before labelling or browsing them',
    ],
    why: 'Clustering is often the first thing tried on unlabelled data, and k-means is the default. Knowing that it optimises a specific measure (squared distance), depends on its start and on feature scale, and assumes round blobs stops you from presenting its output as the "true" groups.',
    watch: 'Points start dark grey (not assigned yet) and take their cluster\'s colour after each assign step: blue, violet, orange, pink, light blue and amber are plain categories, not good or bad. Faint tinted cells behind them are the nearest-centroid (Voronoi) regions. Centroids are large ✚ marks in their cluster\'s colour; while they slide during an update step they carry a yellow ring. The hollow grey dot is the edit cursor. The inertia plot is a grey line with a dot per half-step so far, the current one yellow. The elbow plot is a grey line with a dot per k; the bend (or, in silhouette view, the highest score) is the yellow line and dot, and a dashed grey line marks your k. A refusal is red; in captions a cluster\'s name is in its colour and the best restart\'s inertia is green.',
  },
  tryThis: [
    'On "Three clear blobs", step forward one half-step at a time: points recolour on Assign, centroids slide on Update, and the inertia dots only go down.',
    'Load "Bad start" and play it through: two centroids share one blob, and the caption compares the result with the best of 5 restarts.',
    'Load "Moons" with k = 2: k-means cuts straight across both curved groups, however you start it.',
    'Load "Different scales", run it, then flip Features to Standardised: the y values in centimetres stop drowning out x.',
    'Load "Stranded centroid" and step to the first Update: the centroid that won no points is reseeded.',
  ],
  keyIdeas: [
    'Assign to the nearest centroid, move each centroid to its mean, repeat: inertia never goes up, so it always stops.',
    'It stops at a local optimum that depends on the start: run several starts (k-means++) and keep the lowest inertia.',
    'You choose k; the elbow and the silhouette are heuristics, not answers.',
    'Squared distance means round, similar-sized blobs and scale-sensitive features: standardise, or use density or hierarchical clustering for other shapes.',
  ],
  quiz: [
    {
      q: 'k-means split your customers into 4 clusters. What does that tell you?',
      options: [
        'One low-inertia way to cut the data into 4, for that start',
        'That the customers really fall into exactly 4 natural groups',
        'The one best grouping into 4 that any method could produce',
        'Which customer segments will respond to the same marketing',
      ],
      answer: 0,
      why: 'k-means always returns k clusters, because you asked for k, and it finds a local optimum of inertia from its start. It doesn\'t discover how many groups "really" exist or prove the grouping is best; that\'s the tempting misreading.',
    },
    {
      q: 'You rerun k-means with a different random seed and get different clusters. What is going on?',
      options: [
        'It converged to a different local optimum from a different start',
        'A bug: on the same data k-means must return the same answer',
        'The data must have changed, since k-means itself has no randomness',
        'The second run stopped early, before it had fully converged',
      ],
      answer: 0,
      why: 'Lloyd\'s algorithm is deterministic once the start is fixed, but the start is random, and different starts settle into different local optima. That\'s why libraries run several starts and keep the lowest inertia.',
    },
    {
      q: 'One feature is in metres and another in centimetres. Why can that wreck k-means?',
      options: [
        'Distances are dominated by the feature with the biggest numbers',
        'k-means can only cluster features measured in the same units',
        'Centimetre values get rounded, so the cluster means come out wrong',
        'The elbow plot only works when every feature is in metres',
      ],
      answer: 0,
      why: 'k-means measures plain squared distance, so a feature whose values run into the hundreds outweighs one that runs from 2 to 6, even if it\'s pure noise. Standardising each feature to z-scores puts them on an equal footing.',
    },
    {
      q: 'Why does k-means fail on two interlocking crescent shapes?',
      options: [
        'Each point joins its nearest centre, so the regions are convex',
        'It needs labels to tell it which crescent each point belongs to',
        'Two clusters is too few: it needs at least three to converge',
        'Crescents have no mean, so the update step is undefined there',
      ],
      answer: 0,
      why: 'Nearest-centroid regions are always convex polygons (the Voronoi cells), so no choice of k = 2 centroids can trace a curved shape. Density-based methods like DBSCAN, or spectral clustering, handle shapes like these.',
    },
  ],
};

export default lesson;
