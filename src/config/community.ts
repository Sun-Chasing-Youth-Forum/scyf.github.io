const repository = import.meta.env.PUBLIC_GITHUB_REPOSITORY || '';

export const community = {
  repository,
  discussionsUrl: repository ? `https://github.com/${repository}/discussions` : '',
  giscus: {
    repo: repository,
    repoId: import.meta.env.PUBLIC_GISCUS_REPO_ID || '',
    category: import.meta.env.PUBLIC_GISCUS_CATEGORY || '活动讨论',
    categoryId: import.meta.env.PUBLIC_GISCUS_CATEGORY_ID || ''
  }
};

export const giscusEnabled = Boolean(
  community.giscus.repo && community.giscus.repoId && community.giscus.categoryId
);
