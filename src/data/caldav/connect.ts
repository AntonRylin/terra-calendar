import { useCalendarStore } from '../../app/store';
import { createTauriTransport } from './tauriTransport';
import { CalDavClient, type CalendarInfo } from './caldavClient';
import type { CalDavConfig } from './types';

const ICLOUD_SERVER = 'https://caldav.icloud.com';

/**
 * Build a CalDAV client for an Apple iCloud account. If `config` lacks a
 * calendar list, discovery runs and every calendar is enabled by default.
 * Returns the client + resolved config (the caller assembles the repository).
 */
export async function buildAppleAccount(
  email: string,
  password: string,
  config?: CalDavConfig,
): Promise<{ client: CalDavClient; config: CalDavConfig; discovered: CalendarInfo[] }> {
  const transport = createTauriTransport('Basic ' + btoa(`${email}:${password}`));

  let discovered: CalendarInfo[] = [];
  let finalConfig: CalDavConfig;

  if (config && config.calendars && config.calendars.length > 0) {
    finalConfig = config;
  } else {
    const base = new CalDavClient(transport, { serverUrl: ICLOUD_SERVER, username: email });
    discovered = await base.discover();
    if (discovered.length === 0) throw new Error('No VEVENT calendars found for this account.');

    const calendars = discovered.map((c) => ({
      url: c.url,
      displayName: c.displayName,
      enabled: true,
      shared: c.shared || undefined,
      readOnly: c.readOnly || undefined,
    }));
    // The default write target must be a calendar the user OWNS — otherwise new
    // private events would be created on a family member's shared calendar.
    const ownWritable = calendars.filter((c) => !c.shared && !c.readOnly);
    const primaryUrl =
      ownWritable.find((c) => /\/home\/?$/.test(c.url))?.url ?? ownWritable[0]?.url;

    finalConfig = {
      serverUrl: ICLOUD_SERVER,
      username: email,
      calendarUrl: primaryUrl,
      calendars,
    };
  }

  return { client: new CalDavClient(transport, finalConfig), config: finalConfig, discovered };
}

/**
 * DEV helper — call from the app devtools console to connect iCloud and load
 * your events into the running UI:
 *
 *   const { connectCalDavDev } = await import('/src/data/caldav/connect.ts');
 *   await connectCalDavDev('me@icloud.com', 'app-specific-pw');
 */
export async function connectCalDavDev(
  email: string,
  password: string,
): Promise<{ available: string[]; loaded: number }> {
  const { client, config } = await buildAppleAccount(email, password);
  const { repositoryForAccount } = await import('../createRepository');
  const repository = await repositoryForAccount(client, `apple:${email}`, config);
  await useCalendarStore.getState().init(repository);
  return {
    available: config.calendars?.map((c) => c.displayName) ?? [],
    loaded: useCalendarStore.getState().events.length,
  };
}
