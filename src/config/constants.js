export const ALLOWED_ISSUE_TYPES = ['Story', 'Bug'];

export const COMMENT_COMMAND = '/cursor-coding-agent';

export const CURSOR_DISPLAY_NAME = 'Cursor';

export const READY_FOR_DEV_STATUS = 'Ready for Dev';

export const REQUIRED_LABELS = ['AI-Generated', 'bot-generated'];

// Internal trigger names form the stable contract sent to Cursor automations.
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

// Cursor agent runs are viewed under the team's shared tenant path.
export const CURSOR_AGENT_BASE_URL =
	'https://cursor.com/t/okta-grp-cursor-digital-gpt/agents';

export const DEFAULT_JIRA_TIMEOUT_MS = 10000;

// Capture the first GitLab URL after repo=, including Jira wiki smart-link chips.
export const GITLAB_REPO_ASSIGNMENT = /\brepo=\[?(https:\/\/gitlab\.com\/[^|\s\]]+)/i;

// Project roots need a namespace plus a project name; optional trailing slash.
export const GITLAB_REPO_ROOT =
	/^https:\/\/gitlab\.com\/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\/?$/i;
