// Names that may change later. Everything else in the site reads them from here:
// astro.config.mjs, the components in src/components/, and the MDX pages that import them.
// Markdown links inside the pages still spell out the base path, because Astro requires
// internal links to carry it (https://docs.astro.build/en/guides/deploy/github/), and the
// landing page's hero buttons in src/content/docs/index.mdx spell out the base path and the
// repository URL. After a change here, find those links from site/ with
//   grep -rnE '(\]\(|link: )/local-voice-transcriber/|github.com/josesiqueira' src/content
// (the old base path and slug) and replace them. Paths such as ~/.local/state/local-voice-transcriber/
// are folder names on the user's computer, not the base path; change them only if the
// program's folders change. The build fails on any internal link that misses the new base.

/** Product name, as shown in the header, page titles and the footer. */
export const PRODUCT_NAME = 'Local Voice Transcriber';

/** GitHub repository, as "owner/name". */
export const REPO_SLUG = 'josesiqueira/local-voice-transcriber';

/** Branch that links to source files point at. */
export const REPO_BRANCH = 'main';

/** Origin the site is served from (no trailing slash). */
export const SITE_ORIGIN = 'https://josesiqueira.github.io';

/** Path the site lives under on that origin (leading slash, no trailing slash). */
export const BASE_PATH = '/local-voice-transcriber';

/** Notice shown in the footer of every page and on the License page. */
export const TRADEMARK_NOTICE = `${PRODUCT_NAME} is an independent open source project. It is not affiliated with, endorsed by or sponsored by WhatsApp LLC or Meta Platforms, Inc. WhatsApp is a trademark of WhatsApp LLC, used here only to describe compatibility.`;

/** Risk notice shown on Install, in the landing page FAQ and on Limits. */
export const TERMS_RISK_NOTICE =
	"WhatsApp's Terms of Service restrict modifying or altering its service. Using any browser extension on WhatsApp Web may conflict with those terms, and WhatsApp may restrict accounts it believes break them. You install and use this tool at your own risk.";

// Derived values. Do not hard-code these anywhere else.
export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const REPO_NAME = REPO_SLUG.split('/')[1];
export const CLONE_URL = `${REPO_URL}.git`;
export const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}/`;

/** Internal page link with the base path, for components and MDX: pageUrl('start/install/'). */
export function pageUrl(path = ''): string {
	return `${BASE_PATH}/${path.replace(/^\//, '')}`;
}

/** Link to a file or folder in the repository on GitHub: source('host/config.py'). */
export function source(path: string): string {
	const kind = path.endsWith('/') ? 'tree' : 'blob';
	return `${REPO_URL}/${kind}/${REPO_BRANCH}/${path.replace(/\/$/, '')}`;
}
