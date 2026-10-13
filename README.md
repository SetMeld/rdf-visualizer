# RDF Visualizer

A client-side React app (Vite + TypeScript) with no back-end, deployed to GitHub Pages.

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
