import { useState } from 'react';
import { useSettingsStore, type HabitTabKind } from '../../app/settingsStore';
import { useHabitEntriesStore } from '../../app/habitEntriesStore';
import { useUiStore } from '../../app/uiStore';
import { HABIT_ICONS, habitIconById } from '../habit-tabs/habitIcons';
import { confirmDialog } from '../../ui/confirmStore';
import { useIsMobile } from '../../ui/useMediaQuery';
import { PhoneGroup, PhoneSwitchRow } from './PhoneSettings';
import './habitTabsSection.css';

const KIND_OPTIONS: { value: HabitTabKind; label: string; description: string; icon: string }[] = [
  { value: 'check', label: 'Check', description: 'Mark as done or not', icon: '✓' },
  { value: 'text', label: 'Note', description: 'Write a short note', icon: '✎' },
  { value: 'number', label: 'Count', description: 'Track a number', icon: '#' },
];

/** Apple-style minimalistic habit tabs settings with step-by-step flow. */
export function HabitTabsSection() {
  const enabled = useSettingsStore((s) => s.habitTabsEnabled);
  const setEnabled = useSettingsStore((s) => s.setHabitTabsEnabled);
  const tabs = useSettingsStore((s) => s.habitTabs);
  const addHabitTab = useSettingsStore((s) => s.addHabitTab);
  const renameHabitTab = useSettingsStore((s) => s.renameHabitTab);
  const setHabitTabIcon = useSettingsStore((s) => s.setHabitTabIcon);
  const deleteHabitTab = useSettingsStore((s) => s.deleteHabitTab);
  const isMobile = useIsMobile();

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HabitTabKind>('check');
  const [icon, setIcon] = useState(HABIT_ICONS[1]?.id ?? HABIT_ICONS[0].id);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const [showTypePopup, setShowTypePopup] = useState(false);
  const [iconPickerAnchorEl, setIconPickerAnchorEl] = useState<{ top: number; left: number } | null>(null);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addHabitTab({ name: trimmed, icon, kind });
    setName('');
    setIsAdding(false);
    setShowTypePopup(false);
    setIconPickerFor(null);
    setIconPickerAnchorEl(null);
  }

  async function remove(id: string, tabName: string) {
    const recorded = Object.keys(useHabitEntriesStore.getState().entries[id] ?? {}).length;
    const ok = await confirmDialog({
      title: `Delete "${tabName}"?`,
      message: recorded > 0
        ? `This removes the tab and its ${recorded} recorded ${recorded === 1 ? 'day' : 'days'}. This can't be undone.`
        : "This removes the tab. This can't be undone.",
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteHabitTab(id);
    useHabitEntriesStore.getState().deleteTabEntries(id);
    if (useUiStore.getState().activeHabitTab === id) {
      useUiStore.getState().setActiveHabitTab(null);
    }
    setIconPickerFor(null);
    setIconPickerAnchorEl(null);
  }

  return (
    <section className="settings-section">
      {isMobile ? (
        <PhoneGroup footer="Track habits, journal entries, or metrics directly on your calendar.">
          <PhoneSwitchRow title="Habit tracker" checked={enabled} onChange={setEnabled} />
        </PhoneGroup>
      ) : (
        <>
          <div className="habit-section-header">
            <h3 className="settings-subhead">Habit Tracker</h3>
            <div className="habit-toggle-wrapper">
              <label className="habit-toggle-switch">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className="habit-toggle-slider"></span>
              </label>
            </div>
          </div>
          
          <p className="settings-description">
            Track habits, journal entries, or metrics directly on your calendar.
          </p>
        </>
      )}

      {enabled && (
        <>
          {/* Step 1: Existing tabs list */}
          <div className="habit-step">
            <div className="habit-step-header">
              <span className="habit-step-number">1</span>
              <h4 className="habit-step-title">Your Habits</h4>
            </div>
            
            {tabs.length === 0 ? (
              <div className="habit-empty-state">
                <div className="habit-empty-icon">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <p>No habits yet</p>
                <button 
                  className="habit-add-prompt-btn"
                  onClick={() => setIsAdding(true)}
                >
                  Create your first habit
                </button>
              </div>
            ) : (
              <ul className="habit-tab-list">
                {tabs.map((tab, index) => (
                  <li key={tab.id} className="habit-tab-card" style={{ animationDelay: `${index * 0.05}s` }}>
                    <div className="habit-tab-content">
                      <button
                        className="habit-tab-icon-wrapper"
                        title="Change icon"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setIconPickerAnchorEl({
                            top: rect.bottom + 8,
                            left: Math.max(16, rect.left - 100),
                          });
                          setIconPickerFor(iconPickerFor === tab.id ? null : tab.id);
                        }}
                      >
                        <div className="habit-tab-icon">
                          {habitIconById(tab.icon).icon}
                        </div>
                      </button>
                      
                      <div className="habit-tab-details">
                        <input
                          className="habit-tab-name"
                          value={tab.name}
                          onChange={(e) => renameHabitTab(tab.id, e.target.value)}
                          placeholder="Habit name"
                        />
                        <span className="habit-tab-type">{KIND_OPTIONS.find(k => k.value === tab.kind)?.label || tab.kind}</span>
                      </div>
                    </div>
                    
                    <div className="habit-tab-actions">
                      {iconPickerFor === tab.id && iconPickerAnchorEl && (
                        <div 
                          className="habit-icon-picker-modal" 
                          style={{
                            position: 'fixed',
                            top: `${iconPickerAnchorEl.top}px`,
                            left: `${iconPickerAnchorEl.left}px`,
                          }}
                        >
                          {HABIT_ICONS.map((opt) => (
                            <button
                              key={opt.id}
                              className={`habit-icon-option${tab.icon === opt.id ? ' is-selected' : ''}`}
                              title={opt.label}
                              onClick={() => {
                                setHabitTabIcon(tab.id, opt.id);
                                setIconPickerFor(null);
                                setIconPickerAnchorEl(null);
                              }}
                            >
                              {opt.icon}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      <button
                        className="habit-tab-delete"
                        onClick={() => void remove(tab.id, tab.name)}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Step 2: Add new habit */}
          {!isAdding && tabs.length > 0 && (
            <button className="habit-add-btn" onClick={() => setIsAdding(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add New Habit</span>
            </button>
          )}

          {isAdding && (
            <div className="habit-add-step">
              <div className="habit-step-header">
                <span className="habit-step-number">2</span>
                <h4 className="habit-step-title">Create New Habit</h4>
              </div>
              
              <div className="habit-form">
                <div className="habit-form-group">
                  <label className="habit-form-label">Name</label>
                  <input
                    className="habit-form-input"
                    placeholder="e.g., Morning Exercise"
                    value={name}
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && name.trim()) add();
                      if (e.key === 'Escape') setIsAdding(false);
                    }}
                  />
                </div>

                <div className="habit-form-group">
                  <label className="habit-form-label">Type</label>
                  <button
                    className="habit-type-selector-btn"
                    onClick={() => setShowTypePopup(!showTypePopup)}
                  >
                    <span className="habit-type-selector-icon">
                      {KIND_OPTIONS.find(k => k.value === kind)?.icon || '✓'}
                    </span>
                    <span className="habit-type-selector-label">
                      {KIND_OPTIONS.find(k => k.value === kind)?.label || 'Check'}
                    </span>
                    <span className="habit-type-selector-desc">
                      {KIND_OPTIONS.find(k => k.value === kind)?.description || 'Mark as done or not'}
                    </span>
                    <svg className="habit-type-selector-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  
                  {showTypePopup && (
                    <div className="habit-type-popup">
                      {KIND_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          className={`habit-type-popup-option${kind === opt.value ? ' is-selected' : ''}`}
                          onClick={() => {
                            setKind(opt.value);
                            setShowTypePopup(false);
                          }}
                        >
                          <span className="habit-type-popup-icon">{opt.icon}</span>
                          <div className="habit-type-popup-info">
                            <span className="habit-type-popup-label">{opt.label}</span>
                            <span className="habit-type-popup-desc">{opt.description}</span>
                          </div>
                          {kind === opt.value && (
                            <svg className="habit-type-checkmark" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="habit-form-group">
                  <label className="habit-form-label">Icon</label>
                  <button
                    className="habit-icon-preview-btn"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setIconPickerAnchorEl({
                        top: rect.bottom + 8,
                        left: Math.max(16, rect.left - 100),
                      });
                      setIconPickerFor(iconPickerFor ? null : 'new');
                    }}
                  >
                    <div className="habit-icon-preview">
                      {habitIconById(icon).icon}
                    </div>
                    <span>Choose icon</span>
                    <svg className="habit-icon-preview-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  
                  {iconPickerFor === 'new' && iconPickerAnchorEl && (
                    <div 
                      className="habit-icon-picker-modal habit-icon-picker-grid"
                      style={{
                        position: 'fixed',
                        top: `${iconPickerAnchorEl.top}px`,
                        left: `${iconPickerAnchorEl.left}px`,
                      }}
                    >
                      {HABIT_ICONS.map((opt) => (
                        <button
                          key={opt.id}
                          className={`habit-icon-option${icon === opt.id ? ' is-selected' : ''}`}
                          title={opt.label}
                          onClick={() => {
                            setIcon(opt.id);
                            setIconPickerFor(null);
                            setIconPickerAnchorEl(null);
                          }}
                        >
                          {opt.icon}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="habit-form-actions">
                  <button
                    className="habit-form-cancel"
                    onClick={() => setIsAdding(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="habit-form-submit"
                    disabled={!name.trim()}
                    onClick={add}
                  >
                    Create Habit
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
