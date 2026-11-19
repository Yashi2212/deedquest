import type { PublicRoom } from '../src/game/types';

export const ROOM_TTL_SECONDS = 72 * 60 * 60;
export interface StoredRoom extends PublicRoom {
  auth: Record<string, string>;
  joinKey: string;
  joins: Record<string, string>;
  requests: Record<string, string[]>;
  botActedAt?: number;
}
export interface RoomStore {
  get(code: string): Promise<StoredRoom | null>;
  create(room: StoredRoom): Promise<boolean>;
  compareAndSwap(code: string, revision: number, room: StoredRoom): Promise<boolean>;
  rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

