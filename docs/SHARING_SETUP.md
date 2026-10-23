# Calendar sharing — setup

Everything in the app is built and committed. This is the part only you can do:
bring the database up to date, set one environment variable, and check it works.

Design and rationale live in
[`docs/superpowers/specs/2026-08-14-calendar-sharing-design.md`](superpowers/specs/2026-08-14-calendar-sharing-design.md).

---

## 1. Bring the project up to date first

**If your project predates the entitlement gating (migration 0009), 0014 will
fail** with `function public.has_cloud_access() does not exist`. Sharing gates
share *creation* on the Cloud subscription using that helper.

Check before you start:

```sql
select
  to_regprocedure('public.has_cloud_access()') is not null as has_0009,
  to_regclass('public.user_habit_entries')     is not null as has_0011;
```

If either says `false`, run **`supabase/full_setup.sql`** first — paste the whole
file into the SQL Editor and run it. It is idempotent, safe on an existing
project, and is the consolidated equivalent of every migration including this
one. **If you run `full_setup.sql`, sharing is already installed and you can skip
step 2.**

## 2. Run the sharing migration

Only needed if your project was already current (both checks above `true`).

**File:** `supabase/migrations/0014_calendar_sharing.sql`

Open your Supabase project → **SQL Editor** → **New query** → paste the whole
file → **Run**. Or, if you use the CLI:

```bash
supabase db push
```

It creates two tables (`shares`, `share_members`), adds two columns to `events`
(`share_include`, `share_exclude`), and creates four functions. It is safe to
re-run: every statement is `if not exists` or `create or replace`. It fails fast
with a readable message if the 0009 helper is missing.

### Check it landed

Run this in the SQL editor. All five rows should say `true`:

```sql
select 'shares table'      as thing, to_regclass('public.shares')        is not null as ok
union all select 'members table', to_regclass('public.share_members')    is not null
union all select 'event columns', (select count(*) = 2 from information_schema.columns
                                   where table_name = 'events'
                                     and column_name in ('share_include','share_exclude'))
union all select 'read function', to_regproc('public.shared_events')     is not null
union all select 'join function', to_regproc('public.join_share')        is not null;
```

### Confirm the important safety property

Sharing must **not** have widened who can read the `events` table directly. This
should return exactly the four original ownership policies and nothing mentioning
shares:

```sql
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'events';
```

If a policy here ever references `shares` or `share_members`, stop — that would
let other people's events into the sync engine, which writes them to the local
file and pushes them into the user's connected iCloud/Google accounts.

---

## 3. Set the web app URL

Share links have to point at the **web** build, because that is the only one a
recipient can open from a phone or a link in a message.

Add to your production `.env` (and to your hosting provider's env vars):

```
VITE_WEB_APP_URL=https://yourdomain.com/app
```

Without it the app falls back to whatever origin it is currently running on,
which is fine for local testing but produces `localhost` links in a real build.

Links look like:

```
https://yourdomain.com/app/?share=<48-char-token>
```

---

## 4. Test it end to end

You need two accounts. The second one does **not** need a subscription — that is
the point.

1. Sign in as the **owner**, with Cloud active.
2. **Settings → Sharing → New share**. Name it "Family", **Create**.
3. Set *Include* to **Everything**, *They can* to **Change events too**.
4. **Copy link**.
5. Open the link in a private window, sign in as the **second account** (no
   subscription). You should see a toast: *"Shared calendar added"*.
6. The owner's events appear on the second account's calendar.
7. From the second account, open one and change its time. Save.
8. Back on the owner's account, focus the window — the new time is there.

Then check the narrower modes:

- Set *Include* to **Only some categories** and tick one. Only events in that
  category should remain visible to the second account.
- Open any event on the owner's calendar. Under **Shared with**, untick "Family".
  It disappears for the second account, even though the category is shared.
- Set *They see* to **Only that you're busy**. Titles become "Busy" and
  descriptions vanish — verify in the second account, not just in the UI.

---

## What is free and what is paid

| | Needs Cloud? |
|---|---|
| Receiving a calendar someone shares with you | **No** — only a free account |
| Editing an event someone shared with you (when they granted it) | **No** |
| Receiving a Google/Apple shared calendar via the desktop app | **No account at all** |
| Creating a share | **Yes** |

This is enforced server-side: the insert policy on `shares` requires
`profiles.cloud_active`. Reading, joining, and leaving never check it, so a
lapsed subscriber keeps access to their data and the people they shared with
keep theirs until the share is revoked.

Members are capped at **10 per share** (in `join_share`) so a share cannot be
repurposed as free storage for an unbounded crowd of accounts.

---

## Things worth knowing

**Revoking is immediate and final.** Deleting a share cascades its members away
and the link stops working. There is no undo — you would issue a new link.

**Renaming a category updates the shares that scope to it.** Categories are bare
strings, so the app rewrites any share listing the old name at rename time
(`shareStore.renameCategory`). If that write fails — offline, say — the share
keeps the old name and silently stops matching. Worth re-checking a
category-scoped share after renaming a category while offline.

**Editors cannot delete.** They can reschedule and retitle; deleting someone
else's event stays with its owner. The server enforces this — the editor RPC
only issues `UPDATE`.

**"Busy" shares are read-only in practice.** The editor RPC refuses events from
a `busy` share, since you should not be able to change what you cannot read. The
UI says so when you pick that combination.

**Tasks are never shared.** Dateless tasks are filtered out server-side in
`shared_events()`.

---

## If something goes wrong

**"Sharing needs an active Cloud subscription"** when creating a share — the
`profiles.cloud_active` flag is false for that user. Only the Stripe webhook
writes it; check `select cloud_active from profiles where user_id = '...'`.

**"This share link is not valid or has been revoked"** — the token does not match
any row. Either the share was deleted, or the link got truncated (the token is 48
hex characters).

**The recipient sees nothing** — check in order: did `join_share` insert a row
(`select * from share_members`)? Does the share's scope actually match any events
(`scope_mode`, `categories`)? Is the event a task (those are excluded)?

**Shared events showing up in the owner's iCloud/Google** — this should be
impossible; it would mean the `events` SELECT policy was widened. Re-run the
policy check in step 2.
