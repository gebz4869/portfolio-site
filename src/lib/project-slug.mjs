const slugAliases = new Map([
	// The local fallback calls this project "Double Take"; Notion calls it "Double Take Branding".
	['double-take', 'double-take-branding'],
]);

/** @param {string} title */
export function createProjectSlug(title) {
	const baseSlug = String(title)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	if (!baseSlug) {
		throw new Error(`Cannot create a project URL from the title "${title}".`);
	}

	return slugAliases.get(baseSlug) ?? baseSlug;
}

/** @param {{ slug: string; title: string }[]} projects */
export function assertUniqueProjectSlugs(projects) {
	const titlesBySlug = new Map();
	for (const project of projects) {
		const previousTitle = titlesBySlug.get(project.slug);
		if (previousTitle) {
			throw new Error(
				`Projects "${previousTitle}" and "${project.title}" both use the URL slug "${project.slug}". ` +
				'Give one project a distinct title or add a Notion Slug property before building.',
			);
		}
		titlesBySlug.set(project.slug, project.title);
	}
	return projects;
}
