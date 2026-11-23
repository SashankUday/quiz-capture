import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, copyFile, cp, lstat, link, mkdir, mkdtemp, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwrightCommand, provisionBrowser } from './browser.mjs';
import { desktopDirectory } from './paths.mjs';

const sources = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(await readFile(join(sources, 'package.json'), 'utf8'));
const macName = 'Socrative and Mentimeter Quiz Capture';
const macLauncher = 'Start ' + macName + '.command';
const legacyMacLauncherHash = '8636b71be879d9d507eccc31099eebc90c18d23ce1d9a74736e7d2bd65d1adfe';
const versionPattern = /^\d+\.\d+\.\d+$/;
const marker = 'Quiz Capture installation\n';
const env = process.env;

function absoluteOverride(name, fallback) {
  const value = env[name];
  if (!value) return fallback;
  if (!isAbsolute(value)) throw new Error(name + ' must be an absolute path.');
  return value;
}

function linuxDataDirectory() {
  return isAbsolute(env.XDG_DATA_HOME || '') ? env.XDG_DATA_HOME : join(homedir(), '.local', 'share');
}

async function existingFile(path) {
  const entry = await lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!entry) return null;
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Move the existing item aside: ' + path);
  return readFile(path);
}

function desktopEntry(launcher) {
  if (/[\x00-\x1f\x7f]/.test(launcher)) throw new Error('The install path cannot contain control characters.');
  // Exec quoting is applied after desktop-file string escaping.
  const quoted = launcher.replace(/[\\$"\x60]/g, '\\$&').replace(/\\/g, '\\\\').replace(/%/g, '%%');
  return Buffer.from('[Desktop Entry]\nType=Application\nName=Quiz Capture\nExec="' + quoted +
    '"\nTerminal=true\nIcon=camera-photo\nCategories=Education;\n');
}

async function launcherFiles(root) {
  const resources = dirname(sources);
  const linux = process.platform === 'linux';
  const defaultDir = linux ? join(linuxDataDirectory(), 'applications') : await desktopDirectory();
  const directory = absoluteOverride('QUIZ_CAPTURE_LAUNCHER_DIR', defaultDir);
  if (linux) {
    const launcher = join(root, 'quiz-capture');
    return [
      { path: launcher, content: await readFile(join(resources, 'Start Quiz Capture.sh')), mode: 0o755 },
      { path: join(directory, 'quiz-capture.desktop'), content: desktopEntry(launcher), mode: 0o644 },
    ];
  }
  const name = process.platform === 'darwin' ? macLauncher : 'Start Quiz Capture.cmd';
  return [{ path: join(directory, name), content: await readFile(join(resources, name)), mode: 0o755 }];
}

async function checkLauncher(file) {
  const existing = await existingFile(file.path);
  if (!existing || existing.equals(file.content)) return existing;
  if (process.platform === 'darwin' &&
      createHash('sha256').update(existing).digest('hex') === legacyMacLauncherHash) return existing;
  throw new Error('A different launcher already exists. Move it aside and retry: ' + file.path);
}

async function writeLauncher(file, previous) {
  if (previous?.equals(file.content)) return;
  const parent = dirname(file.path);
  await mkdir(parent, { recursive: true });
  const tempDir = await mkdtemp(join(parent, '.quiz-capture-'));
  const staged = join(tempDir, 'launcher');
  try {
    await writeFile(staged, file.content, { mode: file.mode });
    await chmod(staged, file.mode);
    if (!previous) {
      // link fails if another file has appeared since the ownership check.
      await link(staged, file.path);
    } else {
      const current = await existingFile(file.path);
      if (!current?.equals(previous)) throw new Error('Launcher changed during installation: ' + file.path);
      await rename(staged, file.path);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function checkVersion(path) {
  const entry = await lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!entry?.isDirectory() || entry.isSymbolicLink()) throw new Error('Move the incomplete or unrelated installation aside: ' + path);
  const contents = await existingFile(join(path, '.quiz-capture'));
  if (contents?.toString() !== marker) throw new Error('Move the incomplete or unrelated installation aside: ' + path);
}

async function install() {
  if (!versionPattern.test(version)) throw new Error('The release app version is invalid.');
  const installSystemDeps = process.argv.includes('--install-system-deps');
  const allowed = ['--non-interactive', '--install-system-deps'];
  if (process.argv.slice(2).some((arg) => !allowed.includes(arg))) throw new Error('Unknown installer option.');
  if (installSystemDeps && process.platform !== 'linux') throw new Error('--install-system-deps is for Linux only.');
  if (process.getuid?.() === 0) throw new Error('Run the installer as your regular user without sudo.');
  const root = absoluteOverride('QUIZ_CAPTURE_INSTALL_ROOT', {
    darwin: join(homedir(), 'Library', 'Application Support', macName),
    win32: join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Quiz Capture'),
    linux: join(linuxDataDirectory(), 'quiz-capture'),
  }[process.platform]);
  await mkdir(root, { recursive: true });
  const lock = join(root, '.install-lock');
  await mkdir(lock).catch((error) => {
    if (error.code === 'EEXIST') throw new Error('Another installation may be running. If it was interrupted, remove the empty .install-lock folder in ' + root);
    throw error;
  });
  let staging;
  try {
    const launchers = await launcherFiles(root);
    const previousLaunchers = await Promise.all(launchers.map(checkLauncher));
    const currentPath = join(root, 'current');
    const current = (await existingFile(currentPath))?.toString().trim();
    if (current !== undefined) {
      if (!versionPattern.test(current)) throw new Error('Move the unrelated current file aside: ' + currentPath);
      await checkVersion(join(root, current));
      const currentParts = current.split('.').map(Number);
      const newParts = version.split('.').map(Number);
      const firstDifference = currentParts.findIndex((number, index) => number !== newParts[index]);
      if (firstDifference >= 0 && currentParts[firstDifference] > newParts[firstDifference]) {
        throw new Error('A newer version is installed. Download the latest release.');
      }
    }

    if (installSystemDeps) await playwrightCommand('install-deps', 'chromium');
    await provisionBrowser();
    const target = join(root, version);
    const targetExists = await lstat(target).then(() => true, (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    staging = await mkdtemp(join(root, '.staging-'));
    if (targetExists) {
      await checkVersion(target);
    } else {
      const app = join(staging, 'app');
      await mkdir(app);
      const node = join(app, process.platform === 'win32' ? 'node.exe' : 'node');
      await copyFile(process.execPath, node, constants.COPYFILE_EXCL);
      await chmod(node, 0o755);
      await copyFile(join(dirname(process.execPath), 'LICENSE'), join(app, 'Node-LICENSE'));
      await cp(sources, join(app, 'Quiz Capture'), { recursive: true, errorOnExist: true, force: false });
      await writeFile(join(app, '.quiz-capture'), marker, { flag: 'wx' });
      await rename(app, target);
    }

    // A successful install always verifies the installed runtime and browser.
    const runtime = join(target, process.platform === 'win32' ? 'node.exe' : 'node');
    const capture = join(target, 'Quiz Capture', 'capture.mjs');
    await checkInstalledBrowser(runtime, capture);

    for (const [index, file] of launchers.entries()) await writeLauncher(file, previousLaunchers[index]);
    const selector = join(staging, 'current');
    await writeFile(selector, version + (process.platform === 'win32' ? '\r\n' : '\n'), { flag: 'wx' });
    if (current === undefined) await link(selector, currentPath);
    else await rename(selector, currentPath);

    console.log('Installed Quiz Capture ' + version + '.');
    console.log(process.platform === 'linux' ? 'Open Quiz Capture from the applications menu.' : 'Open ' + launchers[0].path);
  } finally {
    try {
      if (staging) await rm(staging, { recursive: true, force: true });
    } finally {
      await rmdir(lock);
    }
  }
}

async function checkInstalledBrowser(runtime, capture) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  try {
    const { stdout } = await promisify(execFile)(runtime, [capture, '--verify'], { timeout: 45000, windowsHide: true });
    if (!stdout.includes('Quiz Capture browser verification passed.')) throw new Error('Browser verification produced no result.');
  } catch (error) {
    throw new Error('The installed app could not start. ' + (error.stderr || error.message));
  }
}

install().catch((error) => {
  console.error('Quiz Capture installation failed. ' + error.message);
  process.exitCode = 1;
});
