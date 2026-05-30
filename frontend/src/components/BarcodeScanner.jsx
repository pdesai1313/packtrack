import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const containerId = 'qr-reader-container'
  const [error, setError] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId)
    scannerRef.current = scanner

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!cameras.length) { setError('No camera found'); return }
        return scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 100 } },
          (decodedText) => {
            onScan(decodedText)
          },
          () => {}
        )
      })
      .then(() => setStarted(true))
      .catch((e) => setError(e?.message || 'Camera error'))

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-medium text-sm">Scan Ticket Barcode</span>
          <button className="btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div id={containerId} className="w-full" />

        {error && (
          <div className="p-4">
            <p className="text-red-600 text-xs mb-2">{error}</p>
            <p className="text-gray-500 text-xs">Use manual entry below instead.</p>
          </div>
        )}

        {!started && !error && (
          <div className="p-4 text-center text-gray-400 text-xs">Starting camera…</div>
        )}
      </div>
    </div>
  )
}
