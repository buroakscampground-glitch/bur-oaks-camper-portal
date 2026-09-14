function escapeWaitlistHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function buildWaitlistConfirmation(firstName: string) {
  const name = firstName.trim() || 'there'
  const subject = 'Welcome to the Bur Oaks waitlist'
  const text = [
    `Hi ${name},`,
    '',
    'Thank you for your interest in joining the Bur Oaks Campground family! Your information has been received, and you have been added to our seasonal-site waitlist.',
    '',
    'At Bur Oaks, we take great pride in providing a welcoming, family atmosphere where campers often remain part of our community for many years. Because openings are limited, we carefully work through our waitlist as suitable sites become available.',
    '',
    'We will contact you when we have an opening that may be a good fit for you and your camper. In the meantime, please feel free to contact us with any questions or updated information.',
    '',
    'Bur Oaks Campground',
    '(618) 488-7927',
    'buroakscampground@gmail.com',
    '',
    'A Site to Remember · Est. 1972',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d8c18b;font-weight:700">Bur Oaks Campground</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">Welcome to the Bur Oaks waitlist</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.6">Hi ${escapeWaitlistHtml(name)},</p>
          <p style="font-size:16px;line-height:1.6">Thank you for your interest in joining the <strong>Bur Oaks Campground family!</strong> Your information has been received, and you have been added to our seasonal-site waitlist.</p>
          <p style="font-size:16px;line-height:1.6">At Bur Oaks, we take great pride in providing a welcoming, family atmosphere where campers often remain part of our community for many years. Because openings are limited, we carefully work through our waitlist as suitable sites become available.</p>
          <div style="margin:20px 0;padding:18px;border-left:4px solid #2f5b3b;background:#f4f7f1;border-radius:12px;line-height:1.6">
            We will contact you when we have an opening that may be a good fit for you and your camper. In the meantime, please feel free to contact us with any questions or updated information.
          </div>
          <p style="font-size:15px;line-height:1.7"><strong>Bur Oaks Campground</strong><br><a href="tel:+16184887927" style="color:#2f5b3b">(618) 488-7927</a><br><a href="mailto:buroakscampground@gmail.com" style="color:#2f5b3b">buroakscampground@gmail.com</a></p>
          <p style="margin-bottom:0;font-family:Georgia,serif;color:#8a6c35">A Site to Remember · Est. 1972</p>
        </div>
      </div>
    </div>
  `

  return { subject, text, html }
}
