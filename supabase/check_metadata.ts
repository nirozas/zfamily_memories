import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase
    .from('family_media')
    .select('id, type, url, metadata, google_id')
    .eq('type', 'video')
    .limit(100)

  if (error) {
    console.error(error)
    return
  }

  console.log(`Found ${data.length} videos.`)
  data.forEach(v => {
      if (!v.google_id) {
          console.log(`Video ${v.id} is missing google_id. Metadata:`, JSON.stringify(v.metadata))
      }
  })
}

check()
