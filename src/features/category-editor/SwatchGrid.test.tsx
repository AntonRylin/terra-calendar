import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwatchGrid } from './SwatchGrid';
import { buildGallery } from './presets';

const customs = [{ name: 'Custom 1', color1: '#22d3ee', color2: '#818cf8' }];

function setup(over: Partial<React.ComponentProps<typeof SwatchGrid>> = {}) {
  const props = {
    mode: 'gradient' as const,
    designs: buildGallery('gradient', customs),
    selectedValue: 'linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff)',
    cosmeticsUnlocked: false,
    onSelect: vi.fn(),
    onSaveCustom: vi.fn(),
    onDeleteCustom: vi.fn(),
    ...over,
  };
  render(<SwatchGrid {...props} />);
  return props;
}

describe('SwatchGrid', () => {
  it('collapsed: 11 swatches + custom tile, names as accessible labels only', () => {
    setup();
    expect(screen.getAllByRole('button', { name: /^(?!New custom).+ gradient$/i })).toHaveLength(11);
    expect(screen.getByRole('button', { name: 'New custom gradient' })).toBeInTheDocument();
    expect(screen.queryByText('Ocean Breeze')).not.toBeInTheDocument(); // no visible names
    expect(screen.queryByRole('button', { name: /premium/ })).not.toBeInTheDocument(); // premium only in gallery
  });

  it('clicking a swatch reports its design', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Forest Vine gradient' }));
    expect(p.onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Forest Vine' }));
  });

  it('See all reveals groups incl. locked premium; premium is still clickable', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: /see all designs/i }));
    expect(screen.getByText('Your gradients')).toBeInTheDocument();
    expect(screen.getByText('Premium designs')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Neon Rush.*premium/i }));
    expect(p.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'neon-rush', premium: true }));
  });

  it('custom flow saves start/end via onSaveCustom', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'New custom gradient' }));
    const start = screen.getByLabelText('Start color');
    expect(start).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save gradient' }));
    expect(p.onSaveCustom).toHaveBeenCalled();
  });

  it('deleting a custom asks via onDeleteCustom', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: /see all designs/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Custom 1' }));
    expect(p.onDeleteCustom).toHaveBeenCalledWith('Custom 1');
  });
});
