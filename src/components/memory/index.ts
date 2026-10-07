export { HeapObject, type HeapField, type HeapVariant, type TagPlacement } from './HeapObject';
export { RefArrow } from './RefArrow';
export { VarSlot } from './VarSlot';
export {
  HEAP, SLOT, fanBend, heapFieldPort, heapHeight, heapRect, rectCenter, rectEdgeToward, slotPort, slotValueRect, stackBoxes,
  type PortSide, type Rect,
} from './geometry';
export { MemoryMap, MemoryMapGroup, type MemoryMapProps } from './MemoryMap';
export {
  MEMMAP, formatAddr, memCellRect, memPort, memRegionRect, memoryMapLayout, rowAt,
  type MemBand, type MemCell, type MemLayout, type MemPointer, type MemRegion, type MemRow,
} from './mapLayout';
