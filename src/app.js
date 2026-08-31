import "dotenv/config";
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_REQUESTS_DIR = path.resolve(__dirname, '../api-requests');

export function createApp(options = {}) {
	const fetchImpl = options.fetch || globalThis.fetch;
	const app = express();

	// Middleware to parse JSON and URL-encoded bodies
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

	// Health check endpoint
	app.get('/health', (req, res) => {
		res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
	});

	// Handler for inspecting and forwarding POST requests from Jira Webhook
	const handleJiraWebhook = async (req, res) => {
		const timestamp = new Date().toISOString();

		console.log('\n' + '='.repeat(60));
		console.log(`📥 [${timestamp}] Incoming Webhook Request`);
		console.log('='.repeat(60));

		// 1. Request Method, URL & Path
		const requestInfo = {
			method: req.method,
			originalUrl: req.originalUrl,
			path: req.path,
			ip: req.ip || req.socket.remoteAddress,
			timestamp
		};
		console.log('\n--- 🌐 Request Info ---');
		console.log(`Method:        ${requestInfo.method}`);
		console.log(`Original URL:  ${requestInfo.originalUrl}`);
		console.log(`Path:          ${requestInfo.path}`);
		console.log(`IP:            ${requestInfo.ip}`);

		// 2. Query & Route Parameters
		const parameters = {
			query: req.query,
			params: req.params
		};
		console.log('\n--- 🔍 Parameters ---');
		console.log('Query Params: ', Object.keys(parameters.query).length ? JSON.stringify(parameters.query, null, 2) : '(none)');
		console.log('Route Params: ', Object.keys(parameters.params).length ? JSON.stringify(parameters.params, null, 2) : '(none)');

		// 3. Request Headers
		const headers = req.headers;
		console.log('\n--- 📋 Headers ---');
		console.log(JSON.stringify(headers, null, 2));

		// 4. Request Body
		const body = req.body;
		console.log('\n--- 📦 Request Body ---');
		if (body && Object.keys(body).length > 0) {
			console.log(JSON.stringify(body, null, 2));
		} else {
			console.log('(empty body or non-JSON content-type)');
		}

		console.log('='.repeat(60) + '\n');

		// Write request data to 4 distinct JSON files in api-requests/
		try {
			await fs.mkdir(API_REQUESTS_DIR, { recursive: true });
			await Promise.all([
				fs.writeFile(path.join(API_REQUESTS_DIR, 'request-info.json'), JSON.stringify(requestInfo, null, 2), 'utf-8'),
				fs.writeFile(path.join(API_REQUESTS_DIR, 'parameters.json'), JSON.stringify(parameters, null, 2), 'utf-8'),
				fs.writeFile(path.join(API_REQUESTS_DIR, 'headers.json'), JSON.stringify(headers, null, 2), 'utf-8'),
				fs.writeFile(path.join(API_REQUESTS_DIR, 'body.json'), JSON.stringify(body, null, 2), 'utf-8')
			]);
			console.log(`💾 Saved request details to ${API_REQUESTS_DIR}`);
		} catch (err) {
			console.error('❌ Failed to write request files:', err);
		}

		// Return 200 OK to acknowledge receipt during testing
		return res.status(200).json({
			success: true,
			message: "Webhook received and logged successfully",
			receivedAt: timestamp
		});
	};

	// Support POST on /webhook, /api/jira-webhook, and root /
	app.post('/webhook', handleJiraWebhook);
	app.post('/api/jira-webhook', handleJiraWebhook);
	app.post('/', handleJiraWebhook);

	return app;
}

