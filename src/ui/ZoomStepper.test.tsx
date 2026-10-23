import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomStepper } from './ZoomStepper';

describe('ZoomStepper', () => {
  it('shows the rounded percentage', () => {
    render(<ZoomStepper value={1} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}} fitDisabled={false} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('fires zoom in/out/fit', async () => {
    const onZoomIn = vi.fn(), onZoomOut = vi.fn(), onFit = vi.fn();
    render(<ZoomStepper value={0.8} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFit={onFit} fitDisabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fit to width' }));
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onFit).toHaveBeenCalledOnce();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('disables fit when already fitted', () => {
    render(<ZoomStepper value={1} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}} fitDisabled />);
    expect(screen.getByRole('button', { name: 'Fit to width' })).toBeDisabled();
  });
});
