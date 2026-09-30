// Stylised world map: very rough continent outlines, turned into a dot grid, and
// the equirectangular projection the canvas draws with.

export interface LonLat {
  lon: number;
  lat: number;
}

// Projection bounds
const LON0 = -170;
const LON1 = 182;
const LAT0 = 78;
const LAT1 = -58;

/** Longitude/latitude to pixels in a w×h map. */
export const project = (p: LonLat, w: number, h: number) => ({
  x: ((p.lon - LON0) / (LON1 - LON0)) * w,
  y: ((LAT0 - p.lat) / (LAT0 - LAT1)) * h,
});

const LAND: [number, number][][] = [
  // North America
  [[-168, 65], [-140, 70], [-95, 72], [-78, 62], [-60, 52], [-66, 44], [-75, 35], [-81, 25], [-97, 26], [-97, 20], [-87, 15], [-83, 9], [-78, 8], [-92, 15], [-105, 20], [-114, 30], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 60]],
  // Greenland
  [[-55, 60], [-22, 70], [-25, 82], [-60, 82], [-72, 76]],
  // South America
  [[-80, 10], [-62, 11], [-50, 0], [-35, -7], [-40, -22], [-48, -28], [-58, -38], [-66, -55], [-73, -50], [-72, -35], [-70, -18], [-81, -5]],
  // Europe
  [[-10, 36], [-9, 44], [-2, 48], [4, 52], [5, 62], [10, 71], [30, 71], [40, 66], [45, 55], [40, 45], [28, 41], [22, 36], [10, 38], [3, 43]],
  // British Isles
  [[-5.5, 50], [1.5, 51], [-2, 55.5], [-3, 58.6], [-6.5, 57.5], [-5, 54], [-10, 52], [-9, 54.5]],
  // Africa
  [[-17, 21], [-10, 35], [10, 37], [32, 31], [35, 28], [43, 12], [51, 12], [40, -5], [40, -15], [33, -26], [20, -35], [12, -18], [9, 4], [-8, 4], [-17, 14]],
  // Arabia
  [[35, 28], [43, 12], [52, 15], [58, 22], [56, 26], [50, 30], [48, 30], [35, 33]],
  // Asia
  [[28, 41], [45, 42], [52, 47], [60, 40], [55, 26], [60, 25], [67, 24], [72, 20], [77, 8], [80, 15], [88, 22], [92, 21], [98, 16], [100, 5], [104, 1.5], [106, 10], [109, 20], [120, 23], [122, 30], [121, 40], [128, 38], [130, 43], [140, 48], [142, 54], [135, 55], [160, 60], [170, 65], [180, 68], [180, 72], [140, 74], [100, 78], [70, 73], [60, 70], [45, 68], [40, 66], [45, 55], [40, 45]],
  // Indonesia (roughly)
  [[95, 5], [106, -6], [115, -8.5], [125, -9], [140, -8], [141, -2], [131, -1], [119, 2], [110, 2], [104, -2]],
  // Japan
  [[130, 31], [135, 33.5], [140, 35], [141.5, 41], [142, 45.5], [145, 43.5], [140, 39.5], [137, 37]],
  // Australia
  [[114, -22], [122, -17], [130, -12], [137, -12], [142, -10.8], [146, -19], [153, -26], [151, -34], [146, -39], [140, -38], [131, -31.5], [115, -34]],
];

const GRID_DEG = 2.2;

function inside(lon: number, lat: number, poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

let landDots: [number, number][] | null = null;

/** Land points on a 2.2° grid, computed once. */
export function getLandDots() {
  if (landDots) return landDots;
  const dots: [number, number][] = [];
  for (let lat = 76; lat > -56; lat -= GRID_DEG) {
    for (let lon = -168; lon < 180; lon += GRID_DEG) {
      if (LAND.some((p) => inside(lon, lat, p))) dots.push([lon, lat]);
    }
  }
  landDots = dots;
  return dots;
}
