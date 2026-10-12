import { next } from '@vercel/functions';
import { ARCHIVE_TEST_URL, archiveTestRequestBlock } from './api/_archive-test-client.js';
export const config = { matcher: '/api/:path*' };
export default function middleware(request) {
  const block = archiveTestRequestBlock(request);
  return block ? Response.json({ code: block.code }, { status: block.status, headers: { 'Cache-Control': 'no-store' } }) : next({ headers: { 'X-Proto-Archive-Test-Target': ARCHIVE_TEST_URL, 'X-Proto-Archive-Test-Mode': 'read-only' } });
}
