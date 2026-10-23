import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolbarButton } from './ToolbarButton';

describe('ToolbarButton', () => {
  it('renders a labeled text button and fires onClick', async () => {
    const onClick = vi.fn();
    render(<ToolbarButton onClick={onClick}>Today</ToolbarButton>);
    const btn = screen.getByRole('button', { name: 'Today' });
    expect(btn).toHaveClass('tb', 'tb-text');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders an icon-only button using aria-label and marks active', () => {
    render(
      <ToolbarButton variant="icon" aria-label="Fit" active>
        <svg />
      </ToolbarButton>,
    );
    const btn = screen.getByRole('button', { name: 'Fit' });
    expect(btn).toHaveClass('tb', 'tb-icon', 'is-active');
  });

  it('respects disabled', () => {
    render(<ToolbarButton disabled>Today</ToolbarButton>);
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });
});
