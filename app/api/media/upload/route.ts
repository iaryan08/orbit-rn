import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/firebase/auth-server'

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const formData: any = await request.formData()
        const bucket = String(formData.get('bucket') || '').trim()
        const path = String(formData.get('path') || '').trim().replace(/^\/+/, '')
        const contentType = String(formData.get('contentType') || 'application/octet-stream').trim()
        const file = formData.get('file')

        if (!bucket || !path || !(file instanceof File)) {
            return NextResponse.json({ error: 'Missing bucket/path/file' }, { status: 400 })
        }

        const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL || process.env.UPLOAD_URL
        const uploadSecret = process.env.NEXT_PUBLIC_UPLOAD_SECRET || process.env.UPLOAD_SECRET
        if (!uploadUrl || !uploadSecret) {
            return NextResponse.json({ error: 'Upload worker is not configured' }, { status: 503 })
        }

        const fileBuf = await (file as File).arrayBuffer()

        const targetUrl = `${uploadUrl.replace(/\/$/, '')}/${bucket}/${path}`
        const response = await fetch(targetUrl, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${uploadSecret}`,
                'Content-Type': contentType || (file as File).type || 'application/octet-stream',
                'Content-Length': fileBuf.byteLength.toString(),
            },
            body: fileBuf,
            cache: 'no-store',
        })

        if (!response.ok) {
            const text = await response.text().catch(() => '')
            return NextResponse.json(
                { error: `Upload failed: ${response.status}`, details: text || undefined },
                { status: response.status }
            )
        }

        return NextResponse.json({ success: true, path })
    } catch (error: any) {
        console.error('[UploadAPI] Error:', error);
        return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 })
    }
}
