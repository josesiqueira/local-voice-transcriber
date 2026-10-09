# Local Voice Transcriber

Transcribe WhatsApp Web voice notes on your own Linux computer. The audio is transcribed locally with Whisper large-v3-turbo and is never sent over the network.

Documentation: https://josesiqueira.github.io/local-voice-transcriber/

## How it works

Local Voice Transcriber is a Google Chrome extension plus a small Python program that runs on your computer. The extension adds a **T** button under each voice note in WhatsApp Web. When you click it:

1. The extension gets the note's audio from the page. Usually it presses the note's own play button with the sound muted, captures the audio, then pauses and rewinds the note.
2. Chrome passes the audio to the local program through [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), over standard input and output. No network port is opened.
3. The program transcribes it with [faster-whisper](https://github.com/SYSTRAN/faster-whisper) on your NVIDIA GPU, or on the CPU if there is no usable GPU, returns the text and exits.
4. The text appears under the note with the detected language and a Copy link, and is cached in Chrome so a reload shows it again.

The local program runs only while it transcribes a note. There is no server, no background service and no Docker container.

## Privacy

- The extension requests two permissions: `nativeMessaging` and `storage`. It runs only on `https://web.whatsapp.com/*` and makes no network requests, including from its popup.
- The local program runs with Hugging Face offline mode on (`HF_HUB_OFFLINE=1`) and loads the model from disk only.
- The local program also blocks its own network access through the Linux kernel. When it starts, before it loads faster-whisper or any other third-party library and before it reads the audio, it installs a seccomp filter, so the kernel refuses it every network socket for the rest of its run. If the filter cannot be installed, nothing is transcribed.
- The network is used only when you install or update: `git` for the code, and `install.sh` for Python packages from PyPI, Python 3.12 if `uv` has to download it, and the model (about 1.6 GB) from Hugging Face, pinned to a fixed revision. Transcription does not use the network.
- No telemetry, analytics, crash reports or update checks. One dependency, onnxruntime (it runs the speech filter), contains Microsoft usage telemetry; the launcher turns it off with `ORT_DISABLE_TELEMETRY=1`.
- Transcripts and the language choice are stored in Chrome's local extension storage on your computer, unencrypted, and are deleted when you remove the extension. The program's log holds timings and character counts, not transcript text.

The documentation explains how to [verify these claims yourself](https://josesiqueira.github.io/local-voice-transcriber/privacy/verify/) and what this tool does [not protect against](https://josesiqueira.github.io/local-voice-transcriber/privacy/limits/).

## Requirements

- Linux (x86_64) with Google Chrome installed from Google's .deb or .rpm package. Flatpak and Snap builds are not supported.
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- About 4.5 GB of free disk space (Python environment and model)
- Optional: an NVIDIA GPU with its driver installed. The CUDA libraries come from Python packages, so no CUDA toolkit is needed. Without a GPU the program runs on the CPU, several times slower.

macOS, Windows and Firefox are not supported.

## Install

Read `install.sh` before running it. It does not use `sudo` and writes only inside the repository folder and your home directory.

```bash
git clone https://github.com/josesiqueira/local-voice-transcriber.git
cd local-voice-transcriber
./install.sh
```

The script sets up the Python environment in `host/.venv`, downloads the model, registers the program with Chrome in `~/.config/google-chrome/NativeMessagingHosts/`, and runs a self-check.

Then load the extension:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `extension` folder of the repository.
3. Check that the extension ID is `aclgfofogdialjfpeplknjloiemchjcf`.

Open WhatsApp Web, open a chat with a voice note and click **T**.

### Languages

By default the language of each note is detected among all 100 languages Whisper supports. To limit detection to the languages you receive, which avoids mix-ups between similar languages, click the extension's icon in Chrome's toolbar. An unpacked extension starts in the Extensions menu (the puzzle piece button), where you can pin it.

In the popup, choose **Only these languages** and check the languages in the list. The choice is saved at once and applies to the next transcription; notes already transcribed keep their text. If two checked languages are equally likely, the one checked first wins.

Check only languages you actually receive. A note in a language you did not check is forced into one of your languages, and the text will be wrong or read like a poor translation. Choose **Any language** to remove the limit.

The choice is stored in the extension's local storage in Chrome and is removed with the extension.

## Update

```bash
git pull
./install.sh
```

Then click the reload icon on the extension card in `chrome://extensions` and reload the WhatsApp Web tab.

## Uninstall

```bash
./uninstall.sh                  # keeps the model
./uninstall.sh --remove-model   # also deletes the model
```

With `--remove-model` the script deletes the model through the Hugging Face cache manager, which also removes the model file from the shared `~/.cache/huggingface/hub/blobs/` folder that recent Hugging Face versions use.

Then remove the extension in `chrome://extensions`. This also deletes its cached transcripts and the language choice.

## Troubleshooting

| Message | Fix |
|---|---|
| Local transcriber not installed. Run install.sh | Run `./install.sh`. If the repository folder was moved, run it again from the new location. |
| Transcriber connection lost. Retry | Reload the WhatsApp Web tab, which is needed after the extension is reloaded or updated. |
| Could not block network access, so nothing was transcribed. See host.log | The kernel refused the network block, for example a kernel without seccomp or a system that is not x86_64. Read `host.log`. This tool supports Linux on x86_64 only. |
| No **T** button appears | WhatsApp Web may have changed its page. See [Troubleshooting](https://josesiqueira.github.io/local-voice-transcriber/guides/troubleshooting/). |

The program's log is in `~/.local/state/local-voice-transcriber/host.log`. All messages and fixes are listed in the [documentation](https://josesiqueira.github.io/local-voice-transcriber/guides/troubleshooting/).

## Known limits

- To capture a note, the extension usually presses the note's own play button with the sound muted, then pauses and rewinds it. WhatsApp may then show the sender that the note was played.
- If WhatsApp Web plays a note through Web Audio instead of an audio element, the extension cannot mute it, and you may hear the note.
- WhatsApp Web changes can break the extension until it is updated. Unpacked extensions do not update automatically.
- Chrome's documentation says it can stop an extension's service worker when a single event or API call takes longer than 5 minutes. It does not say whether this applies to native messaging, and the extension sets no time limit of its own. Very long notes, especially in CPU mode, may fail this way.

## WhatsApp's terms

Local Voice Transcriber reads voice notes in your own account, one note per click. It never sends, forwards or automates messages and does not export chats. Still, WhatsApp's Terms of Service restrict modifying or altering its service. Using any browser extension on WhatsApp Web may conflict with those terms, and WhatsApp may restrict accounts it believes break them. You install and use this tool at your own risk.

## Development

```bash
cd host && uv sync && cd ..
host/.venv/bin/python -m pytest   # host tests (slow tests that load the real model or run the install scripts are skipped)
npm ci && npx playwright install chromium
npx playwright test               # extension tests against a mock WhatsApp Web page
```

The documentation site lives in `site/` (Astro and Starlight).

## Security

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/josesiqueira/local-voice-transcriber/security/advisories/new), not in public issues.

## License

[GNU Affero General Public License, version 3 only (AGPL-3.0-only)](LICENSE).

Local Voice Transcriber is an independent open source project. It is not affiliated with, endorsed by or sponsored by WhatsApp LLC or Meta Platforms, Inc. WhatsApp is a trademark of WhatsApp LLC, used here only to describe compatibility.
