# Arena Universal Markdown Export

[中文说明](README.md) · [MIT License](LICENSE) · **v2.6.0**

A Tampermonkey userscript that exports Arena Direct and Battle conversations to Markdown and provides a reversible winner-only reading layout.

**[Install userscript](https://raw.githubusercontent.com/atmago/arena-universal-export/main/arena-universal-export.user.js)** · [Releases](https://github.com/atmago/arena-universal-export/releases)

## Features

- Export Direct conversations in API message order, including model metadata when available.
- Select A, B, or both answers for each Battle round before downloading Markdown.
- Detect winner highlights and expand the selected answer while reducing nested scrolling.
- Use a collapsible menu for automatic detection, left only, right only, both sides, or restoring all rounds.
- Remember manual layout preferences locally for up to 100 conversations.

Reading layout choices and export choices are independent. Layout controls do not submit votes or modify the original conversation.

## Installation and use

1. Install and enable Tampermonkey and allow userscripts on the target site.
2. Disable previous copies of this script.
3. Open the installation link above and confirm in Tampermonkey, or paste the complete `.user.js` file into a new script.
4. Refresh Arena and open a saved `/c/<id>` or `/chat/<id>` conversation while signed in.
5. Click **导出对话** at the bottom right. For Battle exports, select an answer for every round first.

The **胜者视图** menu appears near the right edge. Manual side selection applies to the last detected round. **全部恢复** restores both sides for all detected rounds. Click outside the menu or press Esc to collapse it.

The script matches `arena.ai`, `lmarena.ai`, and `canaryarena.ai`. Actual compatibility depends on each site's current API and layout.

## Privacy and limitations

The script uses `@grant none` and has no remote runtime dependencies or analytics. Export requests go to the current site's `/api/evaluation/<id>`, with `/nextjs-api/evaluation/<id>` as a fallback, using the existing signed-in session. Markdown is generated and downloaded in the browser; the script contains no third-party conversation upload logic.

Manual preferences are stored under `arena-winner-manual-v24` in the site's `localStorage`, which is accessible to other scripts on that origin. Exports include conversation text, source URL, and available model metadata. Review files before sharing them. Your userscript manager may contact this repository for updates through the script's metadata URLs.

This is an independent community project, unaffiliated with Arena. API or DOM changes may break export or winner detection. Use manual controls if automatic detection is incorrect. Exports primarily preserve text and do not download image, audio, or video attachments. Signed-in live Arena testing was not performed as part of this repository preparation.

For bug reports, include the script version, browser, userscript manager, target domain, and sanitized errors. Never include cookies, tokens, or private conversations.

## Development

No build step or npm dependencies. With Node.js 22 or newer:

```sh
node --check arena-universal-export.user.js
node --test
```

Tests cover script loading, conversation detection, message schemas, Battle grouping, Markdown generation, and API fallback. Simulated checks do not replace live-site verification. Update the metadata version and `CHANGELOG.md` when releasing functionality changes.

## Contributors

- **[ChatGPT](https://chatgpt.com/) (OpenAI)**: script development; repository preparation, documentation, and basic tests through Codex.
- **[atmago](https://github.com/atmago)**: project requirements, maintenance, and open-source publication.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for attribution details.

Licensed under the [MIT License](LICENSE). Issues and pull requests are welcome.
