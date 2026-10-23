import { Fragment, useState, useMemo, useEffect, useRef } from 'react';
import type { VirtualElement } from '@floating-ui/react';
import { friendlyDate, dayDiff } from '../../core/dates';
import { describeRecurrence } from '../../core/recurrence';
import { isSpan, spanEndDate } from '../../core/spans';
import { instantToWallClock } from '../../core/timezone';
import type { CalendarEvent } from '../../core/types';
import { resolveEventLook } from '../../core/cosmetics';
import { useCalendarStore } from '../../app/store';
import { useVisibleEvents } from '../../app/visibleEvents';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore, getCategoryStyle } from '../../app/settingsStore';
import { useSelectionStore } from '../../app/selectionStore';
import { buildOngoing, buildUpcoming, buildTasks, DEFAULT_UPCOMING_VIEW, describeOngoingSpan, UpcomingView, viewOngoing, viewTasks, viewUpcoming, type UpcomingItem, clampDensity, DENSITY_MIN, DENSITY_MAX, DENSITY_STEP } from './upcoming';

import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { confirmDialog, confirmChoice } from '../../ui/confirmStore';
import { ContextMenu, pointAnchor, type ContextMenuItem } from '../../ui/ContextMenu';
import { buildEventMenuItems, deleteEventWithConfirm } from '../../app/eventActions';
import { useAutoHideScrollbar } from '../../ui/useAutoHideScrollbar';
import { useMarqueeSelect } from './useMarqueeSelect';
import { ExpandingSearch } from '../../ui/ExpandingSearch';
import './upcomingStack.css';
import '../../ui/toolbarButton.css';
// Reuse the day-editing popover's control styles (.sd-*) so the filter popover
// stays pixel-consistent with it. specialDay.css is already global, but the
// explicit import documents the dependency.
import '../special-day/specialDay.css';

/** The three single-select filters, each rendered as a segmented control that
 *  mirrors the day popover's recurrence row. */
const FILTER_SEGMENTS = [
  {
    label: 'Order',
    key: 'order' as const,
    options: [
      { value: 'date-asc', label: 'Date Asc' },
      { value: 'date-desc', label: 'Date Desc' },
      { value: 'alpha', label: 'A–Z' },
    ],
  },
  {
    label: 'Show',
    key: 'type' as const,
    options: [
      { value: 'all', label: 'All' },
      { value: 'events', label: 'Events' },
      { value: 'tasks', label: 'Tasks' },
    ],
  },
  {
    label: 'Repeat',
    key: 'repeat' as const,
    options: [
      { value: 'all', label: 'All' },
      { value: 'one-time', label: 'One-time' },
      { value: 'repeating', label: 'Repeating' },
    ],
  },
  {
    label: 'Time',
    key: 'timing' as const,
    options: [
      { value: 'all', label: 'All' },
      { value: 'timed', label: 'Timed' },
      { value: 'all-day', label: 'All-day' },
    ],
  },
];

const COLUMN_WIDTHS: Record<string, number> = {
  date: 120,
  recurrence: 85,
  category: 110,
  time_until: 80,
};

