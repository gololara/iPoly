# iPoly

A private, installable web app for your language-learning memory. Capture a note, photo, or short audio clip in the moment. Revisit it later, add what you learned, and keep the original and its history. Each installation starts with an empty language list. Choose the languages you study and use the globe in the header to switch the interface between Español and English.

Teachers are grouped by study language. Record what a teacher explained as a contribution to the relevant memory. The app stores your records and files. A compatible chat client can use its MCP tools to help you review material and propose additions for your approval.

## Install

| Where | Guide |
| --- | --- |
| OpenAI Sites | [Set up a private Site and connect ChatGPT](docs/install-sites.md) |
| Cloudflare Workers | [Deploy a private, single-user instance with your own storage](docs/install-cloudflare.md) |
| Your computer | [Run and test locally](LOCAL-DEVELOPMENT.md) |

Open the app over HTTPS and use your browser's install or **Add to Home Screen** option where available. Your records live in your installation. The app does not include an LLM or require an LLM API key.

## Updates

On GitHub, choose **Watch → Custom → Releases** to receive release notifications. An upgrade uses the existing installation and its storage. Review the release notes, back up your database and attachments, then deploy the new code and apply pending migrations. The installation guides explain the order for each host.

See [contributing](CONTRIBUTING.md) for proposing and reviewing changes, and [local development](LOCAL-DEVELOPMENT.md) for running the checks. Please use synthetic notes, images, and audio in issues and pull requests.

Licensed under [MIT](LICENSE). Bundled third-party components retain their own notices.
