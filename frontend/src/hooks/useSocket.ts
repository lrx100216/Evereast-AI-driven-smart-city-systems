/**
 * useSocket — 硬件数据 WebSocket 连接 Hook
 *
 * 通过共享 Socket.IO 连接监听 hardware:data 事件。
 * sendCommand 使用独立的一次性 emit（不干扰共享连接的 refCount）。
 */

import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { HardwareData } from '../types';
import { getSharedSocket, releaseSharedSocket, getExistingSocket } from '../socket';
import { SOCKET_URL } from '../config';

export function useSocket(onData: (data: HardwareData) => void) {
  const cbRef = useRef(onData);
  cbRef.current = onData; // always latest callback without re-connecting

  useEffect(() => {
    const socket = getSharedSocket();
    const handler = (data: HardwareData) => cbRef.current(data);
    socket.on('hardware:data', handler);
    return () => {
      socket.off('hardware:data', handler);
      releaseSharedSocket();
    };
  }, []); // connect once, stable ref for callback

  /**
   * sendCommand — 向服务器发送指令
   *
   * 优先复用现有共享 socket（不增减 refCount），
   * 无活跃连接时使用一次性临时连接，避免竞态问题。
   */
  const sendCommand = useCallback((event: string, data: unknown) => {
    const existing = getExistingSocket();
    if (existing?.connected) {
      // 有活跃共享连接，直接用（不改变 refCount）
      existing.emit(event, data);
    } else {
      // 无活跃连接：创建临时 socket，emit 后立即断开
      const tempSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: false,
      });
      tempSocket.once('connect', () => {
        tempSocket.emit(event, data);
        tempSocket.disconnect();
      });
      tempSocket.once('connect_error', () => {
        tempSocket.disconnect();
      });
    }
  }, []);

  return { sendCommand };
}
