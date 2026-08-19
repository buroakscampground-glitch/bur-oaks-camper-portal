'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentCamper, supabase } from '../../lib/supabase'
import { CakeSlice, CheckCircle2, ClipboardCheck, Eye, FileUp, PartyPopper, ShieldCheck, UsersRound } from 'lucide-react'
import AddressFinder from '../../components/AddressFinder'

export default function ProfilePage() {
  const router = useRouter()
  const [camper, setCamper] = useState<any>(null)
  const [insuranceDocuments, setInsuranceDocuments] = useState<any[]>([])
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null)
  const [uploadingInsurance, setUploadingInsurance] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [insuranceMessage, setInsuranceMessage] = useState('')
  const [currentLoginEmail, setCurrentLoginEmail] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    setCurrentLoginEmail(String(user.email || '').trim().toLowerCase())

    const data = await getCurrentCamper()

    setCamper(data)

    if (data?.id) {
      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('camper_id', data.id)
        .eq('document_type', 'Golf Cart Insurance')

      setInsuranceDocuments(documents || [])
    }

    setLoading(false)
  }

  async function saveProfile() {
    if (!camper) return

    setSaving(true)
    setMessage('')

    const primaryEmail = String(camper.email || '').trim().toLowerCase()
    const secondaryEmail = String(camper.secondary_email || '').trim().toLowerCase()
    const loginEmail = currentLoginEmail.trim().toLowerCase()

    if (!primaryEmail) {
      setSaving(false)
      setMessage('Please enter your primary email address.')
      return
    }

    if (loginEmail && primaryEmail !== loginEmail && secondaryEmail !== loginEmail) {
      setSaving(false)
      setMessage('For safety, keep your current login email in either Profile 1 email or Profile 2 email. The office can create a new portal login for a new email.')
      return
    }

    if (
      !String(camper.mailing_address_line1 || '').trim() ||
      !String(camper.mailing_city || '').trim() ||
      !String(camper.mailing_state || '').trim() ||
      !String(camper.mailing_zip || '').trim()
    ) {
      setSaving(false)
      setMessage('Please add your full mailing address. This is required so Bur Oaks can mail paper notices if needed.')
      return
    }

    const profileUpdates = {
      first_name: camper.first_name,
      last_name: camper.last_name,
      email: primaryEmail,
      secondary_email: secondaryEmail || null,
      phone: camper.phone,
      alternate_phone: camper.alternate_phone,
      second_profile_first_name: camper.second_profile_first_name,
      second_profile_last_name: camper.second_profile_last_name,
      second_profile_phone: camper.second_profile_phone,
      birthday: camper.birthday || null,
      second_profile_birthday: camper.second_profile_birthday || null,
      birthday_celebration_opt_in: Boolean(camper.birthday_celebration_opt_in),
      celebration_messages_opt_in: Boolean(camper.celebration_messages_opt_in),
      celebration_messages_opt_in_at: camper.celebration_messages_opt_in
        ? camper.celebration_messages_opt_in_at || new Date().toISOString()
        : null,
      event_reminders_opt_in: Boolean(camper.sms_opt_in),
      event_reminders_opt_in_at: camper.sms_opt_in
        ? camper.event_reminders_opt_in_at || new Date().toISOString()
        : null,
      mailing_address_line1: camper.mailing_address_line1,
      mailing_address_line2: camper.mailing_address_line2,
      mailing_city: camper.mailing_city,
      mailing_state: camper.mailing_state,
      mailing_zip: camper.mailing_zip,
      emergency_contact_name: camper.emergency_contact_name,
      emergency_contact_phone: camper.emergency_contact_phone,
      vehicle_make: camper.vehicle_make,
      vehicle_model: camper.vehicle_model,
      license_plate: camper.license_plate,
      vehicle_2_make: camper.vehicle_2_make,
      vehicle_2_model: camper.vehicle_2_model,
      vehicle_2_license_plate: camper.vehicle_2_license_plate,
      golf_cart_make: camper.golf_cart_make,
      golf_cart_color: camper.golf_cart_color,
      sms_opt_in: Boolean(camper.sms_opt_in),
      sms_opt_in_at: camper.sms_opt_in
        ? camper.sms_opt_in_at || new Date().toISOString()
        : null,
    }

    const { error } = await supabase
      .from('campers')
      .update({
        ...profileUpdates,
        directory_opt_in: Boolean(camper.directory_opt_in),
        directory_show_phone: Boolean(
          camper.directory_opt_in && camper.directory_show_phone
        ),
      })
      .eq('id', camper.id)

    if (error && /(directory_(opt_in|show_phone)|sms_opt_in|birthday|celebration_messages|event_reminders)/i.test(error.message)) {
      const {
        sms_opt_in,
        sms_opt_in_at,
        birthday,
        second_profile_birthday,
        birthday_celebration_opt_in,
        celebration_messages_opt_in,
        celebration_messages_opt_in_at,
        event_reminders_opt_in,
        event_reminders_opt_in_at,
        ...fallbackUpdates
      } = profileUpdates

      const { error: fallbackError } = await supabase
        .from('campers')
        .update(fallbackUpdates)
        .eq('id', camper.id)

      setMessage(
        fallbackError
          ? fallbackError.message
          : 'Profile saved. Birthday, personal greeting, event reminder, and directory preferences will be available after setup is complete.'
      )
    } else if (error) {
      setMessage(error.message)
    } else {
      setMessage('✅ Profile Updated Successfully')
    }

    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function uploadGolfCartInsurance() {
    if (!insuranceFile) {
      setInsuranceMessage('Choose your golf cart insurance file first.')
      return
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    setUploadingInsurance(true)
    setInsuranceMessage('Uploading your golf cart insurance…')

    const formData = new FormData()
    formData.append('file', insuranceFile)

    try {
      const response = await fetch('/api/upload-golf-cart-insurance', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        setInsuranceMessage(result.error || 'Unable to upload your insurance.')
        return
      }

      setInsuranceFile(null)
      setInsuranceDocuments((current) => [result.document, ...current])
      setInsuranceMessage('✅ Golf cart insurance uploaded successfully.')
    } catch {
      setInsuranceMessage('Unable to upload your insurance. Please try again.')
    } finally {
      setUploadingInsurance(false)
    }
  }

  async function openInsuranceDocument(documentId: string) {
    router.push(`/documents/view/${documentId}`)
  }

  if (loading) {
    return (
      <div style={{ padding: '40px' }}>
        Loading Profile...
      </div>
    )
  }

  if (!camper) {
    return (
      <div style={{ padding: '40px' }}>
        Unable to load profile.
      </div>
    )
  }

  const profileChecklist = [
    { label: 'Phone number', complete: Boolean(camper.phone) },
    { label: 'Second phone number', complete: Boolean(camper.alternate_phone || camper.second_profile_phone) },
    { label: 'Mailing address required', complete: Boolean(camper.mailing_address_line1 && camper.mailing_city && camper.mailing_state && camper.mailing_zip) },
    { label: 'Second profile optional', complete: Boolean(camper.second_profile_first_name || camper.secondary_email) },
    { label: 'Emergency contact', complete: Boolean(camper.emergency_contact_name && camper.emergency_contact_phone) },
    { label: 'Vehicle information', complete: Boolean(camper.vehicle_make && camper.vehicle_model && camper.license_plate) },
    { label: 'Directory choice', complete: camper.directory_opt_in !== null && camper.directory_opt_in !== undefined },
    { label: 'Text alert choice', complete: camper.sms_opt_in !== null && camper.sms_opt_in !== undefined },
    { label: 'Golf cart insurance optional', complete: true },
  ]
  const completeItems = profileChecklist.filter((item) => item.complete).length
  const completionPercent = Math.round((completeItems / profileChecklist.length) * 100)

  return (
    <main className="page">
      <div className="container">

        <section
          className="card"
          style={{
            marginBottom: '25px',
            background:
              'linear-gradient(135deg,#ffffff 0%,#eef4ea 100%)',
          }}
        >
          <p className="muted">BUR OAKS CAMPGROUND</p>

          <h1>
            👤 {camper.first_name} {camper.last_name}
          </h1>

          <h2 style={{ color: '#2f5d3a' }}>
            Lot {camper.lot_number}
          </h2>

          <p className="muted">
            Manage your camper information.
          </p>
        </section>

        <section className="card camper-profile-checkup" style={{ marginBottom: '25px' }}>
          <div className="camper-profile-checkup-heading">
            <span><ClipboardCheck size={22} /></span>
            <div>
              <small>PROFILE CHECKUP</small>
              <h2>{completionPercent}% complete</h2>
              <p className="muted">Complete information helps the office contact you quickly and keeps campground records launch-ready.</p>
            </div>
          </div>
          <div className="camper-profile-checklist">
            {profileChecklist.map((item) => (
              <span className={item.complete ? 'done' : ''} key={item.label}>
                {item.complete ? <CheckCircle2 size={16} /> : <i />}
                {item.label}
              </span>
            ))}
          </div>
        </section>

        <section className="card camper-birthday-profile-card" style={{ marginBottom: '25px' }}>
          <div className="camper-birthday-profile-heading">
            <span><CakeSlice size={23} /></span>
            <div>
              <small>BUR OAKS BIRTHDAY CLUB</small>
              <h2>Add your birthdays</h2>
              <p>We’ll celebrate the month and day in the camper portal. Your birth year always stays private.</p>
            </div>
            <PartyPopper size={30} />
          </div>

          <div className="camper-birthday-profile-grid">
            <label>
              <span>{camper.first_name || 'Profile 1'}’s birthday</span>
              <input
                type="date"
                value={camper.birthday || ''}
                onChange={(event) => setCamper({ ...camper, birthday: event.target.value })}
              />
              <small>Profile 1</small>
            </label>

            <label>
              <span>{camper.second_profile_first_name || 'Profile 2'}’s birthday</span>
              <input
                type="date"
                value={camper.second_profile_birthday || ''}
                onChange={(event) => setCamper({ ...camper, second_profile_birthday: event.target.value })}
              />
              <small>Optional second camper</small>
            </label>
          </div>

          <label className="camper-birthday-celebration-toggle">
            <input
              type="checkbox"
              checked={Boolean(camper.birthday_celebration_opt_in)}
              onChange={(event) =>
                setCamper({ ...camper, birthday_celebration_opt_in: event.target.checked })
              }
            />
            <span>
              <strong>Include us on the monthly birthday board</strong>
              <small>Other signed-in campers will see first name, last initial, lot, and birthday month/day. They will never see the birth year.</small>
            </span>
          </label>

          <label className="camper-birthday-celebration-toggle personal-greetings">
            <input
              type="checkbox"
              checked={Boolean(camper.celebration_messages_opt_in)}
              onChange={(event) =>
                setCamper({
                  ...camper,
                  celebration_messages_opt_in: event.target.checked,
                  celebration_messages_opt_in_at: event.target.checked
                    ? camper.celebration_messages_opt_in_at || new Date().toISOString()
                    : null,
                })
              }
            />
            <span>
              <strong>Send us private birthday and camping-anniversary greetings</strong>
              <small>
                By checking this box, I agree to receive optional birthday and annual Bur Oaks camper-anniversary greetings by email and, when Text Alerts are also turned on, by SMS. Up to one anniversary greeting and one birthday greeting per saved profile each year. Message and data rates may apply. Reply STOP to opt out of texts. This is optional and is not a condition of campground service. <a href="/sms-terms">SMS Terms</a> · <a href="/privacy">Privacy Policy</a>
              </small>
            </span>
          </label>

          <div className="camper-birthday-profile-actions">
            <button type="button" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save Birthday Details'}
            </button>
            {message && <p>{message}</p>}
          </div>
        </section>

        <section className="card directory-preferences" style={{ marginBottom: '25px' }}>
          <div className="directory-preferences-heading">
            <span><ShieldCheck size={22} /></span>
            <div>
              <h2>Text Alerts</h2>
              <p className="muted">
                Choose whether the office can text important account and campground alerts to your saved phone number.
              </p>
            </div>
          </div>

          <label className="privacy-toggle">
            <input
              type="checkbox"
              checked={Boolean(camper.sms_opt_in)}
              onChange={(event) =>
                setCamper({
                  ...camper,
                  sms_opt_in: event.target.checked,
                  sms_opt_in_at: event.target.checked
                    ? camper.sms_opt_in_at || new Date().toISOString()
                    : null,
                  event_reminders_opt_in: event.target.checked,
                  event_reminders_opt_in_at: event.target.checked
                    ? camper.event_reminders_opt_in_at || new Date().toISOString()
                    : null,
                })
              }
            />
            <span>
              <strong>I agree to receive Bur Oaks Campground text alerts</strong>
              <small>
                By checking this box, I agree to receive recurring, non-marketing SMS messages from Bur Oaks Campground at the phone number saved in my profile about invoices, payment reminders, account notices, maintenance updates, sewer pump-out updates, gate notices, utility notices, office notices, upcoming event reminders (including Wednesday reminders for events within the next two weeks), safety notices, weather-related operational alerts, and other campground account or operations notices. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out. Consent is optional and is not a condition of campground service. <a href="/sms-terms">SMS Terms</a> · <a href="/privacy">Privacy Policy</a>
              </small>
            </span>
          </label>

          <div className="directory-safety-note">
            <ShieldCheck size={16} /> Wednesday reminders for upcoming events are included automatically when Text Alerts are on. Reply STOP or turn off Text Alerts at any time.
          </div>

          <div className="directory-safety-note">
            <ShieldCheck size={16} /> Text alerts are separate from the camper directory. Your phone number is not shared publicly.
          </div>
          <div className="directory-safety-note">
            <ShieldCheck size={16} /> Your SMS opt-in, phone number, and text consent are not sold or shared with third parties or affiliates for marketing. <a href="/sms-terms">SMS Terms</a> · <a href="/privacy">Privacy Policy</a> · <a href="/sms-consent">SMS consent</a>
          </div>
          <div className="directory-safety-note warning">
            <ShieldCheck size={16} /> SMS consent is optional and is not required to stay at Bur Oaks or use the camper portal. Text alerts are courtesy reminders only. Turning texts off does not remove payment obligations, campground rules, lease notices, or other account responsibilities.
          </div>

          <div style={{ marginTop: '16px' }}>
            <button onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save Alert & Reminder Preferences'}
            </button>
            {message && <p style={{ marginBottom: 0 }}>{message}</p>}
          </div>
        </section>

        <section className="card directory-preferences" style={{ marginBottom: '25px' }}>
          <div className="directory-preferences-heading">
            <span><UsersRound size={22} /></span>
            <div>
              <h2>Camper Directory</h2>
              <p className="muted">
                You are private by default. Choose whether other signed-in campers can find you.
              </p>
            </div>
          </div>

          <label className="privacy-toggle">
            <input
              type="checkbox"
              checked={Boolean(camper.directory_opt_in)}
              onChange={(event) =>
                setCamper({
                  ...camper,
                  directory_opt_in: event.target.checked,
                  directory_show_phone: event.target.checked
                    ? Boolean(camper.directory_show_phone)
                    : false,
                })
              }
            />
            <span>
              <strong>List me in the camper directory</strong>
              <small>Shares your name and lot number with signed-in campers.</small>
            </span>
          </label>

          <label className={`privacy-toggle secondary ${!camper.directory_opt_in ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={Boolean(camper.directory_show_phone)}
              disabled={!camper.directory_opt_in}
              onChange={(event) =>
                setCamper({ ...camper, directory_show_phone: event.target.checked })
              }
            />
            <span>
              <strong>Also share my phone number</strong>
              <small>Your email, vehicles, and emergency contacts are never shown.</small>
            </span>
          </label>

          <div className="directory-safety-note">
            <ShieldCheck size={16} /> You can change these choices at any time.
          </div>

          <div style={{ marginTop: '16px' }}>
            <button onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save Directory Preferences'}
            </button>
            {message && <p style={{ marginBottom: 0 }}>{message}</p>}
          </div>
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Profile 1 Information</h2>
          <p style={{ marginTop: '-4px', color: '#66736a' }}>
            Primary camper/signature profile for this site.
          </p>

          <input
            placeholder="First Name"
            value={camper.first_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                first_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Last Name"
            value={camper.last_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                last_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Phone Number"
            value={camper.phone || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                phone: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Second phone number"
            value={camper.alternate_phone || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                alternate_phone: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Profile 1 Email"
            value={camper.email || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                email: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <p style={{ marginTop: '-6px', marginBottom: '12px', color: '#66736a', fontSize: '12px' }}>
            Current login email: {currentLoginEmail || camper.email || '—'}. Keep this email in Profile 1 or Profile 2 until the office creates a new portal login.
          </p>

          <input
            value={camper.lot_number || ''}
            disabled
            style={{
              width: '100%',
              marginBottom: '12px',
              background: '#f3f4f6',
            }}
          />
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Mailing Address Required</h2>
          <p style={{ marginTop: '-4px', color: '#66736a' }}>
            Required so Bur Oaks can mail paper notices, leases, billing items, or other campground documents if needed.
          </p>

          <AddressFinder
            initialAddress={[
              camper.mailing_address_line1,
              camper.mailing_city,
              camper.mailing_state,
              camper.mailing_zip,
            ].filter(Boolean).join(', ')}
            onSelect={(address) =>
              setCamper((current: any) => ({
                ...current,
                mailing_address_line1: address.line1,
                mailing_city: address.city,
                mailing_state: address.state,
                mailing_zip: address.zip,
              }))
            }
          />

          <input
            placeholder="Street address"
            name="mailing-address-line1"
            autoComplete="address-line1"
            value={camper.mailing_address_line1 || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                mailing_address_line1: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Apartment, unit, PO box, or address line 2"
            name="mailing-address-line2"
            autoComplete="address-line2"
            value={camper.mailing_address_line2 || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                mailing_address_line2: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            <input
              placeholder="City"
              name="mailing-city"
              autoComplete="address-level2"
              value={camper.mailing_city || ''}
              onChange={(e) =>
                setCamper({
                  ...camper,
                  mailing_city: e.target.value,
                })
              }
              style={{ width: '100%', marginBottom: '12px' }}
            />

            <input
              placeholder="State"
              name="mailing-state"
              autoComplete="address-level1"
              value={camper.mailing_state || ''}
              onChange={(e) =>
                setCamper({
                  ...camper,
                  mailing_state: e.target.value,
                })
              }
              style={{ width: '100%', marginBottom: '12px' }}
            />

            <input
              placeholder="ZIP"
              name="mailing-zip"
              autoComplete="postal-code"
              value={camper.mailing_zip || ''}
              onChange={(e) =>
                setCamper({
                  ...camper,
                  mailing_zip: e.target.value,
                })
              }
              style={{ width: '100%', marginBottom: '12px' }}
            />
          </div>
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Profile 2 Information</h2>
          <p style={{ marginTop: '-4px', color: '#66736a' }}>
            Optional second camper/signature profile. This helps when two people need to sign leases for the same site.
          </p>

          <input
            placeholder="Second profile first name"
            value={camper.second_profile_first_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                second_profile_first_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Second profile last name"
            value={camper.second_profile_last_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                second_profile_last_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Second profile phone"
            value={camper.second_profile_phone || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                second_profile_phone: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Profile 2 email"
            value={camper.secondary_email || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                secondary_email: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Emergency Contact</h2>

          <input
            placeholder="Emergency Contact Name"
            value={camper.emergency_contact_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                emergency_contact_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Emergency Contact Phone"
            value={camper.emergency_contact_phone || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                emergency_contact_phone: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Vehicle Information</h2>
          <p style={{ marginTop: '-4px', color: '#66736a' }}>
            Add the main vehicle and an optional second vehicle for the site.
          </p>

          <input
            placeholder="Vehicle 1 Make"
            value={camper.vehicle_make || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_make: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 1 Model"
            value={camper.vehicle_model || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_model: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 1 License Plate"
            value={camper.license_plate || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                license_plate: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 2 Make"
            value={camper.vehicle_2_make || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_2_make: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 2 Model"
            value={camper.vehicle_2_model || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_2_model: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 2 License Plate"
            value={camper.vehicle_2_license_plate || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_2_license_plate: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Golf Cart Information</h2>

          <input
            placeholder="Golf Cart Make"
            value={camper.golf_cart_make || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                golf_cart_make: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Golf Cart Color"
            value={camper.golf_cart_color || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                golf_cart_color: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <div className="camper-insurance-upload-box">
            <div>
              <span><ShieldCheck size={18} /> Golf cart insurance</span>
              <p>
                Upload your current golf cart insurance card or proof of coverage.
                PDF, Word, or photo files are accepted.
              </p>
            </div>

            <label className="camper-insurance-upload-button">
              <FileUp size={18} />
              <span>{insuranceFile ? insuranceFile.name : 'Choose insurance file'}</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                onChange={(event) => setInsuranceFile(event.target.files?.[0] || null)}
              />
            </label>

            <button type="button" onClick={uploadGolfCartInsurance} disabled={uploadingInsurance || !insuranceFile}>
              {uploadingInsurance ? 'Uploading…' : 'Upload Golf Cart Insurance'}
            </button>

            {insuranceMessage && <p className="camper-insurance-message">{insuranceMessage}</p>}

            <div className="camper-insurance-list">
              {insuranceDocuments.length === 0 ? (
                <small>No golf cart insurance is on file yet.</small>
              ) : (
                insuranceDocuments.map((document) => (
                  <button key={document.id} type="button" onClick={() => openInsuranceDocument(document.id)}>
                    <Eye size={15} />
                    <span>{document.document_name}</span>
                    <em>{document.created_at ? new Date(document.created_at).toLocaleDateString() : 'Saved'}</em>
                  </button>
                ))
              )}
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>

          {message && (
            <p style={{ marginTop: '15px' }}>
              {message}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Account Actions</h2>

          <button
            onClick={handleSignOut}
            style={{
              background: '#cc0000',
              color: 'white',
            }}
          >
            Sign Out
          </button>
        </section>

      </div>
    </main>
  )
}
