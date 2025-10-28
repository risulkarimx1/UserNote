# Repository Guidelines

## Project Structure & Module Organization
The Express service in `src/server.ts` is the single runtime: it orchestrates Ollama-enhanced logging and writes to `logs.md`. `templates/index.html` is the browser UI served straight from the Node process. Configuration assets (`package.json`, `tsconfig.json`, `package-lock.json`) live at the repo root; generated folders such as `node_modules/` and `dist/` stay untracked. If you need local fixtures for `logs.md`, keep them lightweight and anonymised.

## Build, Test, and Development Commands
- `npm install` — install Node dependencies.
- `npm run dev` — run the live-reloading Express server on port 3000 via `tsx`.
- `npm run build` — compile TypeScript to `dist/` for production checks.
- `npm start` — serve the compiled bundle from `dist/server.js`.
- `npm run lint` (add when needed) — reserve this slot for repo-wide linting workflows.

## Coding Style & Naming Conventions
Match the two-space indentation and camelCase seen in `src/server.ts`; classes stay PascalCase and async handlers should return typed payloads. Keep prompts and Ollama options in single-responsibility helpers instead of inlining. Store shared types near their consumers (`src/types/` once introduced) and favour descriptive file names tied to features. Prettier or ESLint can be added, but keep configuration minimal and committed.

## Testing Guidelines
Automation is still missing, so add coverage alongside features. Place TypeScript tests in `tests/` (or `src/__tests__/`) using a runner such as `vitest` or `node --test`; cover happy paths, validation errors, and Ollama fallbacks. Until suites stabilise, note manual validation steps (e.g., `curl` calls or browser flows) inside pull requests.

## Commit & Pull Request Guidelines
Write present-tense commits with a clear scope (`feat: enhance log paraphrasing`). Pull requests should outline motivation, list verification commands, and link tracking issues. Attach screenshots or terminal snippets when responses change, and call out new model requirements or environment switches so reviewers can reproduce quickly.

## Ollama & Model Configuration
Ensure `ollama` is running before exercising any interface; fetch the default `llama3.2` model with `ollama pull llama3.2` and document overrides. Treat `logs.md` as user data—commit placeholder fixtures only. When updating prompts or model names, store them near the callers and describe defaults in the MR description for future debugging.
