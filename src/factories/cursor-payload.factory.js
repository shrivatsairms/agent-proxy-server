import { COMMAND_MAX_LENGTH, TRIGGERS } from '../config/constants.js';

function truncateCommand(value) {
	if (value.length <= COMMAND_MAX_LENGTH) {
		return value;
	}

	return value.slice(0, COMMAND_MAX_LENGTH);
}

export function buildCursorPayload({ body = {}, query = {}, trigger }) {
	const issue = body.issue || {};
	const fields = issue.fields || {};
	const project = fields.project || {};

	const payload = {
		issueKey: issue.key || query['issue-key'] || '',
		issueId: issue.id || '',
		projectKey: project.key || query['project-key'] || '',
		projectId: project.id || query['project-id'] || '',
		trigger,
		triggeredByAccountId:
			query.triggeredByUser ||
			body.user?.accountId ||
			body.comment?.author?.accountId ||
			'',
		summary: fields.summary || ''
	};

	if (trigger === TRIGGERS.COMMENT_COMMAND && typeof body.comment?.body === 'string') {
		payload.command = truncateCommand(body.comment.body);
	}

	return payload;
}

export function extractIssueKey(body = {}, query = {}) {
	return body.issue?.key || query['issue-key'] || 'unknown';
}

export function extractProject(body = {}, query = {}) {
	const project = body.issue?.fields?.project || {};

	return {
		projectKey: project.key || query['project-key'] || '',
		projectId: project.id || query['project-id'] || ''
	};
}
