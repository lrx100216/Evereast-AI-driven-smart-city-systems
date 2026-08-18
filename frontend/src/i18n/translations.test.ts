import { describe, it, expect } from 'vitest';
import { zh } from './zh';
import { en } from './en';

describe('i18n translations', () => {
  it('zh and en should have the same top-level keys', () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('zh and en should have matching nested key structure for nav', () => {
    expect(Object.keys(zh.nav).sort()).toEqual(Object.keys(en.nav).sort());
  });

  it('zh and en should have matching nested key structure for dashboard', () => {
    expect(Object.keys(zh.dashboard).sort()).toEqual(Object.keys(en.dashboard).sort());
  });

  it('zh and en should have matching nested key structure for traffic', () => {
    expect(Object.keys(zh.traffic).sort()).toEqual(Object.keys(en.traffic).sort());
  });

  it('zh and en should have matching nested key structure for drone', () => {
    expect(Object.keys(zh.traffic.drone).sort()).toEqual(Object.keys(en.traffic.drone).sort());
  });

  it('zh and en should have matching nested key structure for energy', () => {
    expect(Object.keys(zh.energy).sort()).toEqual(Object.keys(en.energy).sort());
  });

  it('zh and en should have matching nested key structure for weather', () => {
    expect(Object.keys(zh.weather).sort()).toEqual(Object.keys(en.weather).sort());
  });

  it('zh and en should have matching nested key structure for about', () => {
    expect(Object.keys(zh.about).sort()).toEqual(Object.keys(en.about).sort());
  });

  it('zh and en should have matching nested key structure for ai', () => {
    expect(Object.keys(zh.ai).sort()).toEqual(Object.keys(en.ai).sort());
  });

  it('zh and en should have matching nested key structure for status', () => {
    expect(Object.keys(zh.status).sort()).toEqual(Object.keys(en.status).sort());
  });

  it('zh and en should have matching nested key structure for trafficSystem', () => {
    expect(Object.keys(zh.trafficSystem).sort()).toEqual(Object.keys(en.trafficSystem).sort());
  });

  it('zh and en should have matching nested key structure for marl', () => {
    expect(Object.keys(zh.marl).sort()).toEqual(Object.keys(en.marl).sort());
  });

  it('zh and en should have matching nested key structure for whatIf', () => {
    expect(Object.keys(zh.whatIf).sort()).toEqual(Object.keys(en.whatIf).sort());
  });

  it('zh and en should have matching nested key structure for joint', () => {
    expect(Object.keys(zh.joint).sort()).toEqual(Object.keys(en.joint).sort());
  });

  it('zh and en should have matching nested key structure for privacy', () => {
    expect(Object.keys(zh.privacy).sort()).toEqual(Object.keys(en.privacy).sort());
  });

  it('all translation values should be non-empty strings', () => {
    function checkValues(obj: Record<string, any>, path: string) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object') {
          checkValues(value, `${path}.${key}`);
        } else {
          expect(value, `${path}.${key} should be non-empty`).toBeTruthy();
        }
      }
    }
    checkValues(zh, 'zh');
    checkValues(en, 'en');
  });
});
