import gulp from 'gulp';
import fs from 'fs-extra';
import axios from './scripts/axios-build-instance.js';
import minimist from 'minimist';

const ARGV = minimist(process.argv.slice(2));
const CONTRIBUTION_THRESHOLD = 3;
const MAX_CONTRIBUTORS = 15;

gulp.task('default', async () => {
  console.log('hello!');
});

const CLEAR = gulp.task('clear', async () => {
  try {
    await fs.emptyDir('./dist/');
  } catch (err) {
    throw new Error(`Failed to clear dist directory: ${err.message}`, { cause: err });
  }
});

const BOWER = gulp.task('bower', async () => {
  try {
    const npm = JSON.parse(await fs.readFile('package.json', 'utf8'));
    const bower = JSON.parse(await fs.readFile('bower.json', 'utf8'));

    const FIELDS = ['name', 'description', 'version', 'homepage', 'license', 'keywords'];

    for (let i = 0; i < FIELDS.length; i++) {
      const field = FIELDS[i];
      if (npm[field] !== undefined) {
        bower[field] = npm[field];
      }
    }

    await fs.writeFile('bower.json', JSON.stringify(bower, null, 2));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Required file not found: ${err.path}`, { cause: err });
    }
    throw new Error(`Failed to sync bower.json: ${err.message}`, { cause: err });
  }
});

async function getContributors(user, repo, maxCount = 1) {
  try {
    const contributors = (
      await axios.get(
        `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/contributors`,
        { params: { per_page: maxCount }, timeout: 10000 }
      )
    ).data;

    const results = await Promise.allSettled(
      contributors.map(async (contributor) => {
        const userData = await axios.get(
          `https://api.github.com/users/${encodeURIComponent(contributor.login)}`,
          { timeout: 5000 }
        );
        return {
          ...contributor,
          ...userData.data,
        };
      })
    );

    const successfulContributors = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);

    const failedCount = results.length - successfulContributors.length;
    if (failedCount > 0) {
      console.error(`Warning: Failed to fetch details for ${failedCount} contributor(s)`);
    }

    return successfulContributors;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response) {
        switch (err.response.status) {
          case 403:
            throw new Error(`GitHub API rate limit exceeded: ${err.response.data?.message || 'Try again later'}`, { cause: err });
          case 404:
            throw new Error(`GitHub repository not found: ${user}/${repo}`, { cause: err });
          case 500:
          case 502:
          case 503:
            throw new Error(`GitHub API server error (${err.response.status}): Please try again later`, { cause: err });
          default:
            throw new Error(`GitHub API error (${err.response.status}): ${err.response.data?.message || err.message}`, { cause: err });
        }
      } else if (err.request) {
        throw new Error(`Network error connecting to GitHub API: ${err.message}`, { cause: err });
      }
    }
    throw new Error(`Failed to fetch contributors: ${err.message}`, { cause: err });
  }
}

const PACKAGE_JSON = gulp.task('package', async () => {
  try {
    const npm = JSON.parse(await fs.readFile('package.json', 'utf8'));

    try {
      const contributors = await getContributors('axios', 'axios', MAX_CONTRIBUTORS);

      npm.contributors = contributors
        .filter(
          ({ type, contributions }) =>
            type?.toLowerCase() === 'user' && contributions >= CONTRIBUTION_THRESHOLD
        )
        .map(({ login, name }) => `${name || login} (https://github.com/${login})`);

      await fs.writeFile('package.json', JSON.stringify(npm, null, 2));
      console.log(`Updated package.json with ${npm.contributors.length} contributors`);
    } catch (err) {
      console.error(`Warning: Could not update contributors: ${err.message}`);
      console.error('Continuing without updating contributors list');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('package.json not found', { cause: err });
    }
    throw new Error(`Failed to update package.json: ${err.message}`, { cause: err });
  }
});

const ENV = gulp.task('env', async () => {
  try {
    const npm = JSON.parse(await fs.readFile('package.json', 'utf8'));

    const envFilePath = './lib/env/data.js';
    const version = (ARGV.bump || npm.version).replace(/^v/, '');
    
    if (!version) {
      throw new Error('Version is undefined or empty');
    }
    
    const content = Object.entries({
      VERSION: version,
    })
      .map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
      .join('\n');

    await fs.ensureDir(envFilePath.replace(/\/[^/]+$/, ''));
    await fs.writeFile(envFilePath, content);
    
    console.log(`env file generated with version: ${version}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('package.json not found when generating env file', { cause: err });
    }
    throw new Error(`Failed to generate env file: ${err.message}`, { cause: err });
  }
});

const VERSION = gulp.series('bower', 'env', 'package');

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

export { BOWER, ENV, CLEAR, VERSION, PACKAGE_JSON };
