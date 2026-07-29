# FUCK CANCER

> An open-source, self-hosted AI assistant for long-term cancer treatment management. Built for patients and caregivers who need to organize complex medical journeys.

Cancer treatment isn't a single visit — it's months or years of reports, prescriptions, imaging, lab results, and doctor conversations scattered across hospitals, apps, and photo albums. This tool brings it all together and lets you ask questions about it in plain language.

> ⚠️ **Not medical advice.** This is an organizing and reference tool. Its answers can be wrong or incomplete and must never replace a qualified doctor. Always confirm anything important with your healthcare provider before acting on it.

## What it does

- **Collect** — Upload medical reports, prescriptions, images, and even raw visit-recording audio. Everything becomes a source in a private [NotebookLM](https://notebooklm.google.com) notebook, one per patient.
- **Understand** — NotebookLM reads every source natively — PDFs, photos of reports, audio recordings — no manual transcription or OCR step.
- **Cover drugs automatically** — when you add a document, the app reads the drug names out of it and automatically pulls in the matching **official FDA / DailyMed leaflets** (from a whitelist of authoritative medical sites) as sources. So when you later ask about a medication, answers are grounded in the real label — dosing, interactions, black-box warnings — instead of a guess.
- **Ask** — Chat with an AI that has the full context of the patient's notebook. Ask about trends, what a result means, how things have changed over time.
- **Research** — Search the web from inside a case (powered by NotebookLM's own research model — drug leaflets, guidelines, patient resources) and import the pages you pick as sources, so answers can cite them too. A deep-research mode writes a full report into the notebook.
- **Cite** — Every answer is grounded in the patient's own documents and comes back with citations to the exact source passages it used.

## Why self-hosted

Medical data is sensitive. This app does not retain uploaded binary files — every uploaded file becomes a source in the connected NotebookLM (Google) account. The local SQLite database stores case metadata, source indexes, pasted text notes, chat transcripts, and citations. You run it on your own machine.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 24 + Fastify + TypeScript |
| Frontend | React 19 + Vite + TailwindCSS |
| Database | SQLite (single file, zero setup) |
| Storage + AI | NotebookLM, via [`@cola_runner/notebooklm-cli`](https://www.npmjs.com/package/@cola_runner/notebooklm-cli) |
| Auth | Google sign-in (identity only) |
| Packaging | Docker Compose first, local npm dev second |

No AI API keys to configure — all intelligence comes from your NotebookLM session.

## Getting started

### Prerequisites

- Node.js 22+ (Docker uses Node.js 24)
- A Google account (used both for app sign-in and for NotebookLM)

### 1. Clone

```bash
git clone https://github.com/cola-runner/fuck-cancer.git
cd fuck-cancer
```

### 2. Connect NotebookLM

The server talks to NotebookLM through a saved browser session. Keep that
session in this project's dedicated private directory rather than mounting your
whole CLI configuration:

```bash
umask 077
mkdir -p server/data server/notebooklm-session
chmod 700 server/data server/notebooklm-session

# Preferred: no Playwright or automated Google sign-in.
# Paste a NotebookLM request copied as cURL from your signed-in browser.
npx @cola_runner/notebooklm-cli@0.1.4 login --paste \
  --storage "$PWD/server/notebooklm-session/storage_state.json"
chmod 600 server/notebooklm-session/storage_state.json

npx @cola_runner/notebooklm-cli@0.1.4 status \
  --storage "$PWD/server/notebooklm-session/storage_state.json"
```

The paste is read from standard input, so the cookie does not need to appear in
your shell history or process arguments. The CLI verifies the session before
saving it. If it expires later, rerun the same `login --paste --storage ...`
command.

The browser-driven `login --storage ...` flow is only an optional fallback and
requires Playwright. The application itself does not need Playwright.

`storage_state.json` grants access to the connected NotebookLM account. Never
commit or share it. Docker mounts only `server/notebooklm-session/` read-write,
because session refresh uses a temporary file and an atomic rename; it does not
mount `~/.config/notebooklm-cli`.

### 3. Google OAuth setup (app sign-in)

Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and:

1. Create a new project (or use an existing one)
2. Enable the **Google People API** (for sign-in / userinfo) — no Drive scope is needed
3. Create an **OAuth 2.0 Client ID** (Web application type)
4. Add the authorized redirect URI for the origin users will actually open:
   - Local desktop only: `http://localhost:5173/api/auth/google/callback`
   - Phone / remote access: `https://your-domain.example/api/auth/google/callback`
5. Copy the Client ID and Client Secret

### 4. Configure

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and fill in the secrets:

```env
DATABASE_PATH=./data/fuckcancer.db
NOTEBOOKLM_STORAGE_PATH=./notebooklm-session/storage_state.json

JWT_SECRET=        # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=    # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
OWNER_EMAIL=your-google-account@example.com  # only this account may sign in

APP_ORIGIN=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

For phone access, `localhost` and plain LAN HTTP are not a usable deployment:
`localhost` on the phone means the phone itself, and Google web OAuth requires a
real HTTPS callback outside its localhost development exception. Put the web
service behind a trusted HTTPS reverse proxy or tunnel, point it at
`http://127.0.0.1:5173`, and use one exact public origin everywhere:

```env
GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback
APP_ORIGIN=https://your-domain.example
CORS_ORIGIN=https://your-domain.example
```

Register that exact redirect URI in Google Cloud. Do not expose the backend
port: the browser calls `/api` on the same HTTPS origin, and the web container
proxies it to the private `server:3000` service.

### 5. Install and run

**Recommended: Docker Compose**

```bash
docker compose up --build
```

This starts:

- Web app at `http://localhost:5173`
- API available only through same-origin `/api` (port 3000 is not published)
- SQLite database persisted in `server/data/`
- NotebookLM session persisted in `server/notebooklm-session/`

**Local development without Docker**

```bash
cd server
npm install
npm run dev

# In a second terminal
cd web
npm install
npm run dev
```

For local desktop development, open **http://localhost:5173** and sign in with
Google. On a phone, open the configured **HTTPS domain**, not the host's LAN IP
and not `localhost`.

## Grounded answers with citations

Because every document lives in NotebookLM, chat answers are retrieved from the patient's actual sources (real RAG, not a giant prompt) and come back with **citations** — each answer shows which document and which passage it drew from, so you can verify it. Always consult your healthcare provider for personalized medical advice.

## Recording visits

Multi-speaker visit recordings (doctor + patient) can be uploaded **directly** — NotebookLM transcribes and indexes the audio as a source:

1. Record the visit on your phone (`.mp3`, `.m4a`, `.wav`, …)
2. Upload it like any other document
3. Ask questions about what was discussed — answers cite the moments in the recording

No separate transcription step needed.

## Privacy

- Uploaded files (images, PDFs, audio) are stored as sources in the **connected NotebookLM account**
- The app database lives in a local SQLite file on **your machine** (case metadata, source indexes, pasted text, and chat history)
- AI runs through **your own NotebookLM session** — no third-party API keys
- The NotebookLM cookie jar lives in the dedicated, gitignored `server/notebooklm-session/` directory with private permissions
- The server processes uploads and chat in order to send them to NotebookLM, so treat the host machine as trusted infrastructure

## Project structure

```
fuck-cancer/
├── server/                 # Node.js + Fastify API
│   ├── src/
│   │   ├── routes/         # auth, cases, documents, chat, research, settings
│   │   ├── lib/            # notebooklm (self-healing client), drug-coverage,
│   │   │                   #   source-tracking, auth, encryption
│   │   └── db/             # SQLite schema + connection
│   ├── data/                # Local SQLite database files (gitignored)
│   ├── notebooklm-session/  # Dedicated NotebookLM cookie jar (gitignored)
│   └── Dockerfile
├── web/                    # React frontend
│   ├── src/
│   │   ├── pages/          # Login, Cases, CaseDetail, Chat, Settings
│   │   └── components/     # Layout, DocumentCard, UploadModal
│   └── Dockerfile
├── docker-compose.yml      # Primary self-hosted deployment path
└── DESIGN.md               # Product design document
```

## Roadmap

- [ ] Treatment timeline visualization
- [ ] Lab value trend charts (CEA, WBC over time)
- [ ] Appointment and medication reminders
- [ ] Share a case with family members (via NotebookLM sharing)
- [ ] i18n — English, Chinese, more

## Contributing

Pull requests welcome. This project is built by someone accompanying a family member through cancer treatment. If you've been there, you understand why this needs to exist.

## License

MIT
