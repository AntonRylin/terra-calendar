import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown } from './Dropdown';

const options = [
  { value: 'continuous', label: 'Continuous', hint: 'C' },
  { value: 'separate', label: 'Months', hint: 'M' },
];

describe('Dropdown', () => {
  it('shows the current option label on the trigger', () => {
    render(<Dropdown value="continuous" options={options} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Continuous/ })).toBeInTheDocument();
  });

  it('opens the menu and selects an option', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="continuous" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Continuous/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Months/ }));
    expect(onChange).toHaveBeenCalledWith('separate');
  });

  it('marks the active option as checked', async () => {
    render(<Dropdown value="separate" options={options} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Months/ }));
    expect(screen.getByRole('menuitem', { name: /Months/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('selects an option by its hint key while the menu is open', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="continuous" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Continuous/ }));
    await userEvent.keyboard('m');
    expect(onChange).toHaveBeenCalledWith('separate');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ignores hint keys while the menu is closed', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="continuous" options={options} onChange={onChange} />);
    await userEvent.keyboard('m');
    expect(onChange).not.toHaveBeenCalled();
  });
});
