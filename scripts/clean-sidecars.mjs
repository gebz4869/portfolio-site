import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2);
let removed = 0;

async function cleanDirectory(directory) {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') return;
		throw error;
	}

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.name.startsWith('._')) {
			await rm(entryPath, { recursive: true, force: true });
			removed += 1;
		} else if (entry.isDirectory()) {
			await cleanDirectory(entryPath);
		}
	}
}

for (const target of targets) {
	await cleanDirectory(path.resolve(rootDirectory, target));
}

if (removed > 0) {
	console.log(`Removed ${removed} macOS sidecar item(s) from ${targets.join(', ')}.`);
}
