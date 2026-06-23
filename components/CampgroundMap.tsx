const campgroundAddress = '10303 Oaks Rd, Alhambra, IL 62001'
const encodedAddress = encodeURIComponent(campgroundAddress)
const latitude = 38.8884
const longitude = -89.7312
const aerialMapUrl = '/bur-oaks-aerial-map.svg'
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`
const satelliteUrl = `https://www.google.com/maps/@${latitude},${longitude},700m/data=!3m1!1e3`

export default function CampgroundMap({
  lotNumber,
  compact = false,
}: {
  lotNumber?: string | null
  compact?: boolean
}) {
  return (
    <div className={`campground-map ${compact ? 'compact' : ''}`}>
      <img
        alt="Aerial style view of Bur Oaks Campground"
        src={aerialMapUrl}
      />

      <div className="campground-map-overlay">
        <span>Aerial site view</span>
        <strong>Bur Oaks Campground</strong>
        <small>{campgroundAddress}</small>
        {lotNumber && <em>Your portal site: Lot {lotNumber}</em>}
      </div>

      <div className="campground-map-actions">
        <a href={directionsUrl} rel="noreferrer" target="_blank">Directions</a>
        <a href={satelliteUrl} rel="noreferrer" target="_blank">Satellite view</a>
      </div>

      <small className="campground-map-credit">Bur Oaks aerial-style map</small>
    </div>
  )
}
