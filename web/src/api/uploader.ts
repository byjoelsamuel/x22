import type { Credentials } from './subsonic'

export interface UploadResult {
  name: string
  status: 'saved' | 'skipped' | 'rejected'
  reason?: string
  path?: string
  title?: string
  artist?: string
}

const base = (c: Credentials) => `${c.server}/api`

export async function uploaderHealth(c: Credentials): Promise<{ ok: boolean; maxFileMB?: number }> {
  try {
    const r = await fetch(`${base(c)}/health`, { signal: AbortSignal.timeout(4000) })
    return r.ok ? await r.json() : { ok: false }
  } catch {
    return { ok: false }
  }
}

/** Upload one file with progress (XHR, because fetch has no upload progress). */
export function uploadFile(c: Credentials, file: File, onProgress: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base(c)}/upload`)
    xhr.setRequestHeader('X-Subsonic-User', c.user)
    xhr.setRequestHeader('X-Subsonic-Token', c.token)
    xhr.setRequestHeader('X-Subsonic-Salt', c.salt)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText)
        if (xhr.status !== 200) return reject(new Error(body.error ?? `HTTP ${xhr.status}`))
        resolve(body.files[0] ?? { name: file.name, status: 'rejected', reason: 'No response' })
      } catch {
        reject(new Error(`HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed — is the uploader running?'))
    const form = new FormData()
    form.append('files', file, file.name)
    xhr.send(form)
  })
}
