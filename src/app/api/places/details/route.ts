import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('place_id');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  if (!placeId || !apiKey) {
    return NextResponse.json({ result: null });
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_components,formatted_address&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.result?.address_components) {
    return NextResponse.json({ result: null });
  }

  const components = data.result.address_components as { long_name: string; short_name: string; types: string[] }[];
  const get = (type: string) => components.find(c => c.types.includes(type));

  const streetNumber = get('street_number')?.long_name || '';
  const route = get('route')?.long_name || '';

  return NextResponse.json({
    result: {
      address: `${streetNumber} ${route}`.trim(),
      city: get('locality')?.long_name || get('sublocality')?.long_name || '',
      state: get('administrative_area_level_1')?.short_name || '',
      zip: get('postal_code')?.long_name || '',
    },
  });
}
