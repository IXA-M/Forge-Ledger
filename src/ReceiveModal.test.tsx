import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiveModal } from './features/dialogs/PlannerDialogs';
import type { BuyOrder } from './domain';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe('buy order receipt modal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('adds the full unreceived remainder after an earlier partial receipt', () => {
    const order: BuyOrder = {
      id: 'order-1', projectId: 'project-1', materialId: 'T4_BAG', materialName: "Adept's Bag",
      city: 'Martlock', unitPrice: 1200, quantity: 100, fulfilled: 60, received: 40,
      placedAt: '2026-10-14', notes: '', mode: 'Active', cancelled: false, archived: false,
    };
    const onSave = vi.fn();

    act(() => root.render(<ReceiveModal order={order} onClose={() => {}} onSave={onSave} />));
    const addAllButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Add all 60 remaining as bought'));

    expect(addAllButton).toBeDefined();
    act(() => addAllButton?.click());

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toBe(60);
    expect(onSave.mock.calls[0][1]).toBe(1200);
  });
});
