const campgroundAddress = '10303 Oaks Rd, Alhambra, IL 62001'
const encodedAddress = encodeURIComponent(campgroundAddress)
const latitude = 38.8884
const longitude = -89.7312
const mapEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=-89.7382%2C38.8838%2C-89.7242%2C38.8926&layer=mapnik&marker=${latitude}%2C${longitude}`
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`
const satelliteUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=Bur%20Oaks%20Campground`

export default function CampgroundMap({
  lotNumber,
  compact = false,
}: {
  lotNumber?: string | null
  compact?: boolean
}) {
  return (
    <div className={`campground-map ${compact ? 'compact' : ''}`}>
      <iframe
        title="Bur Oaks Campground map"
        src={mapEmbedUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <div className="campground-map-overlay">
        <span>Live map</span>
        <strong>Bur Oaks Campground</strong>
        <small>{campgroundAddress}</small>
        {lotNumber && <em>Your portal site: Lot {lotNumber}</em>}
      </div>

      <div className="campground-map-actions">
        <a href={directionsUrl} rel="noreferrer" target="_blank">Directions</a>
        <a href={satelliteUrl} rel="noreferrer" target="_blank">Satellite view</a>
      </div>
    </div>
  )
}
