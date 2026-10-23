import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../app/entitlementStore', () => ({
  useEntitlementStore: (sel: (s: { cosmeticsUnlocked: boolean }) => unknown) => sel({ cosmeticsUnlocked: false }),
}));
vi.mock('./confirmStore', () => ({ confirmDialog: vi.fn(async () => false) }));
const startCheckout = vi.fn(async (_k: string) => ({}));
vi.mock('../data/checkout', () => ({ startCheckout: (k: string) => startCheckout(k) }));

import { CosmeticSelector } from './CosmeticSelector';
import { ALL_COSMETICS_FREE } from '../core/cosmetics';

describe('CosmeticSelector gating', () => {
  beforeEach(() => vi.stubEnv('VITE_BILLING_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  // Skipped while the temporary ALL_COSMETICS_FREE promo is on — no swatch
  // renders locked. Re-activates unchanged when the flag flips back.
  (ALL_COSMETICS_FREE ? it.skip : it)('locks premium swatches and does not select them on click', () => {
    const onChange = vi.fn();
    const { container } = render(<CosmeticSelector value="" onChange={onChange} />);
    const locked = container.querySelector('.cosmetic-swatch.is-locked') as HTMLElement;
    expect(locked).toBeTruthy();
    fireEvent.click(locked);
    expect(onChange).not.toHaveBeenCalled();
  });

  (ALL_COSMETICS_FREE ? it : it.skip)('renders no locked swatches during the free-for-all', () => {
    const { container } = render(<CosmeticSelector value="" onChange={vi.fn()} />);
    expect(container.querySelector('.cosmetic-swatch.is-locked')).toBeNull();
  });

  it('selects a free swatch on click', () => {
    const onChange = vi.fn();
    const { container } = render(<CosmeticSelector value="" onChange={onChange} />);
    const free = container.querySelector(
      '.cosmetic-swatch:not(.cosmetic-none):not(.cosmetic-more):not(.is-locked)',
    ) as HTMLElement;
    fireEvent.click(free);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
