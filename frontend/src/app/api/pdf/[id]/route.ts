import { NextRequest, NextResponse } from 'next/server';
import { getPdfFromCache } from '@/lib/pdf-cache';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const params = await context.params;
  const { id } = params;

  if (!id) {
    return new NextResponse('Missing PDF ID', { status: 400 });
  }

  const buffer = getPdfFromCache(id);
  if (!buffer) {
    return new NextResponse('PDF not found or expired', { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="deed.pdf"',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
