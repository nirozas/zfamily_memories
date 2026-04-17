import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Verify User
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    // 2. Parse Body
    const body = await req.json()
    console.log("[B2 Proxy] Received key:", body?.key)
    console.log("[B2 Proxy] Received content type:", body?.contentType)
    console.log("[B2 Proxy] Received file data length:", body?.fileBase64?.length)

    const { key, contentType, fileBase64 } = body
    if (!key || !fileBase64) {
       throw new Error(`Missing key (${!!key}) or file data (${!!fileBase64})`)
    }

    // 3. Resolve Secrets
    const B2_KEY_ID = Deno.env.get('B2_KEY_ID')
    const B2_APP_KEY = Deno.env.get('B2_APPLICATION_KEY')
    const BUCKET_ID = Deno.env.get('B2_BUCKET_ID')

    if (!B2_KEY_ID || !B2_APP_KEY || !BUCKET_ID) {
      throw new Error("B2 secrets not configured on server")
    }

    // 4. Authorize with B2
    const authString = btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)
    const authRes = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
      headers: { Authorization: `Basic ${authString}` }
    })
    if (!authRes.ok) throw new Error(`B2 Auth failed: ${await authRes.text()}`)
    
    const authData = await authRes.json()
    const apiUrl = authData.apiUrl || authData.apiInfo?.storageApi?.apiUrl
    const authToken = authData.authorizationToken

    // 5. Get Upload URL
    const uploadUrlRes = await fetch(`${apiUrl}/b2api/v3/b2_get_upload_url?bucketId=${BUCKET_ID}`, {
      headers: { Authorization: authToken }
    })
    if (!uploadUrlRes.ok) throw new Error(`B2 Get Upload URL failed: ${await uploadUrlRes.text()}`)
    const { uploadUrl, authorizationToken } = await uploadUrlRes.json()

    // 6. Perform Upload
    const binaryString = atob(fileBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(key),
        'Content-Type': contentType || 'application/octet-stream',
        'X-Bz-Content-Sha1': 'do_not_verify'
      },
      body: bytes
    })

    if (!uploadRes.ok) {
      throw new Error(`B2 Upload failed: ${await uploadRes.text()}`)
    }

    return new Response(await uploadRes.text(), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error("[B2 Proxy Error]", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    })
  }
})
