import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Document, key-value, wide-column and graph stores are not "SQL but faster": each one lays data out for a particular kind of question, so you pick the model and the keys from the queries you must answer.',
    what: 'The same shop data can live as relational rows, as order documents with their items embedded, as opaque values behind keys, as wide-column rows grouped into partitions, or as nodes and edges. Each layout makes some lookups one step and others a scan: a document reads a whole order at once but copies product names into every order; a key-value store can only fetch by key; a wide-column partition returns a customer\'s orders already sorted but only if the partition key says so; a graph follows edges but has no cheap "newest first". This is a simplified model of each, counting keyed lookups, round trips and copies.',
    analogy: 'Filing cabinets arranged for different questions: by order number, by customer, by date. A cabinet organised for one question makes the others a walk through every drawer, and a second cabinet that answers the other question is a second set of papers to keep up to date.',
    useCases: [
      'Choosing between Postgres, MongoDB, DynamoDB, Cassandra and Neo4j for a new feature',
      'Designing a DynamoDB or Cassandra table: the partition key and sort key come from the queries',
      'Spotting a hot partition: one key (a constant, a date, a bestseller) taking all the traffic',
      'Knowing what embedding data in a document costs when that data changes',
    ],
    why: 'NoSQL is not "no design": the layout is the design, and a store that fits today\'s query can make tomorrow\'s need a full scan or a rewrite of millions of records. Starting from the access patterns, and counting what each choice costs on reads and writes, avoids that. It does not say one kind of store scales and another does not: relational databases scale too, and each model here is a trade-off. It builds on `sql-basics`, `er-data-modeling`, `normalization` and `hash-table`; spreading data over machines is `sharding`, `replication` and `cap-theorem`.',
    watch: 'Five models of one shop, each as record chips (a graph for the graph model). The record being read now is solid yellow, records already read are blue, and records an update rewrites are orange. Violet lines in the document are embedded sub-documents; dashed violet lines in the graph are the BOUGHT shortcut edges. The code panel shows how order 1042 is stored in that model. The row at the bottom compares all five models for the query: green is the cheapest, red the costliest. In Design from the queries, a red banner and red text mark a hot partition or a query that must read every partition, orange marks a warning or sorting in the application, and green marks one partition.',
  },
  tryThis: [
    'In Five models, pick Document and the price update, press play, and count the orange records; then pick Relational and Graph.',
    'Pick Key-value and "a customer\'s last 10 orders": it has to read every blob. Turn on the index keys and play it again, then read the round trips.',
    'Pick each model for "get order 1042 with its items" and compare the lookups: which model pays for its joins?',
    'In Design from the queries, keep Wide-column and change the partition key until order history is one partition; then switch to the order page query set.',
    'Set the partition key to a constant and read the red banner; then try product_id and compare its warning.',
  ],
  keyIdeas: [
    'Pick the model and the keys from the queries; a layout that suits one query can make another scan everything.',
    "Embedding copies data into many records, so a change to that data rewrites them all.",
    'A wide-column partition key makes one query a single read of sorted rows, and every other query a scatter.',
    "A hot partition is a key that sends most of the traffic to one place: a constant, a date, a bestseller.",
  ],
  quiz: [
    {
      q: 'A team says: "We chose a document store, so we don\'t have to design the data." What is wrong with that?',
      options: [
        'The shape decides which queries are cheap, so it is a design',
        'Document stores need a schema file written before any data',
        'Documents always need joins, so the design is just hidden',
        'Embedded data is not allowed to change once it is saved',
      ],
      answer: 0,
      why: 'Embedding the items in the order makes "get an order" one read and makes "update a product everywhere" a rewrite of every order that embeds it. Those costs follow from choices you make, schema file or not. Documents are often schemaless, but not designless, and they do not need joins for the order page.',
    },
    {
      q: 'In the lesson\'s document model, how many records hold the pen\'s price, counting the catalogue entry?',
      options: ['10', '9', '1', '16'],
      answer: 0,
      why: 'The pen is embedded in 9 of the 16 order documents and is in the catalogue once, so 10 records must change to keep the price consistent everywhere. The relational model stores the price once, so 1 record.',
    },
    {
      q: 'A key-value store holds each order as a blob under order:<id>. What does "a customer\'s last 10 orders" cost with no index keys?',
      options: [
        'A read of every order, since keys cannot be searched by content',
        'A single read, because the keys are already stored in date order',
        'Ten reads, one for each order in the history that was asked for',
        'Nothing extra, since a key-value store sorts all of its values',
      ],
      answer: 0,
      why: 'A key-value store only answers "what is under this key?". It cannot look inside values or filter by customer, so the application must read all 16 blobs, or maintain index keys itself (customer:<id>:orders), which then become another thing to keep correct on every write.',
    },
    {
      q: 'You pick a constant as the partition key of a wide-column table, so every query is served from one partition. What is the problem?',
      options: [
        'All the traffic and data land on a single hot partition',
        'The database refuses a key with only one distinct value',
        'Every query now returns rows in a random order each time',
        'Clustering columns stop working once the key is a constant',
      ],
      answer: 0,
      why: 'One partition lives on one set of nodes, so every read and write hits the same place and the partition grows without bound. That defeats the point of partitioning: the key should spread load evenly (customer_id or order_id do). Clustering still works, and the database accepts a constant.',
    },
    {
      q: 'Which wide-column table answers "a customer\'s 10 newest orders" with one partition read?',
      options: [
        'Partition key customer_id, clustered by order date, newest first',
        'Partition key order_date, clustered by customer_id and product',
        'Partition key order_id, with a secondary index on the customer',
        'Partition key product_id, clustered by order_id and then date',
      ],
      answer: 0,
      why: 'The partition key must be what the query filters on (customer_id) and the clustering order what it sorts by (date, newest first): the first 10 rows of one partition are the answer. Partitioning by date would make today\'s partition take every write (a hot spot), and partitioning by order_id or product_id scatters a customer\'s orders across partitions.',
    },
  ],
};

export default lesson;
