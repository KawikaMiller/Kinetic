import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { PREPARED } from './chunker';
import type { Prompt } from './generate';

export type ChunkMark = 'ok' | 'bad' | null;

/** `system + retrieved chunks + question`, as a word count against the (illustrative) context budget; chunks that do not fit are struck. */
export function PromptPanel({ prompt, mark, question }: { prompt: Prompt; mark: (chunkId: number) => ChunkMark; question: string }) {
  const requested = prompt.systemWords + prompt.questionWords + prompt.items.reduce((sum, i) => sum + i.words, 0);
  return (
    <Box>
      <SectionTitle hint="word counts stand in for tokens; the budget is illustrative">The prompt the model would see</SectionTitle>
      <Bar value={prompt.used} max={prompt.budget} tone="violet" marker={1} label={<span className="rag-budget">{prompt.used} of {prompt.budget} words used (the sources asked for {requested})</span>} ariaLabel={`${prompt.used} of ${prompt.budget} words of context used`} />
      <ol className="rag-prompt">
        <li className="rag-part"><b>system</b> instruction, {prompt.systemWords} words</li>
        {prompt.items.map((item) => {
          const m = mark(item.chunk.id);
          const title = PREPARED[item.chunk.docIndex].doc.title;
          return (
            <li key={item.chunk.id} className={`rag-part is-source ${item.fits ? '' : 'is-cut'} ${m ? `is-${m}` : ''}`}>
              <b>source</b> {title}, {item.words} words{item.fits ? '' : ' (cut: does not fit)'}
            </li>
          );
        })}
        <li className="rag-part"><b>question</b> {question} ({prompt.questionWords} words)</li>
      </ol>
    </Box>
  );
}
