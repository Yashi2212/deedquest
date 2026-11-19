import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleRoomRequest } from '../server/handler.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleRoomRequest(req, res);
}
