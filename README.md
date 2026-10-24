# ToS Decipher

ToS Decipher helps people understand terms of service and privacy policies before agreeing to them. It includes an English/Spanish web app, a Chrome/Edge Manifest V3 extension, and a Python API that analyzes policy text and returns concise, cited findings.

This project is an independent open-source tool, not legal advice. AI-generated explanations can be incomplete or incorrect; read the original policy before making decisions.

## What it does

- Summarizes policy text in plain language and highlights potentially important terms.
- Shows findings alongside supporting excerpts from the source document.
- Reviews policy links on a page and can identify legal disclosures embedded in expandable sections.
- Offers English and Spanish interface and analysis language.
- Includes a browser extension that extracts policy text locally and sends text for analysis; it does not ask the server to fetch policy URLs.

## Privacy and data handling

The extension reads page text and policy links only after you start a review or enable automatic review and grant the required browser permissions. It excludes form fields from page and disclosure text extraction, but this is not a guarantee that every page-specific sensitive detail will be excluded. The extension/API sends extracted policy text and relevant link labels and URLs to the API configured in the extension. The API then sends policy content to the configured AI providers; if you enable LangSmith tracing, trace inputs may also include policy text. Do not use real booking, payment, account, or other sensitive pages until you have reviewed the providers' data handling and retention policies and configured a backend you trust.

The extension currently targets a local API at `http://localhost:8000`. It is not ready for general distribution as a turnkey hosted service. Do not put provider credentials in the extension; keep them on the server.

## Repository layout

- `apps/api`: FastAPI service, policy-analysis pipeline, API tests, and evaluation runner.
- `apps/extension`: unpacked Manifest V3 Chrome/Edge extension.
- `apps/web`: React/Vite web interface.
- `tests/fixtures/policies`: sample policies for local evaluation.
- `docs`: project presentation material.
- `.github/workflows/ci.yml`: CI checks for tests, type checking, build, and extension syntax.

## Requirements

- Python 3.11 or later and [uv](https://docs.astral.sh/uv/).
- Node.js 22 or later and npm.
- API credentials for the configured TypeSafe and OpenRouter providers to run live AI analysis.
- Docker Desktop is optional if you prefer Docker Compose.

## Local development

Install dependencies and create your local environment file:

```powershell
uv sync --all-groups
Copy-Item .env.example .env
npm ci
```

Add your provider credentials to `.env`. `OPENROUTER_API_KEY` and `TYPESAFE_API_KEY` are needed for live analysis. `LANGSMITH_API_KEY` is optional; tracing is disabled by default. If you enable it, policy text may be included in LangSmith traces.

Start the API in one terminal:

```powershell
uv run uvicorn apps.api.server:app --reload --port 8000
```

Start the web app in a second terminal:

```powershell
npm run dev
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:8000/health`.

### Docker Compose

After creating `.env` and configuring provider credentials, run:

```powershell
docker compose up --build
```

Open `http://localhost:5173`. Stop the services with Ctrl+C or `docker compose down`.

## Browser extension

1. Start the API at `http://localhost:8000` and configure its provider credentials.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode, select **Load unpacked**, and choose `apps/extension`.
4. Open a website and use the extension popup to start a review. Grant access only to sites you want reviewed.

The extension also has an optional automatic-review setting that scans for legal-page signals and starts reviews after you explicitly enable the setting and grant the browser permission for all sites. You can block individual sites in the extension settings. Keep provider credentials server-side; the extension's default API URL is local development only.

## Tests and build

```powershell
uv run pytest
npm run typecheck
npm run build
```

The evaluation dataset can be run locally with:

```powershell
uv run python -m apps.api.evaluate_dataset
```

Without `LANGSMITH_API_KEY`, the evaluation runner reports results locally. With a key, it uploads an experiment to LangSmith.

## Configuration

See `.env.example` for supported backend settings. Provider credentials belong only in the API environment. The extension's API endpoint is currently configured in `apps/extension/src/service-worker.js`; a public deployment requires an HTTPS API, appropriate extension host permissions, and a deliberate privacy and operational plan before distribution.

## Contributing

Issues and pull requests are welcome. Please avoid including private policy text, account data, payment details, API keys, or other secrets in issues, tests, screenshots, and pull requests. Run the tests and build commands above before submitting changes.

## License

This project is licensed under the MIT License. See `LICENSE`.
