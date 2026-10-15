import type { LessonModule } from '../../core/types';
import { decimal, pctText, sig } from '../../core/format';
import { LONGER_LIST, RAISED_NPROBE, curseFacts, exactFacts, hnswFacts, ivfFacts, tableFacts } from './facts';
import { Stage } from './Stage';

const exact = exactFacts();
const ivf = ivfFacts();
const hnsw = hnswFacts();
const curse = curseFacts();
const table = tableFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Exact nearest-neighbour search compares the query with every vector; approximate indexes such as IVF and HNSW look at a small part of the data and return a good answer with some probability, trading recall for speed, memory and build time.',
    what: 'Brute force computes N distances. IVF cuts the vectors into cells with k-means and scans only the cells nearest the query, so a true neighbour just across a border is missed. HNSW links each vector to near neighbours on layered graphs and walks greedily from a sparse top layer down to the full bottom one, keeping a candidate list of size efSearch. Recall, the share of the true neighbours returned, is what these indexes spend to save distance computations, and in many dimensions, where the nearest and the average distance are close, they lose it sooner.',
    analogy: 'Finding the nearest coffee shop: checking every street is exact but slow; checking only the districts nearest to you is fast but can miss a shop just over a district line; a road network lets you head toward the right area before you look closely.',
    useCases: [
      'Semantic search over text or image embeddings',
      '"More like this" and recommendation lookups',
      'Finding near-duplicate items in a large collection',
      'Choosing settings in a vector database or library',
    ],
    why: 'A vector store hides one trade-off behind its settings: recall against speed, memory and build time. Knowing what nprobe or efSearch buys, and why many dimensions make it harder, lets you tune recall on purpose and read benchmark numbers with care.',
    watch:
      'Exact: grey dots are all the points, green dots the nearest k, the yellow dot is the query you can drag. IVF: the shading is each centroid\'s cell, blue dots were scanned, grey dots were not, a green dot is a true neighbour that was returned and a red dot or red ring a true neighbour that was missed or a wrong one that was returned; the curve is recall against computations. HNSW: one layer at a time, the yellow node and edge are the walk, blue nodes were visited, violet links are upper layers and grey ones layer 0. Why 2-D lies and The trade are computed curves and a table. Chips say what is a toy, simulated, real or from memory.',
  },
  tryThis: [
    `In "Exact costs N", the stat reads ${exact.n} distance computations whatever k is. At the default settings Euclidean and cosine ${exact.rawAgree ? 'agree' : 'pick different neighbours'}; switch Vectors to "Scaled to unit length" and they ${exact.unitAgree ? 'agree' : 'still differ'}.`,
    `In "IVF", the default probes ${ivf.nprobe} of ${ivf.nlist} cells and scans ${ivf.scanned} of ${exact.n} points: recall ${pctText(ivf.recall, 0)}, with ${ivf.missed} true neighbour across a cell border. Raise nprobe to ${RAISED_NPROBE}: recall ${pctText(ivf.twoRecall, 0)}, scanning ${ivf.twoScanned}. Raise it to ${ivf.nlist}: exact, at ${ivf.allComputations} computations, more than brute force.`,
    `In "HNSW", the default efSearch of 1 (a candidate list the size of k) ends in a local minimum: recall ${pctText(hnsw.shortRecall, 0)} after ${hnsw.shortComputations} computations. Set efSearch to ${LONGER_LIST}: recall ${pctText(hnsw.longRecall, 0)} after ${hnsw.longComputations}, against ${exact.n} for brute force.`,
    `In "Why 2-D lies", drag Dimensions from 2 to 256: the gap between the farthest and nearest point, as a share of the nearest distance, falls from ${sig(curse.first.ratio, 3)} to ${decimal(curse.last.ratio, 2)}, and IVF recall at a quarter of the cells falls from ${pctText(curse.first.recall, 0)} to ${pctText(curse.last.recall, 0)}.`,
    `In "The trade", at the settings you left on the IVF and HNSW scenes, IVF reaches recall ${pctText(table.ivf.recall, 0)} in about ${sig(table.ivf.computations, 2)} computations a query and HNSW ${pctText(table.hnsw.recall, 0)} in about ${sig(table.hnsw.computations, 2)}, against ${table.brute.computations} for brute force; HNSW stores ${table.hnsw.extra.toLocaleString('en-US')} extra numbers and IVF ${table.ivf.extra.toLocaleString('en-US')}.`,
  ],
  keyIdeas: [
    'Exact search costs one distance per vector, so in this model its cost grows with N, and an approximate index spends recall to avoid most of those distances.',
    'IVF probes only the nearest cells, so a true neighbour just across a cell border is missed unless nprobe grows; probing every cell is exact but costs more than brute force.',
    'HNSW walks greedily down its layers and can stop in a local minimum; in this model a longer candidate list tends to raise recall, but recall is not guaranteed to rise at every step.',
    'In many dimensions the nearest and the average distance get close, so in this model partitioning loses recall at a fixed nprobe and the 2-D picture misleads.',
  ],
  quiz: [
    {
      q: 'An approximate nearest-neighbour index answers much faster than brute force. Does it return the nearest neighbour?',
      options: [
        'It returns a good one with some probability; the share of true neighbours it finds is the recall it spends for speed',
        'Yes: an index only reorders the search, so the answer matches brute force on every query it is given, however large the data grows',
        'Yes, when k is 1, because the single nearest point is always the first one that an index walks onto',
        'No: it returns random points from the region it probes, with no link between rank and distance',
      ],
      answer: 0,
      why: 'ANN indexes look at part of the data, so the true nearest point can be outside what they examine. Recall measures how often they still find it, and it is the price of the speed.',
    },
    {
      q: 'An IVF query probes one cell. Why can a true neighbour be missing from its answer?',
      options: [
        'It lies across a cell border, in a cell that was not probed, so its distance was never computed',
        'K-means moved it to another cell after the index was built, so the distance stored for it is stale',
        'Distances inside a cell are rounded, so the nearest point can rank behind others from the same cell',
        'The centroid of the probed cell is farther away than the point, so the point is skipped as too close',
      ],
      answer: 0,
      why: 'The query ranks centroids and scans just the nearest cells. In this model a point that is close to the query but belongs to a neighbouring cell is skipped, which is why recall rises with nprobe.',
    },
    {
      q: 'An HNSW search with efSearch = 1 ends far from the true neighbours. What does raising efSearch change?',
      options: [
        'The candidate list keeps more nodes alive, so the walk can climb out of a local minimum, at the cost of more computations',
        'It adds links to the graph, so more nodes become reachable, and the whole build has to be run over again from the first point',
        'It switches the layer to brute force, so the answer is exact from then on for every query it receives',
        'It lowers M, so each node keeps fewer and closer neighbours and the walk across the graph is shorter',
      ],
      answer: 0,
      why: 'Greedy descent follows the single closest neighbour and can stop in a dip. A longer candidate list keeps other promising nodes to expand, which finds a way out but computes more distances.',
    },
    {
      q: 'The data and the share of cells probed stay fixed while the number of dimensions grows. Why does an IVF index lose recall?',
      options: [
        'Distances to near and far points become similar, so the nearest points scatter across many cells and a quarter of the cells misses them',
        'Each new dimension adds a cell to the index, so there are more cells to probe than the fixed share can cover',
        'K-means cannot run in more than a few dimensions, so the cells stop being computed in a meaningful way',
        'High-dimensional points are stored with less precision, which blurs which cell each of them belongs to',
      ],
      answer: 0,
      why: 'As d grows the farthest point is hardly farther than the nearest, so closeness stops separating points into regions. Partitioning then splits true neighbours between cells, which is why 2-D pictures mislead.',
    },
    {
      q: 'IVF with nlist = 8 and nprobe = 8 on 400 points is compared with brute force. What does it give?',
      options: [
        'The exact answer, at about N plus 8 computations, slightly more than brute force',
        'A faster exact answer, because the cells let the search skip half of the points it would visit',
        'The same speed as brute force with a lower recall, since probing every cell adds noise to the result',
        'A faster answer with the same recall as nprobe = 1, because the probed cells overlap the first one',
      ],
      answer: 0,
      why: 'Probing the full set of cells scans each point, so the answer is exact, and the centroid ranking is extra work. In this model the speed-up comes from probing fewer cells than there are.',
    },
  ],
};

export default lesson;
