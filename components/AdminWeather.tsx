'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  RefreshCw,
  Snowflake,
  Sun,
  ThermometerSun,
  Umbrella,
  Wind,
} from 'lucide-react'

type WeatherData = {
  location: string
  updatedAt: string
  current: {
    temperature: number
    feelsLike: number
    humidity: number
    precipitation: number
    weatherCode: number
    windSpeed: number
    windGusts: number
  }
  hourly: Array<{
    time: string
    temperature: number
    rainChance: number
    weatherCode: number
  }>
  daily: Array<{
    date: string
    weatherCode: number
    high: number
    low: number
    rainChance: number
    windSpeed: number
    sunrise: string
    sunset: string
  }>
}

function condition(code: number) {
  if (code === 0) return { label: 'Clear skies', Icon: Sun }
  if (code <= 2) return { label: 'Partly cloudy', Icon: CloudSun }
  if (code === 3 || code === 45 || code === 48) return { label: 'Cloudy', Icon: Cloud }
  if (code >= 95) return { label: 'Storms possible', Icon: CloudLightning }
  if (code >= 71 && code <= 77) return { label: 'Snow showers', Icon: Snowflake }
  if (code >= 51 && code <= 82) return { label: 'Rain showers', Icon: CloudRain }
  return { label: 'Changing conditions', Icon: CloudSun }
}

export function AdminWeatherNow() {
  const [current, setCurrent] = useState<{ temperature: number; weatherCode: number } | null>(null)

  useEffect(() => {
    let active = true

    fetch('/api/weather', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Weather unavailable')
        return response.json()
      })
      .then((weather) => {
        if (active) setCurrent(weather.current)
      })
      .catch(() => {
        if (active) setCurrent(null)
      })

    return () => {
      active = false
    }
  }, [])

  if (!current) {
    return <span className="admin-weather-nowline"><CloudSun size={15} /> Weather loading…</span>
  }

  const currentCondition = condition(current.weatherCode)
  const CurrentIcon = currentCondition.Icon

  return (
    <span className="admin-weather-nowline" aria-label={`Current weather: ${current.temperature} degrees and ${currentCondition.label}`}>
      <CurrentIcon size={16} /> {current.temperature}° · {currentCondition.label}
    </span>
  )
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric' })
}

function dayName(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isWeekend(value: string) {
  const day = new Date(`${value}T12:00:00`).getDay()
  return day === 0 || day === 6
}

function operationsNote(weather: WeatherData) {
  const today = weather.daily[0]
  const nextSixHoursRain = Math.max(...weather.hourly.slice(0, 6).map((hour) => hour.rainChance), 0)
  const stormy = weather.current.weatherCode >= 95 || today?.weatherCode >= 95
  const windy = weather.current.windSpeed >= 20 || weather.current.windGusts >= 30 || today?.windSpeed >= 22
  const hot = weather.current.feelsLike >= 90 || today?.high >= 90
  const wet = nextSixHoursRain >= 60 || today?.rainChance >= 60

  if (stormy) {
    return {
      tone: 'storm',
      title: 'Watch for storm interruptions',
      detail: 'Good day to keep an eye on alerts, gate traffic, outdoor events, and maintenance work around trees or electric.',
    }
  }

  if (windy) {
    return {
      tone: 'wind',
      title: 'Secure loose campground items',
      detail: 'Wind is high enough to watch flags, awnings, signs, canopies, and lightweight furniture around common areas.',
    }
  }

  if (wet) {
    return {
      tone: 'rain',
      title: 'Rain could affect arrivals',
      detail: 'Consider messaging campers about roads, umbrellas, wet-site setup, and indoor event backup plans.',
    }
  }

  if (hot) {
    return {
      tone: 'heat',
      title: 'Heat planning day',
      detail: 'A good time to remind campers about water, shade, pets, and checking electric load during the afternoon.',
    }
  }

  return {
    tone: 'good',
    title: 'Good campground operating weather',
    detail: 'Comfortable conditions for arrivals, outdoor work, events, and weekend camper activity.',
  }
}

export default function AdminWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function loadWeather() {
    setLoading(true)
    setError(false)

    try {
      const response = await fetch('/api/weather', { cache: 'no-store' })
      if (!response.ok) throw new Error('Weather unavailable')
      setWeather(await response.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWeather()
  }, [])

  const weekend = useMemo(
    () => weather?.daily.filter((day) => isWeekend(day.date)).slice(0, 2) || [],
    [weather],
  )

  if (loading) {
    return (
      <section className="admin-weather-card admin-weather-loading">
        <RefreshCw className="admin-weather-spin" size={22} />
        <span>Loading campground weather…</span>
      </section>
    )
  }

  if (error || !weather) {
    return (
      <section className="admin-weather-card admin-weather-error">
        <AlertTriangle size={24} />
        <div>
          <strong>Weather temporarily unavailable</strong>
          <span>Refresh again in a moment.</span>
        </div>
        <button type="button" onClick={loadWeather}>Try again</button>
      </section>
    )
  }

  const CurrentIcon = condition(weather.current.weatherCode).Icon
  const note = operationsNote(weather)

  return (
    <section className="admin-weather-card" aria-label="Admin campground weather">
      <div className="admin-weather-heading">
        <div>
          <span><CloudSun size={15} /> LIVE CAMPGROUND WEATHER</span>
          <h2>Weather & operations</h2>
          <p>
            {weather.location} · Updated{' '}
            {new Date(weather.updatedAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
        <button type="button" onClick={loadWeather}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="admin-weather-grid">
        <article className="admin-weather-now">
          <span className="admin-weather-current-icon"><CurrentIcon size={38} /></span>
          <div>
            <small>Right now</small>
            <strong>{weather.current.temperature}°</strong>
            <em>{condition(weather.current.weatherCode).label}</em>
          </div>
        </article>

        <article className={`admin-weather-note ${note.tone}`}>
          <span><AlertTriangle size={18} /></span>
          <div>
            <small>Staff note</small>
            <strong>{note.title}</strong>
            <p>{note.detail}</p>
          </div>
        </article>

        <div className="admin-weather-metrics">
          <span><ThermometerSun size={15} /> Feels {weather.current.feelsLike}°</span>
          <span><Droplets size={15} /> Humidity {weather.current.humidity}%</span>
          <span><Wind size={15} /> Wind {weather.current.windSpeed} mph</span>
          <span><Umbrella size={15} /> Rain now {weather.current.precipitation.toFixed(2)} in</span>
        </div>
      </div>

      <div className="admin-weather-bottom">
        <div className="admin-weather-hours">
          {weather.hourly.slice(0, 6).map((hour, index) => {
            const HourIcon = condition(hour.weatherCode).Icon
            return (
              <article key={hour.time}>
                <small>{index === 0 ? 'Now' : shortTime(hour.time)}</small>
                <HourIcon size={18} />
                <strong>{hour.temperature}°</strong>
                <span>{hour.rainChance}% rain</span>
              </article>
            )
          })}
        </div>

        <div className="admin-weather-weekend">
          {weekend.map((day) => {
            const DayIcon = condition(day.weatherCode).Icon
            return (
              <article key={day.date}>
                <div>
                  <small>{dayName(day.date)} · {dateLabel(day.date)}</small>
                  <strong>{day.high}° / {day.low}°</strong>
                </div>
                <DayIcon size={22} />
                <span>{day.rainChance}% rain</span>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
