import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cmpccxkxrfauvpvjvyuk.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_cEQ69SyLZmR9sKIvkzT5Sw_4TLcD7CI'

// Use cookie-based auth to share session with login.dailin.tech
// In production (*.dailin.tech), cookies are shared across subdomains
// In development (localhost), cookies are host-only
const isProduction = window.location.hostname.endsWith('.dailin.tech')

export const supabase = supabaseUrl && supabaseKey
  ? createBrowserClient(supabaseUrl, supabaseKey, {
      cookieOptions: {
        domain: isProduction ? '.dailin.tech' : undefined,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      },
    })
  : null

export interface DonationRecord {
  id: number
  created_at: string
  chain: string
  contract_address: string
  donor_wallet: string
  donor_user_id: string | null
  donor_email: string | null
  donor_name: string | null
  amount_eth: number
  tx_hash: string
  message: string | null
  is_anonymous: boolean
}
