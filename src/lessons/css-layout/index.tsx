import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Every element on a web page is a rectangle. The box model says how big each one is; flexbox and grid say where they all go.',
    what: 'A box is its content, then padding, then a border, then margin outside. By default width sets only the content, so padding and border are added on top; box-sizing: border-box makes width include them. Two vertical margins that touch collapse into the larger one instead of adding up. Flexbox lays items along one line and shares out the leftover space with flex-grow; grid lays them out in rows and columns at once, on numbered grid lines.',
    analogy: 'A framed picture: the picture is the content, the mount around it is padding, the frame is the border, and the gap you leave on the wall around the frame is the margin.',
    useCases: [
      'Working out why a "200px" card is actually 244px wide',
      'A nav bar whose links spread out evenly (justify-content)',
      'A card grid that fits as many columns as the screen allows (auto-fill + minmax)',
      'A page layout with a fixed sidebar and a flexible main column',
    ],
    why: 'Layout bugs are the most common front-end bugs, and they are almost always the box model or a flex/grid rule behaving exactly as specified. Once you can predict padding, collapsing margins and free space, you stop fixing CSS by trial and error.',
    watch: 'The sandbox is real HTML you can resize by dragging its right edge. In the box model, orange striped space is margin, the yellow line is the border, green is padding and blue is content, with each measurement labelled beside the box. The margin-collapse preset stripes each paragraph\'s margin in orange so you can see them overlap. In flexbox, blue boxes are the items, the one you are editing is yellow, and violet striped regions are the free space the browser left over. In grid, grey dashed lines are the grid lines, numbered from 1. Under the sandbox, the generated CSS highlights the property you last changed, and the table lists what the browser measured.',
  },
  tryThis: [
    'Box model: note the box width, then switch box-sizing to border-box. The total stops growing when you add padding.',
    'Pick the "Margin collapse" preset: 20px + 30px margins leave a gap of just 30px.',
    'Flexbox: give item 2 a flex-grow of 2 and item 3 a flex-grow of 1, and see the free space split 2 : 1.',
    'Flexbox: turn on flex-wrap and drag the container narrower until items jump to a new line.',
    'Grid: choose the auto-fill template and drag the width: columns appear and disappear on their own.',
  ],
  keyIdeas: [
    'A box is content + padding + border (+ margin outside); width is only the content unless box-sizing is border-box.',
    'Adjacent vertical margins collapse: 20px and 30px give 30px, not 50px.',
    'Flexbox is one direction: flex-basis first, then flex-grow shares out the free space.',
    'Grid is two directions: columns and rows, on numbered lines; fr means a share of the leftover space.',
  ],
  quiz: [
    {
      q: 'A div has width: 200px and padding: 20px, with the default box-sizing. How wide is it on screen (ignoring border)?',
      options: ['200px', '220px', '240px', '160px'],
      answer: 2,
      why: 'content-box width is the content only, so padding is added to both sides: 200 + 20 + 20 = 240. With border-box it would be 200.',
    },
    {
      q: 'Paragraph A has margin-bottom: 20px and paragraph B below it has margin-top: 30px. How big is the gap?',
      options: ['50px', '30px', '20px', '25px'],
      answer: 1,
      why: 'Adjacent vertical margins collapse to the larger of the two. They only add up when something (padding, a border, a flex or grid parent) separates them.',
    },
    {
      q: 'Three flex items share 300px of free space with flex-grow 1, 1 and 2. How much extra does the third get?',
      options: ['100px', '150px', '200px', '300px'],
      answer: 1,
      why: 'Free space is shared in proportion to flex-grow: 2 of 4 shares, so half of 300px.',
    },
  ],
};

export default lesson;
