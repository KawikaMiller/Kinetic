import { useState } from 'react';
import { Button, ChipButton, ControlGroup, Hint, TextField } from '../../components/ui';
import { EVAL_QUESTIONS } from './corpus';
import { parseQuestion } from './question';
import { MAX_QUESTION_CHARS } from './settings';

/** The eight evaluation questions as chips, plus a field for the learner's own (refused with a reason, old question kept). */
export function QuestionPicker({ question, onChange }: { question: string; onChange: (question: string) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ask = () => {
    const parsed = parseQuestion(text);
    if (parsed.ok) {
      setError(null);
      onChange(parsed.value);
    } else {
      setError(parsed.error);
    }
  };
  return (
    <>
      <ControlGroup label="Question" inline className="rag-questions">
        {EVAL_QUESTIONS.map((q) => (
          <ChipButton key={q.id} tone="info" on={question === q.text} title={q.text} onClick={() => { setError(null); onChange(q.text); }}>
            {q.id.toUpperCase()}
          </ChipButton>
        ))}
      </ControlGroup>
      <TextField label="Your own" value={text} onChange={setText} onEnter={ask} maxLength={MAX_QUESTION_CHARS} width={230} placeholder="up to 120 characters" />
      <Button onClick={ask}>Ask</Button>
      {error && <span role="alert"><Hint tone="muted" block>{error}</Hint></span>}
    </>
  );
}
