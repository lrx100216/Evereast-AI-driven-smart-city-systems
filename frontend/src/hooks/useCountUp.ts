/**
 * 【模块说明】useCountUp — 数字跳动动画 Hook
 * Module: useCountUp — Animated number counter hook
 *
 * 【功能】让数字从 0 平滑跳动到目标值，仅第一次挂载时播放动画；后续目标变化直接跳变
 * Function: Animates a number from 0 to target on first mount only; subsequent target changes jump instantly.
 *
 * 【核心逻辑】使用 requestAnimationFrame + ease-out cubic 缓动曲线
 * Core Logic: Uses requestAnimationFrame with an ease-out cubic easing curve.
 *
 * 【用法】const value = useCountUp(target, duration, enabled);
 * Usage: const value = useCountUp(target, duration, enabled);
 *
 * 【参数】
 * Parameters:
 *   target   : 目标数值 (target number)
 *   duration : 动画时长(ms)，默认 1500 (animation duration in ms, default 1500)
 *   enabled  : 是否启用动画，默认 true (whether to enable animation, default true)
 *
 * 【返回值】当前动画帧的整数数值
 * Returns: The current animated integer value.
 */

import { useEffect, useState, useRef } from 'react';

export function useCountUp(target: number, duration = 1500, enabled = true) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    // Only animate from 0 on the first completed run; afterwards jump directly.
    if (hasAnimated.current) {
      setValue(target);
      return;
    }

    startTime.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        hasAnimated.current = true; // mark only after animation fully completes
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, enabled]);

  return value;
}
