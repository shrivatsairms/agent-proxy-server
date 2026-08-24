import dotenv from 'dotenv';
import { createApp } from './app.js';

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
	console.log(`====================================================`);
	console.log(`🚀 Jira Webhook Proxy Server running on port ${PORT}`);
	console.log(`📌 Target Cursor Webhook URL: ${process.env.CURSOR_WEBHOOK_URL || 'https://api2.cursor.sh/automations/webhook/db5d8c6c-9d82-11f1-a7d1-d6b4613131ce'}`);
	console.log(`🔑 Auth Token configured: ${process.env.CURSOR_AUTH_TOKEN ? 'YES' : 'NO (WARNING: Missing CURSOR_AUTH_TOKEN)'}`);
	console.log(`====================================================`);
});
