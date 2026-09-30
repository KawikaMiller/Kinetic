// Scene kit: compose these inside an <svg viewBox> (or, for Flyer, a positioned div).
// scene.css is loaded globally from main.tsx, so lessons can use the scene-* classes
// on custom shapes without importing a component.

export { Flyer } from './Flyer';
export { Packet, type PacketTiming } from './Packet';
export { Pulse } from './Pulse';
export { SceneNode } from './SceneNode';
export { TravelDot } from './TravelDot';
