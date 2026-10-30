## Graph explorer library

SetMeld's Knowledge Graph view draws the project's published graph with this visualizer's explorer,
in the web app and inside MCP App hosts. It receives the triples from its own server-sent state and
must not fetch them, so it needs the explorer without the editor or the SPARQL client.

### Behaviour

| Start | Action | Expected result | Check |
| --- | --- | --- | --- |
| This app, any graph | Use it as before | Unchanged: every existing e2e test passes in Chromium and Firefox | `npm run test:e2e` |
| A page whose CSP has `worker-src 'none'` | Paste Turtle | The graph is laid out left to right and drawn, with no layout error | `e2e/sandbox.spec.ts` |
| Another app | `import { GraphExplorer, parseTurtle } from 'rdf-visualizer'` and `rdf-visualizer/explorer.css` | The explorer renders the given graph, and its styles reach nothing outside it | The consuming app's build and browser check |

### Shape

- `GraphExplorer` is the viewer pane lifted out of `App`, with the focus, selection, view and Esc
  handling it owned there. `App` keeps the editor, the SPARQL run and Ctrl/Cmd-Enter.
- `package.json` `exports` points at the TypeScript source and the CSS entry. Installing from git
  needs no build step, and React becomes a peer dependency so the host's React is the only one.
- Components no longer import CSS; `main.tsx` imports it, so a consumer's tests can import the
  components without a CSS loader. The colour variables move from `:root` to `.rdf-theme`, set on
  this page's `<html>` and on the explorer's root, so they never override a host page's own.
- `layoutInWorker` falls back to laying out on the page when the worker cannot be created or fails
  to start.
