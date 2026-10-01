const METHOD_STEPS =['Reproduce', 'Isolate', 'Hypothesize', 'Test', 'Fix', 'Add a regression test'] as const;

/** The scientific method as a rail: steps done are green, the current one yellow. */
export function MethodRail({ done }: { done: number }) {
  return (
    <ol className="dm-rail" aria-label="Debugging method">
      {METHOD_STEPS.map((step, i) => (
        <li key={step} className={i < done ? 'is-done' : i === done ? 'is-now' : ''}>
          <span className="dm-rail-dot" aria-hidden="true">
            {i < done ? '✓' : i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
