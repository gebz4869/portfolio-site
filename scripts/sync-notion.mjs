import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertUniqueProjectSlugs, createProjectSlug } from '../src/lib/project-slug.mjs';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseId = '3f5acef2-5da8-80fd-b929-d1ef367663f9';
const notionVersion = '2026-03-11';
const apiBase = 'https://api.notion.com/v1';
const token = process.env.NOTION_API_KEY;
const generatedFile = path.join(rootDirectory, '.astro', 'notion-projects.generated.ts');

async function writeGeneratedProjects(projects) {
	await mkdir(path.dirname(generatedFile), { recursive: true });
	await writeFile(generatedFile, `export const projects = ${JSON.stringify(projects, null, 2)};\n`);
}

async function useLocalFallback(reason) {
	await writeGeneratedProjects([]);
	console.warn(
		`Notion sync unavailable: ${reason}\n` +
		'Continuing the build with local fallback projects from src/data/projects.ts. ' +
		'Notion content will not be included in this build.',
	);
}

const headers = token ? {
	Authorization: `Bearer ${token}`,
	'Notion-Version': notionVersion,
	'Content-Type': 'application/json',
} : {};

async function requestNotion(pathname, options = {}) {
	let response;
	try {
		response = await fetch(`${apiBase}${pathname}`, {
			...options,
			headers: { ...headers, ...options.headers },
		});
	} catch (error) {
		throw new Error(`Could not reach the Notion API: ${error.message}`);
	}

	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		const code = body.code ? ` (${body.code})` : '';
		throw new Error(`Notion API returned HTTP ${response.status}${code}: ${body.message ?? 'No error message returned.'}`);
	}
	return body;
}

function validateSchema(properties) {
	const expected = {
		Name: { type: 'title', required: true },
		Published: { type: 'checkbox', required: true },
		Featured: { type: 'checkbox', required: true },
		Discipline: { type: 'multi_select' },
		'Work Type': { type: 'select' },
		Year: { type: 'number' },
		Client: { type: 'rich_text' },
		Description: { type: 'rich_text' },
		Cover: { type: 'files' },
	};

	for (const [name, expectation] of Object.entries(expected)) {
		const property = properties[name];
		if (!property) {
			if (expectation.required) {
				throw new Error(`Works schema is missing required property "${name}".`);
			}
			console.warn(`Optional Works property "${name}" is missing; it will be left blank.`);
			continue;
		}
		if (property.type !== expectation.type) {
			throw new Error(`Works property "${name}" has type "${property.type}"; expected "${expectation.type}".`);
		}
	}
}

function richTextValue(property) {
	return (property?.rich_text ?? []).map((part) => part.plain_text ?? '').join('').trim();
}

function titleValue(property) {
	return (property?.title ?? []).map((part) => part.plain_text ?? '').join('').trim();
}

function textValue(parts = []) {
	return parts.map((part) => part.plain_text ?? part.text?.content ?? '').join('').trim();
}

function safeHttpUrl(value) {
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
	} catch {
		return undefined;
	}
}

function fileSource(file) {
	if (file?.type === 'file') return file.file?.url;
	if (file?.type === 'external') return file.external?.url;
	return undefined;
}

