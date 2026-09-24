import {
	ALLOWED_ISSUE_TYPES,
	COMMENT_COMMAND,
	CURSOR_DISPLAY_NAME,
	READY_FOR_DEV_STATUS,
	REQUIRED_LABELS,
	TRIGGERS,
	WEBHOOK_EVENTS
} from '../config/constants.js';

/* Get the type of the Jira Issue from the Request body
 * i.e. Bug, Story, Epic or Task etc */
function getIssueTypeName(body) {
	return body?.issue?.fields?.issuetype?.name;
}

/* Helper function to check if the Jira Issue is one of the allowed Type
 * i.e. "Story" or "Bug" */
function isAllowedIssueType(body) {
	return ALLOWED_ISSUE_TYPES.includes(getIssueTypeName(body));
}

/* Helper function to get the Item Change Logs from the request body
 * will contain array of objects showing different state changes of the object */
function getIssueChangelogs(body) {
	const items = body?.changelog?.items;
	// Jira may omit changelog or include multiple unrelated changes in one event.
	return Array.isArray(items) ? items : [];
}

function getIssueLabels(body) {
	const values = body?.issue?.fields?.labels;
	return Array.isArray(values) ? values : [];
}

function hasRequiredLabels(body) {
	const issueLabels = getIssueLabels(body);
	// The workflow requires both labels, not merely either label.
	return REQUIRED_LABELS.every((label) => issueLabels.includes(label));
}

export function qualifySlashCommand(body) {
	if (!isAllowedIssueType(body)) {
		return { qualified: false, reason: 'wrong issue type' };
	}

	/* Check for the type of event that triggered the webhook, 
	 * the event should be of type 'comment_created' */ 
	if (body?.webhookEvent !== WEBHOOK_EVENTS.COMMENT_CREATED) {
		return { qualified: false, reason: 'unexpected webhook event' };
	}

	/* Check if Jira the comment that fired the webhook, 
	 * contains the appropriate contents to be recognised as an agent invocation command 
	 * i.e. the comment should contain the string "/cursor-coding-agent" */
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
		// Search every changelog item because assignee changes are not guaranteed to be first.
		const assignedToCursor = getIssueChangelogs(body).some(
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

	const movedToReadyForDev = getIssueChangelogs(body).some(
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
