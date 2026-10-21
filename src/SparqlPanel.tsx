import { useId, type KeyboardEvent } from 'react';

export type SparqlStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; summary: string; empty: boolean }
  | { kind: 'error'; error: string };

type Props = {
  endpoint: string;
  query: string;
  status: SparqlStatus;
  onEndpointChange: (endpoint: string) => void;
  onQueryChange: (query: string) => void;
  onRun: () => void;
  onCancel: () => void;
  /** Tab handling shared with the Turtle editor. */
  onEditorKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/** An endpoint URL and a CONSTRUCT query, run on demand; the result is drawn by App. */
export function SparqlPanel({
  endpoint,
  query,
  status,
  onEndpointChange,
  onQueryChange,
  onRun,
  onCancel,
  onEditorKeyDown,
}: Props) {
  const running = status.kind === 'running';
  const id = useId();

  const onQueryKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!running) onRun();
      return;
    }
    onEditorKeyDown(event);
  };

  return (
    <form
      className="sparql"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running) onRun();
      }}
    >
      <div className="sparql__field">
        <label htmlFor={`${id}-endpoint`}>Endpoint</label>
        <input
          id={`${id}-endpoint`}
          type="text"
          inputMode="url"
          value={endpoint}
          onChange={(event) => onEndpointChange(event.target.value)}
          placeholder="https://example.org/sparql"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="url"
        />
      </div>
      <div className="sparql__field sparql__field--query">
        <label htmlFor={`${id}-query`}>Query</label>
        <textarea
          id={`${id}-query`}
          className="editor__input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onQueryKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
      </div>
      <div className="sparql__actions">
        {/* Keyed apart: reused, the element turns back into a submit button mid-click and runs again. */}
        {running ? (
          <button key="cancel" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button key="run" type="submit">
            Run
          </button>
        )}
        <span className="sparql__hint">⌘/Ctrl-Enter runs · CONSTRUCT or DESCRIBE</span>
      </div>
      <div className={`editor__status ${status.kind === 'error' ? 'editor__status--error' : ''}`} role="status">
        {status.kind === 'running'
          ? 'Running…'
          : status.kind === 'error'
            ? status.error
            : status.kind === 'done'
              ? status.summary
              : 'Run the query to load the graph.'}
      </div>
    </form>
  );
}
