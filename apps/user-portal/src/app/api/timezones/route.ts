import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://worldtimeapi.org/api/timezone');
    
    if (!response.ok) {
      throw new Error('Failed to fetch timezones');
    }
    
    const timezones = await response.json();
    
    return NextResponse.json({ timezones });
  } catch (error) {
    console.error('Error fetching timezones:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timezones' },
      { status: 500 }
    );
  }
}

