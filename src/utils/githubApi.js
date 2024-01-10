async function GithubRequest(url) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'user-agent': 'node.js',
  });
  if (process.env.GITHUB_TOKEN) {
    headers.append('Authorization', `Bearer ${process.env.GITHUB_TOKEN}`);
  }

  const response = await (
    await fetch(`https://api.github.com/${url}`, {
      headers,
    })
  ).json();

  return response;
}

async function getRandomFollower(user) {
  const followers = await GithubRequest(`users/${user}/followers`);

  if (followers.length) {
    const randomFollowerIndex = Math.floor(Math.random() * followers.length);
    const selectedFollowerName = followers[randomFollowerIndex].login;
    const selectedFollower = await GithubRequest(`users/${selectedFollowerName}`);
    return selectedFollower;
  }

  return Promise.resolve({});
}

async function getRepositories(user) {
  const repositories = GithubRequest(`users/${user}/repos`);
  return repositories;
}

module.exports = { getRandomFollower, getRepositories };
