import { describe, it, expect } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { effectiveIdentity, initials } from './identity';

function sessionWith(meta: Record<string, unknown>, email: string | null = 'me@example.com'): Session {
  return { user: { email, user_metadata: meta } } as unknown as Session;
}

describe('initials', () => {
  it('takes the first letter of two name tokens', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
  });
  it('falls back to the first two chars of a single token', () => {
    expect(initials('ada@example.com')).toBe('AD');
  });
  it('returns ? for empty or missing input', () => {
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
    expect(initials(undefined)).toBe('?');
  });
});

describe('effectiveIdentity', () => {
  const emptyProfile = { name: '', avatarDataUrl: null };

  it('prefers cloud metadata over the local profile and email', () => {
    const id = effectiveIdentity(
      sessionWith({ full_name: 'Cloud Name', avatar_url: 'data:image/webp;base64,CLOUD' }),
      { name: 'Local Name', avatarDataUrl: 'data:image/webp;base64,LOCAL' },
    );
    expect(id.name).toBe('Cloud Name');
    expect(id.avatarDataUrl).toBe('data:image/webp;base64,CLOUD');
    expect(id.email).toBe('me@example.com');
  });

  it('falls back to the local profile when metadata is empty', () => {
    const id = effectiveIdentity(sessionWith({}), {
      name: 'Local Name',
      avatarDataUrl: 'data:image/webp;base64,LOCAL',
    });
    expect(id.name).toBe('Local Name');
    expect(id.avatarDataUrl).toBe('data:image/webp;base64,LOCAL');
  });

  it('falls back to the email prefix when nothing else is set', () => {
    const id = effectiveIdentity(sessionWith({}), emptyProfile);
    expect(id.name).toBe('me');
    expect(id.avatarDataUrl).toBeNull();
  });

  it('treats blank/whitespace metadata as unset', () => {
    const id = effectiveIdentity(sessionWith({ full_name: '   ', avatar_url: '' }), {
      name: 'Local Name',
      avatarDataUrl: 'data:image/webp;base64,LOCAL',
    });
    expect(id.name).toBe('Local Name');
    expect(id.avatarDataUrl).toBe('data:image/webp;base64,LOCAL');
  });

  it('uses the local profile when signed out', () => {
    const id = effectiveIdentity(null, { name: 'Just Me', avatarDataUrl: null });
    expect(id.name).toBe('Just Me');
    expect(id.email).toBeNull();
  });

  it('is fully empty for a signed-out user with no local profile', () => {
    const id = effectiveIdentity(null, emptyProfile);
    expect(id.name).toBeNull();
    expect(id.avatarDataUrl).toBeNull();
    expect(id.email).toBeNull();
  });
});