function extensionFor(contentType, sourceUrl, kind) {
	const mimeExtensions = {
		'image/avif': 'avif',
		'image/gif': 'gif',
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/svg+xml': 'svg',
		'image/webp': 'webp',
		'video/mp4': 'mp4',
		'video/webm': 'webm',
		'video/ogg': 'ogv',
		'video/quicktime': 'mov',
	};
	if (mimeExtensions[contentType]) return mimeExtensions[contentType];
	const urlExtension = path.extname(new URL(sourceUrl).pathname).slice(1).toLowerCase();
	const imageExtensions = ['avif', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp'];
	const videoExtensions = ['mp4', 'webm', 'ogv', 'mov'];
	return (kind === 'image' ? imageExtensions : videoExtensions).includes(urlExtension)
		? urlExtension
		: undefined;
}

async function cacheNotionFile(pageId, assetKey, file, kind) {
	const sourceUrl = safeHttpUrl(fileSource(file) ?? '');
	if (!sourceUrl) return undefined;

	const response = await fetch(sourceUrl);
	if (!response.ok) throw new Error(`file download returned HTTP ${response.status}`);

	const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (!(kind === 'image' ? contentType.startsWith('image/') : contentType.startsWith('video/'))) {
		throw new Error(`file is not a supported ${kind} (${contentType || 'unknown content type'})`);
	}
	const extension = extensionFor(contentType, sourceUrl, kind);
	if (!extension) throw new Error(`unsupported ${kind} file type "${contentType}"`);

	const directory = path.join(rootDirectory, 'public', 'notion-covers');
	await mkdir(directory, { recursive: true });
	const stablePageId = pageId.replaceAll('-', '');
	const stableAssetKey = assetKey.replace(/[^a-zA-Z0-9-]/g, '-');
	const filename = `${stablePageId}-${stableAssetKey}.${extension}`;
	await writeFile(path.join(directory, filename), Buffer.from(await response.arrayBuffer()));
	return `/notion-covers/${filename}`;
}

async function queryAllPages(dataSourceId) {
	const pages = [];
	let cursor;
	do {
		const result = await requestNotion(`/data_sources/${dataSourceId}/query`, {
			method: 'POST',
			body: JSON.stringify({
				filter: { property: 'Published', checkbox: { equals: true } },
				page_size: 100,
				...(cursor ? { start_cursor: cursor } : {}),
			}),
		});
		pages.push(...(result.results ?? []));
		cursor = result.has_more ? result.next_cursor : undefined;
	} while (cursor);
	return pages;
}

async function retrieveChildren(blockId) {
	const blocks = [];
	let cursor;
	do {
		const query = new URLSearchParams({ page_size: '100' });
		if (cursor) query.set('start_cursor', cursor);
		const result = await requestNotion(`/blocks/${blockId}/children?${query.toString()}`);
		blocks.push(...(result.results ?? []));
		cursor = result.has_more ? result.next_cursor : undefined;
	} while (cursor);
	return blocks;
}

function safeVideoEmbedUrl(rawUrl) {
	const safeUrl = safeHttpUrl(rawUrl);
	if (!safeUrl) return undefined;
	const url = new URL(safeUrl);
	const host = url.hostname.toLowerCase();
	if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
		const id = url.searchParams.get('v');
		return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
	}
	if (host === 'youtu.be' || host === 'www.youtu.be') {
		const id = url.pathname.split('/').filter(Boolean)[0];
		return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
	}
	if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
		const id = url.pathname.split('/').filter(Boolean).at(-1);
		return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : undefined;
	}
	return undefined;
}

function countCachedPageMedia(blocks) {
	return blocks.reduce((count, block) => {
		if (block.type === 'image') return count + Number(block.image.src.startsWith('/notion-covers/'));
		if (block.type === 'image-row') return count + block.images.filter((image) => image.src.startsWith('/notion-covers/')).length;
		if (block.type === 'video') return count + Number(block.url.startsWith('/notion-covers/'));
		if (block.type === 'columns') return count + block.columns.reduce((columnCount, column) => columnCount + countCachedPageMedia(column), 0);
		return count;
	}, 0);
}

async function normalizeImage(pageId, block, key) {
	const image = block.image;
	if (!image) return undefined;
	const file = image[image.type];
	const caption = textValue(image.caption ?? []);
	let src;
	try {
		if (image.type === 'file') {
			src = await cacheNotionFile(pageId, key, image, 'image');
		} else if (image.type === 'external') {
			src = safeHttpUrl(image.external?.url ?? '');
		}
	} catch (error) {
		console.warn(`Could not cache a page image: ${error.message}`);
	}
	if (!src) return undefined;
	return {
		src,
		...(file?.name ? { alt: file.name } : {}),
		...(caption ? { caption } : {}),
	};
}

async function normalizePageBlocks(pageId, blocks, warningLabel) {
	const content = [];
	for (const block of blocks) {
		const data = block[block.type] ?? {};
		try {
			switch (block.type) {
				case 'image': {
					const image = await normalizeImage(pageId, block, `block-${block.id}`);
					if (image) content.push({ type: 'image', image });
					break;
				}
				case 'heading_1':
				case 'heading_2':
				case 'heading_3': {
					const text = textValue(data.rich_text);
					if (text) content.push({ type: 'heading', level: Number(block.type.at(-1)), text });
					break;
				}
				case 'paragraph': {
					const text = textValue(data.rich_text);
					if (text) content.push({ type: 'paragraph', text });
					break;
				}
				case 'column_list': {
					const columns = await retrieveChildren(block.id);
					const columnContents = [];
					for (const column of columns) {
						try {
							const children = await retrieveChildren(column.id);
							columnContents.push(await normalizePageBlocks(pageId, children, warningLabel));
						} catch (error) {
							console.warn(`Could not read a nested column in ${warningLabel}: ${error.message}`);
							columnContents.push([]);
						}
					}
					if (columnContents.some((column) => column.length > 0)) {
						content.push({ type: 'columns', columns: columnContents });
					}
					break;
				}
				case 'column': {
					content.push(...await normalizePageBlocks(pageId, await retrieveChildren(block.id), warningLabel));
					break;
				}
				case 'video': {
					const rawUrl = fileSource(data);
					if (!rawUrl) break;
					if (data.type === 'file') {
						const url = await cacheNotionFile(pageId, `video-${block.id}`, data, 'video');
						if (url) content.push({ type: 'video', url, title: textValue(data.caption ?? []) || 'Project video' });
					} else {
						const url = safeHttpUrl(rawUrl);
						if (!url) break;
						const embedUrl = safeVideoEmbedUrl(url);
						content.push(embedUrl
							? { type: 'video', url, embedUrl, title: textValue(data.caption ?? []) || 'Project video' }
							: { type: 'link', url, label: textValue(data.caption ?? []) || 'Watch video' });
					}
					break;
				}
				case 'embed': {
					const url = safeHttpUrl(data.url ?? '');
					if (!url) break;
					const embedUrl = safeVideoEmbedUrl(url);
					content.push(embedUrl
						? { type: 'video', url, embedUrl, title: 'Embedded video' }
						: { type: 'link', url, label: 'Open embedded content' });
					break;
				}
				case 'bookmark':
				case 'link_preview': {
					const url = safeHttpUrl(data.url ?? '');
					if (url) content.push({ type: 'link', url, label: textValue(data.caption ?? []) || url });
					break;
				}
				default: {
					if (block.has_children) {
						content.push(...await normalizePageBlocks(pageId, await retrieveChildren(block.id), warningLabel));
					}
				}
			}
		} catch (error) {
			console.warn(`Could not read ${block.type} block in ${warningLabel}: ${error.message}`);
		}
	}
	return content;
}

