import { supabase } from '../lib/supabase'

// ---- API base URL (for upload / delete) ----
const DEV_API_BASE = 'http://localhost:4900/api/v1'
const PROD_API_BASE = 'https://files.minalgem.com/api/v1'

function getApiBaseUrl() {
  return import.meta.env.PROD ? PROD_API_BASE : DEV_API_BASE
}

// ---- Public file base URL (for serving images / videos) ----
const DEV_PUBLIC_BASE = 'http://localhost:4900'
const PROD_PUBLIC_BASE = 'https://files.minalgem.com'

function getPublicBaseUrl() {
  return import.meta.env.PROD ? PROD_PUBLIC_BASE : DEV_PUBLIC_BASE
}

/**
 * Converts a relative storage path to a full public URL.
 * If the input is already a full URL (http/https), it returns it unchanged.
 * Otherwise, it cleans the relative path and prepends the public base.
 */
export function getAssetUrl(relativePath) {
  if (!relativePath) return null

  // Already a full URL? Return as-is.
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath
  }

  const publicBase = getPublicBaseUrl()

  // Remove any leading "/uploads/" prefix or leading slash
  let cleanPath = relativePath.replace(/^\/uploads\//, '').replace(/^\//, '')

  return `${publicBase}/${cleanPath}`
}

/**
 * Generates a unique filename similar to the existing pattern.
 */
export function generateProductFileName(originalName, itemNo = '') {
  const ext = originalName.split('.').pop()
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000000000)
  const prefix = itemNo ? `${itemNo}-` : ''
  return `${prefix}${timestamp}-${random}.${ext}`
}

/**
 * Uploads a file to your storage API.
 * @param {File} file – the file to upload
 * @param {string} folder – target folder (e.g. 'products', 'avatars')
 * @returns {Promise<string>} – the relative path of the uploaded file
 */
export async function uploadFile(file, folder = 'products') {
  // Get current Supabase session token
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated – cannot upload files')

  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)

  const response = await fetch(`${getApiBaseUrl()}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Upload failed: ${errorText}`)
  }

  const data = await response.json()
  // data.url looks like: "https://files.minalgem.com/products/file.jpg"
  // Extract relative path (folder/filename)
  try {
    const urlObj = new URL(data.url)
    return urlObj.pathname.replace(/^\//, '')   // "products/file.jpg"
  } catch {
    // If data.url is not a valid URL, assume it's already relative
    return data.url
  }
}