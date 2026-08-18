import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountUp } from './useCountUp';

describe('useCountUp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start at 0', () => {
    const { result } = renderHook(() => useCountUp(100, 1000, true));
    expect(result.current).toBe(0);
  });

  it('should animate to target value', () => {
    const { result } = renderHook(() => useCountUp(100, 1000, true));

    // Advance time by 500ms (halfway, with cubic easing)
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const value = result.current;
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });

  it('should reach target after duration', () => {
    const { result } = renderHook(() => useCountUp(100, 1000, true));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(100);
  });

  it('should return target immediately when disabled', () => {
    const { result } = renderHook(() => useCountUp(42, 1000, false));
    expect(result.current).toBe(42);
  });

  it('should handle zero target', () => {
    const { result } = renderHook(() => useCountUp(0, 1000, true));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(0);
  });

  it('should animate only on the first run, then jump directly', async () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, 100, true),
      { initialProps: { target: 100 } }
    );

    // First run: starts at 0
    expect(result.current).toBe(0);

    // Complete first animation — run all pending timers (including rAF)
    await act(async () => {
      vi.runAllTimers();
    });
    expect(result.current).toBe(100);

    // Change target — should jump directly without re-animating from 0
    rerender({ target: 200 });
    expect(result.current).toBe(200);

    // Another change — still direct
    rerender({ target: 50 });
    expect(result.current).toBe(50);
  });

  it('should not re-animate when target changes during first animation', async () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, 100, true),
      { initialProps: { target: 100 } }
    );

    // Halfway through first animation
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    const midValue = result.current;
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(100);

    // Change target before first completes — should restart from 0 and still animate
    rerender({ target: 200 });
    // It should still be animating (hasAnimated not set yet)
    expect(result.current).toBeLessThanOrEqual(200);

    // Complete the animation
    await act(async () => {
      vi.runAllTimers();
    });
    expect(result.current).toBe(200);

    // Now hasAnimated is true — next change should jump
    rerender({ target: 300 });
    expect(result.current).toBe(300);
  });
});
