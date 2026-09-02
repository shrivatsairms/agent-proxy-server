import {
	ALLOWED_ISSUE_TYPES,
	COMMENT_COMMAND,
	CURSOR_DISPLAY_NAME,
	READY_FOR_DEV_STATUS,
	REQUIRED_LABELS,
	TRIGGERS,
	WEBHOOK_EVENTS
} from '../config/constants.js';

function getIssueTypeName(body) {
	return body?.issue?.fields?.issuetype?.name;
}

function isAllowedIssueType(body) {
	return ALLOWED_ISSUE_TYPES.includes(getIssueTypeName(body));
}

function changelogItems(body) {
	const items = body?.changelog?.items;
	return Array.isArray(items) ? items : [];
}

function labels(body) {
	const values = body?.issue?.fields?.labels;
	return Array.isArray(values) ? values : [];
}

function hasRequiredLabels(body) {
	const issueLabels = labels(body);
	return REQUIRED_LABELS.every((label) => issueLabels.includes(label));
}

export function classifySlashCommand(body) {
	if (!isAllowedIssueType(body)) {
		return { qualified: false, reason: 'wrong issue type' };
	}

	if (body?.webhookEvent !== WEBHOOK_EVENTS.COMMENT_CREATED) {
		return { qualified: false, reason: 'unexpected webhook event' };
	}

	const commentBody = body?.comment?.body;
	if (typeof commentBody !== 'string' || !commentBody.includes(COMMENT_COMMAND)) {
		return { qualified: false, reason: `comment missing ${COMMENT_COMMAND}` };
	}

	return { qualified: true, trigger: TRIGGERS.COMMENT_COMMAND };
}

export function classifyAssignment(body) {
	if (!isAllowedIssueType(body)) {
		return { qualified: false, reason: 'wrong issue type' };
	}

	if (body?.webhookEvent === WEBHOOK_EVENTS.ISSUE_CREATED) {
		if (body?.issue?.fields?.assignee?.displayName === CURSOR_DISPLAY_NAME) {
			return { qualified: true, trigger: TRIGGERS.CURSOR_ASSIGNMENT };
		}

		return { qualified: false, reason: 'assignee is not Cursor' };
	}

	if (body?.webhookEvent === WEBHOOK_EVENTS.ISSUE_UPDATED) {
		const assignedToCursor = changelogItems(body).some(
			(item) => item.fieldId === 'assignee' && item.toString === CURSOR_DISPLAY_NAME
		);

		if (assignedToCursor) {
			return { qualified: true, trigger: TRIGGERS.CURSOR_ASSIGNMENT };
		}

		return { qualified: false, reason: 'assignee changelog is not Cursor' };
	}

	return { qualified: false, reason: 'unexpected webhook event' };
}

export function classifyStatusChanged(body) {
	if (!isAllowedIssueType(body)) {
		return { qualified: false, reason: 'wrong issue type' };
	}

	if (body?.webhookEvent !== WEBHOOK_EVENTS.ISSUE_UPDATED) {
		return { qualified: false, reason: 'unexpected webhook event' };
	}

	const movedToReadyForDev = changelogItems(body).some(
		(item) => item.fieldId === 'status' && item.toString === READY_FOR_DEV_STATUS
	);

	if (!movedToReadyForDev) {
		return { qualified: false, reason: 'status did not change to Ready for Dev' };
	}

	if (!hasRequiredLabels(body)) {
		return { qualified: false, reason: 'missing required labels' };
	}

	return { qualified: true, trigger: TRIGGERS.READY_FOR_DEV };
}
