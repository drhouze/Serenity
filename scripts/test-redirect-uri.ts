/**
 * Quick test to verify the getGoogleRedirectUri fix works correctly.
 * Simulates a production request coming through Caddy with proxy headers,
 * and confirms the redirect URI is derived from the public domain (not the
 * stale DB value pointing to the FC URL).
 */
import { getGoogleRedirectUri, getPublicOrigin } from '../src/lib/google-drive'

// Simulate a Request coming through Caddy with production proxy headers
const mockRequest = new Request('http://0.0.0.0:3000/api/google-drive/auth', {
  headers: {
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'nursinghomesys.space-z.ai',
    'host': 'nursinghomesys.space-z.ai',
  },
})

async function main() {
  console.log('=== Testing getPublicOrigin ===')
  const origin = getPublicOrigin(mockRequest)
  console.log('Public origin:', origin)
  console.log('Expected:      https://nursinghomesys.space-z.ai')
  console.log('Match:', origin === 'https://nursinghomesys.space-z.ai' ? '✅ PASS' : '❌ FAIL')
  console.log()

  console.log('=== Testing getGoogleRedirectUri ===')
  const redirectUri = await getGoogleRedirectUri(mockRequest)
  console.log('Redirect URI:', redirectUri)
  console.log('Expected:      https://nursinghomesys.space-z.ai/api/google-drive/callback')
  console.log('Match:', redirectUri === 'https://nursinghomesys.space-z.ai/api/google-drive/callback' ? '✅ PASS' : '❌ FAIL')
  console.log()

  if (redirectUri.includes('fcapp.run')) {
    console.log('❌ FAIL: Redirect URI still points to the FC URL!')
    console.log('   The stale DB value is being used instead of the request origin.')
    process.exit(1)
  } else if (redirectUri.includes('nursinghomesys.space-z.ai')) {
    console.log('✅ PASS: Redirect URI uses the production domain, NOT the FC URL.')
    console.log('   The fix is working — OAuth will redirect back to the production domain.')
  } else {
    console.log('⚠️  Unexpected redirect URI:', redirectUri)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
