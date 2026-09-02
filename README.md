# Jira Webhook Proxy Server

POC Express proxy between Jira webhooks and Cursor Automations. Jira cannot set a Bearer token or a custom POST body, so this server inspects each webhook, looks up the project’s automation in a JSON mapping file, and forwards a small authenticated payload.

Inbound authentication, WAF allowlists, and JSON body-size limits are deferred. Do not expose this POC on the public internet without those controls.

## Features

- Dedicated endpoints for comment, assignment, and status webhooks
- Project-to-automation mapping loaded from JSON (stand-in for a later Mongo collection)
- Slim outbound payload (issue key, project, trigger) instead of the full Jira body
- Terminal logs for live monitoring of receive, qualify, invoke, and skip paths

## Prerequisites

- Node.js v18 or higher
- npm v9 or higher

## Setup

```bash
npm install
cp .env.example .env
cp data/project-automations.example.json data/project-automations.json
```

Edit `data/project-automations.json` with real automation URLs and Bearer tokens:

```json
[
  {
    "projectId": "16842",
    "projectKey": "TPAS",
    "automationId": "abcd",
    "automationWebhookUrl": "https://api.sh2.cursor.com/v1/abcd",
    "automationBearerToken": "crsr_123"
  }
]
```

`.env` only holds process settings:

```env
PORT=3000
PROJECT_AUTOMATIONS_FILE=./data/project-automations.json
CURSOR_REQUEST_TIMEOUT_MS=15000
```

## Run

```bash
npm run dev
npm start
```

## Jira webhook URLs

Configure three Jira webhooks against this host:

| Event | JQL (as configured in Jira) | Endpoint |
|---|---|---|
| Comment command | `issuetype in (Story, Bug) AND comment ~ "/cursor-coding-agent"` | `POST /api/slash-commands` |
| Assigned to Cursor | assignee/create JQL for the Cursor bot | `POST /api/assignment` |
| Ready for Dev | labels + status changed to Ready for Dev | `POST /api/status-changed` |

Example:

`https://<host>/api/assignment?issue-key={{issue.key}}&project-key={{project.key}}&project-id={{project.id}}`

The proxy still reads issue and project identity from the JSON body when those fields are present.

## Qualification rules

All routes require issue type `Story` or `Bug`.

- `/api/slash-commands`: `comment_created` and comment body contains `/cursor-coding-agent`
- `/api/assignment`: created with assignee display name `Cursor`, or changelog assignee `toString` is `Cursor`
- `/api/status-changed`: status changelog `toString` is `Ready for Dev` and labels include both `AI-Generated` and `bot-generated`

Non-matching payloads return `202` with `forwarded: false` and do not call Cursor.

## Health and sample curl

```bash
curl http://localhost:3000/health
```

```bash
curl -X POST "http://localhost:3000/api/slash-commands?issue-key=TPAS-284&project-key=TPAS&project-id=16842" \
  -H "Content-Type: application/json" \
  -d @api-requests/body-comment-added.json
```

The sample comment fixture uses `/cursor` and will be ignored. Use a comment body that includes `/cursor-coding-agent` to invoke an automation.

## Tests

```bash
npm test
```

## Layout

- `src/app.js` — Express composition
- `src/index.js` — process entry
- `src/routes/` — HTTP routes
- `src/controllers/` — request handling
- `src/services/` — classification, mapping, Cursor `fetch`
- `src/factories/` — slim outbound payload
- `data/project-automations.example.json` — mapping shape
- `data/project-automations.json` — local secrets (gitignored)
