import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

const repository = process.env.GITHUB_REPOSITORY ?? '';
const [owner = '', repositoryName = ''] = repository.split('/');
const isOrganizationSite = repositoryName.toLowerCase() === `${owner.toLowerCase()}.github.io`;
const site = process.env.SITE_URL || (owner ? `https://${owner}.github.io` : 'http://localhost:4321');
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
