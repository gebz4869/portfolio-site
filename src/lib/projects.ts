import { projects as generatedProjects } from '../../.astro/notion-projects.generated';
import { projects as localProjects } from '../data/projects';
import { assertUniqueProjectSlugs, createProjectSlug } from './project-slug.mjs';
import type { Project } from './project-types';

const localFallback: Project[] = localProjects.map((project) => ({
	slug: createProjectSlug(project.title),
	title: project.title,
	discipline: [project.category],
	featured: project.featured,
	gallery: [],
}));

const selectedProjects = generatedProjects.length > 0
	? generatedProjects as Project[]
	: localFallback;

export const projects = assertUniqueProjectSlugs(selectedProjects);
