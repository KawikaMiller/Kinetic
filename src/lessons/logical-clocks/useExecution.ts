import { useState } from 'react';
import type { LaneModel } from '../../core/laneEditor';
import { DEFAULT_PRESET, type EvData, type ExecModel, type ExecPreset } from './execution';

const UNDO_DEPTH = 20;

export interface ExecutionState {
  model: ExecModel;
  loaded: string | null;
  message: string;
  canUndo: boolean;
  change: (next: LaneModel<EvData>) => void;
  setMessage: (m: string) => void;
  undo: () => void;
  load: (p: ExecPreset) => void;
}

/** The drawing the learner is working on, kept above the scenes so scene 2 sees what scene 1 drew. */
export function useExecution(): ExecutionState {
  const [model, setModel] = useState<ExecModel>(() => DEFAULT_PRESET.model());
  const [loaded, setLoaded] = useState<string | null>(DEFAULT_PRESET.id);
  const [undoStack, setUndo] = useState<ExecModel[]>([]);
  const [message, setMessage] = useState('');

  return {
    model,
    loaded,
    message,
    canUndo: undoStack.length > 0,
    setMessage,
    change: (next) => {
      if (next.items !== model.items || next.links !== model.links) {
        setUndo((u) => [...u.slice(-(UNDO_DEPTH - 1)), model]);
        setLoaded(null);
      }
      setModel(next);
      setMessage('');
    },
    undo: () => {
      const previous = undoStack.at(-1);
      if (!previous) return;
      setUndo((u) => u.slice(0, -1));
      setModel(previous);
      setMessage('');
    },
    load: (p) => {
      setModel(p.model());
      setLoaded(p.id);
      setUndo([]);
      setMessage('');
    },
  };
}
