import { describe, it, expect, vi } from 'vitest';
import { setupSocketHandlers } from './socketHandlers';

function createMockIO() {
  const events: Record<string, any[]> = {};
  const sockets: any[] = [];

  const mockIO = {
    on: vi.fn((event: string, handler: (socket: any) => void) => {
      if (event === 'connection') {
        // Store handler for later invocation
        mockIO._connectionHandler = handler;
      }
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      if (!events[event]) events[event] = [];
      events[event].push(args);
    }),
    _connectionHandler: null as ((socket: any) => void) | null,
    _events: events,
    _sockets: sockets,
  };

  return mockIO;
}

function createMockSocket(id = 'test-socket-1') {
  const listeners: Record<string, any[]> = {};
  return {
    id,
    on: vi.fn((event: string, handler: any) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    emit: vi.fn(),
    _trigger: (event: string, data: any) => {
      (listeners[event] || []).forEach((h) => h(data));
    },
  };
}

describe('socketHandlers', () => {
  it('should set up connection handler', () => {
    const mockIO = createMockIO();
    setupSocketHandlers(mockIO as any);
    expect(mockIO.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('should forward traffic signal command to all clients', () => {
    const mockIO = createMockIO();
    setupSocketHandlers(mockIO as any);

    const mockSocket = createMockSocket();
    mockIO._connectionHandler!(mockSocket);

    mockSocket._trigger('command:traffic:signal', {
      intersectionId: 'cross-1',
      greenDuration: 35,
      redDuration: 25,
    });

    expect(mockIO.emit).toHaveBeenCalledWith('hardware:command', {
      intersectionId: 'cross-1',
      greenDuration: 35,
      redDuration: 25,
      type: 'signal',
    });
  });

  it('should forward solar panel command to all clients', () => {
    const mockIO = createMockIO();
    setupSocketHandlers(mockIO as any);

    const mockSocket = createMockSocket();
    mockIO._connectionHandler!(mockSocket);

    mockSocket._trigger('command:energy:panel', { angle: 75 });

    expect(mockIO.emit).toHaveBeenCalledWith('hardware:command', {
      angle: 75,
      type: 'panel',
    });
  });

  it('should handle multiple socket connections', () => {
    const mockIO = createMockIO();
    setupSocketHandlers(mockIO as any);

    const socket1 = createMockSocket('s1');
    const socket2 = createMockSocket('s2');

    mockIO._connectionHandler!(socket1);
    mockIO._connectionHandler!(socket2);

    // Both sockets should have registered listeners
    expect(socket1.on).toHaveBeenCalledTimes(3); // command:traffic:signal, command:energy:panel, disconnect
    expect(socket2.on).toHaveBeenCalledTimes(3);
  });
});
