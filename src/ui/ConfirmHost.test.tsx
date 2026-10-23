import { render, fireEvent, act, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfirmHost } from './ConfirmHost';
import { useConfirmStore, confirmDialog, confirmChoice } from './confirmStore';

describe('ConfirmHost Keyboard Shortcuts', () => {
  beforeEach(() => {
    // Reset the store state before each test
    useConfirmStore.setState({ request: null });
  });

  it('renders nothing when there is no active request', () => {
    const { container } = render(<ConfirmHost />);
    expect(container.firstChild).toBeNull();
  });

  it('resolves with true when Enter is pressed on confirmDialog', async () => {
    render(<ConfirmHost />);

    let resultPromise: Promise<boolean>;
    act(() => {
      resultPromise = confirmDialog({
        title: 'Delete Item',
        message: 'Are you sure?',
        confirmLabel: 'Delete',
      });
    });

    // Verify dialog is visible
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();

    // Trigger Enter key press on window
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    const result = await resultPromise!;
    expect(result).toBe(true);

    // Verify dialog is closed
    expect(screen.queryByText('Delete Item')).toBeNull();
  });

  it('resolves with false when Escape is pressed on confirmDialog', async () => {
    render(<ConfirmHost />);

    let resultPromise: Promise<boolean>;
    act(() => {
      resultPromise = confirmDialog({
        title: 'Delete Item',
        message: 'Are you sure?',
        confirmLabel: 'Delete',
      });
    });

    // Trigger Escape key press on window
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    const result = await resultPromise!;
    expect(result).toBe(false);

    expect(screen.queryByText('Delete Item')).toBeNull();
  });

  it('resolves with the first option when Enter is pressed on confirmChoice', async () => {
    render(<ConfirmHost />);

    let resultPromise: Promise<string | null>;
    act(() => {
      resultPromise = confirmChoice({
        title: 'Delete recurring event',
        message: 'Would you like to delete only this occurrence, or all events in the series?',
        actions: [
          { label: 'Only this event', value: 'occurrence' },
          { label: 'All events', value: 'all', danger: true },
        ],
      });
    });

    // Trigger Enter key press on window
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    const result = await resultPromise!;
    expect(result).toBe('occurrence');

    expect(screen.queryByText('Delete recurring event')).toBeNull();
  });

  it('resolves with null when Escape is pressed on confirmChoice', async () => {
    render(<ConfirmHost />);

    let resultPromise: Promise<string | null>;
    act(() => {
      resultPromise = confirmChoice({
        title: 'Delete recurring event',
        message: 'Would you like to delete only this occurrence, or all events in the series?',
        actions: [
          { label: 'Only this event', value: 'occurrence' },
          { label: 'All events', value: 'all', danger: true },
        ],
      });
    });

    // Trigger Escape key press on window
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    const result = await resultPromise!;
    expect(result).toBeNull();

    expect(screen.queryByText('Delete recurring event')).toBeNull();
  });
});
