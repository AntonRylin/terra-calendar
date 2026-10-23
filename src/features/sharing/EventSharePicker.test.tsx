import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useShareStore } from '../../app/shareStore';
import type { Share } from '../../data/sharing/types';
import { EventSharePicker } from './EventSharePicker';

const share = (id: string, extra: Partial<Share> = {}): Share => ({
  id, name: id, scopeMode: 'all', categories: [], detail: 'full', role: 'viewer',
  token: `tok-${id}`, createdAt: '2026-08-01T00:00:00Z', ...extra,
});

beforeEach(() => {
  useShareStore.setState({ shares: [] });
});

describe('EventSharePicker', () => {
  it('renders nothing until the user has a share', () => {
    const { container } = render(
      <EventSharePicker eventType={undefined} shareInclude={undefined} shareExclude={undefined} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an event as shared when the share covers everything', () => {
    useShareStore.setState({ shares: [share('Family')] });
    render(<EventSharePicker eventType={undefined} shareInclude={undefined} shareExclude={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('shows an event as not shared when a category share misses its category', () => {
    useShareStore.setState({
      shares: [share('Family', { scopeMode: 'categories', categories: ['Holiday'] })],
    });
    render(<EventSharePicker eventType="Work" shareInclude={undefined} shareExclude={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('records an exclude when unticking an event the scope covers', async () => {
    useShareStore.setState({ shares: [share('s1', { scopeMode: 'all' })] });
    const onChange = vi.fn();
    render(<EventSharePicker eventType={undefined} shareInclude={undefined} shareExclude={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith({ shareInclude: undefined, shareExclude: ['s1'] });
  });

  it('records an include when ticking an event the scope misses', async () => {
    useShareStore.setState({ shares: [share('s1', { scopeMode: 'manual' })] });
    const onChange = vi.fn();
    render(<EventSharePicker eventType={undefined} shareInclude={undefined} shareExclude={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith({ shareInclude: ['s1'], shareExclude: undefined });
  });

  it('stores no override when the choice already matches the scope', async () => {
    // Re-ticking something the scope covers should clear the exclude, not write
    // an include — otherwise widening the share later would skip this event.
    useShareStore.setState({ shares: [share('s1', { scopeMode: 'all' })] });
    const onChange = vi.fn();
    render(<EventSharePicker eventType={undefined} shareInclude={undefined} shareExclude={['s1']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith({ shareInclude: undefined, shareExclude: undefined });
  });

  it('an explicit include beats a scope that would exclude it', () => {
    useShareStore.setState({
      shares: [share('s1', { scopeMode: 'categories', categories: ['Holiday'] })],
    });
    render(<EventSharePicker eventType="Work" shareInclude={['s1']} shareExclude={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('just this event')).toBeInTheDocument();
  });
});
