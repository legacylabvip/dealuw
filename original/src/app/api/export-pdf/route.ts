import { NextRequest, NextResponse } from 'next/server';
import { generateDealPDF } from '@/lib/generatePDF';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.subject?.address) {
      return NextResponse.json({ error: 'Subject data with address is required' }, { status: 400 });
    }

    const pdfBuffer = generateDealPDF(body);
    const address = (body.subject.address || 'deal').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="DealUW_${address}.pdf"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
