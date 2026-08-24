import express from 'express';

export function createApp(options = {}) {
	const fetchImpl = options.fetch || globalThis.fetch;
	const app = express();

	// Middleware to parse JSON bodies
	app.use(express.json());

	// Health check endpoint
	app.get('/health', (req, res) => {
		res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
	});

	// Handler for forwarding POST requests to Cursor webhook
	const handleJiraWebhook = async (req, res) => {
		const timestamp = new Date().toISOString();
		console.log(`[${timestamp}] Received POST request from Jira Webhook:`, JSON.stringify(req.body));

		const token = process.env.CURSOR_AUTH_TOKEN;
		const targetUrl = process.env.CURSOR_WEBHOOK_URL || 'https://api2.cursor.sh/automations/webhook/db5d8c6c-9d82-11f1-a7d1-d6b4613131ce';

		if (!token) {
			console.error(`[${timestamp}] Error: CURSOR_AUTH_TOKEN environment variable is not set.`);
			return res.status(500).json({
				error: 'Configuration Error',
				message: 'CURSOR_AUTH_TOKEN environment variable is missing on the server.'
			});
		}

		// Append Bearer along with the token
		const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

		try {
			console.log(`[${timestamp}] Forwarding POST request to Cursor endpoint: ${targetUrl}`);

			const downstreamResponse = await fetchImpl(targetUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': authHeader
				},
				body: JSON.stringify(req.body)
			});

			const responseText = await downstreamResponse.text();
			let responseData;
			try {
				responseData = JSON.parse(responseText);
			} catch {
				responseData = responseText;
			}

			console.log(`[${timestamp}] Cursor API responded with status ${downstreamResponse.status}:`, responseData);

			return res.status(downstreamResponse.status).json({
				success: downstreamResponse.ok,
				status: downstreamResponse.status,
				data: responseData
			});
		} catch (error) {
			console.error(`[${timestamp}] Failed to forward request to Cursor endpoint:`, error.message);
			return res.status(502).json({
				error: 'Bad Gateway',
				message: 'Failed to communicate with Cursor webhook service.',
				details: error.message
			});
		}
	};

	// Support POST on /webhook, /api/jira-webhook, and root /
	app.post('/webhook', handleJiraWebhook);
	app.post('/api/jira-webhook', handleJiraWebhook);
	app.post('/', handleJiraWebhook);

	return app;
}
