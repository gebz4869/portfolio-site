export type Project = {
	title: string;
	category: string;
	featured: boolean;
};

export const projects: Project[] = [
	{ title: 'Double Take', category: 'Branding', featured: true },
	{ title: 'Ans.Ein', category: 'Social Media', featured: false },
	{ title: 'Creation Care Playbook', category: 'Editorial', featured: true },
	{ title: 'Typoetry', category: 'Campaign', featured: false },
	{ title: 'Photography Works', category: 'Photography', featured: false },
];
