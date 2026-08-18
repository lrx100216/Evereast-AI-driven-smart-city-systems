import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from './config';

let _socket: Socket | null = null;
let _refCount = 0;

export function getSharedSocket(): Socket {
  if (!_socket) {
    _socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
  }
  _refCount++;
  return _socket;
}

export function releaseSharedSocket(): void {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount === 0 && _socket) {
    _socket.disconnect();
    _socket = null;
  }
}

export function getExistingSocket(): Socket | null {
  return _socket;
}
