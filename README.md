# Bur Oaks Camper Portal Starter

This is a starter Next.js app for a camper portal connected to Supabase.

## What this starter includes

- Camper dashboard
- Electric usage page
- Invoice page
- Documents page
- Events calendar page
- Admin dashboard
- Admin camper list page
- Supabase connection file
- Environment variable example
- Basic clean layout

## First setup

1. Install Node.js
2. Install VS Code
3. Open this folder in VS Code
4. Rename `.env.example` to `.env.local`
5. Add your Supabase project URL and anon key
6. Run:

```bash
npm install
npm run dev
```

Then open:

```txt
http://localhost:3000
```

## Supabase keys

In Supabase:
Project Settings > API

Copy:
- Project URL
- anon public key

Paste them into `.env.local`.

## Important

This is a starter app. It is not fully secured for live camper use yet.
Before going live, you need:
- Supabase authentication
- Row level security policies
- Stripe payments
- Twilio texting
- Legal signature provider integration
