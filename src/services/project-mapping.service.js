import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MAPPING_FILE } from '../config/constants.js';

function normalizeRecords(records) {
	if (!Array.isArray(records)) {
		throw new Error('Project automations mapping must be a JSON array');
	}

	return records.map((record) => ({
		projectId: record.projectId != null ? String(record.projectId) : '',
		projectKey: record.projectKey || '',
		automationId: record.automationId || '',
		automationWebhookUrl: record.automationWebhookUrl || '',
		automationBearerToken: record.automationBearerToken || ''
	}));
}

function loadRecordsFromFile(filePath) {
	const resolved = path.resolve(filePath);
	const raw = fs.readFileSync(resolved, 'utf8');
	return normalizeRecords(JSON.parse(raw));
}

export function createProjectMappingService(options = {}) {
	const filePath = options.filePath || process.env.PROJECT_AUTOMATIONS_FILE || DEFAULT_MAPPING_FILE;
	const records = options.records
		? normalizeRecords(options.records)
		: loadRecordsFromFile(filePath);

	function find({ projectKey, projectId } = {}) {
		if (projectKey) {
			const byKey = records.find((record) => record.projectKey === projectKey);
			if (byKey) {
				return byKey;
			}
		}

		if (projectId) {
			const normalizedId = String(projectId);
			return records.find((record) => record.projectId === normalizedId) || null;
		}

		return null;
	}

	return {
		filePath,
		count: records.length,
		find
	};
}
