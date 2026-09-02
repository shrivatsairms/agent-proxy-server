export const ALLOWED_ISSUE_TYPES = ['Story', 'Bug'];

export const COMMENT_COMMAND = '/cursor-coding-agent';

export const CURSOR_DISPLAY_NAME = 'Cursor';

export const READY_FOR_DEV_STATUS = 'Ready for Dev';

export const REQUIRED_LABELS = ['AI-Generated', 'bot-generated'];

export const TRIGGERS = {
	COMMENT_COMMAND: 'comment-command',
	CURSOR_ASSIGNMENT: 'cursor-assignment',
	READY_FOR_DEV: 'ready-for-dev'
};

export const WEBHOOK_EVENTS = {
	COMMENT_CREATED: 'comment_created',
	ISSUE_CREATED: 'jira:issue_created',
	ISSUE_UPDATED: 'jira:issue_updated'
};

export const DEFAULT_CURSOR_TIMEOUT_MS = 15000;

export const DEFAULT_MAPPING_FILE = './data/project-automations.json';

export const COMMAND_MAX_LENGTH = 500;
