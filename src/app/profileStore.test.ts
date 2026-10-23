import { describe, it, expect, beforeEach } from 'vitest';
import { useProfileStore, currentLocalProfile } from './profileStore';

const KEY = 'open-calendar.profile';

function stored() {
  return JSON.parse(localStorage.getItem(KEY) ?? '{}');
}

describe('profileStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useProfileStore.setState({ name: '', avatarDataUrl: null });
  });

  it('setName updates state and the localStorage mirror', () => {
    useProfileStore.getState().setName('Ada');
    expect(useProfileStore.getState().name).toBe('Ada');
    expect(stored().name).toBe('Ada');
  });

  it('setAvatar and clearAvatar round-trip through both state and storage', () => {
    const url = 'data:image/webp;base64,AAA';
    useProfileStore.getState().setAvatar(url);
    expect(useProfileStore.getState().avatarDataUrl).toBe(url);
    expect(stored().avatarDataUrl).toBe(url);

    useProfileStore.getState().clearAvatar();
    expect(useProfileStore.getState().avatarDataUrl).toBeNull();
    expect(stored().avatarDataUrl).toBeNull();
  });

  it('currentLocalProfile returns a plain snapshot without store methods', () => {
    useProfileStore.getState().setName('Bob');
    expect(currentLocalProfile()).toEqual({ name: 'Bob', avatarDataUrl: null });
  });
});
