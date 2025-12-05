import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { timezone: string } }
) {
  try {
    const { timezone } = params;
    
    if (!timezone) {
      return NextResponse.json(
        { error: 'Timezone parameter is required' },
        { status: 400 }
      );
    }

    // Fetch timezone details from worldtimeapi.org
    const response = await fetch(`https://worldtimeapi.org/api/timezone/${timezone}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch timezone details');
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      timezone: data.timezone,
      utcOffset: data.utc_offset,
      abbreviation: data.abbreviation,
      datetime: data.datetime,
    });
  } catch (error) {
    console.error('Error fetching timezone details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timezone details' },
      { status: 500 }
    );
  }
}

