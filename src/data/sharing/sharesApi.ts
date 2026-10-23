import type { CalendarEvent, DayOverride, Recurrence } from '../../core/types';
import { getSupabase } from '../supabaseClient';
import type { Share, ShareDetail, ShareRole, ShareScopeMode } from './types';

/** A row in `public.shares`. */
interface ShareRow {
  id: string;
  name: string;
  scope_mode: ShareScopeMode;
  categories: string[] | null;
  detail: ShareDetail;
  role: ShareRole;
  token: string;
  created_at: string;
  share_members?: { count: number }[];
}

function fromRow(r: ShareRow): Share {
  return {
    id: r.id,
    name: r.name,
    scopeMode: r.scope_mode,
    categories: r.categories ?? [],
    detail: r.detail,
    role: r.role,
    token: r.token,
    createdAt: r.created_at,
    memberCount: r.share_members?.[0]?.count ?? 0,
  };
}

/** Every share the signed-in user OWNS, newest first, with member counts. */
export async function listOwnedShares(): Promise<Share[]> {
  const { data, error } = await getSupabase()
    .from('shares')
    .select('*, share_members(count)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Couldn't load your shares: ${error.message}`);
  return ((data ?? []) as ShareRow[]).map(fromRow);
}

export async function createShare(input: {
  name: string;
  scopeMode: ShareScopeMode;
  categories: string[];
  detail: ShareDetail;
  role: ShareRole;
}): Promise<Share> {
  const { data, error } = await getSupabase()
    .from('shares')
    .insert({
      name: input.name,
      scope_mode: input.scopeMode,
      categories: input.categories,
      detail: input.detail,
      role: input.role,
    })
    .select('*')
    .single();
  // RLS rejects the insert without an active subscription; say why rather than
  // surfacing a Postgres policy error.
  if (error) {
    throw new Error(
      error.code === '42501'
        ? 'Sharing needs an active Cloud subscription.'
        : `Couldn't create the share: ${error.message}`,
    );
  }
  return fromRow(data as ShareRow);
}

export async function updateShare(
  id: string,
  patch: Partial<Pick<Share, 'name' | 'scopeMode' | 'categories' | 'detail' | 'role'>>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.scopeMode !== undefined) row.scope_mode = patch.scopeMode;
  if (patch.categories !== undefined) row.categories = patch.categories;
  if (patch.detail !== undefined) row.detail = patch.detail;
  if (patch.role !== undefined) row.role = patch.role;
  const { error } = await getSupabase().from('shares').update(row).eq('id', id);
  if (error) throw new Error(`Couldn't update the share: ${error.message}`);
}

/** Revoke a share. Everyone who joined loses access immediately (the members
 *  rows cascade), and the link stops working. */
export async function deleteShare(id: string): Promise<void> {
  const { error } = await getSupabase().from('shares').delete().eq('id', id);
  if (error) throw new Error(`Couldn't revoke the share: ${error.message}`);
}

/** Remove one person from a share, leaving the share itself intact. */
export async function removeShareMember(shareId: string, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('share_members')
    .delete()
    .eq('share_id', shareId)
    .eq('user_id', userId);
  if (error) throw new Error(`Couldn't remove that person: ${error.message}`);
}

/** Stop receiving a share someone granted to this user. */
export async function leaveShare(shareId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('share_members')
    .delete()
    .eq('share_id', shareId)
    .eq('user_id', user.id);
  if (error) throw new Error(`Couldn't leave the share: ${error.message}`);
}

/** Redeem an invite token. Returns the share id joined. */
export async function joinShare(token: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('join_share', { p_token: token });
  if (error) throw new Error(error.message);
  return data as string;
}

/** A row from the `shared_events()` function — someone else's event. */
interface SharedEventRow {
  id: string;
  share_id: string;
  owner_id: string;
  owner_name: string | null;
  role: ShareRole;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  type: string | null;
  time: string | null;
  end_time: string | null;
  tz: string | null;
  recurrence: Recurrence | null;
  exdates: string[] | null;
  day_overrides: Record<string, DayOverride> | null;
  color: string | null;
  cosmetic: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Events other people share with this user.
 *
 * Deliberately NOT part of the sync engine: these are read through their own
 * RPC into their own store and merged at the render layer. Letting them into
 * `UnifiedRepository` would write them to the local file and push them into the
 * user's connected iCloud/Google accounts. See migration 0014.
 */
export async function fetchSharedEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await getSupabase().rpc('shared_events');
  if (error) throw new Error(`Couldn't load shared calendars: ${error.message}`);
  return ((data ?? []) as SharedEventRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    endDate: r.end_date ?? undefined,
    type: r.type ?? undefined,
    time: r.time ?? undefined,
    endTime: r.end_time ?? undefined,
    tz: r.tz ?? undefined,
    description: r.description ?? undefined,
    recurrence: r.recurrence ?? null,
    exdates: r.exdates ?? undefined,
    dayOverrides: r.day_overrides ?? undefined,
    color: r.color ?? undefined,
    cosmetic: r.cosmetic ?? undefined,
    sharedBy: r.owner_name ?? 'Someone',
    shareId: r.share_id,
    shareAccess: r.role === 'editor' ? 'edit' : 'view',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** The fields an editor may change on someone else's event (see migration 0014). */
export interface SharedEventPatch {
  title?: string;
  description?: string;
  date?: string;
  endDate?: string;
  time?: string;
  endTime?: string;
  tz?: string;
}

/** Write an edit back to the owner's calendar. Only allowed on shares whose
 *  role is `editor`; the server re-checks and refuses otherwise. */
export async function updateSharedEvent(id: string, patch: SharedEventPatch): Promise<void> {
  const row: Record<string, string> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.endDate !== undefined) row.end_date = patch.endDate;
  if (patch.time !== undefined) row.time = patch.time;
  if (patch.endTime !== undefined) row.end_time = patch.endTime;
  if (patch.tz !== undefined) row.tz = patch.tz;
  const { error } = await getSupabase().rpc('update_shared_event', {
    p_event: id,
    p_patch: row,
  });
  if (error) throw new Error(error.message);
}
