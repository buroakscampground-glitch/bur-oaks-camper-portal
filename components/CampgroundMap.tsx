const campgroundAddress = '10303 Oaks Rd, Alhambra, IL 62001'
const encodedAddress = encodeURIComponent(campgroundAddress)
const mapEmbedUrl = `https://maps.google.com/maps?q=${encodedAddress}&t=k&z=16&output=embed`
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`

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
        title="Bur Oaks Campground satellite map"
        src={mapEmbedUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <div className="campground-map-overlay">
        <span>Satellite view</span>
        <strong>Bur Oaks Campground</strong>
        <small>{campgroundAddress}</small>
        {lotNumber && <em>Your portal site: Lot {lotNumber}</em>}
      </div>

      <a href={directionsUrl} rel="noreferrer" target="_blank">
        Open directions
      </a>
    </div>
  )
}
