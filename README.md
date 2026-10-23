# Terra Calendar

**[Download](https://github.com/AntonRylin/terra-calendar/releases/latest)** · **[Website](https://antonrylin.github.io/terra-calendar/)** · **[Discord](https://discord.com/invite/kfTbsN7eF7)**

A minimalistic calendar for desktop (and later mobile). It ships in two editions
from this one codebase:

- **Local edition (free, open source).** Local-first: your events live in a JSON
  file on your machine (or `localStorage` in the browser) — no account, no
  server, fully offline. This is the default and needs zero configuration.
- **Cloud edition (paid, hosted).** The same app backed by Supabase, with sign-in
  and cross-device sync. Activated at runtime for signed-in users with an active Cloud subscription; see
  [`supabase/README.md`](./supabase/README.md). Hosting and the database aren't
  free, so the hosted service is paid — but the code stays open and anyone can
  self-host it.

Same UI, same domain logic, swappable storage: the cloud edition is just another
`EventRepository` implementation selected by config.

## Development

```bash
npm install
npm run dev        # web app in the browser (localStorage adapter)
npm test           # unit + component tests (Vitest)
npm run build      # type-check + production web build
npx tauri dev      # desktop app (requires Rust — see below)
npx tauri build    # production desktop build + installer
```

### Google Calendar sync (optional, desktop)

The desktop app can sync with a user's own Google Calendar over CalDAV. It's
off unless you supply an OAuth client ID:

1. In the [Google Cloud Console](https://console.cloud.google.com/), enable the
   **Google Calendar API**, then create an **OAuth client ID** of type
   **Desktop app**.
2. Copy `.env.example` to `.env.local` and set
   `VITE_GOOGLE_CLIENT_ID=<your-id>.apps.googleusercontent.com`.
3. Run the desktop app (`npx tauri dev`) and choose **Connect Google Calendar**
   in Settings.

The flow uses OAuth 2.0 with PKCE and a loopback redirect (no client secret), so
the client ID is safe to ship. The refresh token is stored in the OS keychain;
access tokens are refreshed automatically. Browser sessions can't reach CalDAV
(CORS), so this is desktop-only — the same constraint as the iCloud connector.

> **Shipping to the public?** Bake the client ID into the build and get the
> Google consent screen verified — see [`docs/RELEASING.md`](./docs/RELEASING.md).

### Connecting several calendars at once

Apple and Google can be connected **at the same time**. In Settings, each
account lists its calendars with two toggles:

- the checkbox controls whether events are **read/shown** from that calendar;
- the **Default** toggle marks it as a write target for new events.

Mark one or more calendars (across either account) as Default and new events are
written to all of them — e.g. mirror everything to Apple *Main* and Google
*Main*. The event editor has a per-event calendar picker (multi-select) that
starts from your defaults, so individual events can override where they live. The
same event can be synced to several calendars; it shows up once in the app.

### Desktop prerequisites (Rust)

The desktop shell uses [Tauri 2](https://tauri.app), which needs a Rust
toolchain ([rustup](https://rustup.rs)).

- **MSVC target (recommended):** install the Visual Studio C++ Build Tools
  *with the Windows 10/11 SDK*, then `rustup default stable-msvc`.
- **GNU target (no Visual Studio / SDK required) — what this project is set up
  against:**
  1. `rustup toolchain install stable-x86_64-pc-windows-gnu` then
     `rustup default stable-x86_64-pc-windows-gnu`.
  2. Install a mingw-w64 toolchain that provides `gcc`/`dlltool`, e.g. WinLibs:
     `winget install BrechtSanders.WinLibs.POSIX.MSVCRT`.
  3. Put two directories on `PATH` so gcc can find `dlltool` and the `ld.lld`
     linker — without the second one the Rust build fails to link (see
     Troubleshooting below):
     - the WinLibs `...\mingw64\bin` (the WinLibs installer adds this for you)
     - `<rustup>\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\gcc-ld`

     Add the `gcc-ld` directory yourself — once, permanently, in PowerShell:

     ```powershell
     $lld = "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\gcc-ld"
     [Environment]::SetEnvironmentVariable("Path", "$lld;" + [Environment]::GetEnvironmentVariable("Path","User"), "User")
     ```

     Open a fresh terminal afterwards and verify both tools resolve:

     ```powershell
     gcc --version      # WinLibs gcc
     where.exe ld.lld   # ...\gcc-ld\ld.lld.exe
     ```

  `src-tauri/.cargo/config.toml` already forces the LLD linker for this target
  (the default BFD `ld` hits an "export ordinal too large" bug with the Tauri
  dependency graph). The Rust library is built as a plain `lib` (not `cdylib`)
  for the same reason — a Windows-GNU cdylib overflows the PE 64K export limit;
  re-add `cdylib`/`staticlib` to `src-tauri/Cargo.toml` only when adding mobile
  targets.

  **Troubleshooting.** If `npx tauri dev`/`build` fails with
  `collect2.exe: fatal error: cannot find 'ld'` — often first hit while
  compiling `cookie` or `tokio-macros` — the `gcc-ld` directory from step 3 is
  not on `PATH`: gcc was told to link with `-fuse-ld=lld` but can't find
  `ld.lld.exe`. Add it as shown above and reopen the terminal. (Builds can
  appear to work for a long time and only fail once a dependency forces fresh
  native linking, e.g. after adding an HTTP/network crate.)

## Architecture

- `src/core/` — pure domain logic, zero React: event types, time parser,
  recurrence/occurrence expander, date helpers (fully unit-tested)
- `src/data/` — storage behind the `EventRepository` interface:
  `LocalStorageRepository` (browser dev), `JsonFileRepository` (Tauri desktop),
  and `SupabaseRepository` (cloud edition), selected by `createRepository`.
  `src/data/caldav/` adds an Apple iCloud connector (CalDAV + Basic auth) and
  `src/data/google/` a Google Calendar connector (the same CalDAV engine over
  OAuth 2.0). `MultiCalendarRepository` syncs one account whose events can each
  live in several calendars; `CompositeRepository` aggregates **multiple
  accounts** (Apple + Google together) behind the single repository the app
  uses — reading from every enabled calendar and routing writes. Desktop-only,
  chosen at runtime in Settings
- `src/auth/` — Supabase session store + optional inline sign-in, active when
  Supabase is configured (accounts are optional; Cloud sync is entitlement-driven)
- `src/features/` — self-contained UI modules: `month-grid`, `upcoming-stack`,
  `year-circle`, `quick-entry`, `event-editor`
- `src/app/` — layout shell (data-driven panel registry) and Zustand stores
- `src/ui/` — design tokens and shared primitives (popover, toast)
- `src-tauri/` — thin Rust shell (no app logic)

Events are stored as `{ "version": 1, "events": [...] }`. Dates and times are
local wall-clock values (no UTC conversion) by design.

See `docs/superpowers/specs/` for the design spec and
`docs/superpowers/plans/` for the implementation plan.

## License

[GNU AGPL-3.0](./LICENSE). You're free to use, modify, and self-host the app,
including the cloud edition. The one obligation that matters here: if you run a
**modified** version as a network service, you must make your modified source
available to its users. This keeps the project genuinely open while discouraging
a closed-source competing host — the paid hosted service is a convenience you
operate, not a code advantage you hide.

## Community

Questions, ideas or bugs? Open an [issue](https://github.com/AntonRylin/terra-calendar/issues) or join the [Discord](https://discord.com/invite/kfTbsN7eF7). Pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).
