// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import {
	BASE_PATH,
	PRODUCT_NAME,
	REPO_BRANCH,
	REPO_URL,
	SITE_ORIGIN,
	SITE_URL,
} from './src/consts.ts';

export default defineConfig({
	site: SITE_ORIGIN,
	base: BASE_PATH,
	// GitHub Pages redirects slash-less directory URLs, so every link ends in a slash.
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: PRODUCT_NAME,
			description:
				'Transcribe WhatsApp Web voice notes on your own computer with Whisper large-v3-turbo. Open source, no telemetry, no audio leaves your computer.',
			logo: { src: './src/assets/logo.svg', alt: '' },
			favicon: '/favicon.svg',
			social: [{ icon: 'github', label: 'Source code on GitHub', href: REPO_URL }],
			editLink: { baseUrl: `${REPO_URL}/edit/${REPO_BRANCH}/site/` },
			customCss: [
				'@fontsource-variable/ibm-plex-sans/wght.css',
				'@fontsource-variable/ibm-plex-sans/wght-italic.css',
				'./src/styles/theme.css',
			],
			components: {
				Hero: './src/components/Hero.astro',
				Footer: './src/components/Footer.astro',
			},
			head: [
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${BASE_PATH}/apple-touch-icon.png` } },
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
				},
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#151210', media: '(prefers-color-scheme: dark)' },
				},
				{ tag: 'meta', attrs: { property: 'og:image', content: `${SITE_URL}og.png` } },
				{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
				{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:alt',
						content: `${PRODUCT_NAME}: voice notes transcribed on your own computer.`,
					},
				},
			],
			expressiveCode: {
				styleOverrides: { borderRadius: '0.5rem', codeFontSize: '0.875rem' },
			},
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ slug: 'start/overview' },
						{ slug: 'start/how-it-works' },
						{ slug: 'start/requirements' },
						{ slug: 'start/install' },
						{ slug: 'start/first-transcription' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ slug: 'guides/languages' },
						{ slug: 'guides/update' },
						{ slug: 'guides/uninstall' },
						{ slug: 'guides/troubleshooting' },
					],
				},
				{
					label: 'Privacy and security',
					items: [
						{ slug: 'privacy/privacy' },
						{ slug: 'privacy/verify' },
						{ slug: 'privacy/limits' },
						{ slug: 'privacy/security-issues' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ slug: 'reference/architecture' },
						{ slug: 'reference/files' },
						{ slug: 'reference/configuration' },
						{ slug: 'reference/platform-support' },
						{ slug: 'reference/license' },
					],
				},
			],
			plugins: [starlightLinksValidator()],
		}),
	],
});
