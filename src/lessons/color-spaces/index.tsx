import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The numbers in a colour like #808080 are not amounts of light: sRGB stores light on a curve, so mixing or comparing colours means picking the right space first.', // allow-color: a colour named in the lesson's text
    what: 'sRGB values are encoded. The IEC 61966-2-1 transfer function turns a stored value into linear light with a short straight toe and then a 2.4 power curve (close to, but not, a plain 2.2 gamma), so sRGB 128 is only about 22% of the light. A gradient that mixes the stored numbers (in srgb) can dip darker in the middle than either end: the muddy band. Mixing linear light (in srgb-linear) is physically right but looks uneven, while OKLCH, Björn Ottosson\'s perceptual space, keeps lightness changing evenly. HSL and HSV are RGB rearranged into a cylinder, so "L = 50%" is the same number for a yellow and a blue that look nothing alike. WCAG 2.x contrast, from the `accessibility` lesson, is a ratio of linear luminances, and it agrees only roughly with perceived lightness.',
    analogy: 'A volume knob with a log taper: halfway round the dial isn\'t half the power, it\'s where it sounds about half as loud. Doing maths on the dial positions instead of on the power gives odd answers, and so does doing maths on sRGB numbers instead of on light.',
    useCases: [
      'CSS gradients and color-mix(): `in oklch` or `in srgb-linear` instead of the default sRGB mix',
      'Design systems generating palettes in OKLCH so each step looks evenly lighter (Tailwind CSS v4 among them)',
      'Image processing: resizing, blurring and blending in linear light, so fine detail doesn\'t darken',
      'Accessibility checks: WCAG contrast ratios computed from linear luminance',
    ],
    why: 'Colour bugs look like design bugs: muddy gradients, dark fringes when images are scaled, a "50% grey" that\'s too dark, palettes whose steps jump unevenly, and contrast that passes a checker but still reads badly. Knowing which space your numbers live in tells you which of those is a maths mistake.',
    watch: 'Gradients: the three strips show the colours themselves, drawn by your browser. Under each, a blue line plots the perceived lightness (OKLab L) of the colours shown along the strip (where oklch leaves sRGB, a dashed blue line adds OKLCH’s own L before mapping), a grey dashed line marks the darker end\'s level, and a red line and dot mark the deepest dip below both ends; a midpoint stat turns red when its strip dips. Gamma: the blue curve is the sRGB decoding curve and the grey dashed curve a plain 2.2 gamma; the yellow dot is your grey (drag it) with grey dashed crosshair lines through it, and the violet dot is sRGB 188, half the light. The patches are the greys themselves. Models: the swatches are the colours themselves, with their perceived lightness under each; your colour\'s table row is yellow. Contrast: the preview uses your two colours; pass labels are green and fail labels red, and the ratio stat is green when it passes AA for body text and red when it doesn\'t.',
  },
  tryThis: [
    'In Gradients, with "red → green", watch the srgb strip go muddy in the middle: its lightness line dips below both ends at the red marker.',
    'Pick "black → white": nothing dips now, but the srgb-linear strip turns light almost straight away.',
    'In Gamma, drag the yellow dot to 128: about 22% of the light. Half the light needs sRGB 188.',
    'In Models, read the perceived lightness under the three HSL "L = 50%" swatches, then under the OKLCH row.',
    'In Contrast, compare "#777 on white" with "blue on black": almost the same ΔL, very different WCAG ratios.', // allow-color: a colour named in the lesson's text
  ],
  keyIdeas: [
    'sRGB values are encoded, not linear: 128 is about 22% of the light, and half the light is 188.',
    'Mix colours in a space that fits the job: linear light for physics, OKLCH for gradients that look even.',
    'HSL lightness is not perceived lightness; OKLCH\'s L is built to be.',
    'WCAG 2.x contrast is a luminance ratio that tracks perceived lightness only roughly, and it\'s still what audits use.',
  ],
  quiz: [
    {
      q: 'A grey stored as rgb(128, 128, 128) sits halfway up the 0-255 scale. How much light does it give, compared with white?', // allow-color: a colour named in the lesson's text
      options: [
        'About 22%: sRGB stores light on a curve',
        'Exactly 50%: the value is halfway to 255',
        'About 73%: brighter than half, like a gamma',
        'It depends only on the screen\'s brightness',
      ],
      answer: 0,
      why: 'sRGB values are encoded with the IEC transfer curve, and decoding 128/255 gives 0.216 of white\'s light; 50% of the light is stored as about 188. The 73% is that curve read backwards (encoding 50% gives 0.735). Screen brightness scales everything, but the 22% share is in the encoding itself.',
    },
    {
      q: 'hsl(60 100% 50%) is yellow and hsl(240 100% 50%) is blue. Do they look equally light?',
      options: [
        'No: HSL\'s L ignores how bright a hue looks',
        'Yes: both have the same lightness value, 50%',
        'Yes, as long as the screen is calibrated well',
        'No: blue looks lighter, because it has more energy',
      ],
      answer: 0,
      why: 'HSL\'s L is the average of the largest and smallest RGB channel, so pure yellow and pure blue both get 50%. Their perceived lightness is far apart: OKLCH gives about 0.97 for that yellow and 0.45 for the blue. Calibration can\'t fix a formula that never looked at perception.',
    },
    {
      q: 'A CSS gradient from red to green looks muddy in the middle. Which change helps most?',
      options: [
        'Interpolate it in oklch instead of srgb',
        'Add more colour stops of the same red and green',
        'Write the two colours as hsl() instead of hex',
        'Make the gradient longer so the mud spreads out',
      ],
      answer: 0,
      why: 'Between hex, rgb() or hsl() colours, a gradient mixes the stored sRGB numbers unless told otherwise, and the midpoint (128, 128, 0) is darker than both ends. `in oklch` keeps perceived lightness on a straight line. Writing the stops as hsl() changes nothing: they are still mixed in srgb.',
    },
    {
      q: 'Which number do accessibility audits use today to judge text contrast?',
      options: [
        'The WCAG 2.x luminance ratio, such as 4.5:1',
        'The OKLCH lightness difference ΔL between them',
        'The HSL lightness gap between text and page',
        'The difference between the two hex numbers',
      ],
      answer: 0,
      why: 'WCAG 2.x (AA: 4.5:1 for body text) is what laws and audits point to. OKLCH ΔL follows perceived lightness better, and APCA is a candidate for WCAG 3, which is still a draft, but neither is today\'s audit criterion. #777 on white and blue on black have nearly the same ΔL, yet WCAG rates them 4.48:1 and 2.44:1.', // allow-color: a colour named in the lesson's text
    },
    {
      q: 'Shrinking an image averages a black pixel with a white one. Done in linear light, which stored sRGB value is right?',
      options: [
        'About 188: half the light, encoded back',
        'Exactly 128: half of 255 in the stored numbers',
        'About 64: a quarter, since light adds as squares',
        'About 245: averages always round towards white',
      ],
      answer: 0,
      why: 'Light adds linearly, so half black and half white is 50% light, and encoding 0.5 gives sRGB 188. Averaging the stored numbers gives 128, which is only 22% of the light: that\'s why naive resizing darkens fine detail.',
    },
  ],
};

export default lesson;
