import { execFile } from 'node:child_process';
import { writeFile, mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { log } from './log.js';

/** Runs git, never echoing the environment that carries the token. */
function git(args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, env: { ...process.env, ...env }, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // Scrub anything token-shaped out of the message before it is logged.
          const detail = `${stderr || stdout || err.message}`.replace(
            /gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+/g,
            '***',
          );
          reject(new Error(`git ${args[0]} failed: ${detail.trim().slice(0, 500)}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

/**
 * Writes an askpass helper that reads the token from the environment, so the
 * credential never reaches .git/config or the process arguments.
 */
async function makeAskpass() {
  const dir = await mkdir(path.join(os.tmpdir(), 'cards-askpass'), { recursive: true }).then(
    () => path.join(os.tmpdir(), 'cards-askpass'),
  );
  const file = path.join(dir, 'askpass.sh');
  await writeFile(file, '#!/bin/sh\nprintf %s "$GIT_TOKEN"\n', { mode: 0o700 });
  return file;
}

export class Publisher {
  constructor(config) {
    this.config = config;
    this.remote = `https://github.com/${config.repoSlug}.git`;
    this.askpass = null;
  }

  async env() {
    this.askpass ??= await makeAskpass();
    return {
      GIT_ASKPASS: this.askpass,
      GIT_TOKEN: this.config.token,
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: this.config.gitName,
      GIT_AUTHOR_EMAIL: this.config.gitEmail,
      GIT_COMMITTER_NAME: this.config.gitName,
      GIT_COMMITTER_EMAIL: this.config.gitEmail,
    };
  }

  async ensureRepo() {
    const { workDir, repoBranch } = this.config;
    const env = await this.env();

    if (!existsSync(path.join(workDir, '.git'))) {
      await rm(workDir, { recursive: true, force: true });
      await mkdir(path.dirname(workDir), { recursive: true });
      log.info('cloning profile repo', { slug: this.config.repoSlug });
      await git(
        [
          '-c',
          'credential.username=x-access-token',
          'clone',
          '--depth=1',
          '--branch',
          repoBranch,
          this.remote,
          workDir,
        ],
        { env },
      );
    }
    return workDir;
  }

  /** Discards local state and matches the remote branch exactly. */
  async syncToRemote() {
    const { workDir, repoBranch } = this.config;
    const env = await this.env();
    await git(['-c', 'credential.username=x-access-token', 'fetch', '--depth=1', 'origin', repoBranch], {
      cwd: workDir,
      env,
    });
    await git(['reset', '--hard', `origin/${repoBranch}`], { cwd: workDir, env });
    await git(['clean', '-fd'], { cwd: workDir, env });
  }

  /**
   * Copies the rendered cards into the repo and pushes, if anything changed.
   * Retries once after re-syncing, since the scheduled GitHub Action may have
   * pushed between our fetch and our push.
   */
  async publish(outDir, files) {
    const { workDir, repoSubdir, repoBranch } = this.config;
    const env = await this.env();
    await this.ensureRepo();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.syncToRemote();

      const target = path.join(workDir, repoSubdir);
      await mkdir(target, { recursive: true });
      for (const filename of Object.keys(files)) {
        await copyFile(path.join(outDir, filename), path.join(target, filename));
      }

      const status = await git(['status', '--porcelain', '--', repoSubdir], {
        cwd: workDir,
        env,
      });
      if (!status) {
        log.info('cards unchanged, nothing to publish');
        return { pushed: false };
      }

      await git(['add', '--', repoSubdir], { cwd: workDir, env });
      await git(
        ['commit', '-m', 'Update profile cards', '-m', 'Rendered by the cards service.'],
        { cwd: workDir, env },
      );

      try {
        await git(
          ['-c', 'credential.username=x-access-token', 'push', 'origin', `HEAD:${repoBranch}`],
          { cwd: workDir, env },
        );
        const head = await git(['rev-parse', '--short', 'HEAD'], { cwd: workDir, env });
        log.info('published cards', { commit: head, files: Object.keys(files).length });
        return { pushed: true, commit: head };
      } catch (err) {
        if (attempt === 2) throw err;
        log.warn('push rejected, re-syncing and retrying', { error: err.message });
      }
    }
    return { pushed: false };
  }
}

export async function listPublished(outDir) {
  try {
    return await readdir(outDir);
  } catch {
    return [];
  }
}
