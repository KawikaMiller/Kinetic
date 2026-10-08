import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Normalization splits a table so that each fact is stored exactly once, which stops updates, deletes and inserts from corrupting or losing data.',
    what: 'A functional dependency A → B says that knowing A fixes B: a customer id fixes the email, a product id fixes the price. A table repeats a fact when it stores B next to things that don\'t determine it, and every repeat is a copy that can drift. 1NF makes every cell a single value. 2NF removes columns that depend on only part of a composite key. 3NF removes columns that depend on a non-key column (a transitive dependency). BCNF is the stricter version: the left side of every non-trivial dependency must be a superkey (3NF lets a dependency slip when its right side is part of a key).',
    analogy: 'Writing a friend\'s phone number on every party invitation you send them, instead of once in your address book. When the number changes, you will miss one, and if you throw the invitations away, the number goes with them.',
    useCases: [
      'Designing the tables for a new feature so an email change is one UPDATE, not a hunt',
      'Diagnosing "the report shows two prices for one product" bugs',
      'Reviewing a schema migration that adds a copied column for speed',
      'Explaining in a design review why a JOIN is the price of a clean model',
    ],
    why: 'Most data bugs that survive testing are anomalies: two rows that disagree, a delete that took a customer with it, a record that can\'t be saved until something unrelated exists. Normalizing is how you design them out instead of patching them, and knowing what it costs (joins) lets you decide when to bend it. It builds on `er-data-modeling`, `sql-basics` and `relational-algebra`.',
    watch: 'The functional dependencies sit at the top; a dependency that breaks a normal form at this design is a red line with "breaks 2NF in orders" beside it. Next to it, each anomaly is a green "fixed" or red "present" chip for this design, the one being tried tinted orange. In the tables, key columns have a yellow header with a key glyph, foreign keys a violet header with an FK tag, and cells that repeat a fact are tinted orange. Right after a split, the columns that moved into a new table flash blue. Pressing an anomaly shows its effect: cells that now contradict each other are red and bold, a list squeezed into one cell is red italics, a newly added product row is green, and the console says what happened in green or red. At the bottom, the query that reads an invoice back, with its join count.',
  },
  tryThis: [
    "At 1NF, press \"Change Ada's email in one row\" and find the red cells. Keep it pressed and step Design up to 3NF.",
    'Press "Delete order 1004" at 1NF, 2NF and 3NF: what does each design forget?',
    'At 1NF, press "Add a product nobody has ordered", then switch Design to 2NF.',
    'Step from 1NF to 2NF and watch which columns move into products and order_lines; then read which dependency is still red.',
    'Compare the reading-back query at 1NF and at 3NF, and count the joins.',
  ],
  keyIdeas: [
    "Normalization stores each fact once, so a write can't leave two copies disagreeing.",
    '2NF: nothing depends on only part of the key. 3NF: nothing depends on a non-key column.',
    "Each anomaly comes from a fact stored next to things it doesn't depend on.",
    'Every split costs a join on read: that trade-off is why some systems denormalize on purpose.',
  ],
  quiz: [
    {
      q: 'What is the main reason to normalize a schema?',
      options: [
        'To stop anomalies: each fact stored once, never contradicted',
        'To save disk space by removing every repeated value stored',
        'To make every query run faster by giving it smaller tables',
        'To let the database choose the keys for each table',
      ],
      answer: 0,
      why: 'The point is integrity: with a fact in one place, an update can\'t miss a copy, a delete can\'t take unrelated facts with it, and an insert doesn\'t need unrelated data. Space savings are a side effect at best (the split adds key columns), and reads often get slower, since they now need joins.',
    },
    {
      q: 'lines(order_id, product_id, product_name, quantity) has the key (order_id, product_id). Which normal form does product_id → product_name break?',
      options: ['2NF', '1NF', '3NF', 'BCNF'],
      answer: 0,
      why: 'product_name depends on product_id, which is only part of the key: a partial dependency, exactly what 2NF forbids. Every cell is a single value, so 1NF holds. 3NF and BCNF are stricter and fail too, but 2NF is the first one it breaks.',
    },
    {
      q: 'In the 2NF design, deleting order 1004 still loses something. What, and why?',
      options: [
        "Grace's email: it's stored only on her order's row",
        "The stapler's price: it's stored only on order lines",
        'Nothing: 2NF has already removed every anomaly',
        'The order lines of every other York order',
      ],
      answer: 0,
      why: "In 2NF the orders table still carries customer_email, which depends on customer_id, not on the order: a transitive dependency. Grace's only order was 1004, so her email goes with it. The stapler's price is safe, because 2NF moved prices into products. 3NF moves customers out too.",
    },
    {
      q: 'customers(customer_id, name, email), with customer_id → name, email. Is it in 3NF?',
      options: [
        'Yes: its only determinant, customer_id, is the key',
        'No: name and email both depend on customer_id alone',
        'No: only a composite key can reach 3NF',
        'Only once every customer has placed an order',
      ],
      answer: 0,
      why: 'Depending on the key is exactly what columns should do. 3NF (and BCNF) only forbid dependencies on something that isn\'t a key, and here the one left side is the key itself. A single-column key is fine.',
    },
    {
      q: 'Going from the one wide table to the 3NF design, what does printing an invoice now cost?',
      options: [
        'Joins: the facts now live in four tables, not one',
        'Nothing: the database merges the tables for you',
        'More disk, for the copies kept in each table',
        'A full scan of every table for each invoice',
      ],
      answer: 0,
      why: "The lesson's invoice query goes from no joins to three. That's the honest price of storing each fact once. There are fewer copies, not more, and with indexes on the keys a join doesn't need full scans (see `db-indexes`).",
    },
  ],
};

export default lesson;
