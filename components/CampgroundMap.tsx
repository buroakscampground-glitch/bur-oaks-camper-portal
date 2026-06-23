const campgroundAddress = '10303 Oaks Rd, Alhambra, IL 62001'
const encodedAddress = encodeURIComponent(campgroundAddress)
const latitude = 38.8884
const longitude = -89.7312
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`
const satelliteUrl = `https://www.google.com/maps/@${latitude},${longitude},700m/data=!3m1!1e3`
const satelliteTileBase = 'https://mt.google.com/vt/lyrs=s&z=17'
const satelliteTiles = [
  [50144, 32864],
  [50144, 32865],
  [50144, 32866],
  [50145, 32864],
  [50145, 32865],
  [50145, 32866],
  [50146, 32864],
  [50146, 32865],
  [50146, 32866],
]

export default function CampgroundMap({
  lotNumber,
  compact = false,
}: {
  lotNumber?: string | null
  compact?: boolean
}) {
  return (
    <div className={`campground-map ${compact ? 'compact' : ''}`}>
      <div className="campground-satellite-tiles" aria-label="Real satellite view of Bur Oaks Campground">
        {satelliteTiles.map(([row, column]) => (
          <img
            alt=""
            aria-hidden="true"
            key={`${row}-${column}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={`${satelliteTileBase}&x=${column}&y=${row}`}
          />
        ))}
      </div>

      <div className="campground-map-overlay">
        <span>Real satellite view</span>
        <strong>Bur Oaks Campground</strong>
        <small>{campgroundAddress}</small>
        {lotNumber && <em>Your portal site: Lot {lotNumber}</em>}
      </div>

      <div className="campground-map-actions">
        <a href={directionsUrl} rel="noreferrer" target="_blank">Directions</a>
        <a href={satelliteUrl} rel="noreferrer" target="_blank">Satellite view</a>
      </div>

      <small className="campground-map-credit">Satellite imagery © Google</small>
    </div>
  )
}
