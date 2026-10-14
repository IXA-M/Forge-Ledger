import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe('application shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders the dashboard and opens the project form', () => {
    act(() => root.render(<App />));

    expect(container.textContent).toContain('Albion Forge Ledger');
    expect(container.textContent).toContain('No crafting projects yet');
    expect(container.textContent).toContain('Buy Orders');

    const newProjectButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('New project'));
    expect(newProjectButton).toBeDefined();

    act(() => newProjectButton?.click());
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label'))
      .toBe('Plan a crafting project');

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click());
    act(() => [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Buy Orders')?.click());
    expect(container.textContent).toContain('Buy order fulfillment');
    expect(container.textContent).toContain('Material Shortages');

    act(() => [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Settings')?.click());
    expect(container.textContent).toContain('Price source & freshness');
    expect(container.textContent).toContain('Protect project progress');
  });
});
