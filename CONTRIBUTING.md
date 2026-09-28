# Contributing to emdy.md

Thanks for helping out. Setup, checks, and tests are covered in the [README](README.md#%EF%B8%8F-development); the project's conventions for design, storage, shortcuts, and testing are in [AGENTS.md](AGENTS.md).

## Ground rules

- **Everything stays on the device.** No network requests after load: no analytics, telemetry, remote fonts, or CDNs. A change that sends anything off the device will not be merged.
- **Match what's there.** Reuse existing components, theme tokens, and registries rather than adding new patterns.

## Issues

- Search existing issues first.
- For bugs, include your browser and OS and the steps to reproduce. Share a minimal Markdown sample, never your real documents or a library export.
- For large features, open an issue to discuss the idea before writing code.
- Report security or privacy problems privately through [GitHub security advisories](https://github.com/imabdulazeez/emdy.md/security/advisories/new), not in a public issue.

## Pull requests

- Branch from `main` and keep each pull request to one change.
- Add or update tests in the same change.
- Use short, lowercase, imperative commit messages, such as `add github source link to settings about section`.
- In the description, say what changed and why, link the issue it closes, list the tests you added, and include light and dark screenshots for visual changes.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
