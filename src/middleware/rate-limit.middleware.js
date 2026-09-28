import rateLimit from 'express-rate-limit';
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '../config/constants.js';

export function createWebhookRateLimiter(options = {}) {
	return rateLimit({
		windowMs: options.windowMs ?? RATE_LIMIT_WINDOW_MS,
		max: options.max ?? RATE_LIMIT_MAX_REQUESTS,
		standardHeaders: true,
		legacyHeaders: false,
		message: { error: 'Too Many Requests' }
	});
}
