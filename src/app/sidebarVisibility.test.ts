import { useSettingsStore } from './settingsStore';
import { useUiStore } from './uiStore';
import { isSidebarShortcut, setSidebarVisible, toggleSidebar } from './sidebarVisibility';

/** A keydown event shaped like the one the window listener receives. */
function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, ...init });
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  useSettingsStore.setState({ sidebarCollapsed: false });
  useUiStore.getState().closeOverlays();
});

describe('setSidebarVisible / toggleSidebar', () => {
  it('hides and shows the side panel', () => {
    setSidebarVisible(false);
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(true);

    setSidebarVisible(true);
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);
  });

  it('toggles between the two states', () => {
    toggleSidebar();
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(true);

    toggleSidebar();
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);
  });

  it('persists the choice so it survives a restart', () => {
    setSidebarVisible(false);
    const stored = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(stored.sidebarCollapsed).toBe(true);
  });

  it('closes a popover anchored inside the panel when it collapses', () => {
    document.body.innerHTML = '<aside class="sidebar"><button id="a">+</button></aside>';
    const anchor = document.getElementById('a')!;
    useUiStore.getState().openCreate(anchor);

    setSidebarVisible(false);

    expect(useUiStore.getState().create).toBeNull();
  });

  it('leaves popovers anchored outside the panel open', () => {
    document.body.innerHTML =
      '<aside class="sidebar"></aside><main class="main-panel"><button id="b">+</button></main>';
    const anchor = document.getElementById('b')!;
    useUiStore.getState().openCreate(anchor);

    setSidebarVisible(false);

    expect(useUiStore.getState().create).not.toBeNull();
  });
});

describe('isSidebarShortcut', () => {
  it('matches Ctrl+B and Cmd+B', () => {
    expect(isSidebarShortcut(keyEvent({ key: 'b', ctrlKey: true }))).toBe(true);
    expect(isSidebarShortcut(keyEvent({ key: 'B', metaKey: true }))).toBe(true);
  });

  it('ignores a bare B and modified variants', () => {
    expect(isSidebarShortcut(keyEvent({ key: 'b' }))).toBe(false);
    expect(isSidebarShortcut(keyEvent({ key: 'b', ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSidebarShortcut(keyEvent({ key: 'b', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSidebarShortcut(keyEvent({ key: 'n', ctrlKey: true }))).toBe(false);
  });

  it('defers to the focused text field, where Cmd+B means bold', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    expect(isSidebarShortcut(keyEvent({ key: 'b', metaKey: true }))).toBe(false);
  });
});
