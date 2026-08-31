import dotenv from 'dotenv';
import { createApp } from './app.js';

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
	console.log(`====================================================`);
	console.log(`🚀 Jira Webhook Proxy Server running on port ${PORT}`);

});
