import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Draw a system at four zoom levels (context, containers, components, code) instead of one diagram with everything on it, so each picture answers one audience\'s question at one level of detail.',
    what: 'The C4 model is Simon Brown\'s way of drawing software architecture. Level 1, System Context, shows the system as one box with the people and other systems around it. Level 2, Containers, opens it into the separately running parts (a web app, an API, a database, a queue). Level 3, Components, opens one container, and level 4, Code, opens one component into classes, which most teams skip or generate. C4 does not prescribe a notation: boxes and labelled arrows are enough.',
    analogy: 'A map app: the world, then the country, then the city, then the street. You do not read a street plan to decide which country to fly to, and a world map will not tell you which door to knock on.',
    useCases: [
      'Onboarding a new engineer with a picture of the parts before they open any code',
      'Explaining a system to non-engineers using only the context diagram',
      'Finding which service an alert belongs to, and what it talks to, during an incident',
      'Reviewing a design proposal or an architecture decision against a shared set of diagrams',
    ],
    why: 'Most architecture diagrams fail the same way: boxes of different sizes and kinds, arrows with no labels, and no hint of what level you are looking at. Knowing the four levels gives you a vocabulary for what to draw, what to leave out and who each diagram is for. It also makes you better at reading other teams\' diagrams, and at spotting the ones that mix a database table with a whole payment system.',
    watch:
      'Boxes are the model\'s elements, each with its name and a second line (a technology, or its kind at the top level). People are tinted sky blue, the system in focus is solid yellow, external systems are tinted grey, containers blue, components violet, and the code-level classes amber. A dashed yellow frame with a yellow title marks the box you zoomed into, and the boxes outside it are its neighbours. A + in a box corner means you can click it to zoom in. Arrows are grey; their labels are in the normal text colour, with any protocol in grey brackets after the intent. The audience picker puts a star on the zoom level that answers their question; at that level, detail they do not need (technology, protocol) is faded, and at every other level the whole picture fades. The stats are yellow for the zoom level and plain for the counts. In the bad-diagram scene, boxes with no stated type are plain grey, and fixing them tints each by kind in the same colours. The title is plain text, or grey italics when missing. The checklist rows are orange with a hollow circle while a check is failing and green with a tick once it passes, and the Readability score is orange until all five pass and green after; the "deeper than level 2" count is orange above 0 and green at 0.',
  },
  tryThis: [
    'Click the Book a table box (it has a +): the frame grows out of it and five containers appear. Click API, then Availability service, to reach the code.',
    'Pick Executive in the audience picker: the stage jumps to level 1 (Context), and at levels 2 to 4 the whole picture fades.',
    'Pick On-call, then New engineer: both land on Containers, but the on-call view keeps the protocols (SQL, AMQP) at full strength and the engineer view fades them.',
    'Open Fix a bad diagram and tick "Keep one level per diagram": the reservations table folds into the Database box and the arrow follows it.',
    'Tick the five fixes in any order: the Readability score goes from 0 to 5, one check at a time, whatever order you pick.',
  ],
  keyIdeas: [
    'One diagram per level and per audience: a single diagram that shows everything answers nobody\'s question.',
    'Context shows people and systems, containers show what runs, components show what is inside one container, code is optional.',
    'Label every arrow with its intent, and from the container level down with the protocol too, and give every diagram a title and a key.',
    'Keep one level per diagram: do not put a database table next to a whole external system.',
  ],
  quiz: [
    {
      q: 'Why does C4 use several diagrams instead of one detailed diagram of everything?',
      options: [
        'Each audience has a different question, and a mixed diagram answers none',
        'Drawing tools can only fit a small number of boxes into one diagram',
        'Each level is a separate document owned by a different team lead',
        'Detail makes a diagram wrong, so the deeper levels are never drawn',
      ],
      answer: 0,
      why: 'An executive asks what the system does and depends on; a new engineer asks what the parts are; on-call asks what talks to what. One diagram that tries to serve all of them becomes cluttered. Tool limits are not the reason, and deeper levels are not wrong, just optional (the code level in particular).',
    },
    {
      q: 'Which C4 level shows the Database as a PostgreSQL box that the API calls over SQL?',
      options: ['Container', 'Context', 'Component', 'Code'],
      answer: 0,
      why: 'Containers are the separately running parts of the system, each with its technology, and the arrows between them name the protocol. The context level draws the whole system as one box and has no database in it; components are the inside of one container such as the API.',
    },
    {
      q: 'What is a "container" in the C4 model?',
      options: [
        'A separately running part, such as a web app, an API or a database',
        'A Docker image that packages the application so it can be deployed',
        'A class whose job is to hold a collection of other objects in memory',
        'A boundary that groups several systems owned by one engineering team',
      ],
      answer: 0,
      why: 'In C4 a container is something that has to be running for the system to work, like the API process or the database. It has nothing to do with Docker specifically, though a Docker container can be how one is deployed.',
    },
    {
      q: 'How many boxes does the Component diagram of the API show inside its dashed frame?',
      options: ['5', '4', '6', '9'],
      answer: 0,
      why: 'The frame holds the API\'s five components. The other four boxes drawn around it (Web app, Database, Message queue and Payment provider) are neighbours, shown outside the frame so the arrows have somewhere to go; 9 counts both groups.',
    },
    {
      q: 'A container diagram draws a database table next to the whole Payment provider. What is wrong with it?',
      options: [
        'It mixes levels: the table lives inside the Database container',
        'External systems may never appear on a container diagram at all',
        'Tables always belong on a container diagram as their own boxes',
        'Nothing: extra detail never hurts the person reading a diagram',
      ],
      answer: 0,
      why: 'A table is inside the Database container, so it belongs on a deeper diagram, and the container diagram should show the Database box instead. External systems and people are allowed on a container diagram, as the real one in scene 1 shows; they are the context around the containers.',
    },
  ],
};

export default lesson;
