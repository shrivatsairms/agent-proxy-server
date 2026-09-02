import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createProjectMappingService } from './services/project-mapping.service.js';
import { log } from './utils/logger.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

let mappingService;
try {
	mappingService = createProjectMappingService();
} catch (error) {
	log(`Failed to load project automations mapping: ${error.message}`);
	process.exit(1);
}

log(`Loaded ${mappingService.count} project mappings from ${mappingService.filePath}`);

const app = createApp({ mappingService });

app.listen(PORT, () => {
	log(`Jira webhook proxy listening on port ${PORT}`);
});
