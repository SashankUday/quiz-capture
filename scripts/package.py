"""Build one release archive on its target OS after npm ci."""
import hashlib
import platform
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE = 'v24.22.3'
# https://nodejs.org/en/blog/release/v24.22.3/#shasums
HASHES = {
    'darwin-x64.tar.xz': '4daeec962855c1a6e66cda398a25037319dc1bbd4a0939188b3547afbbfb6490',
    'darwin-arm64.tar.xz': '1d64136c8a43d648d1b3bad10797a4c995b1ca032d2bde8799de43b37f058fe5',
    'win-x64.zip': 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f',
    'win-arm64.zip': 'b3cc74a295b39d4f273271e96f58c06dd2b35757ca12abec64c7d0598b434f14',
    'linux-x64.tar.xz': '4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb',
    'linux-arm64.tar.xz': '6e51a2ada00f0011cc266f65d98922b403d7ad88f809ca2aa615a5fe1ce6e86c',
}
NAME = 'Socrative and Mentimeter Quiz Capture'
APP_FILES = ('capture.mjs', 'question.mjs', 'mentimeter.mjs', 'paths.mjs', 'browser.mjs',
             'install.mjs', 'package.json', 'package-lock.json')
PLATFORMS = {
    'Darwin': ('darwin', 'macOS.zip', 'Install Quiz Capture.command', f'Start {NAME}.command'),
    'Windows': ('win', 'Windows.zip', 'Install Quiz Capture.cmd', 'Start Quiz Capture.cmd'),
    'Linux': ('linux', 'Linux.tar.gz', 'Install Quiz Capture.sh', 'Start Quiz Capture.sh'),
}


def bundle_runtime(platform_name, arch, output, work):
    windows = platform_name == 'win'
    suffix = f'{platform_name}-{arch}.' + ('zip' if windows else 'tar.xz')
    folder = f'node-{NODE}-{platform_name}-{arch}'
    filename = f'node-{NODE}-{suffix}'
    archive = work / filename
    url = f'https://nodejs.org/dist/{NODE}/{filename}'
    # curl's retry also covers transient release-server errors in the CI matrix.
    subprocess.run(['curl', '--proto', '=https', '--proto-redir', '=https',
                    '--fail', '--silent', '--show-error', '--location', '--retry', '3',
                    '--max-time', '180', '--output', str(archive), url], check=True)
    with archive.open('rb') as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != HASHES[suffix]:
        raise RuntimeError(f'Checksum mismatch for {filename}')
    output.mkdir(parents=True)
    if windows:
        with zipfile.ZipFile(archive) as node:
            for member in ('node.exe', 'LICENSE'):
                (output / member).write_bytes(node.read(f'{folder}/{member}'))
    else:
        with tarfile.open(archive, 'r:xz') as node:
            for member in ('bin/node', 'LICENSE'):
                with node.extractfile(f'{folder}/{member}') as stream:
                    with (output / Path(member).name).open('wb') as destination:
                        shutil.copyfileobj(stream, destination)
            (output / 'node').chmod(0o755)


def copy_launcher(source, destination):
    shutil.copy2(source, destination)
    if destination.suffix == '.cmd':
        destination.write_bytes(source.read_bytes().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n'))
    else:
        destination.chmod(0o755)


def build():
    platform_name, extension, installer, launcher = PLATFORMS[platform.system()]
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    asset = output / f'Quiz-Capture-{extension}'
    resources = ROOT / 'Resources'
    app = resources / 'Quiz Capture'
    with tempfile.TemporaryDirectory(prefix='quiz-capture-build-') as temp:
        work = Path(temp)
        package = work / NAME
        target = package / 'Resources' / 'Quiz Capture'
        target.mkdir(parents=True)
        copy_launcher(ROOT / installer, package / installer)
        copy_launcher(resources / launcher, package / 'Resources' / launcher)
        shutil.copy2(ROOT / 'README.md', package / 'README.md')
        for name in APP_FILES:
            shutil.copy2(app / name, target / name)
        for name in ('playwright', 'playwright-core'):
            shutil.copytree(app / 'node_modules' / name, target / 'node_modules' / name)
        for arch in ('x64', 'arm64'):
            bundle_runtime(platform_name, arch, package / 'Resources' / 'runtime' / arch, work)

        if extension.endswith('.zip'):
            with zipfile.ZipFile(asset, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as release:
                for file in sorted(package.rglob('*')):
                    if file.is_file():
                        release.write(file, file.relative_to(work))
        else:
            with tarfile.open(asset, 'w:gz') as release:
                release.add(package, arcname=NAME)
    print(asset)


if __name__ == '__main__':
    build()
