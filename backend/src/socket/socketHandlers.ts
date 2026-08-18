import { Server as SocketIOServer, Socket } from 'socket.io';

export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.on('command:traffic:signal', (data: { intersectionId: string; greenDuration: number; redDuration: number }) => {
      console.log('[Socket] Traffic signal command:', data);
      io.emit('hardware:command', { ...data, type: 'signal' });
    });

    socket.on('command:energy:panel', (data: { angle: number }) => {
      console.log('[Socket] Solar panel command:', data);
      io.emit('hardware:command', { ...data, type: 'panel' });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
