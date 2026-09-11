import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

const repository = process.env.GITHUB_REPOSITORY ?? '';
const [owner = '', repositoryName = ''] = repository.split('/');
const normalizedOwner = owner.toLowerCase();
const isOrganizationSite = repositoryName.toLowerCase() === `${normalizedOwner}.github.io`;
const site = process.env.SITE_URL || (normalizedOwner ? `https://${normalizedOwner}.github.io` : 'http://localhost:4321');
const base = process.env.BASE_PATH || (!repositoryName || isOrganizationSite ? '/' : `/${repositoryName}`);

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx()],
  markdown: {
    shikiConfig: { theme: 'github-dark' }
  }
});