async function retrievePageContent(pageId, title) {
	try {
		const blocks = await retrieveChildren(pageId);
		return await normalizePageBlocks(pageId, blocks, `"${title}"`);
	} catch (error) {
		console.warn(`Could not read page content for "${title}"; using the Cover gallery fallback. ${error.message}`);
		return [];
	}
}

if (!token) {
	await useLocalFallback('NOTION_API_KEY is missing. Add it to .env.local or the build environment to enable CMS content.');
} else {
	try {
const database = await requestNotion(`/databases/${databaseId}`);
const dataSources = database.data_sources ?? [];
const worksSource = dataSources.find((source) => source.name === 'Works')
	?? (dataSources.length === 1 ? dataSources[0] : undefined);
if (!worksSource) {
	throw new Error('Could not find a Works data source in the Notion database.');
}

const schema = await requestNotion(`/data_sources/${worksSource.id}`);
validateSchema(schema.properties ?? {});

const pages = await queryAllPages(worksSource.id);
const publishedPages = pages.filter((page) => page.properties?.Published?.checkbox === true);
let cachedCovers = 0;
let cachedPageMedia = 0;

const projects = [];
for (const page of publishedPages) {
	const properties = page.properties ?? {};
	const title = titleValue(properties.Name);
	if (!title) continue;

	const coverFiles = properties.Cover?.files ?? [];
	const coverGallery = [];
	for (const [fileIndex, file] of coverFiles.entries()) {
		try {
			const image = await cacheNotionFile(page.id, `cover-${fileIndex}`, file, 'image');
			if (image) {
				coverGallery.push(image);
				cachedCovers += 1;
			}
		} catch (error) {
			console.warn(`Could not cache Cover image ${fileIndex + 1} for "${title}": ${error.message}`);
		}
	}

	const discipline = (properties.Discipline?.multi_select ?? [])
		.map((item) => item.name)
		.filter(Boolean);
	const workType = properties['Work Type']?.select?.name || undefined;
	const year = properties.Year?.number ?? undefined;
	const client = richTextValue(properties.Client) || undefined;
	const description = richTextValue(properties.Description) || undefined;
	const content = await retrievePageContent(page.id, title);
		cachedPageMedia += countCachedPageMedia(content);

	projects.push({
		slug: createProjectSlug(title),
		title,
		discipline,
		workType,
		year,
		client,
		description,
		cover: coverGallery[0],
		gallery: coverGallery,
		content,
		featured: properties.Featured?.checkbox === true,
	});
}

assertUniqueProjectSlugs(projects);

await writeGeneratedProjects(projects);

const featuredCount = projects.filter((project) => project.featured).length;
console.log(`Notion sync complete: ${projects.length} published project(s), ${featuredCount} featured, ${cachedCovers} Cover image(s) and ${cachedPageMedia} page-content media file(s) cached.`);
if (projects.length === 0) {
	console.warn('No published Notion projects were found; the site will use local fallback projects from src/data/projects.ts.');
}
if (featuredCount !== 2) {
	const featuredTitles = projects.filter((project) => project.featured).map((project) => project.title);
	console.warn(
		`Featured checkbox mismatch: the homepage layout expects 2 featured projects, but Notion currently marks ${featuredCount}. ` +
		`Featured titles: ${featuredTitles.join(', ') || '(none)'}. No Notion values were changed.`,
	);
}
	} catch (error) {
		await useLocalFallback(error instanceof Error ? error.message : String(error));
	}
}
