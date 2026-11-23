"""Smoke-test an extracted release using an isolated per-user install location."""
import os
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

from package import NAME, PLATFORMS, ROOT


def invoke(script, *args, env, success=True):
    if script.suffix == '.cmd':
        # cmd.exe has its own quoting rules for a quoted executable after /c.
        command = f'"{os.environ["ComSpec"]}" /d /s /c ""{script}" {" ".join(args)}"'
    else:
        command = [str(script), *args]
    result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    print(result.stdout, end='')
    if success != (result.returncode == 0):
        raise RuntimeError(f'Unexpected exit code {result.returncode} from {script}')
    return result.stdout


def smoke_test():
    system = platform.system()
    _, extension, installer_name, launcher_name = PLATFORMS[system]
    asset = ROOT / 'dist' / f'Quiz-Capture-{extension}'
    with tempfile.TemporaryDirectory(prefix='Quiz Capture QA ') as temp:
        work = Path(temp)
        extracted = work / 'archive'
        if system == 'Windows':
            shutil.unpack_archive(asset, extracted)
        else:
            # The native tools restore executable permissions as end users' tools do.
            extracted.mkdir()
            command = ['unzip', '-q', asset, '-d', extracted] if system == 'Darwin' else [
                'tar', '-xzf', asset, '-C', extracted]
            subprocess.run(command, check=True)
        installer = extracted / NAME / installer_name
        app = work / 'User Apps' / 'quiz-capture'
        launcher_dir = work / 'User Launchers'
        env = dict(os.environ, QUIZ_CAPTURE_INSTALL_ROOT=str(app),
                   QUIZ_CAPTURE_LAUNCHER_DIR=str(launcher_dir))
        launcher = app / 'quiz-capture' if system == 'Linux' else launcher_dir / launcher_name
        menu_entry = launcher_dir / 'quiz-capture.desktop' if system == 'Linux' else launcher

        # Refuse to overwrite an unrelated launcher.
        menu_entry.parent.mkdir(parents=True)
        menu_entry.write_text('unrelated content', encoding='utf-8')
        output = invoke(installer, '--non-interactive', env=env, success=False)
        assert 'A different launcher already exists' in output
        assert menu_entry.read_text(encoding='utf-8') == 'unrelated content'
        menu_entry.unlink()

        invoke(installer, '--non-interactive', env=env)
        assert menu_entry.is_file()
        if system == 'Linux':
            assert 'Terminal=true' in menu_entry.read_text(encoding='utf-8')
            assert str(launcher) in menu_entry.read_text(encoding='utf-8')
        if system != 'Windows':
            assert os.access(launcher, os.X_OK)
        result = invoke(launcher, '--verify', env=env)
        assert 'browser verification passed' in result

        # Reinstall the same version without rewriting its application files.
        version = (app / 'current').read_text(encoding='ascii').strip()
        runtime = app / version / ('node.exe' if system == 'Windows' else 'node')
        before = runtime.stat().st_mtime_ns
        invoke(installer, '--non-interactive', env=env)
        assert runtime.stat().st_mtime_ns == before

        # Emulate a previous version already selected by the stable launcher.
        previous = '1.0.9'
        (app / version).rename(app / previous)
        (app / 'current').write_text(previous + '\n', encoding='ascii')
        invoke(installer, '--non-interactive', env=env)
        assert (app / 'current').read_text(encoding='ascii').strip() == version
        assert (app / previous / '.quiz-capture').is_file()
        assert not (app / '.install-lock').exists()
        assert 'browser verification passed' in invoke(launcher, '--verify', env=env)


if __name__ == '__main__':
    smoke_test()
