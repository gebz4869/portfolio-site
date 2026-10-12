export type ProjectImage = {
	src: string;
	alt?: string;
	caption?: string;
};

export type ProjectContentBlock =
	| { type: 'image'; image: ProjectImage }
	| { type: 'image-row'; images: ProjectImage[] }
	| { type: 'columns'; columns: ProjectContentBlock[][] }
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'paragraph'; text: string }
	| { type: 'video'; url: string; embedUrl?: string; title?: string }
	| { type: 'link'; url: string; label: string };

export type Project = {
	slug: string;
	title: string;
	discipline: string[];
	workType?: string;
	year?: number;
	client?: string;
	description?: string;
	cover?: string;
	gallery?: string[];
	content?: ProjectContentBlock[];
	featured: boolean;
};
