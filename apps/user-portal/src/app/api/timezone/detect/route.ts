import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get client IP from request headers
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || '';

    // Use worldtimeapi.org to detect timezone from IP
    const response = await fetch('https://worldtimeapi.org/api/ip');
    
    if (!response.ok) {
      throw new Error('Failed to detect timezone');
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      timezone: data.timezone,
      utcOffset: data.utc_offset,
    });
  } catch (error) {
    console.error('Error detecting timezone:', error);
    // Return default timezone if detection fails
    return NextResponse.json({
      timezone: 'Africa/Johannesburg',
      utcOffset: '+02:00',
    });
  }
}

