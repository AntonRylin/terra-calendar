import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ExpandingSearch } from './ExpandingSearch';

function Harness() {
  const [q, setQ] = useState('');
  return <ExpandingSearch value={q} onChange={setQ} placeholder="Search events" />;
}

describe('ExpandingSearch', () => {
  it('is collapsed until the lupa is clicked, then focuses the input', async () => {
    render(<Harness />);
    const root = screen.getByTestId('expanding-search');
    expect(root).not.toHaveClass('is-open');
    await userEvent.click(screen.getByRole('button', { name: 'Search events' }));
    expect(root).toHaveClass('is-open');
    expect(screen.getByPlaceholderText('Search events')).toHaveFocus();
  });

  it('stays open while it has a value but collapses when emptied and blurred', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Search events' }));
    const input = screen.getByPlaceholderText('Search events');
    await userEvent.type(input, 'dentist');
    input.blur();
    expect(screen.getByTestId('expanding-search')).toHaveClass('is-open');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByTestId('expanding-search')).not.toHaveClass('is-open');
  });
});
