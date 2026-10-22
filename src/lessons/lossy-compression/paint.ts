import { CHANNEL_MAX, type Rgb } from '../../components/canvasImage';

/** A grey level 0..255 as a colour. */
export const grey = (v: number): Rgb => [v / CHANNEL_MAX, v / CHANNEL_MAX, v / CHANNEL_MAX];
