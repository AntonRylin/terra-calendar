# Contributing to Terra Calendar

Thanks for wanting to help. Terra Calendar is open source under the [AGPL-3.0 license](LICENSE): you can copy, fork and change it. If you run a changed version as a service for others, you must share your changes under the same license. Changes to this repository go through pull requests, and the maintainer reviews and merges each one.

## Before you start

- **Bugs:** open an [issue](https://github.com/AntonRylin/terra-calendar/issues) with the steps to reproduce it, what you expected and what happened.
- **Features or larger changes:** open an issue or ask on [Discord](https://discord.com/invite/kfTbsN7eF7) first, so you don't spend time on something that won't be merged.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Set up the project with `npm ci` and run it with `npm run dev` (browser) or `npx tauri dev` (desktop). See the [README](README.md) for details.
3. Keep the pull request focused on one change.
4. Run `npm test` and `npm run build` before you open the pull request.
5. Open the pull request and fill in the template.

## Review

Every pull request needs the maintainer's approval before it can be merged. Pull requests may be changed, asked to change, or declined to keep the app consistent. Automated checks on pull requests from outside contributors run only after the maintainer approves them.

By submitting a pull request you agree that your contribution is licensed under the AGPL-3.0 license.