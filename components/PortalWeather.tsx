'use client'

import { useEffect, useMemo, useState } from 'react'
import {
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
  if (code >= 95) return { label: 'Thunderstorms', Icon: CloudLightning }
  if (code >= 71 && code <= 77) return { label: 'Snow showers', Icon: Snowflake }
  if (code >= 51 && code <= 82) {
    return { label: 'Rain showers', Icon: CloudRain }
  }
  return { label: 'Changing conditions', Icon: CloudSun }
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric' })
}

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function isWeekend(value: string) {
  const day = new Date(`${value}T12:00:00`).getDay()
  return day === 0 || day === 6
}

function campingOutlook(days: WeatherData['daily']) {
  const weekend = days.filter((day) => isWeekend(day.date)).slice(0, 2)
  const focus = weekend.length ? weekend : days.slice(0, 2)
  const rain = Math.max(...focus.map((day) => day.rainChance), 0)
  const wind = Math.max(...focus.map((day) => day.windSpeed), 0)
  const high = Math.max(...focus.map((day) => day.high), 0)

  if (rain >= 70) {
    return {
      title: 'Pack for a wet weekend',
      detail: 'Rain looks likely. Bring canopies, dry firewood, and a backup indoor plan.',
      tone: 'rain',
    }
  }
  if (wind >= 22) {
    return {
      title: 'Breezy camping weather',
      detail: 'Secure awnings, flags, and lightweight furniture before settling in.',
      tone: 'wind',
    }
  }
  if (high >= 90) {
    return {
      title: 'A hot weekend ahead',
      detail: 'Plan for shade, plenty of water, and cooler activities during the afternoon.',
      tone: 'heat',
    }
  }
  if (rain <= 30) {
    return {
      title: 'A promising camping weekend',
      detail: 'Conditions look comfortable for campfires, outdoor meals, and time by the water.',
      tone: 'good',
    }
  }
  return {
    title: 'Keep an eye on the sky',
    detail: 'Mostly camp-friendly, with a chance of changing conditions. Pack a light rain layer.',
    tone: 'mixed',
  }
}

export default function PortalWeather() {
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
  const outlook = weather ? campingOutlook(weather.daily) : null

  if (loading) {
    return (
      <section className="portal-weather portal-weather-loading" aria-label="Loading campground weather">
        <RefreshCw className="portal-weather-spin" size={24} />
        <span>Checking the latest campground forecast…</span>
      </section>
    )
  }

  if (error || !weather) {
    return (
      <section className="portal-weather portal-weather-error" aria-label="Campground weather unavailable">
        <CloudSun size={28} />
        <div>
          <strong>Forecast temporarily unavailable</strong>
          <span>Please check again in a moment.</span>
        </div>
        <button type="button" onClick={loadWeather}>Try again</button>
      </section>
    )
  }

  const CurrentIcon = condition(weather.current.weatherCode).Icon

  return (
    <section className="portal-weather" aria-labelledby="campground-weather-title">
      <div className="portal-weather-heading">
        <div>
          <span className="portal-weather-kicker"><CloudSun size={15} /> LIVE CAMPGROUND WEATHER</span>
          <h2 id="campground-weather-title">Plan your next trip to Bur Oaks</h2>
          <p>{weather.location} · Updated {new Date(weather.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
        <button type="button" className="portal-weather-refresh" onClick={loadWeather} aria-label="Refresh weather">
          <RefreshCw size={17} /> Refresh
        </button>
      </div>

      <div className="portal-weather-layout">
        <article className="portal-current-weather">
          <div className="portal-current-main">
            <span className="portal-current-icon"><CurrentIcon size={42} /></span>
            <div>
              <strong>{weather.current.temperature}°</strong>
              <span>{condition(weather.current.weatherCode).label}</span>
            </div>
          </div>
          <div className="portal-current-details">
            <span><ThermometerSun size={15} /> Feels like {weather.current.feelsLike}°</span>
            <span><Droplets size={15} /> Humidity {weather.current.humidity}%</span>
            <span><Wind size={15} /> Wind {weather.current.windSpeed} mph</span>
            <span><Umbrella size={15} /> Rain now {weather.current.precipitation.toFixed(2)} in</span>
          </div>
        </article>

        <div className="portal-hourly-weather">
          <div className="portal-weather-subheading">
            <strong>Next several hours</strong>
            <span>Rain chance</span>
          </div>
          <div className="portal-hourly-scroll">
            {weather.hourly.slice(0, 8).map((hour, index) => {
              const HourIcon = condition(hour.weatherCode).Icon
              return (
                <article key={hour.time}>
                  <small>{index === 0 ? 'Now' : shortTime(hour.time)}</small>
                  <HourIcon size={21} />
                  <strong>{hour.temperature}°</strong>
                  <span><Droplets size={11} /> {hour.rainChance}%</span>
                </article>
              )
            })}
          </div>
        </div>
      </div>

      <div className="portal-weekend-row">
        <article className={`portal-camping-outlook ${outlook?.tone}`}>
          <span><TentWeatherIcon /></span>
          <div>
            <small>WEEKEND CAMPING OUTLOOK</small>
            <strong>{outlook?.title}</strong>
            <p>{outlook?.detail}</p>
          </div>
        </article>

        <div className="portal-weekend-days">
          {weekend.map((day) => {
            const DayIcon = condition(day.weatherCode).Icon
            return (
              <article key={day.date}>
                <div>
                  <small>{dayLabel(day.date)} · {dateLabel(day.date)}</small>
                  <strong>{condition(day.weatherCode).label}</strong>
                </div>
                <DayIcon size={28} />
                <div className="portal-weekend-temps">
                  <strong>{day.high}°</strong>
                  <span>{day.low}°</span>
                </div>
                <span className="portal-weekend-rain"><Droplets size={12} /> {day.rainChance}%</span>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function PortalWeatherMini() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function loadWeather() {
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

    loadWeather()
  }, [])

  if (loading) {
    return (
      <article className="portal-arrival-weather loading">
        <RefreshCw className="portal-weather-spin" size={18} />
        <span>Checking weather…</span>
      </article>
    )
  }

  if (error || !weather) {
    return (
      <article className="portal-arrival-weather">
        <CloudSun size={25} />
        <div>
          <small>Weather</small>
          <strong>Check soon</strong>
          <em>Forecast is updating.</em>
        </div>
      </article>
    )
  }

  const current = condition(weather.current.weatherCode)
  const CurrentIcon = current.Icon
  const today = weather.daily[0]
  const tomorrow = weather.daily[1]

  return (
    <article className="portal-arrival-weather">
      <div className="portal-arrival-weather-now">
        <span><CurrentIcon size={28} /></span>
        <div>
          <small>Right now at Bur Oaks</small>
          <strong>{weather.current.temperature}°</strong>
          <em>{current.label} · feels like {weather.current.feelsLike}°</em>
        </div>
      </div>

      <div className="portal-arrival-weather-grid">
        <span><Droplets size={13} /> Rain {today?.rainChance || 0}%</span>
        <span><Wind size={13} /> Wind {weather.current.windSpeed} mph</span>
        <span>Today {today ? `${today.high}° / ${today.low}°` : '—'}</span>
        <span>Tomorrow {tomorrow ? `${tomorrow.high}° / ${tomorrow.low}°` : '—'}</span>
      </div>

      <a href="#campground-weather-title">View full forecast</a>
    </article>
  )
}

function TentWeatherIcon() {
  return <CloudSun size={25} />
}
