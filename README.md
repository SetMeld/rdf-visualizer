# RDF Visualizer

A client-side React app (Vite + TypeScript) with no back-end, deployed to GitHub Pages.

## Using it

Paste Turtle into the editor. Each subject becomes a card listing its literal values, with arrows to
the other resources it links to.

- **Click a card** to show only it and its neighbours. Click a neighbour to bring in its neighbours
  too, and **×** on a card to hide it. A **+N** badge counts a card's neighbours still hidden.
- **The type list** on the left filters to one type and its neighbours (⌘/Ctrl-click to add more
  types). Expand a type to list its resources; click one to focus on it.
- **Esc**, double-clicking the background, or **Whole graph** returns to the full graph.

## Development

```sh
nvm use         # Node 22 (see .nvmrc)
npm install
npm run dev       # start dev server
npm run build     # type-check and build to dist/
npm run preview   # serve the production build locally
npm run lint      # lint with oxlint
```

## Deployment

Every push to `main` builds the app and deploys it to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

One-time setup: in the GitHub repo, go to **Settings → Pages** and set
**Source** to **GitHub Actions**.

The site is served under `/rdf-visualizer/`, configured by `base` in
[vite.config.ts](vite.config.ts). Update it if the repo is renamed or a custom
domain is used (set `base: '/'` for a custom domain).
