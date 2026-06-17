# FUCK CANCER

> An open-source, self-hosted AI assistant for long-term cancer treatment management. Built for patients and caregivers who need to organize complex medical journeys.

Cancer treatment isn't a single visit — it's months or years of reports, prescriptions, imaging, lab results, and doctor conversations scattered across hospitals, apps, and photo albums. This tool brings it all together and lets you ask questions about it in plain language.

## What it does

- **Collect** — Upload medical reports, prescriptions, images, and even raw visit-recording audio. Everything becomes a source in a private [NotebookLM](https://notebooklm.google.com) notebook, one per patient.
- **Understand** — NotebookLM reads every source natively — PDFs, photos of reports, audio recordings — no manual transcription or OCR step.
- **Ask** — Chat with an AI that has the full context of the patient's notebook. Ask about trends, what a result means, how things have changed over time.
- **Research** — Search the web from inside a case (powered by NotebookLM's own research model — drug leaflets, guidelines, patient resources) and import the pages you pick as sources, so answers can cite them too. A deep-research mode writes a full report into the notebook.
- **Cite** — Every answer is grounded in the patient's own documents and comes back with citations to the exact source passages it used.

## Why self-hosted

Medical data is sensitive. This app stores **zero medical files on its own servers** — every file is a source in your own NotebookLM (Google) account. The local SQLite database only stores a lightweight index (case → notebook, document → source id) plus the chat transcript and citations. You run it on your own machine.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20 + Fastify + TypeScript |
| Frontend | React 18 + Vite + TailwindCSS |
| Database | SQLite (single file, zero setup) |
| Storage + AI | NotebookLM, via [`@cola_runner/notebooklm-cli`](https://www.npmjs.com/package/@cola_runner/notebooklm-cli) |
| Auth | Google sign-in (identity only) |
| Packaging | Docker Compose first, local npm dev second |

No AI API keys to configure — all intelligence comes from your NotebookLM session.

## Getting started

### Prerequisites

- Node.js 20+
- A Google account (used both for app sign-in and for NotebookLM)

### 1. Clone

```bash
git clone https://github.com/cola-runner/fuck-cancer.git
cd fuck-cancer
```

### 2. Connect NotebookLM

The server talks to NotebookLM through a saved browser session. On the host machine, log in once:

```bash
npx @cola_runner/notebooklm-cli login          # opens a browser to sign in
# …or, headless:
npx @cola_runner/notebooklm-cli login --paste   # paste a "Copy as cURL" / Cookie header
npx @cola_runner/notebooklm-cli status           # confirm it worked
```

This writes a cookie jar to `~/.config/notebooklm-cli/storage_state.json`, which the server reads.

### 3. Google OAuth setup (app sign-in)

Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and:

1. Create a new project (or use an existing one)
2. Enable the **Google People API** (for sign-in / userinfo) — no Drive scope is needed
3. Create an **OAuth 2.0 Client ID** (Web application type)
4. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Copy the Client ID and Client Secret

### 4. Configure

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and fill in the secrets:

```env
DATABASE_PATH=./data/fuckcancer.db

JWT_SECRET=        # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=    # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

APP_ORIGIN=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

### 5. Install and run

**Recommended: Docker Compose**

```bash
docker compose up --build
```

This starts:

- Web app at `http://localhost:5173`
- API at `http://localhost:3000`
- SQLite database persisted in `server/data/`
- Your NotebookLM session mounted from `~/.config/notebooklm-cli`

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

Open **http://localhost:5173** and sign in with Google.

## Grounded answers with citations

Because every document lives in NotebookLM, chat answers are retrieved from the patient's actual sources (real RAG, not a giant prompt) and come back with **citations** — each answer shows which document and which passage it drew from, so you can verify it. Always consult your healthcare provider for personalized medical advice.

## Recording visits

Multi-speaker visit recordings (doctor + patient) can be uploaded **directly** — NotebookLM transcribes and indexes the audio as a source:

1. Record the visit on your phone (`.mp3`, `.m4a`, `.wav`, …)
2. Upload it like any other document
3. Ask questions about what was discussed — answers cite the moments in the recording

No separate transcription step needed.

## Privacy

- Medical files (images, PDFs, audio) are stored as sources in **your NotebookLM account**
- The app database lives in a local SQLite file on **your machine** (indexes + chat transcript only)
- AI runs through **your own NotebookLM session** — no third-party API keys
- The server processes uploads and chat in order to send them to NotebookLM, so treat the host machine as trusted infrastructure

## Project structure

```
fuck-cancer/
├── server/                 # Node.js + Fastify API
│   ├── src/
│   │   ├── routes/         # auth, cases, documents, chat, settings
│   │   ├── lib/            # notebooklm (client singleton), auth, encryption
│   │   └── db/             # SQLite schema + connection
│   ├── data/              # Local SQLite database files (gitignored)
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
