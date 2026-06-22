import { NextResponse } from 'next/server'

export const revalidate = 900

export async function GET() {
  try {
    const response = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=38.8884&longitude=-89.7312&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America%2FChicago',
      { next: { revalidate: 900 } },
    )

    if (!response.ok) throw new Error('Weather unavailable')

    const data = await response.json()
    return NextResponse.json({
      temperature: Math.round(data.current.temperature_2m),
      code: data.current.weather_code,
    })
  } catch {
    return NextResponse.json({ error: 'Weather unavailable' }, { status: 503 })
  }
}
