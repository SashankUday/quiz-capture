# Socrative and Mentimeter Quiz Capture for macOS

## Download for macOS

[Download Quiz-Capture-macOS.zip](https://github.com/SashankUday/quiz-capture/releases/latest/download/Quiz-Capture-macOS.zip). This is the installer bundle with Playwright included. The release page also lists the ZIP under **Assets**. [GitHub releases](https://github.com/SashankUday/quiz-capture/releases/latest)

## Install

1. Double-click the ZIP to unzip it and open the **Socrative and Mentimeter Quiz Capture** folder.
2. Double-click **Install Quiz Capture.command**. Wait for **Installed**.
3. Double-click **Start Socrative and Mentimeter Quiz Capture.command** on your Desktop whenever you want to capture a quiz.

The installer runs for your macOS account and needs no administrator password. Playwright is included. The installer uses Node.js 20 or newer if available and otherwise downloads an official Node.js runtime for this app. It uses Google Chrome if installed in Applications, or downloads Chromium if needed. Downloads require internet access.

If macOS blocks the installer because it can’t verify the developer and you trust the ZIP from this repository, try opening the installer in Finder, then go to **System Settings → Privacy & Security → Open Anyway** and confirm. [Apple’s instructions](https://support.apple.com/en-us/102445)

## Update or reinstall

Close Quiz Capture, download and unzip the latest release, and run its installer. Releases v1.0.0 and v1.0.1 use the same installed app files, so an existing installation of either release is ready to use. If you need to reinstall those files, use **Finder → Go → Go to Folder** to open `~/Library/Application Support/Socrative and Mentimeter Quiz Capture`, move the `1.0.0` folder aside, then rerun the installer. Your screenshots are stored separately in **Desktop → Quiz Screenshots**.

## Capture a quiz

Choose Socrative or Mentimeter in Terminal, then enter an optional quiz folder name. Join your Socrative room or enter your Mentimeter code in the browser that opens. To use a Mentimeter participation link, paste it into that browser’s address bar. Socrative captures visible question changes and uses the displayed question number. Mentimeter captures visible titled slides as their content changes and names the PNGs in capture order. Terminal shows the full output path when the first screenshot is saved. Close the browser window to stop.

Find the files in **Desktop → Quiz Screenshots**. Each run gets its own timestamped folder. If you provided a name, the run folder is inside that named folder.

## Install with a terminal or an agent

Give your agent the complete ZIP and ask it to install Socrative and Mentimeter Quiz Capture on your Mac. The installer is a readable shell script. From the extracted **Socrative and Mentimeter Quiz Capture** directory, run:

```sh
/bin/zsh "./Install Quiz Capture.command"
```

Use the recipient's regular macOS account. For an automated installation, run the same command with standard input disconnected so any failure returns an exit code. On success, verify that the Desktop launcher exists and is executable:

```sh
test -x "$HOME/Desktop/Start Socrative and Mentimeter Quiz Capture.command"
```

The installer stores app files in `~/Library/Application Support/Socrative and Mentimeter Quiz Capture/1.0.0`. The recipient can then open the Desktop launcher and join their own quiz.

## Run from source

For a Git clone or GitHub source archive, use the commands below. The double-click installer requires the bundled dependencies from the release ZIP.

From the repository root, run the following with Node.js 20 or newer. Quiz Capture uses Google Chrome or a Playwright-managed Chromium browser.

```sh
cd "Resources/Quiz Capture"
npm ci
npm test
# If Google Chrome is unavailable, run: npx playwright install chromium --no-shell
node capture.mjs
```

The release ZIP bundles Playwright for the installer.
