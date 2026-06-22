import { NextResponse } from 'next/server'

export const revalidate = 900

export async function GET() {
  try {
    const response = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=38.8884&longitude=-89.7312&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FChicago&forecast_days=10',
      { next: { revalidate: 900 } },
    )

    if (!response.ok) throw new Error('Weather unavailable')

    const data = await response.json()
    const currentHour = data.hourly.time.findIndex((time: string) => time >= data.current.time)
    const hourlyStart = currentHour < 0 ? 0 : currentHour

    return NextResponse.json({
      location: 'Alhambra, Illinois',
      updatedAt: new Date().toISOString(),
      temperature: Math.round(data.current.temperature_2m),
      code: data.current.weather_code,
      current: {
        temperature: Math.round(data.current.temperature_2m),
        feelsLike: Math.round(data.current.apparent_temperature),
        humidity: Math.round(data.current.relative_humidity_2m),
        precipitation: Number(data.current.precipitation || 0),
        weatherCode: data.current.weather_code,
        windSpeed: Math.round(data.current.wind_speed_10m),
        windGusts: Math.round(data.current.wind_gusts_10m),
      },
      hourly: data.hourly.time.slice(hourlyStart, hourlyStart + 12).map((time: string, index: number) => ({
        time,
        temperature: Math.round(data.hourly.temperature_2m[hourlyStart + index]),
        rainChance: Math.round(data.hourly.precipitation_probability[hourlyStart + index] || 0),
        weatherCode: data.hourly.weather_code[hourlyStart + index],
      })),
      daily: data.daily.time.map((date: string, index: number) => ({
        date,
        weatherCode: data.daily.weather_code[index],
        high: Math.round(data.daily.temperature_2m_max[index]),
        low: Math.round(data.daily.temperature_2m_min[index]),
        rainChance: Math.round(data.daily.precipitation_probability_max[index] || 0),
        windSpeed: Math.round(data.daily.wind_speed_10m_max[index] || 0),
        sunrise: data.daily.sunrise[index],
        sunset: data.daily.sunset[index],
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Weather unavailable' }, { status: 503 })
  }
}
