import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, win32 } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export function parseXdgDesktop(config, home) {
  const match = config.match(/^[ \t]*XDG_DESKTOP_DIR[ \t]*=[ \t]*"((?:\\.|[^"\\\r\n])*)"[ \t]*(?:#.*)?$/m);
  if (!match) return undefined;
  // Expand only the standard $HOME prefix and only the escapes in a quoted
  // value. Never source the user-dirs file or evaluate any commands in it.
  return match[1].replace(/^\$HOME(?=\/|$)/, () => home).replace(/\\(["\\$\x60])/g, '$1');
}

export async function desktopDirectory({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  if (platform === 'win32') {
    const powershell = win32.join(env.SystemRoot || 'C:\\Windows',
      'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    try {
      const { stdout } = await run(powershell, [
        '-NoProfile', '-NonInteractive', '-Command',
        "[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Environment]::GetFolderPath('DesktopDirectory')",
      ], { windowsHide: true, timeout: 8000 });
      if (win32.isAbsolute(stdout.trim())) return stdout.trim();
    } catch (error) {
      if (env.OneDrive && win32.isAbsolute(env.OneDrive)) {
        const desktop = win32.join(env.OneDrive, 'Desktop');
        if (await isDirectory(desktop)) return desktop;
      }
    }
  }
  if (platform === 'linux') {
    const configHome = isAbsolute(env.XDG_CONFIG_HOME || '') ? env.XDG_CONFIG_HOME : join(home, '.config');
    const config = await readFile(join(configHome, 'user-dirs.dirs'), 'utf8').catch(() => '');
    const desktop = parseXdgDesktop(config, home);
    if (desktop && isAbsolute(desktop)) return desktop;
  }
  return join(home, 'Desktop');
}

async function isDirectory(path) {
  return stat(path).then((entry) => entry.isDirectory(), () => false);
}

export async function screenshotRoot(options = {}) {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const override = env.QUIZ_CAPTURE_SCREENSHOTS;
  if (override) {
    if (!isAbsolute(override)) throw new Error('QUIZ_CAPTURE_SCREENSHOTS must be an absolute folder path.');
    return override;
  }
  const desktop = await desktopDirectory(options);
  return join(await isDirectory(desktop) ? desktop : home, 'Quiz Screenshots');
}

export function validFolderName(name) {
  return Boolean(name) && !/[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) &&
    !/[. ]$/.test(name) && Buffer.byteLength(name) <= 255 &&
    !/^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9¹²³]) *(?:\.|$)/i.test(name);
}
