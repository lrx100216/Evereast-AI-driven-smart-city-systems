import { describe, it, expect } from 'vitest';
import { API_URL, SOCKET_URL } from './config';

describe('config', () => {
  it('should export API_URL with /api suffix', () => {
    expect(API_URL).toBe('http://localhost:3001/api');
  });

  it('should export SOCKET_URL without /api suffix', () => {
    expect(SOCKET_URL).toBe('http://localhost:3001');
  });

  it('API_URL should contain SOCKET_URL', () => {
    expect(API_URL.startsWith(SOCKET_URL)).toBe(true);
  });
});
