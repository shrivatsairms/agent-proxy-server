# Jira Webhook Proxy Server

An Express-based proxy server that listens for POST requests triggered by Jira Webhooks (containing payloads like `{"jiraWorkItemId": "DXP-123"}`) and forwards them to the Cursor Automation Webhook endpoint (`https://api2.cursor.sh/automations/webhook/db5d8c6c-9d82-11f1-a7d1-d6b4613131ce`) with the required `Authorization: Bearer <TOKEN>` header.

## Features

- **Express Server**: Receives POST requests on `/webhook`, `/api/jira-webhook`, or `/`.
- **Environment Configuration**: Fetches Bearer token from `CURSOR_AUTH_TOKEN` environment variable.
- **Detailed Logging**: Logs incoming Jira webhook payloads, outgoing requests, downstream responses, and error conditions.
- **Robust Error Handling**: Gracefully handles missing environment variables, invalid JSON, and downstream network errors.
- **Automated Tests**: Unit and integration test coverage using Node.js test runner.

## Prerequisites

- **Node.js**: v18.0.0 or higher (v26.4.0 tested)
- **npm**: v9.0.0 or higher

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install --cache /tmp/npm-cache
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` or set your environment variables directly:
   ```bash
   cp .env.example .env
   ```

   Update `.env` with your secret Cursor authorization token:
   ```env
   PORT=3000
   CURSOR_AUTH_TOKEN=crsr_7...33
   CURSOR_WEBHOOK_URL=https://api2.cursor.sh/automations/webhook/db5d8c6c-9d82-11f1-a7d1-d6b4613131ce
   ```

## Running the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Testing the Endpoint

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Simulate Jira Webhook POST Request
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"jiraWorkItemId": "DXP-123"}'
```

## Running Automated Tests

Run the test suite using Node's native test runner:
```bash
npm test
```

## File Structure

- [`src/app.js`](file:///Users/sashetty1/Workspace/AI-SDLC/Code-Sandbox/automation-proxy/src/app.js): Express application factory containing route definitions and request proxying logic.
- [`src/index.js`](file:///Users/sashetty1/Workspace/AI-SDLC/Code-Sandbox/automation-proxy/src/index.js): Entry point initializing environment variables and listening on the server port.
- [`src/http/webhook.http`](file:///Users/sashetty1/Workspace/AI-SDLC/Code-Sandbox/automation-proxy/src/http/webhook.http): HTTP test requests file compatible with VS Code REST Client & JetBrains HTTP Client.
- [`test/server.test.js`](file:///Users/sashetty1/Workspace/AI-SDLC/Code-Sandbox/automation-proxy/test/server.test.js): Comprehensive test suite covering health check, proxy forwarding, token headers, error handling.
- [`.env`](file:///Users/sashetty1/Workspace/AI-SDLC/Code-Sandbox/automation-proxy/.env): Local environment file holding credentials and configuration.