export function UpcomingStack() {
  const listRef = useAutoHideScrollbar<HTMLDivElement>();
  const { onPointerDown: onListPointerDown, marquee } = useMarqueeSelect(listRef);
  // Own events plus anything shared with this user (see visibleEvents).
  const events = useVisibleEvents();
  const displayTimeZone = useSettingsStore((s) => s.displayTimeZone);
  const storeCategories = useSettingsStore((s) => s.categories);

  /** Matched-category tint for a card's dot (event's own color wins upstream). */
  const matchedDotStyle = (event: CalendarEvent): React.CSSProperties | undefined => {
    const look = resolveEventLook(event, storeCategories);
    if (look.kind !== 'match') return undefined;
    return look.config.type === 'gradient'
      ? { background: `linear-gradient(90deg, ${look.config.color1}, ${look.config.color2})` }
      : { backgroundColor: look.config.value };
  };

  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const deleteEvents = useCalendarStore((s) => s.deleteEvents);
  const updateEvents = useCalendarStore((s) => s.updateEvents);
  const openCreate = useUiStore((s) => s.openCreate);
  const openTaskCreate = useUiStore((s) => s.openTaskCreate);
  const openTaskEdit = useUiStore((s) => s.openTaskEdit);
  const setViewedDate = useUiStore((s) => s.setViewedDate);
  const selectionActive = useSelectionStore((s) => s.active);
  const selectedIds = useSelectionStore((s) => s.selected);
  const enterSelection = useSelectionStore((s) => s.enter);
  const enterQuickSelection = useSelectionStore((s) => s.enterQuick);
  const exitSelection = useSelectionStore((s) => s.exit);
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const today = instantToWallClock(new Date(), displayTimeZone).date;
  const highlightedEvent = useUiStore((s) => s.highlightedEvent);
  
  const [view, setView] = useState<UpcomingView>(DEFAULT_UPCOMING_VIEW);
  const toggleCategory = (c: string) =>
    setView((v) => ({
      ...v,
      categories: v.categories.includes(c)
        ? v.categories.filter((x) => x !== c)
        : [...v.categories, c],
    }));
  const isDefaultView =
    view.order === DEFAULT_UPCOMING_VIEW.order &&
    view.repeat === DEFAULT_UPCOMING_VIEW.repeat &&
    view.timing === DEFAULT_UPCOMING_VIEW.timing &&
    view.type === DEFAULT_UPCOMING_VIEW.type &&
    view.categories.length === 0 &&
    view.query === DEFAULT_UPCOMING_VIEW.query;
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [menu, setMenu] = useState<{ anchor: VirtualElement; items: ContextMenuItem[] } | null>(null);
  const [groupByCategory, setGroupByCategory] = useState(() => {
    return localStorage.getItem('upcoming_group_by_category') === 'true';
  });
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [compactMode, setCompactMode] = useState(() => {
    return localStorage.getItem('upcoming_compact_mode') === 'true';
  });

  const changeCompactMode = (value: boolean) => {
    setCompactMode(value);
    localStorage.setItem('upcoming_compact_mode', String(value));
  };

  const [ongoingPulse, setOngoingPulse] = useState(() => {
    return localStorage.getItem('upcoming_ongoing_pulse') !== 'false';
  });

  const changeOngoingPulse = (value: boolean) => {
    setOngoingPulse(value);
    localStorage.setItem('upcoming_ongoing_pulse', String(value));
  };

  const [alignColumns, setAlignColumns] = useState(() => {
    return localStorage.getItem('upcoming_align_columns') === 'true';
  });

  const changeAlignColumns = (value: boolean) => {
    setAlignColumns(value);
    localStorage.setItem('upcoming_align_columns', String(value));
  };

  const [density, setDensity] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem('upcoming_density') ?? '');
    return clampDensity(Number.isFinite(v) ? v : 1);
  });

  const changeDensity = (v: number | ((prev: number) => number)) => {
    setDensity((prev) => {
      const nextVal = typeof v === 'function' ? v(prev) : v;
      const d = clampDensity(nextVal);
      localStorage.setItem('upcoming_density', String(d));
      return d;
    });
  };

  const [settingsOrder, setSettingsOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('upcoming_settings_order');
    const defaultOrder = ['date', 'recurrence', 'category', 'time_until'];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length === 4 &&
          parsed.every((item) => defaultOrder.includes(item))
        ) {
          return parsed;
        }
      } catch (e) {
        // ignore
      }
    }
    return defaultOrder;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const nextOrder = [...settingsOrder];
    const draggedItem = nextOrder[draggedIndex];
    nextOrder.splice(draggedIndex, 1);
    nextOrder.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    setSettingsOrder(nextOrder);
    localStorage.setItem('upcoming_settings_order', JSON.stringify(nextOrder));
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const step = e.deltaY < 0 ? DENSITY_STEP : -DENSITY_STEP;
        changeDensity((prev) => prev + step);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);



  const [showDate, setShowDate] = useState(() => {
    const val = localStorage.getItem('upcoming_show_date');
    return val === null ? true : val === 'true';
  });
  const [showRecurrence, setShowRecurrence] = useState(() => {
    const val = localStorage.getItem('upcoming_show_recurrence');
    return val === null ? true : val === 'true';
  });
  const [showCategory, setShowCategory] = useState(() => {
    const val = localStorage.getItem('upcoming_show_category');
    return val === null ? true : val === 'true';
  });
  const [showTimeUntil, setShowTimeUntil] = useState(() => {
    const val = localStorage.getItem('upcoming_show_time_until');
    return val === null ? true : val === 'true';
  });

  const toggleSetting = (setting: 'date' | 'recurrence' | 'category' | 'time_until') => {
    if (setting === 'date') {
      setShowDate(prev => {
        const next = !prev;
        localStorage.setItem('upcoming_show_date', String(next));
        return next;
      });
    } else if (setting === 'recurrence') {
      setShowRecurrence(prev => {
        const next = !prev;
        localStorage.setItem('upcoming_show_recurrence', String(next));
        return next;
      });
    } else if (setting === 'category') {
      setShowCategory(prev => {
        const next = !prev;
        localStorage.setItem('upcoming_show_category', String(next));
        return next;
      });
    } else if (setting === 'time_until') {
      setShowTimeUntil(prev => {
        const next = !prev;
        localStorage.setItem('upcoming_show_time_until', String(next));
        return next;
      });
    }
  };

  const getTimeUntil = (dateStr: string, timeStr?: string) => {
    const wallClock = instantToWallClock(new Date(), displayTimeZone);
    const diffDays = dayDiff(wallClock.date, dateStr);

    if (diffDays === 0) {
      if (timeStr) {
        const [currentH, currentM] = wallClock.time.split(':').map(Number);
        const [eventH, eventM] = timeStr.split(':').map(Number);
        const diffMinutes = (eventH * 60 + eventM) - (currentH * 60 + currentM);
        
        if (diffMinutes === 0) {
          return 'now';
        } else if (diffMinutes > 0) {
          if (diffMinutes < 60) {
            return `in ${diffMinutes} min${diffMinutes > 1 ? 's' : ''}`;
          } else {
            const hours = Math.floor(diffMinutes / 60);
            return `in ${hours} hour${hours > 1 ? 's' : ''}`;
          }
        } else {
          const absDiff = Math.abs(diffMinutes);
          if (absDiff < 60) {
            return `${absDiff} min${absDiff > 1 ? 's' : ''} ago`;
          } else {
            const hours = Math.floor(absDiff / 60);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
          }
        }
      }
      return 'today';
    } else if (diffDays > 0) {
      return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else {
      const absDays = Math.abs(diffDays);
      return `${absDays} day${absDays > 1 ? 's' : ''} ago`;
    }
  };

  const handleGroupByCategoryChange = (checked: boolean) => {
    setGroupByCategory(checked);
    localStorage.setItem('upcoming_group_by_category', String(checked));
    setShowCategory(!checked);
    localStorage.setItem('upcoming_show_category', String(!checked));
  };

  useEffect(() => {
    if (highlightedEvent) {
      const { id, date } = highlightedEvent;
      setTimeout(() => {
        let el = document.getElementById(`upcoming-card-${id}-${date}`);
        if (!el) {
          el = document.getElementById(`upcoming-card-${id}`);
        }
        if (!el) {
          el = document.querySelector(`[id^="upcoming-card-${id}-"]`);
        }
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }, [highlightedEvent]);

  const rawItems = useMemo(
    () => buildUpcoming(events, today, displayTimeZone, 365, storeCategories),
    [events, today, displayTimeZone, storeCategories],
  );

  const items = useMemo(() => viewUpcoming(rawItems, view), [rawItems, view]);
  const tasks = useMemo(() => buildTasks(events, storeCategories), [events, storeCategories]);
  const filteredTasks = useMemo(() => viewTasks(tasks, view), [tasks, view]);

  const groupedItems = useMemo(() => {
    if (!groupByCategory) return [];

    const itemsByCat = new Map<string, UpcomingItem[]>();
    items.forEach((item) => {
      const cat = item.event.type || 'No Category';
      if (!itemsByCat.has(cat)) itemsByCat.set(cat, []);
      itemsByCat.get(cat)!.push(item);
    });

    // Tasks group into the same categories as events (uncategorized → "No
    // Category"); within each group they render after the dated items.
    const tasksByCat = new Map<string, CalendarEvent[]>();
    filteredTasks.forEach((task) => {
      const cat = task.type || 'No Category';
      if (!tasksByCat.has(cat)) tasksByCat.set(cat, []);
      tasksByCat.get(cat)!.push(task);
    });

    const allCats = new Set<string>([...itemsByCat.keys(), ...tasksByCat.keys()]);
    const sortedCategories = Array.from(allCats).sort((a, b) => {
      if (a === 'No Category') return 1;
      if (b === 'No Category') return -1;
      return a.localeCompare(b);
    });

    return sortedCategories.map((cat) => ({
      category: cat,
      items: itemsByCat.get(cat) ?? [],
      tasks: tasksByCat.get(cat) ?? [],
    }));
  }, [items, filteredTasks, groupByCategory]);

  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
    events.forEach((e) => {
      if (e.type) {
        categories.add(e.type);
      }
    });
    return Array.from(categories).sort();
  }, [events]);

  const rawOngoing = useMemo(
    () => buildOngoing(events, today, storeCategories),
    [events, today, storeCategories],
  );
  const ongoing = useMemo(() => viewOngoing(rawOngoing, view), [rawOngoing, view]);

  /** Header readout. Counts what is actually on screen, so it tracks the search
   *  and filters; an empty clause is dropped rather than shown as a zero. */
  const headerCounts = useMemo(() => {
    const counts = [
      { count: ongoing.length, word: 'ongoing' },
      { count: items.length, word: 'upcoming' },
      { count: filteredTasks.length, word: filteredTasks.length === 1 ? 'task' : 'tasks' },
    ];
    return counts.filter((c) => c.count > 0);
  }, [ongoing.length, items.length, filteredTasks.length]);

  const handleDelete = (e: React.MouseEvent, event: CalendarEvent, occurrenceDate?: string) => {
    e.stopPropagation();
    void deleteEventWithConfirm(event, occurrenceDate);
  };

  const bulkDuplicate = async (ids: string[]) => {
    for (const id of ids) {
      const event = events.find((e) => e.id === id);
      if (!event) continue;
      const shared = {
        description: event.description,
        type: event.type,
        color: event.color,
        cosmetic: event.cosmetic,
        showOnMinimap: event.showOnMinimap,
        showInUpcoming: event.showInUpcoming,
        calendarUrls: event.calendarUrls,
        tz: event.tz,
        recurrence: null,
      };
      await addEvent({
        ...shared,
        title: event.title,
        date: event.date,
        endDate: event.endDate,
        time: event.time,
      });
    }
    exitSelection();
  };

  const bulkDelete = async (ids: string[]) => {
    const confirmed = await confirmDialog({
      title: 'Delete events',
      message: `Are you sure you want to permanently delete ${ids.length} selected item${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (confirmed) {
      await deleteEvents(ids);
      exitSelection();
    }
  };

  const bulkHide = async (ids: string[]) => {
    await updateEvents(ids, { showInUpcoming: false });
    exitSelection();
  };

  const bulkRemoveCategory = async (ids: string[]) => {
    await updateEvents(ids, { type: undefined });
    exitSelection();
  };

  const bulkAssignCategory = async (ids: string[]) => {
    const actions = existingCategories.map((cat) => ({
      label: cat,
      value: cat,
    }));
    actions.push({
      label: '+ New Category...',
      value: 'new-category',
    });

    const choice = await confirmChoice({
      title: 'Assign Category',
      message: `Select a category to assign to the ${ids.length} selected items:`,
      actions,
    });

    if (!choice) return;

    let finalCategory: string | null = choice;
    if (choice === 'new-category') {
      const name = window.prompt('Enter new category name:');
      if (!name || !name.trim()) return;
      finalCategory = name.trim();
    }

    await updateEvents(ids, { type: finalCategory || undefined });
    exitSelection();
  };

  const buildBulkMenuItems = (ids: string[]): ContextMenuItem[] => {
    return [
      {
        label: 'Duplicate',
        onClick: () => void bulkDuplicate(ids),
      },
      {
        label: 'Hide from this view',
        onClick: () => void bulkHide(ids),
      },
      {
        label: 'Assign category...',
        onClick: () => void bulkAssignCategory(ids),
      },
      {
        label: 'Remove category',
        onClick: () => void bulkRemoveCategory(ids),
      },
      {
        label: 'Delete',
        danger: true,
        onClick: () => void bulkDelete(ids),
      },
    ];
  };

  /** Build the right-click action menu for a card. `navDate` is where "Show in
   *  calendar" scrolls to; `span` is set for multi-day / ongoing cards (routes
   *  Modify through the span editor). */
  const buildMenuItems = (opts: {
    event: CalendarEvent;
    navDate: string;
    occurrenceDate: string;
    cardEl: Element;
    span?: { start: string; end: string };
  }): ContextMenuItem[] => {
    const { event, navDate, occurrenceDate, cardEl, span } = opts;
    // Modify / Copy / Duplicate / Reset style / Delete are the set every view
    // offers; the two around them are this list's own.
    return [
      { label: 'Show in calendar', onClick: () => setViewedDate(navDate) },
      ...buildEventMenuItems({
        event,
        occurrenceDate,
        anchorEl: cardEl,
        span,
        extra: [
          {
            // Enter selection mode pre-selecting this card; the user keeps
            // tapping other cards, and the SelectionBar finishes or cancels.
            label: 'Select multiple',
            onClick: () => {
              enterSelection();
              toggleSelection(event.id);
            },
          },
          {
            label: 'Hide from this view',
            onClick: () => void updateEvent(event.id, { showInUpcoming: false }),
          },
        ],
      }),
    ];
  };

  const openCardMenu = (e: React.MouseEvent, items: ContextMenuItem[], eventId: string) => {
    e.preventDefault();
    if (selectionActive && selectedIds.has(eventId)) {
      const selectedIdsArray = Array.from(selectedIds);
      const bulkItems = buildBulkMenuItems(selectedIdsArray);
      setMenu({ anchor: pointAnchor(e.clientX, e.clientY), items: bulkItems });
      return;
    }
    if (selectionActive) {
      exitSelection();
    }
    setMenu({ anchor: pointAnchor(e.clientX, e.clientY), items });
  };

  /** Right-click on empty space in the list → create event/task. Ignored when
   *  the click landed on a card (those open their own menu). */
  const openEmptySpaceMenu = (e: React.MouseEvent) => {
    if (selectionActive) return;
    if ((e.target as HTMLElement).closest('.upcoming-card')) return;
    e.preventDefault();
    const anchor = e.currentTarget as Element;
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: [
        { label: 'New event', onClick: () => openCreate(anchor) },
        { label: 'New task', onClick: () => openTaskCreate(anchor) },
      ],
    });
  };

  const renderItem = (item: UpcomingItem) => {
    const { event, date, time } = item;
    const isSelected = selectionActive && selectedIds.has(event.id);
    const isHighlighted = highlightedEvent?.id === event.id && (
      highlightedEvent?.date === date ||
      (event.recurrence && !items.some((it) => it.event.id === event.id && it.date === highlightedEvent?.date))
    );
    const cardClick = (e?: React.MouseEvent) => {
      // Read fresh state — rapid successive clicks fire before a re-render.
      const { active, source } = useSelectionStore.getState();
      if (e?.shiftKey) {
        // Shift+click builds a "quick" selection without navigating.
        if (!active) enterQuickSelection();
        toggleSelection(event.id);
        return;
      }
      if (active) {
        // Tap mode (header button) keeps toggling on a plain click.
        if (source === 'tap') {
          toggleSelection(event.id);
          return;
        }
        // Quick selection: a plain click clears it, then navigates.
        exitSelection();
      }
      useUiStore.getState().setHighlightedEvent({ id: event.id, date });
      setViewedDate(date);
    };

    const details: React.ReactNode[] = [];

    settingsOrder.forEach((key) => {
      if (key === 'date') {
        details.push(
          showDate ? (
            <span
              key="date"
              className={alignColumns ? 'upcoming-detail-cell date-column' : ''}
              style={alignColumns ? { width: `${COLUMN_WIDTHS.date}px` } : undefined}
            >
              {friendlyDate(date, time, today)}
            </span>
          ) : null
        );
      } else if (key === 'recurrence') {
        const hasVal = !!event.recurrence;
        details.push(
          showRecurrence ? (
            hasVal || alignColumns ? (
              <span
                key="recurrence"
                className={`upcoming-repeat ${alignColumns ? 'upcoming-detail-cell recurrence-column' : ''}`}
                style={alignColumns ? { width: `${COLUMN_WIDTHS.recurrence}px` } : undefined}
              >
                {hasVal ? describeRecurrence(event.recurrence!) : ''}
              </span>
            ) : null
          ) : null
        );
      } else if (key === 'category') {
        const hasVal = !!event.type;
        details.push(
          showCategory ? (
            hasVal ? (
              <span
                key="category"
                className={`upcoming-type ${alignColumns ? 'upcoming-detail-cell category-column' : ''}`}
                style={{
                  ...getCategoryStyle(storeCategories[event.type!]),
                  ...(alignColumns ? { width: `${COLUMN_WIDTHS.category}px` } : {}),
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  useUiStore.getState().openCategoryEditor(event.type!, e.currentTarget);
                }}
                title="Double-click to edit category"
              >
                {event.type}
              </span>
            ) : alignColumns ? (
              <span
                key="category"
                className="upcoming-detail-cell category-column"
                style={{ width: `${COLUMN_WIDTHS.category}px` }}
              />
            ) : null
          ) : null
        );
      } else if (key === 'time_until') {
        details.push(
          showTimeUntil ? (
            <span
              key="time-until"
              className={`upcoming-time-until ${alignColumns ? 'upcoming-detail-cell time-until-column' : ''}`}
              style={alignColumns ? { width: `${COLUMN_WIDTHS.time_until}px` } : undefined}
            >
              {getTimeUntil(date, time)}
            </span>
          ) : null
        );
      }
    });

    const renderedDetails: React.ReactNode[] = [];
    if (alignColumns) {
      // Find the first active/present column (not null and not an empty placeholder)
      let firstActiveIdx = -1;
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        if (d !== null && d !== undefined) {
          const el = d as React.ReactElement;
          const isEmpty = 
            (el.props.className?.includes('recurrence-column') && !el.props.children) ||
            (el.props.className?.includes('category-column') && !el.props.children);
          if (!isEmpty) {
            firstActiveIdx = i;
            break;
          }
        }
      }

      details.forEach((detail, idx) => {
        if (detail !== null && detail !== undefined) {
          const el = detail as React.ReactElement;
          const isEmpty = 
            (el.props.className?.includes('recurrence-column') && !el.props.children) ||
            (el.props.className?.includes('category-column') && !el.props.children);
          
          if (isEmpty && (firstActiveIdx === -1 || idx < firstActiveIdx)) {
            return;
          }

          renderedDetails.push(detail);
        }
      });
    } else {
      const activeDetails = details.filter(Boolean);
      activeDetails.forEach((detail, idx) => {
        if (idx > 0) {
          renderedDetails.push(<span key={`sep-${idx}`} className="upcoming-detail-separator"> · </span>);
        }
        renderedDetails.push(detail);
      });
    }

    return (
      <div
        key={`${event.id}-${date}`}
        id={`upcoming-card-${event.id}-${date}`}
        data-event-id={event.id}
        className={'upcoming-card' + (compactMode ? ' is-compact' : '') + (isSelected ? ' is-selected' : '') + (isHighlighted ? ' is-highlighted' : '')}
        role="button"
        tabIndex={0}
        onClick={cardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            cardClick();
          }
        }}
        onContextMenu={(e) =>
          openCardMenu(
            e,
            buildMenuItems({
              event,
              navDate: date,
              occurrenceDate: date,
              cardEl: e.currentTarget,
              span: isSpan(event)
                ? { start: event.date, end: spanEndDate(event) }
                : undefined,
            }),
            event.id,
          )
        }
      >
        <span className="upcoming-card-body">
          <div className="upcoming-title">{event.title}</div>
          {renderedDetails.length > 0 && (
            <div
              className={`upcoming-date ${alignColumns ? 'has-columns' : ''}`}
              style={alignColumns ? { flexShrink: 1, minWidth: 0 } : undefined}
            >
              {renderedDetails}
            </div>
          )}
        </span>
        {/* Kept mounted during selection (just suppressed) so the card height
            doesn't change when entering select mode. */}
        <button
          className={'upcoming-delete-btn' + (selectionActive ? ' is-suppressed' : '')}
          onClick={(e) => handleDelete(e, event, date)}
          disabled={selectionActive}
          title="Delete event"
          aria-label="Delete event"
        >
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  };

  /** A dateless task rendered as a normal card (no date / time-until), opening
   *  the task editor on click. Used inline in the list, ranked after events. */
  const renderTask = (event: CalendarEvent) => (
    <div
      key={event.id}
      id={`upcoming-card-${event.id}`}
      data-event-id={event.id}
      className={'upcoming-card task-card' + (compactMode ? ' is-compact' : '') + (selectionActive && selectedIds.has(event.id) ? ' is-selected' : '')}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        const { active, source } = useSelectionStore.getState();
        if (e.shiftKey) {
          if (!active) enterQuickSelection();
          toggleSelection(event.id);
          return;
        }
        if (active) {
          if (source === 'tap') { toggleSelection(event.id); return; }
          exitSelection();
        }
        openTaskEdit(event.id, e.currentTarget as Element);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTaskEdit(event.id, e.currentTarget as Element);
        }
      }}
      onContextMenu={(e) =>
        openCardMenu(e, [
          { label: 'Modify', onClick: () => openTaskEdit(event.id, e.currentTarget as Element) },
          { label: 'Set date…', onClick: () => openTaskEdit(event.id, e.currentTarget as Element, true) },
          {
            label: 'Select multiple',
            onClick: () => {
              enterSelection();
              toggleSelection(event.id);
            },
          },
          {
            label: 'Hide from this view',
            onClick: () => {
              void updateEvent(event.id, { showInUpcoming: false });
            },
          },
          { label: 'Delete', danger: true, onClick: () => void deleteEventWithConfirm(event) },
        ], event.id)
      }
    >
      <span className="upcoming-card-body">
        <div className="upcoming-title">{event.title}</div>
        {showCategory && event.type && (
          <div className="upcoming-date">
            <span className="upcoming-type" style={getCategoryStyle(storeCategories[event.type])}>{event.type}</span>
          </div>
        )}
      </span>
      <button
        className={'upcoming-delete-btn' + (selectionActive ? ' is-suppressed' : '')}
        onClick={(e) => handleDelete(e, event)}
        disabled={selectionActive}
        title="Delete task"
        aria-label="Delete task"
      >
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="upcoming-panel" ref={panelRef}>
      <div className="upcoming-header" data-tauri-drag-region>
        {/* What the panel holds, rather than what it is called. Clauses drop out
            as they empty, so nothing ever reads "0 upcoming". */}
        <span className="upcoming-count" data-tauri-drag-region>
          {headerCounts.map((c, i) => (
            <Fragment key={c.word}>
              {i > 0 && <span className="upcoming-count-sep">·</span>}
              <b>{c.count}</b> {c.word}
            </Fragment>
          ))}
        </span>

        <div className="upcoming-header-actions">
          <ExpandingSearch
            value={view.query}
            onChange={(query) => setView({ ...view, query })}
            placeholder="Search events"
          />

          <button
            className={`upcoming-filter-btn tb tb-icon${filterAnchorEl ? ' is-active' : ''}`}
            onClick={(e) => setFilterAnchorEl(filterAnchorEl ? null : e.currentTarget)}
            aria-label="Filter & Sort"
            title="Filter & Sort"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </button>

          <button
            className="upcoming-add tb tb-icon"
            onClick={(e) => openCreate(e.currentTarget)}
            aria-label="Add event"
            title="Add event"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            className={`upcoming-settings-btn ${settingsAnchorEl ? 'active' : ''}`}
            onClick={(e) => setSettingsAnchorEl(settingsAnchorEl ? null : e.currentTarget)}
            aria-label="Panel settings"
            title="Panel settings"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {filterAnchorEl && (
        <AnchoredPopover
          anchorEl={filterAnchorEl}
          onClose={() => setFilterAnchorEl(null)}
          placement="bottom-end"
        >
          <div className="sd-panel upcoming-filter-panel">
            {/* Slim action row — reset + close, mirroring the day popover. */}
            <div className="sd-topbar">
              <button
                type="button"
                className="sd-icon-btn"
                onClick={() => setView(DEFAULT_UPCOMING_VIEW)}
                disabled={isDefaultView}
                title="Reset filters"
                aria-label="Reset filters"
              >
                ↺
              </button>
              <button
                type="button"
                className="sd-icon-btn"
                onClick={() => setFilterAnchorEl(null)}
                title="Done"
                aria-label="Done"
              >
                ✕
              </button>
            </div>

            {FILTER_SEGMENTS.map((seg) => {
              const current = view[seg.key];
              const idx = seg.options.findIndex((o) => o.value === current);
              return (
                <div className="sd-section" key={seg.key}>
                  <span className="sd-label">{seg.label}</span>
                  <div className="sd-segment" role="radiogroup" aria-label={seg.label}>
                    <span
                      className="sd-segment-thumb"
                      style={{ transform: `translateX(${Math.max(idx, 0) * 100}%)` }}
                      aria-hidden="true"
                    />
                    {seg.options.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={current === o.value}
                        className={`sd-segment-btn ${current === o.value ? 'selected' : ''}`}
                        onClick={() => setView({ ...view, [seg.key]: o.value } as UpcomingView)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="sd-section">
              <span className="sd-label">Category</span>
              <div className="sd-pills">
                <button
                  type="button"
                  className={`sd-pill ${view.categories.length === 0 ? 'selected' : ''}`}
                  aria-pressed={view.categories.length === 0}
                  onClick={() => setView({ ...view, categories: [] })}
                >
                  <span className="sd-pill-label">All</span>
                </button>
                <button
                  type="button"
                  className={`sd-pill ${view.categories.includes('none') ? 'selected' : ''}`}
                  aria-pressed={view.categories.includes('none')}
                  onClick={() => toggleCategory('none')}
                >
                  <span className="sd-pill-label">No Category</span>
                </button>
                {existingCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`sd-pill ${view.categories.includes(cat) ? 'selected' : ''}`}
                    aria-pressed={view.categories.includes(cat)}
                    onClick={() => toggleCategory(cat)}
                  >
                    <span className="sd-pill-label">{cat}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </AnchoredPopover>
      )}

      {settingsAnchorEl && (
        <AnchoredPopover
          anchorEl={settingsAnchorEl}
          onClose={() => setSettingsAnchorEl(null)}
          placement="bottom-end"
        >
          <div className="upcoming-settings-popover">
            <div className="upcoming-settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px' }}>
              <span className="upcoming-switch-text" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Group by Category</span>
              <label className="upcoming-switch-label" style={{ margin: 0 }}>
                <div className="ios-switch">
                  <input
                    type="checkbox"
                    checked={groupByCategory}
                    onChange={(e) => handleGroupByCategoryChange(e.target.checked)}
                    aria-label="Group by Category"
                  />
                  <span className="ios-switch-slider" />
                </div>
              </label>
            </div>
            <div className="upcoming-settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px', marginTop: 'var(--space-1)' }}>
              <span className="upcoming-switch-text" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Compact Layout</span>
              <label className="upcoming-switch-label" style={{ margin: 0 }}>
                <div className="ios-switch">
                  <input
                    type="checkbox"
                    checked={compactMode}
                    onChange={(e) => changeCompactMode(e.target.checked)}
                    aria-label="Compact Layout"
                  />
                  <span className="ios-switch-slider" />
                </div>
              </label>
            </div>
            <div className="upcoming-settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px', marginTop: 'var(--space-1)' }}>
              <span className="upcoming-switch-text" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Align Columns</span>
              <label className="upcoming-switch-label" style={{ margin: 0 }}>
                <div className="ios-switch">
                  <input
                    type="checkbox"
                    checked={alignColumns}
                    onChange={(e) => changeAlignColumns(e.target.checked)}
                    aria-label="Align Columns"
                  />
                  <span className="ios-switch-slider" />
                </div>
              </label>
            </div>
            <div className="upcoming-settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px', marginTop: 'var(--space-1)' }}>
              <span className="upcoming-switch-text" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Pulse Ongoing</span>
              <label className="upcoming-switch-label" style={{ margin: 0 }}>
                <div className="ios-switch">
                  <input
                    type="checkbox"
                    checked={ongoingPulse}
                    onChange={(e) => changeOngoingPulse(e.target.checked)}
                    aria-label="Pulse Ongoing"
                  />
                  <span className="ios-switch-slider" />
                </div>
              </label>
            </div>
            <div className="upcoming-settings-title" style={{ marginTop: 'var(--space-2)' }}>
              Card Visibility <span className="drag-hint">(drag to reorder)</span>
            </div>
            <div className="apple-segmented-control">
              {settingsOrder.map((key, index) => {
                const isActive = 
                  key === 'date' ? showDate :
                  key === 'recurrence' ? showRecurrence :
                  key === 'category' ? showCategory :
                  key === 'time_until' ? showTimeUntil : false;

                const label = 
                  key === 'date' ? 'Date' :
                  key === 'recurrence' ? 'Recurrence' :
                  key === 'category' ? 'Category' :
                  key === 'time_until' ? 'Time Until' : '';

                return (
                  <button
                    key={key}
                    draggable
                    className={`apple-segment-btn ${isActive ? 'active' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
                    onClick={() => toggleSetting(key as any)}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    title="Click to toggle, drag to reorder"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="upcoming-settings-title" style={{ marginTop: 'var(--space-2)' }}>Tightness</div>
            <div className="upcoming-density-row">
              <button
                type="button"
                className="sd-icon-btn"
                onClick={() => changeDensity(1.0)}
                disabled={density === 1.0}
                title="Reset tightness"
                aria-label="Reset tightness"
              >
                ↺
              </button>
              <input
                type="range"
                min={DENSITY_MIN}
                max={DENSITY_MAX}
                step={DENSITY_STEP}
                value={density}
                onChange={(e) => changeDensity(parseFloat(e.target.value))}
                title="Tightness slider"
              />
              <span className="upcoming-density-readout">{Math.round(density * 100)}%</span>
            </div>
          </div>
        </AnchoredPopover>
      )}

      {ongoing.length > 0 && (
        <div className="ongoing-section" style={{ zoom: density } as React.CSSProperties}>
          {ongoing.map(({ event, start, end }) => {
            const isSelected = selectionActive && selectedIds.has(event.id);
            const isHighlighted = highlightedEvent?.id === event.id;
            const cardClick = (e?: React.MouseEvent) => {
              const { active, source } = useSelectionStore.getState();
              if (e?.shiftKey) {
                if (!active) enterQuickSelection();
                toggleSelection(event.id);
                return;
              }
              if (active) {
                if (source === 'tap') {
                  toggleSelection(event.id);
                  return;
                }
                exitSelection();
              }
              useUiStore.getState().setHighlightedEvent({ id: event.id, date: start });
              setViewedDate(start);
            };
            return (
              <div
                key={event.id}
                id={`upcoming-card-${event.id}`}
                className={'upcoming-card ongoing-card' + (ongoingPulse ? ' is-pulsing' : '') + (compactMode ? ' is-compact' : '') + (isSelected ? ' is-selected' : '') + (isHighlighted ? ' is-highlighted' : '')}
                title={describeOngoingSpan(start, end, today)}
                /* The hint would otherwise become the card's accessible name. */
                aria-label={event.title}
                role="button"
                tabIndex={0}
                onClick={cardClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    cardClick();
                  }
                }}
                onContextMenu={(e) =>
                  openCardMenu(
                    e,
                    buildMenuItems({
                      event,
                      navDate: start,
                      occurrenceDate: start,
                      cardEl: e.currentTarget,
                      span: { start, end },
                    }),
                    event.id,
                  )
                }
              >
                <span
                  className="ongoing-dot"
                  style={event.color ? { backgroundColor: event.color } : matchedDotStyle(event)}
                  aria-hidden="true"
                />
                <span className="upcoming-card-body">
                  <div className="upcoming-title">{event.title}</div>
                  {(() => {
                    const ongoingDetails: React.ReactNode[] = [];
                    settingsOrder.forEach((key) => {
                      if (key === 'date') {
                        ongoingDetails.push(
                          showDate ? (
                            <span
                              key="date"
                              className={alignColumns ? 'upcoming-detail-cell date-column' : ''}
                              style={alignColumns ? { width: `${COLUMN_WIDTHS.date}px` } : undefined}
                            >
                              Ends {friendlyDate(end, undefined, today)}
                            </span>
                          ) : null
                        );
                      } else if (key === 'recurrence') {
                        ongoingDetails.push(
                          showRecurrence ? (
                            alignColumns ? (
                              <span
                                key="recurrence"
                                className="upcoming-repeat upcoming-detail-cell recurrence-column"
                                style={{ width: `${COLUMN_WIDTHS.recurrence}px` }}
                              />
                            ) : null
                          ) : null
                        );
                      } else if (key === 'category') {
                        const hasVal = !!event.type;
                        ongoingDetails.push(
                          showCategory ? (
                            hasVal ? (
                              <span
                                key="category"
                                className={`upcoming-type ${alignColumns ? 'upcoming-detail-cell category-column' : ''}`}
                                style={{
                                  ...getCategoryStyle(storeCategories[event.type!]),
                                  ...(alignColumns ? { width: `${COLUMN_WIDTHS.category}px` } : {}),
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  useUiStore.getState().openCategoryEditor(event.type!, e.currentTarget);
                                }}
                                title="Double-click to edit category"
                              >
                                {event.type}
                              </span>
                            ) : alignColumns ? (
                              <span
                                key="category"
                                className="upcoming-detail-cell category-column"
                                style={{ width: `${COLUMN_WIDTHS.category}px` }}
                              />
                            ) : null
                          ) : null
                        );
                      } else if (key === 'time_until') {
                        ongoingDetails.push(
                          showTimeUntil ? (
                            <span
                              key="time-until"
                              className={`upcoming-time-until ${alignColumns ? 'upcoming-detail-cell time-until-column' : ''}`}
                              style={alignColumns ? { width: `${COLUMN_WIDTHS.time_until}px` } : undefined}
                            >
                              ends {getTimeUntil(end)}
                            </span>
                          ) : null
                        );
                      }
                    });

                    const renderedOngoingDetails: React.ReactNode[] = [];
                    if (alignColumns) {
                      // Find the first active/present column (not null and not an empty placeholder)
                      let firstActiveIdx = -1;
                      for (let i = 0; i < ongoingDetails.length; i++) {
                        const d = ongoingDetails[i];
                        if (d !== null && d !== undefined) {
                          const el = d as React.ReactElement;
                          const isEmpty = 
                            (el.props.className?.includes('recurrence-column') && !el.props.children) ||
                            (el.props.className?.includes('category-column') && !el.props.children);
                          if (!isEmpty) {
                            firstActiveIdx = i;
                            break;
                          }
                        }
                      }

                      ongoingDetails.forEach((detail, idx) => {
                        if (detail !== null && detail !== undefined) {
                          const el = detail as React.ReactElement;
                          const isEmpty = 
                            (el.props.className?.includes('recurrence-column') && !el.props.children) ||
                            (el.props.className?.includes('category-column') && !el.props.children);
                          
                          if (isEmpty && (firstActiveIdx === -1 || idx < firstActiveIdx)) {
                            return;
                          }

                          renderedOngoingDetails.push(detail);
                        }
                      });
                    } else {
                      const activeDetails = ongoingDetails.filter(Boolean);
                      activeDetails.forEach((detail, idx) => {
                        if (idx > 0) {
                          renderedOngoingDetails.push(<span key={`sep-${idx}`} className="upcoming-detail-separator"> · </span>);
                        }
                        renderedOngoingDetails.push(detail);
                      });
                    }

                    return renderedOngoingDetails.length > 0 ? (
                      <div
                        className={`upcoming-date ${alignColumns ? 'has-columns' : ''}`}
                        style={alignColumns ? { flexShrink: 1, minWidth: 0 } : undefined}
                      >
                        {renderedOngoingDetails}
                      </div>
                    ) : null;
                  })()}
                </span>
                <button
                  className={'upcoming-delete-btn' + (selectionActive ? ' is-suppressed' : '')}
                  onClick={(e) => handleDelete(e, event)}
                  disabled={selectionActive}
                  title="Delete event"
                  aria-label="Delete event"
                >
                  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="upcoming-list" ref={listRef} onPointerDown={onListPointerDown} onContextMenu={openEmptySpaceMenu} style={{ zoom: density } as React.CSSProperties}>
        {items.length === 0 && ongoing.length === 0 && filteredTasks.length === 0 && (
          <div className="upcoming-empty">No upcoming events found.</div>
        )}
        {groupByCategory ? (
          groupedItems.map(({ category, items: groupItems, tasks: groupTasks }) => (
            <div key={category} className="upcoming-category-section">
              <span
                className="panel-sublabel upcoming-category-header"
                style={category !== 'No Category' ? getCategoryStyle(storeCategories[category]) : undefined}
                onDoubleClick={(e) => {
                  if (category !== 'No Category') {
                    e.stopPropagation();
                    useUiStore.getState().openCategoryEditor(category, e.currentTarget);
                  }
                }}
                title={category !== 'No Category' ? "Double-click to edit category" : undefined}
              >
                {category}
              </span>
              <div className="upcoming-category-items">
                {groupItems.map(renderItem)}
                {groupTasks.map(renderTask)}
              </div>
            </div>
          ))
        ) : (
          <>
            {items.map(renderItem)}
            {filteredTasks.map(renderTask)}
          </>
        )}
      </div>

      {marquee && (
        <div
          className="upcoming-marquee"
          style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
          aria-hidden="true"
        />
      )}

      {menu && (
        <ContextMenu
          anchor={menu.anchor}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
