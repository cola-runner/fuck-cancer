# FUCK CANCER

> An open-source, self-hosted AI assistant for long-term cancer treatment management. Built for patients and caregivers who need to organize complex medical journeys.

Cancer treatment isn't a single visit — it's months or years of reports, prescriptions, imaging, lab results, and doctor conversations scattered across hospitals, apps, and photo albums. This tool brings it all together.

## What it does

- **Collect** — Upload medical reports, prescriptions, and images directly to your own Google Drive. Paste visit notes transcribed from recordings.
- **Understand** — AI automatically extracts key information from every document: diagnoses, lab values, medications, dates.
- **Ask** — Chat with an AI that has full context of the patient's entire medical history. Ask about trends, drug interactions, what a result means.
- **Reference** — AI automatically queries authoritative medical databases (RxNorm, OpenFDA, DailyMed, NIH, PubMed) to ground answers in real data.

## Why self-hosted

Medical data is sensitive. This app stores **zero medical files on its own servers** — everything goes to the patient's own Google Drive. The local database only stores file indexes and AI-generated summaries. You run it on your own machine.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20 + Fastify + TypeScript |
| Frontend | React 18 + Vite + TailwindCSS |
| Database | SQLite (single file, zero setup) |
| Storage | User's Google Drive |
| AI | Bring your own key — Gemini / Claude / OpenAI |
| Medical APIs | RxNorm, OpenFDA, DailyMed, NIH Clinical Tables, PubMed |

## Getting started

### Prerequisites

- Node.js 20+
- A Google account
- An LLM API key (Gemini recommended — lowest cost)

### 1. Clone

```bash
git clone https://github.com/cola-runner/fuck-cancer.git
cd fuck-cancer
```

### 2. Google OAuth setup

Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and:

1. Create a new project (or use an existing one)
2. Enable these APIs:
   - **Google Drive API**
   - **Google People API**
3. Create an **OAuth 2.0 Client ID** (Web application type)
4. Add authorized redirect URI: `http://localhost:5173/auth/callback`
5. Copy the Client ID and Client Secret

### 3. Configure

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
DATABASE_PATH=./data/fuckcancer.db

JWT_SECRET=        # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=    # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 4. Install and run

**Backend:**

```bash
cd server
npm install
npm run dev
# Running at http://localhost:3000
```

**Frontend (new terminal):**

```bash
cd web
npm install
npm run dev
# Running at http://localhost:5173
```

Open **http://localhost:5173** and sign in with Google.

### 5. Add your LLM API key

After logging in, go to **Settings** and add your API key. Without it, document upload and management still works — AI analysis is unlocked once a key is configured.

Gemini is recommended:
- Get a free key at [aistudio.google.com](https://aistudio.google.com)
- Supports audio transcription for visit recordings (unique among major LLMs)

## Medical data tools

When you ask the AI a question, it can automatically query these free databases in real time:

| Tool | Source | What it provides |
|------|--------|-----------------|
| Drug interactions | RxNorm (NIH) | Checks if medications interact |
| Adverse events | OpenFDA FAERS | Real-world side effect reports |
| Drug labels | DailyMed (NIH) | Official prescribing information |
| Lab reference ranges | NIH Clinical Tables | Normal ranges for test results |
| Clinical guidelines | PubMed (NIH) | Evidence-based medical guidelines |

All free, no API keys required.

## Recording visits

Multi-speaker audio (doctor + patient conversations) is best handled by Gemini:

1. Record the visit on your phone
2. Upload to [Google AI Studio](https://aistudio.google.com) or use the Gemini app
3. Prompt: *"Transcribe this medical visit recording. Label each speaker as Doctor or Patient."*
4. Paste the transcript into FUCK CANCER as a text document

This is currently the most accurate approach for multi-speaker medical audio.

## Privacy

- Medical files (images, PDFs, audio) → stored only in **your Google Drive**
- Database → local SQLite file on **your machine**
- AI analysis → your API key calls the LLM directly
- This server never sees your medical data in transit

## Project structure

```
fuck-cancer/
├── server/                 # Node.js + Fastify API
│   ├── src/
│   │   ├── routes/         # auth, cases, documents, chat, settings
│   │   ├── skills/         # Medical API integrations (RxNorm, FDA, etc.)
│   │   ├── lib/            # Google Drive, LLM providers, encryption
│   │   └── db/             # SQLite schema + connection
│   └── Dockerfile
├── web/                    # React frontend
│   ├── src/
│   │   ├── pages/          # Login, Cases, CaseDetail, Chat, Settings
│   │   └── components/     # Layout, DocumentCard, UploadModal
│   └── Dockerfile
├── docker-compose.yml      # Optional: Docker deployment
└── DESIGN.md               # Product design document
```

## Roadmap

- [ ] Treatment timeline visualization
- [ ] Lab value trend charts (CEA, WBC over time)
- [ ] Appointment and medication reminders
- [ ] Multi-user collaboration (share a case with family members)
- [ ] i18n — English, Chinese, more

## Contributing

Pull requests welcome. This project is built by someone accompanying a family member through cancer treatment. If you've been there, you understand why this needs to exist.

## License

MIT
