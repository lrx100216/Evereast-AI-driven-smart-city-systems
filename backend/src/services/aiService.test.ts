import { describe, it, expect, beforeEach } from 'vitest';

// We don't test the actual DeepSeek API call in unit tests
// All tests here exercise the mock fallback mode

describe('aiService (mock mode)', () => {
  beforeEach(async () => {
    // Clear env so we always use mock mode
    delete process.env.DEEPSEEK_API_KEY;
    // Fresh import to reset cached advice
    vi.resetModules();
  });

  it('should generate mock advice without API key', async () => {
    const { getAIAdvice } = await import('./aiService');
    const advice = await getAIAdvice();

    expect(advice).toBeDefined();
    expect(advice.cached).toBe(false);
    expect(advice.timestamp).toBeDefined();
    expect(advice.overall).toBeDefined();
  });

  it('should return traffic advice with green/red durations in valid range', async () => {
    const { getAIAdvice } = await import('./aiService');
    const advice = await getAIAdvice();

    expect(advice.traffic).toBeDefined();
    expect(advice.traffic!.greenDuration).toBeGreaterThanOrEqual(10);
    expect(advice.traffic!.greenDuration).toBeLessThanOrEqual(60);
    expect(advice.traffic!.redDuration).toBeGreaterThanOrEqual(10);
    expect(advice.traffic!.redDuration).toBeLessThanOrEqual(60);
    expect(advice.traffic!.reasoning).toBeTruthy();
  });

  it('should return energy advice with valid strategy', async () => {
    const { getAIAdvice } = await import('./aiService');
    const advice = await getAIAdvice();

    expect(advice.energy).toBeDefined();
    expect(['store', 'release', 'idle']).toContain(advice.energy!.strategy);
    expect(advice.energy!.panelAngle).toBeGreaterThanOrEqual(0);
    expect(advice.energy!.panelAngle).toBeLessThanOrEqual(180);
    expect(advice.energy!.reasoning).toBeTruthy();
  });

  it('should cache advice within CACHE_TTL', async () => {
    const mod = await import('./aiService');
    const first = await mod.getAIAdvice();
    expect(first.cached).toBe(false);

    const second = await mod.getAIAdvice();
    expect(second.cached).toBe(true);
  });

  it('should have status message with prefix', async () => {
    const { getAIAdvice } = await import('./aiService');
    const advice = await getAIAdvice();

    expect(advice.overall.length).toBeGreaterThan(0);
    const hasValidPrefix =
      advice.overall.includes('⚠️') ||
      advice.overall.includes('✅');
    expect(hasValidPrefix).toBe(true);
  });

  it('should fall back to mock when DeepSeek API key is invalid', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-bad-key';
    vi.resetModules();

    const mod = await import('./aiService');
    const advice = await mod.getAIAdvice();

    // Should still return valid mock advice
    expect(advice.traffic).toBeDefined();
    expect(advice.energy).toBeDefined();
    expect(advice.overall).toBeDefined();
  });
});
