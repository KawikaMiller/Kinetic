import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Name the things your app stores (entities), then say how many of each relate to the other. That cardinality decides the tables: one-to-many puts a foreign key on the "many" side, many-to-many needs a join table.',
    what: 'An entity-relationship (ER) diagram draws each kind of thing as a box with its attributes and each relationship as a line. Crow\'s-foot marks at the ends say how many: a bar for one, a three-pronged foot for many, and an outer circle or bar for whether zero is allowed. Turning it into tables is mechanical. Every table gets a primary key. For one-to-many, the many side holds a foreign key to the one side (an order holds user_id). For one-to-one, either side holds a unique foreign key. For many-to-many, neither side can hold it, so a join table holds a pair of foreign keys, plus any facts about the pair, like the quantity on an order line.',
    analogy: 'A school register: each pupil\'s row names their one form tutor, but a pupil takes many classes and a class has many pupils, so there\'s a separate class list pairing them up.',
    useCases: [
      'Designing the tables for a new feature before writing any migrations',
      'Spotting that "tags" or "order lines" need their own join table',
      'Deciding whether a foreign key may be NULL (is the relationship optional?)',
      'Reading an existing schema: every foreign key is a relationship line',
    ],
    why: 'Getting relationships wrong is expensive later: a list stuffed into one column can\'t be joined, indexed or kept consistent, and fixing it means migrating live data. Five minutes with boxes and lines catches it first.',
    watch: 'Primary keys are amber with a key; foreign keys are violet with the table they point to; join tables are blue. When you move a foreign key to the wrong side, the line and the column turn red and the problem is spelled out above the tables.',
  },
  tryThis: [
    'In "A shop", select users places orders: the FK user_id lands on orders, NOT NULL because every order needs a user.',
    'Set "Put the foreign key" to "on users": users would need a list of order ids, and it turns red.',
    'Select orders contains products and try putting the key on either side: neither works, only the join table order_items does.',
    'Change the users-per-order end to "at least zero": user_id becomes NULL-allowed.',
    'Open "An org chart": employees manage employees, so manager_id points at its own table.',
  ],
  keyIdeas: [
    'Entities become tables; attributes become columns; every table gets a primary key.',
    'One-to-many: the foreign key goes on the many side.',
    'Many-to-many: a join table with two foreign keys, which together make its key.',
    'Optional ("zero allowed") on the one side means the foreign key may be NULL.',
    'Facts about a pair (quantity, grade) live in the join table.',
  ],
  quiz: [
    {
      q: 'Students take many courses and courses have many students. Where do you record who takes what?',
      options: [
        'A course_ids column on students',
        'A student_id column on courses',
        'A join table with student_id and course_id',
        'Either of the first two works',
      ],
      answer: 2,
      why: 'Any single foreign key column can point at only one row. A many-to-many relationship needs a table of pairs, one row per enrolment.',
    },
    {
      q: 'One user places many orders. Which table holds the foreign key?',
      options: ['users, as order_id', 'orders, as user_id', 'Both', 'A join table'],
      answer: 1,
      why: 'Each order belongs to exactly one user, so each order row can name it. A user row would need a list.',
    },
    {
      q: 'Where does the quantity of each product on an order belong?',
      options: ['On products', 'On orders', 'On the order_items join table', 'In a quantities table on its own'],
      answer: 2,
      why: 'Quantity is a fact about one product on one order, the pair, so it lives on the row that represents that pair.',
    },
  ],
};

export default lesson;
