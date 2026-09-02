import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProjectMappingService } from '../src/services/project-mapping.service.js';

const records = [
	{
		projectId: '16842',
		projectKey: 'TPAS',
		automationId: 'abcd',
		automationWebhookUrl: 'https://api.sh2.cursor.com/v1/abcd',
		automationBearerToken: 'crsr_123'
	},
	{
		projectId: '16843',
		projectKey: 'SHRI',
		automationId: 'bcdef',
		automationWebhookUrl: 'https://api.sh2.cursor.com/v1/bddef',
		automationBearerToken: 'crsr_456'
	}
];

describe('project mapping service', () => {
	test('finds a mapping by project key first', () => {
		const service = createProjectMappingService({ records });
		const mapping = service.find({ projectKey: 'SHRI', projectId: '16842' });
		assert.equal(mapping.automationId, 'bcdef');
	});

	test('falls back to project id when key is missing', () => {
		const service = createProjectMappingService({ records });
		const mapping = service.find({ projectId: '16842' });
		assert.equal(mapping.projectKey, 'TPAS');
	});

	test('returns null for an unknown project', () => {
		const service = createProjectMappingService({ records });
		assert.equal(service.find({ projectKey: 'NOPE', projectId: '0' }), null);
	});

	test('loads mappings from a JSON file', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-automations-'));
		const filePath = path.join(directory, 'project-automations.json');
		fs.writeFileSync(filePath, JSON.stringify(records));

		const service = createProjectMappingService({ filePath });
		assert.equal(service.count, 2);
		assert.equal(service.find({ projectKey: 'TPAS' }).automationId, 'abcd');
	});
});
