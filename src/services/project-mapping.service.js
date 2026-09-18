import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MAPPING_FILE } from '../config/constants.js';

/* Correct any discrepancies like mismatch in format, data-type etc in the JSON data, 
 * since it was intitially read from a file */
function normalizeProjectMappings(projectMappings) {
	if (!Array.isArray(projectMappings)) {
		throw new Error('Project automations mapping must be a JSON array');
	}

	return projectMappings.map((record) => ({
		// IDs may be numeric in hand-edited JSON; normalize them for reliable lookup.
		projectId: record.projectId != null ? String(record.projectId) : '',
		projectKey: record.projectKey || '',
		automationId: record.automationId || '',
		automationWebhookUrl: record.automationWebhookUrl || '',
		automationBearerToken: record.automationBearerToken || '',
		pool: {
			name: record.pool?.name || '',
			repos: Array.isArray(record.pool?.repos) ? record.pool.repos.map(String) : []
		}
	}));
}

/* A function to get the Jira-Project to Cursor-Automation mapping data from the JSON file 
 * `filePath`: "/data/project-automations.json" (path relative to the root of the project) */
function loadProjectMappingsFromFile(filePath) {
	const absFilePath = path.resolve(filePath); // get the absolute path to the mappings JSON file
	const raw = fs.readFileSync(absFilePath, 'utf8');
	const projectMappingsJson = JSON.parse(raw);
	return normalizeProjectMappings(projectMappingsJson); 
}

/* Returns mapping lookup helpers:
 * - find: by projectKey, then projectId (assignment/status webhooks)
 * - findByRepoName: first mapping whose pool.repos lists the GitLab project name */
export function createProjectMappingService(options = {}) {

	const projectMappingsFilePath = options.filePath || process.env.PROJECT_AUTOMATIONS_FILE || DEFAULT_MAPPING_FILE;

	// Injected records avoid filesystem access in tests and ease a future database adapter.
	const projectMappings = options.records
		? normalizeProjectMappings(options.records)
		: loadProjectMappingsFromFile(projectMappingsFilePath);

	function findProjectMapping({ projectKey, projectId } = {}) {
		// Project keys are human-readable and authoritative when both values are supplied.
		if (projectKey) {
			const projectMapping = projectMappings.find((record) => record.projectKey === projectKey);
			if (projectMapping) {
				return projectMapping;
			}
		}

		if (projectId) {
			const normalizedId = String(projectId);

			// return the first matching mapping record
			return projectMappings.find((projectMapping) => projectMapping.projectId === normalizedId) || null;
		}

		return null;
	}

	function findByRepoName(repoName) {
		if (!repoName) {
			return null;
		}

		return (
			projectMappings.find((record) => record.pool.repos.includes(repoName)) || null
		);
	}

	return {
		filePath: projectMappingsFilePath,
		count: projectMappings.length,
		find: findProjectMapping,
		findByRepoName
	};
}
