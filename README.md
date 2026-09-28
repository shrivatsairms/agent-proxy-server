# Jira Webhook Proxy Server

Express proxy between Jira Cloud webhooks and Cursor Automations. Jira WebHook cannot attach the Cursor Bearer token or construct the required outbound body, so this service authenticates and classifies each webhook, selects an automation from a JSON mapping, and forwards a small authenticated payload to Cursor.

## Features

- Dedicated endpoints for comment, assignment, and status-change webhooks
- HMAC-SHA256 verification of Jira's `X-Hub-Signature` over the exact raw request body
- Rate limiting for all `/api` webhook routes
- Immediate `200 OK` delivery acknowledgement followed by asynchronous processing in order to prevent WebHook retries.
- Project-to-automation mapping loaded from JSON (a stand-in for a future database)
- Repository-pool routing for slash commands
- Slim outbound Cursor payload instead of forwarding the full Jira body
- Jira success and error comments using Atlassian Document Format mentions
- Terminal logging for receive, reject, qualify, invoke, acknowledge, and skip paths

This remains a POC. WAF/IP allowlists and explicit JSON body-size configuration are not included.

## Prerequisites

- Node.js v18 or higher
- npm v9 or higher

## Setup

```bash
npm install
cp .env.example .env
cp data/project-automations.example.json data/project-automations.json
```

Edit `data/project-automations.json` with real automation URLs, Bearer tokens, and repository pools:

```json
[
  {
    "projectId": "16842",
    "projectKey": "TPAS",
    "automationId": "abcd",
    "automationWebhookUrl": "https://api.sh2.cursor.com/v1/abcd",
    "automationBearerToken": "crsr_123",
    "pool": {
      "name": "sandbox",
      "repos": ["calculator-app", "todo-app"]
    }
  }
]
```

Configure `.env`:

```env
PORT=3000
PROJECT_AUTOMATIONS_FILE=./data/project-automations.json
CURSOR_REQUEST_TIMEOUT_MS=15000
JIRA_BASE_URL=https://your-site.atlassian.net
JIRA_EMAIL=service-account@example.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_WEBHOOK_SECRET=your-jira-webhook-secret
```

`JIRA_WEBHOOK_SECRET` must match the secret configured when registering the Jira webhooks. The current implementation uses one shared secret for all three endpoints.

Rate-limit defaults are code configuration in `src/config/constants.js`:

- `RATE_LIMIT_WINDOW_MS`: `60000` (one minute)
- `RATE_LIMIT_MAX_REQUESTS`: `100` requests per client during that window

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

Example callback URL:

`https://<host>/api/assignment?issue-key={{issue.key}}&project-key={{project.key}}&project-id={{project.id}}`

Canonical issue and project fields in the JSON body take precedence over query-string fallbacks.

## Request authentication and rate limiting

Jira signs the exact JSON request bytes with the configured secret and sends:

```text
X-Hub-Signature: sha256=<hex-encoded-hmac>
```

The service captures the raw body before JSON parsing, computes HMAC-SHA256 with `JIRA_WEBHOOK_SECRET`, and compares signatures in constant time.

- Missing signature or missing server-side secret: `401`
- Invalid signature: `403`
- Rate limit exceeded: `429`
- Authenticated request accepted for processing: `200`

Authentication and rate limiting run before webhook qualification or Cursor invocation. The `/health` endpoint is neither signed nor rate-limited.

## Delivery acknowledgement and asynchronous processing

After authentication and rate limiting, each webhook route immediately responds:

```json
{ "accepted": true }
```

The service then qualifies and processes the event asynchronously. Cursor failures, timeouts, Jira comment failures, irrelevant events, and missing mappings cannot change the response already sent to Jira. This prevents downstream failures from causing Jira to redeliver an accepted webhook.

Authenticated malformed JSON is also acknowledged with `200` and is not processed. Unsigned or incorrectly signed malformed JSON is rejected with `401` or `403`.

## Qualification rules

All routes require issue type `Story` or `Bug`.

- `/api/slash-commands`: `comment_created`, comment contains `/cursor-coding-agent`, and comment includes a GitLab project root such as `repo=https://gitlab.com/group/project`. Plain text and Jira smart-link markup are supported. The first mapping whose `pool.repos` contains the GitLab project name is selected.
- `/api/assignment`: issue created with assignee display name `Cursor`, or issue updated with an assignee changelog whose `toString` is `Cursor`.
- `/api/status-changed`: issue updated with a status changelog whose `toString` is `Ready for Dev`, and labels contain both `AI-Generated` and `bot-generated`.

Slash-command example:

```text
/cursor-coding-agent repo=https://gitlab.com/group/project
```

The repository URL must be a project root. Tree, blob, branch, merge-request, query-string, and fragment URLs are rejected. Missing, invalid, or unmapped repositories do not invoke Cursor and produce a tagged Jira error comment.

Non-matching events are logged and skipped without calling Cursor.

## Cursor and Jira acknowledgements

The outbound Cursor call uses the automation URL and Bearer token from the selected mapping and has a configurable timeout (`CURSOR_REQUEST_TIMEOUT_MS`, default 15 seconds).

For a successful slash command, Cursor's response must contain `backgroundComposerId`. The proxy creates a direct agent URL and posts a Jira comment with a real ADF mention:

`@[User] Agent successfully started and can be viewed by visiting the following URL: https://cursor.com/t/okta-grp-cursor-digital-gpt/agents/<agent-id>`

Successful assignment and status-change invocations are logged but do not add Jira comments. Cursor errors for any qualified trigger produce a Jira error comment mentioning the comment author or Jira event actor. The Jira service account therefore needs permission to add comments to affected issues.

## Health and signed sample request

```bash
curl http://localhost:3000/health
```

To send a local test request, calculate the signature from the exact file bytes:

```bash
export JIRA_WEBHOOK_SECRET="your-jira-webhook-secret"
export SIGNATURE="$(node -e \
  "const fs=require('fs'),c=require('crypto'); \
   const b=fs.readFileSync('api-requests/body-comment-added.json'); \
   process.stdout.write('sha256='+c.createHmac('sha256',process.env.JIRA_WEBHOOK_SECRET).update(b).digest('hex'))")"

curl -X POST "http://localhost:3000/api/slash-commands?issue-key=TPAS-1680&project-key=TPAS&project-id=16842&triggeredByUser=712020:5a54709d-39a9-45b1-9c40-1cfac54b07ec" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: ${SIGNATURE}" \
  --data-binary @api-requests/body-comment-added.json
```

Use `--data-binary`; changing whitespace or re-serializing the JSON changes the signed bytes and invalidates the signature.

## Tests

```bash
npm test
```

Tests cover event qualification, repository parsing, project mapping, Jira comments, signature verification, rate limiting, immediate acknowledgement, and integration flows.

## Layout

- `src/app.js` — Express composition and middleware ordering
- `src/index.js` — process entry point
- `src/routes/` — webhook route declarations
- `src/controllers/` — immediate acknowledgement and asynchronous orchestration
- `src/middleware/` — signature verification, rate limiting, and error handling
- `src/services/` — event classification, HMAC verification, mappings, Jira comments, and Cursor invocation
- `src/factories/` — outbound Cursor payloads and Jira ADF comments
- `data/project-automations.example.json` — mapping shape
- `data/project-automations.json` — local mapping and secrets (gitignored)
