# Contributing to emdy.md

Thanks for helping out.

## Developer setup

Setup, checks, and tests are covered in the [README](README.md#%EF%B8%8F-development).

## Ground rules

- **Everything stays on the device.** No network requests after load: no analytics, telemetry, remote fonts, or CDNs. A change that sends anything off the device will not be merged.
- **Match what's there.** Reuse existing components, theme tokens, and registries rather than adding new patterns. The conventions are in [AGENTS.md](AGENTS.md): [visual direction](AGENTS.md#visual-direction), [keyboard shortcuts](AGENTS.md#keyboard-shortcuts), [persistence](AGENTS.md#persistence-and-settings), and [testing](AGENTS.md#testing-requirements).

## Most likely to be accepted

- Small, focused bug fixes.
- Performance and reliability improvements.
- Accessibility and keyboard fixes.
- Browser and platform compatibility fixes, including native fonts missing from a font stack.

## Least likely to be accepted

- Anything that makes a network request or needs a server.
- New dependencies with a noticeable bundle cost.
- Font files, hard-coded colours, or new visual patterns.
- Rewrites, large pull requests, and features that were not discussed first.

## Discuss first

For anything beyond a small fix, open a [feature request](https://github.com/imabdulazeez/emdy.md/issues/new?template=feature_request.yml) before writing code. It saves you building something that does not fit.

## Reporting bugs

- Search existing issues first.
- Use the [bug report form](https://github.com/imabdulazeez/emdy.md/issues/new?template=bug_report.yml) and include your browser, OS, and steps to reproduce.
- Share a minimal Markdown sample, never your real documents or a library export.
- Report security or privacy problems privately, as described in the [security policy](.github/SECURITY.md).

## Opening a pull request

- Branch from `main` and keep each pull request to one change. Do not mix unrelated fixes.
- Explain what changed and why, and link the issue it closes.
- Add or update tests in the same change.
- Make sure `vp check` and `vp test` pass. If you touch layout, scrolling, focus, routing, or storage, run the browser suite too.
- For visual changes, include before and after screenshots in light and dark mode. For motion or interaction changes, include a short video.
- Use short, lowercase, imperative commit messages, such as `add github source link to settings about section`. A `fix:` or `feat:` prefix is optional.
- AI-assisted changes are welcome. You are responsible for them, and AGENTS.md applies.

## Be realistic

Opening a pull request does not guarantee it will be merged. It may be closed, sent back to be made smaller, or reworked by the maintainer.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
