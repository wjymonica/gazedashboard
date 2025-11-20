import React from 'react'

// Module-level color cache for category colors
const colorCache = new Map<string, string>()

// Backend base URL for hosted/ngrok; empty means same-origin/proxy
const API_BASE: string = (import.meta as any).env?.VITE_BACKEND_URL || ''
const apiUrl = (path: string) => {
  const base = API_BASE ? API_BASE.replace(/\/+$/, '') : ''
  const p = path.startsWith('/') ? path : `/${path}`
  return base + p
}

export const App: React.FC = () => {
  const [apiStatus, setApiStatus] = React.useState<string>('checking...')
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [gaze, setGaze] = React.useState<{ points: number[][], normalized: boolean }>({ points: [], normalized: true })
  const [fps, setFps] = React.useState<number>(25)
  const [showGaze, setShowGaze] = React.useState<boolean>(true)
  const [summaryItems, setSummaryItems] = React.useState<Array<{ start?: number, end?: number, text: string, instructionMode?: string, review?: string, comments?: string, rowIndex?: number }>>([])
  const [transcriptCues, setTranscriptCues] = React.useState<Array<{ index: number, start: number, end: number, text: string }>>([])
  const [activeCueIdx, setActiveCueIdx] = React.useState<number>(-1)
  const transcriptListRef = React.useRef<HTMLDivElement | null>(null)
  const [videoDuration, setVideoDuration] = React.useState<number>(0)
  const timelineRef = React.useRef<HTMLDivElement | null>(null)
  const playheadRef = React.useRef<HTMLDivElement | null>(null)
  const [mainTip, setMainTip] = React.useState<{ text: string, x: number } | null>(null)
  const [standingRows, setStandingRows] = React.useState<Array<{ start?: number, end?: number, label?: string, image?: string }>>([])
  const [standingTip, setStandingTip] = React.useState<{ text: string, x: number } | null>(null)
  const [standingHoverIdx, setStandingHoverIdx] = React.useState<number | null>(null)
  const [activeStandingIdx, setActiveStandingIdx] = React.useState<number>(-1)
  const [categoryItems, setCategoryItems] = React.useState<Array<{ start?: number, end?: number, text?: string, category?: string, subcategory?: string }>>([])
  const [phases, setPhases] = React.useState<Array<{ start: number, end: number, label: string }>>([])
  const [expandedPhases, setExpandedPhases] = React.useState<Record<string, boolean>>({})
  const [showQuickView, setShowQuickView] = React.useState<boolean>(false)
  const [expandedPhaseKeyLine, setExpandedPhaseKeyLine] = React.useState<string | null>(null)
  const [expandedInstructionLabel, setExpandedInstructionLabel] = React.useState<string | null>(null)
  const [expandedExampleLabel, setExpandedExampleLabel] = React.useState<string | null>(null)
  const [commentEdits, setCommentEdits] = React.useState<Record<number, string>>({})
  const [examplesSort, setExamplesSort] = React.useState<'time' | 'theme'>('time')
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [colWidths, setColWidths] = React.useState<{ left: number, middle: number, right: number }>({ left: 35, middle: 40, right: 25 })
  const dragStateRef = React.useRef<{ active: boolean, which: 'left' | 'right', startX: number, start: { left: number, middle: number, right: number } } | null>(null)
  const [quickPreview, setQuickPreview] = React.useState<boolean>(false)
  const [quickSpeed, setQuickSpeed] = React.useState<number>(6)
  const [quickSegments, setQuickSegments] = React.useState<Array<{ start: number, end: number }>>([])
  const quickIdxRef = React.useRef<number>(0)
  const [roleMd, setRoleMd] = React.useState<string>('')

  React.useEffect(() => {
    fetch(apiUrl('/api/health'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => setApiStatus(d.status ?? 'ok'))
      .catch(() => setApiStatus('unreachable'))
  }, [])

  React.useEffect(() => {
    fetch(apiUrl('/api/gaze'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.json())
      .then(setGaze)
      .catch(() => setGaze({ points: [], normalized: true }))
  }, [])

  // Auto-load provided CSV and SRT if available
  React.useEffect(() => {
    // summary.csv (plain summaries)
    fetch(apiUrl('/api/summary'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then(text => setSummaryItems(normalizeSummaryRows(parseCsv(text))))
      .catch(() => {})
    // merged categories/subcategories CSV for category timelines
    fetch(apiUrl('/api/summary_categories'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then(text => setCategoryItems(normalizeSummaryRows(parseCsv(text))))
      .catch(() => {})
    fetch(apiUrl('/api/transcript'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then(text => setTranscriptCues(parseSrt(text)))
      .catch(() => {})
    fetch(apiUrl('/api/standing'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then(text => setStandingRows(normalizeStandingRows(parseCsv(text))))
      .catch(() => {})
    fetch(apiUrl('/api/phases'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then(text => setPhases(normalizePhases(parseCsv(text))))
      .catch(() => {})
    fetch(apiUrl('/api/surgical_role_transitions'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then(text => setRoleMd(text))
      .catch(() => setRoleMd(''))
  }, [])

  React.useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const setCanvasToDisplaySize = () => {
      const dw = video.clientWidth || video.videoWidth || 1920
      const dh = video.clientHeight || video.videoHeight || 1080
      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw
        canvas.height = dh
      }
    }
    const onMeta = () => {
      setCanvasToDisplaySize()
      setVideoDuration(video.duration || 0)
    }
    video.addEventListener('loadedmetadata', onMeta)
    let ro: any = null
    const ResizeObserverCtor = (window as any).ResizeObserver
    if (ResizeObserverCtor) {
      ro = new ResizeObserverCtor(() => setCanvasToDisplaySize())
      ro.observe(video)
    }
    return () => {
      video.removeEventListener('loadedmetadata', onMeta)
      if (ro) ro.disconnect()
    }
  }, [])

  React.useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const draw = () => {
      // Keep canvas in sync with displayed video size
      const displayW = video.clientWidth || video.videoWidth || canvas.width
      const displayH = video.clientHeight || video.videoHeight || canvas.height
      if (canvas.width !== displayW || canvas.height !== displayH) {
        canvas.width = displayW
        canvas.height = displayH
      }
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      if (showGaze && gaze.points.length > 0 && !isNaN(video.currentTime)) {
        const frameIdx = Math.max(0, Math.min(gaze.points.length - 1, Math.floor(video.currentTime * fps)))
        const [gx, gy] = gaze.points[frameIdx] || [NaN, NaN]
        if (Number.isFinite(gx) && Number.isFinite(gy)) {
          const vidW = video.videoWidth || w
          const vidH = video.videoHeight || h
          let x = gaze.normalized ? gx * w : gx * (w / vidW)
          let y = gaze.normalized ? gy * h : gy * (h / vidH)
          if (x >= 0 && y >= 0 && x <= w && y <= h) {
            ctx.beginPath()
            // 50% size scale for the gaze marker
            ctx.arc(x, y, 4, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,0,0,0.9)'
            ctx.shadowColor = 'rgba(255,0,0,0.7)'
            ctx.shadowBlur = 4
            ctx.fill()
            ctx.shadowBlur = 0
          }
        }
      }

      // Active transcript cue tracking
      if (transcriptCues.length > 0 && Number.isFinite(video.currentTime)) {
        const t = video.currentTime
        const idx = transcriptCues.findIndex(c => t >= c.start && t < c.end)
        setActiveCueIdx(prev => (prev === idx ? prev : idx))
      }

      // Update playhead position
      if (videoDuration > 0 && playheadRef.current) {
        const pct = Math.max(0, Math.min(100, (video.currentTime / videoDuration) * 100))
        playheadRef.current.style.left = pct + '%'
      }
      // Active standing segment tracking
      {
        const segs = buildStandingSegments(standingRows)
        if (segs.length > 0 && Number.isFinite(video.currentTime)) {
          const t = video.currentTime
          const idx = segs.findIndex(s => t >= s.start && t < s.end)
          setActiveStandingIdx(prev => (prev === idx ? prev : idx))
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [gaze, fps, showGaze, transcriptCues, videoDuration, quickPreview, quickSegments, quickSpeed, standingRows])

  // Keep active transcript cue scrolled into view
  React.useEffect(() => {
    if (activeCueIdx < 0) return
    const container = transcriptListRef.current
    if (!container) return
    const el = container.querySelector(`[data-cue-idx="${activeCueIdx}"]`) as HTMLElement | null
    if (!el) return
    const elRect = el.getBoundingClientRect()
    const contRect = container.getBoundingClientRect()
    const currentScrollTop = container.scrollTop
    const elTopWithin = elRect.top - contRect.top + currentScrollTop
    const targetTop = Math.max(0, elTopWithin - (container.clientHeight / 2 - el.clientHeight / 2))
    container.scrollTo({ top: targetTop, behavior: 'smooth' })
  }, [activeCueIdx])

  const seekTo = (timeSec: number) => {
    const v = videoRef.current
    if (!v || !Number.isFinite(timeSec)) return
    v.currentTime = Math.max(0, timeSec)
    v.play().catch(() => {})
  }

  // Fetch quick preview segments
  React.useEffect(() => {
    fetch(apiUrl('/api/quick_preview'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then(text => {
        const rows = parseCsv(text)
        const segs: Array<{ start: number, end: number }> = []
        if (rows.length > 0) {
          const header = rows[0].map(h => h.trim().toLowerCase())
          let data = rows.slice(1)
          const hasHeader = header.some(h => ['start', 'starttime', 'start_time', 'end', 'endtime', 'end_time'].includes(h))
          if (!hasHeader) data = rows
          const idxStart = (() => { let i = header.indexOf('start'); if (i === -1) i = header.indexOf('starttime'); if (i === -1) i = header.indexOf('start_time'); return i })()
          const idxEnd = (() => { let i = header.indexOf('end'); if (i === -1) i = header.indexOf('endtime'); if (i === -1) i = header.indexOf('end_time'); return i })()
          for (const r of data) {
            if (!r || r.length === 0) continue
            const s = hasHeader ? (idxStart >= 0 ? parseFlexibleTime(r[idxStart]) : NaN) : parseFlexibleTime(r[0])
            const e = hasHeader ? (idxEnd >= 0 ? parseFlexibleTime(r[idxEnd]) : NaN) : (r.length > 1 ? parseFlexibleTime(r[1]) : NaN)
            if (Number.isFinite(s) && Number.isFinite(e) && e > s) segs.push({ start: s, end: e })
          }
        }
        setQuickSegments(segs.sort((a, b) => a.start - b.start))
      })
      .catch(() => setQuickSegments([]))
  }, [])

  // Control playback rate when quick preview toggled
  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = quickPreview ? (Number(quickSpeed) || 1) : 1
    if (quickPreview) {
      quickIdxRef.current = 0
      if (quickSegments.length > 0) {
        v.currentTime = Math.max(0, quickSegments[0].start)
        v.play().catch(() => {})
      }
    }
  }, [quickPreview, quickSpeed, quickSegments])

  // Jump across segments during quick preview
  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      if (!quickPreview || quickSegments.length === 0) return
      let idx = quickIdxRef.current
      idx = Math.max(0, Math.min(quickSegments.length - 1, idx))
      const seg = quickSegments[idx]
      const t = v.currentTime
      if (t < seg.start - 0.05) {
        v.currentTime = seg.start
        return
      }
      if (t >= seg.end - 0.02) {
        idx += 1
        if (idx >= quickSegments.length) {
          // End of quick preview
          quickIdxRef.current = 0
          setQuickPreview(false)
          v.playbackRate = 1
          v.pause()
          return
        }
        quickIdxRef.current = idx
        v.currentTime = Math.max(0, quickSegments[idx].start)
      }
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [quickPreview, quickSegments])

  const onMouseDownResizer = (which: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault()
    dragStateRef.current = {
      active: true,
      which,
      startX: e.clientX,
      start: { ...colWidths }
    }
    window.addEventListener('mousemove', onMouseMoveWindow)
    window.addEventListener('mouseup', onMouseUpWindow)
  }

  const onMouseMoveWindow = (e: MouseEvent) => {
    const state = dragStateRef.current
    const container = containerRef.current
    if (!state || !state.active || !container) return
    const dxPx = e.clientX - state.startX
    const totalPx = container.clientWidth || 1
    const dxPct = (dxPx / totalPx) * 100
    const min = { left: 20, middle: 20, right: 20 }
    let left = state.start.left
    let middle = state.start.middle
    let right = state.start.right
    if (state.which === 'left') {
      const dxMin = min.left - state.start.left
      const dxMax = state.start.middle - min.middle
      const adj = Math.max(dxMin, Math.min(dxMax, dxPct))
      left = state.start.left + adj
      middle = state.start.middle - adj
    } else {
      const dxMin = min.middle - state.start.middle
      const dxMax = state.start.right - min.right
      const adj = Math.max(dxMin, Math.min(dxMax, dxPct))
      middle = state.start.middle + adj
      right = state.start.right - adj
    }
    setColWidths({ left, middle, right })
  }

  const onMouseUpWindow = () => {
    if (dragStateRef.current) dragStateRef.current.active = false
    window.removeEventListener('mousemove', onMouseMoveWindow)
    window.removeEventListener('mouseup', onMouseUpWindow)
  }

  return (
    <div style={{ padding: 20, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', height: '100vh', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div ref={containerRef} style={{ display: 'grid', gap: 16, gridTemplateColumns: `${colWidths.left}% 6px ${colWidths.middle}% 6px ${colWidths.right}%`, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
        {/* Left: Video + controls */}
        <div style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
          <h1 style={{ marginTop: 0 }}>Gaze Web</h1>
          <p>Backend status: <strong>{apiStatus}</strong></p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span>FPS</span>
              <input value={fps} onChange={e => setFps(Number(e.target.value) || 25)} type="number" min={1} max={120} step={1} style={{ width: 80 }} />
            </label>
            <button
              type="button"
              onClick={() => setShowGaze(v => !v)}
              aria-pressed={showGaze}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', background: showGaze ? '#223555' : '#f3f4f6', color: showGaze ? '#fff' : '#111' }}
            >
              {showGaze ? 'Hide gaze' : 'Show gaze'}
            </button>
            <button
              type="button"
              onClick={() => setQuickPreview(v => !v)}
              aria-pressed={quickPreview}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', background: quickPreview ? '#223555' : '#f3f4f6', color: quickPreview ? '#fff' : '#111' }}
              disabled={quickSegments.length === 0}
              title={quickSegments.length === 0 ? 'No segments found' : undefined}
            >
              {quickPreview ? 'Stop Quick Preview' : 'Quick Preview'}
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>Speed</span>
              <input
                type="number"
                min={0.25}
                max={16}
                step={0.25}
                value={quickSpeed}
                onChange={e => setQuickSpeed(Math.max(0.25, Math.min(16, Number(e.target.value) || 1)))}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <div style={{ position: 'relative' }}>
            <video ref={videoRef} src={apiUrl('/api/video')} controls style={{ display: 'block', width: '100%', height: 'auto' }} />
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: showGaze ? 'block' : 'none' }} />
          </div>
          {/* Surgical role transitions markdown */}
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '8px 0' }}>Surgical Role Transitions</h4>
            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', background: '#fafafa', whiteSpace: 'pre-wrap' }}>
              {roleMd || 'No content'}
            </div>
          </div>
          {/* Standing timeline */}
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '8px 0' }}>Standing position timeline</h4>
            <div style={{ position: 'relative', height: 20, background: '#0b0d12', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
              {(() => {
                const total = videoDuration > 0 ? videoDuration : 0
                const segs = buildStandingSegments(standingRows)
                const nodes: React.ReactNode[] = []
                if (total <= 0) return nodes
                let prevEnd = 0
                for (let i = 0; i < segs.length; i++) {
                  const s = Math.max(0, Math.min(segs[i].start, total))
                  const e = Math.max(s, Math.min(segs[i].end, total))
                  if (s > prevEnd) {
                    const gapDur = s - prevEnd
                    const gapPct = (gapDur / total) * 100
                    nodes.push(<div key={`st-gap-${i}`} style={{ width: gapPct + '%', background: '#000' }} />)
                  }
                  const segDur = Math.max(0, e - s)
                  const segPct = total > 0 ? (segDur / total) * 100 : 0
                  const rawLabel = segs[i].label || 'Standing'
                  const displayLabel = isLikelyFilename(rawLabel) ? 'Standing' : rawLabel
                  // Use fixed colors for A/B/C image names when available
                  const color = colorForStandingImage(segs[i].image, rawLabel)
                  const title = `${displayLabel} • ${formatTime(s)} → ${formatTime(e)}`
                  nodes.push(
                    <div key={`st-seg-${i}`}
                         title={title}
                         onMouseEnter={(e) => {
                           const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect()
                           const x = rect ? e.clientX - rect.left : 0
                           setStandingTip({ text: displayLabel, x })
                           setStandingHoverIdx(i)
                         }}
                         onMouseMove={(e) => {
                           const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect()
                           const x = rect ? e.clientX - rect.left : 0
                           setStandingTip(prev => prev ? { ...prev, x } : { text: displayLabel, x })
                         }}
                         onMouseLeave={() => { setStandingTip(null); setStandingHoverIdx(null) }}
                         onClick={() => seekTo(s)}
                         style={{ width: segPct + '%', background: color, cursor: 'pointer', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.6)' }} />
                  )
                  prevEnd = e
                }
                if (prevEnd < total) {
                  const tailDur = total - prevEnd
                  const tailPct = (tailDur / total) * 100
                  nodes.push(<div key={`st-gap-tail`} style={{ width: tailPct + '%', background: '#000' }} />)
                }
                return nodes
              })()}
              {standingTip && (
                <div style={{ position: 'absolute', bottom: '100%', transform: 'translateX(-50%)', left: (standingTip.x || 0), marginBottom: 6, background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                  {standingTip.text}
                </div>
              )}
            </div>
            {/* Standing image preview and sequence */}
            {(() => {
              const segs = buildStandingSegments(standingRows)
              const currentIdx = standingHoverIdx != null ? standingHoverIdx : activeStandingIdx
              const current = (currentIdx != null && currentIdx >= 0 && currentIdx < segs.length) ? segs[currentIdx] : null
              return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}>
                    {current?.image ? (
                      <img
                        src={apiUrl(`/api/image/${encodeURIComponent(current.image)}`)}
                        alt="Standing image"
                        style={{ maxWidth: '75%', maxHeight: 200, display: 'block', borderRadius: 4 }}
                      />
                    ) : (
                      <div style={{ color: '#6b7280', textAlign: 'center' }}>No image for current segment</div>
                    )}
                  </div>
                  {/* Thumbnails strip hidden as requested */}
                </div>
              )
            })()}
          </div>
          
          
          {/* Interactive category timeline was hidden per request */}

          
        </div>
        {/* Resizer between left and middle */}
        <div
          onMouseDown={onMouseDownResizer('left')}
          style={{
            width: 6,
            height: '100%',
            cursor: 'col-resize',
            background: 'linear-gradient(to right, transparent 0, transparent 2px, #cbd5e1 2px, #cbd5e1 3px, transparent 3px)'
          }}
          title="Drag to resize columns"
        />

        {/* Middle: Surgical phases, Instruction mode, Examples */}
        <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: 12, height: '100%', minHeight: 0, overflow: 'auto' }}>
          {/* Line 1: Surgical phases (buttons, expandable list) */}
          <div style={{ marginTop: 0 }}>
            <h4 style={{ margin: '8px 0' }}>Surgical phases</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {phases.slice().sort((a, b) => a.start - b.start).map((ph, i) => {
                const key = `${ph.label}-${ph.start}-${ph.end}`
                const active = expandedPhaseKeyLine === key
                const count = summaryItems.filter(it => typeof it.start === 'number' && Number.isFinite(it.start as number) && (it.start as number) >= ph.start && (it.start as number) < ph.end).length
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExpandedPhaseKeyLine(prev => prev === key ? null : key)}
                    aria-pressed={active}
                    title={`${formatTime(ph.start)} → ${formatTime(ph.end)}`}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      background: active ? '#223555' : '#f3f4f6',
                      color: active ? '#fff' : '#111'
                    }}
                  >
                    {ph.label} ({count})
                  </button>
                )
              })}
            </div>
            {expandedPhaseKeyLine && (() => {
              const [label, sStr, eStr] = expandedPhaseKeyLine.split('-')
              const s = Number(sStr); const e = Number(eStr)
              const itemsInPhase = summaryItems.filter(it => typeof it.start === 'number' && Number.isFinite(it.start as number) && (it.start as number) >= s && (it.start as number) < e)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, maxHeight: 400, overflow: 'auto' }}>
                  {itemsInPhase.map((it, i) => {
                    const hasStart = typeof it.start === 'number' && Number.isFinite(it.start as number)
                    return (
                      <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', background: '#fafafa' }}>
                        <div onClick={() => hasStart && seekTo(it.start as number)} style={{ color: '#6b7280', fontSize: 12, marginBottom: 4, cursor: hasStart ? 'pointer' : 'default' }}>
                          {hasStart ? formatTime(it.start as number) : ''}{typeof it.end === 'number' && Number.isFinite(it.end as number) ? ` → ${formatTime(it.end as number)}` : ''}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>{it.text}</div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <textarea
                            placeholder="Add a comment..."
                            value={commentEdits[(it.rowIndex ?? -1) as number] ?? (it.comments ?? '')}
                            onChange={e => {
                              const key = (it.rowIndex ?? -1) as number
                              const v = e.target.value
                              setCommentEdits(prev => ({ ...prev, [key]: v }))
                            }}
                            rows={2}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', resize: 'vertical' }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const key = (it.rowIndex ?? -1) as number
                              const comment = commentEdits[key] ?? ''
                              try {
                                await fetch('/api/summary/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: [{ rowIndex: key, comment }] }) })
                                const r = await fetch('/api/summary')
                                if (r.ok) {
                                  const text = await r.text()
                                  setSummaryItems(normalizeSummaryRows(parseCsv(text)))
                                }
                              } catch (_) { /* ignore */ }
                            }}
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#223555', color: '#fff', whiteSpace: 'nowrap' }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {itemsInPhase.length === 0 && <div style={{ color: '#6b7280', fontSize: 12 }}>No summaries in this phase.</div>}
                </div>
              )
            })()}
          </div>
          {/* Line 2: Instruction mode (buttons, expandable list) */}
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '8px 0' }}>Instruction mode</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Next Step Plan', 'Action Guidance', 'Anatomy Recognition', 'Camera and View', 'Hand Coordination', 'Bleeding Handling'].map(label => {
                const active = expandedInstructionLabel === label
                const count = summaryItems.filter(it => (it.instructionMode || '').trim() === label).length
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setExpandedInstructionLabel(prev => prev === label ? null : label)}
                    aria-pressed={active}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      background: active ? '#223555' : '#f3f4f6',
                      color: active ? '#fff' : '#111'
                    }}
                  >
                    {label} ({count})
                  </button>
                )
              })}
            </div>
            {expandedInstructionLabel && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, maxHeight: 400, overflow: 'auto' }}>
                {summaryItems.filter(it => (it.instructionMode || '').trim() === expandedInstructionLabel).map((it, i) => {
                  const hasStart = typeof it.start === 'number' && Number.isFinite(it.start as number)
                  return (
                    <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', background: '#fafafa' }}>
                      <div onClick={() => hasStart && seekTo(it.start as number)} style={{ color: '#6b7280', fontSize: 12, marginBottom: 4, cursor: hasStart ? 'pointer' : 'default' }}>
                        {hasStart ? formatTime(it.start as number) : ''}{typeof it.end === 'number' && Number.isFinite(it.end as number) ? ` → ${formatTime(it.end as number)}` : ''}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>{it.text}</div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <textarea
                          placeholder="Add a comment..."
                          value={commentEdits[(it.rowIndex ?? -1) as number] ?? (it.comments ?? '')}
                          onChange={e => {
                            const key = (it.rowIndex ?? -1) as number
                            const v = e.target.value
                            setCommentEdits(prev => ({ ...prev, [key]: v }))
                          }}
                          rows={2}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', resize: 'vertical' }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const key = (it.rowIndex ?? -1) as number
                            const comment = commentEdits[key] ?? ''
                            try {
                              await fetch('/api/summary/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: [{ rowIndex: key, comment }] }) })
                              const r = await fetch('/api/summary')
                              if (r.ok) {
                                const text = await r.text()
                                setSummaryItems(normalizeSummaryRows(parseCsv(text)))
                              }
                            } catch (_) { /* ignore */ }
                          }}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#223555', color: '#fff', whiteSpace: 'nowrap' }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {/* Line 3: Examples (buttons, expandable list) */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: '8px 0' }}>Examples</h4>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Sort</span>
                <select
                  value={examplesSort}
                  onChange={e => setExamplesSort(e.target.value === 'theme' ? 'theme' : 'time')}
                  style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}
                >
                  <option value="time">Time</option>
                  <option value="theme">Theme</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Good Performance', 'Missed Opportunities for Surgical Excellence', 'Unknown', 'Others'].map(label => {
                const active = expandedExampleLabel === label
                const normalizeExample = (s: string) => {
                  const v = (s || '').trim().toLowerCase()
                  if (v === 'good') return 'Good Performance'
                  if (v === 'bad') return 'Missed Opportunities for Surgical Excellence'
                  if (v === 'unknown' || v === 'uncertain') return 'Unknown'
                  if (!v) return 'Others'
                  return ['Good Performance', 'Missed Opportunities for Surgical Excellence', 'Unknown'].includes(s) ? s : 'Others'
                }
                const count = summaryItems.filter(it => normalizeExample(it.review || '') === label).length
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setExpandedExampleLabel(prev => prev === label ? null : label)}
                    aria-pressed={active}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      background: active ? '#223555' : '#f3f4f6',
                      color: active ? '#fff' : '#111'
                    }}
                  >
                    {label} ({count})
                  </button>
                )
              })}
            </div>
            {expandedExampleLabel && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, maxHeight: 400, overflow: 'auto' }}>
                {summaryItems.filter(it => {
                  const normalizeExample = (s: string) => {
                    const v = (s || '').trim().toLowerCase()
                    if (v === 'good') return 'Good Performance'
                    if (v === 'bad') return 'Missed Opportunities for Surgical Excellence'
                    if (v === 'unknown' || v === 'uncertain') return 'Unknown'
                    if (!v) return 'Others'
                    return ['Good Performance', 'Missed Opportunities for Surgical Excellence', 'Unknown'].includes(s) ? s : 'Others'
                  }
                  return normalizeExample(it.review || '') === expandedExampleLabel
                }).sort((a, b) => {
                  if (examplesSort === 'theme') {
                    const ra = instructionModeRank(a.instructionMode)
                    const rb = instructionModeRank(b.instructionMode)
                    if (ra !== rb) return ra - rb
                  }
                  const at = Number.isFinite(Number(a.start)) ? Number(a.start) : Infinity
                  const bt = Number.isFinite(Number(b.start)) ? Number(b.start) : Infinity
                  return at - bt
                }).map((it, i) => {
                  const hasStart = typeof it.start === 'number' && Number.isFinite(it.start as number)
                  return (
                    <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', background: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div onClick={() => hasStart && seekTo(it.start as number)} style={{ color: '#6b7280', fontSize: 12, cursor: hasStart ? 'pointer' : 'default' }}>
                          {hasStart ? formatTime(it.start as number) : ''}{typeof it.end === 'number' && Number.isFinite(it.end as number) ? ` → ${formatTime(it.end as number)}` : ''}
                        </div>
                        {normalizeInstructionModeLabel(it.instructionMode) && (
                          <span
                            style={{
                              fontSize: 10,
                              color: '#111827',
                              background: instructionModeColor(it.instructionMode),
                              padding: '2px 6px',
                              borderRadius: 9999,
                              lineHeight: 1,
                              whiteSpace: 'nowrap'
                            }}
                            title="Instruction mode"
                          >
                            {normalizeInstructionModeLabel(it.instructionMode)}
                          </span>
                        )}
                      </div>
                      <div onClick={() => hasStart && seekTo(it.start as number)} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35, cursor: hasStart ? 'pointer' : 'default' }}>{it.text}</div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <textarea
                          placeholder="Add a comment..."
                          value={commentEdits[(it.rowIndex ?? -1) as number] ?? (it.comments ?? '')}
                          onChange={e => {
                            const key = (it.rowIndex ?? -1) as number
                            const v = e.target.value
                            setCommentEdits(prev => ({ ...prev, [key]: v }))
                          }}
                          rows={2}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', resize: 'vertical' }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const key = (it.rowIndex ?? -1) as number
                            const comment = commentEdits[key] ?? ''
                            try {
                              await fetch('/api/summary/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: [{ rowIndex: key, comment }] }) })
                              const r = await fetch('/api/summary')
                              if (r.ok) {
                                const text = await r.text()
                                setSummaryItems(normalizeSummaryRows(parseCsv(text)))
                              }
                            } catch (_) { /* ignore */ }
                          }}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#223555', color: '#fff', whiteSpace: 'nowrap' }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Resizer between middle and right */}
        <div
          onMouseDown={onMouseDownResizer('right')}
          style={{
            width: 6,
            height: '100%',
            cursor: 'col-resize',
            background: 'linear-gradient(to right, transparent 0, transparent 2px, #cbd5e1 2px, #cbd5e1 3px, transparent 3px)'
          }}
          title="Drag to resize columns"
        />

        {/* Right: Transcript */}
        <div ref={transcriptListRef} style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: 12, fontSize: 13, height: '100%', minHeight: 0, overflow: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Transcript</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transcriptCues.map((cue, i) => (
              <div key={cue.index}
                   data-cue-idx={i}
                   onClick={() => seekTo(cue.start)}
                   style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', background: i === activeCueIdx ? '#eef2ff' : '#ffffff', cursor: 'pointer' }}>
                <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>{`${formatTime(cue.start)} → ${formatTime(cue.end)}`}</div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>{cue.text}</div>
              </div>
            ))}
          </div>
          {/* Removed table; selection moved above filtered timeline */}
        </div>
      </div>
    </div>
  )
}

// Helpers
function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (hh > 0) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function parseSrt(text: string): Array<{ index: number, start: number, end: number, text: string }> {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const cues: Array<{ index: number, start: number, end: number, text: string }> = []
  let i = 0
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === '') i++
    if (i >= lines.length) break
    let index: number | null = null
    if (/^\d+$/.test(lines[i].trim())) { index = Number(lines[i].trim()); i++ }
    const timeLine = lines[i++] || ''
    const m = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/)
    if (!m) { while (i < lines.length && lines[i].trim() !== '') i++; continue }
    const start = parseTimeHMS(m[1]); const end = parseTimeHMS(m[2])
    const textLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '') textLines.push(lines[i++])
    const cueText = textLines.join('\n').replace(/<[^>]+>/g, '').trim()
    if (Number.isFinite(start) && Number.isFinite(end)) cues.push({ index: index ?? cues.length + 1, start, end, text: cueText })
  }
  return cues
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let i = 0; let field = ''; let row: string[] = []; let inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { if (!(row.length === 1 && row[0].trim() === '')) rows.push(row); row = [] }
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue } else { inQuotes = false; i++; continue } }
      field += ch; i++; continue
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === ',') { pushField(); i++; continue }
      if (ch === '\n') { pushField(); pushRow(); i++; continue }
      if (ch === '\r') { i++; continue }
      field += ch; i++
    }
  }
  pushField(); pushRow();
  return rows
}

function parseTimeHMS(hms: string): number {
  const cleaned = hms.replace(',', '.')
  const m = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!m) return NaN
  const hh = Number(m[1]); const mm = Number(m[2]); const ss = Number(m[3]); const ms = Number(m[4] || 0)
  return hh * 3600 + mm * 60 + ss + ms / 1000
}

function parseFlexibleTime(s: string | undefined): number {
  if (s == null) return NaN
  const str = String(s).trim()
  if (str === '') return NaN
  if (/^\d+(?:\.\d+)?$/.test(str)) return Number(str)
  const parts = str.replace(',', '.').split(':')
  if (parts.length === 2) { const mm = Number(parts[0]); const ss = Number(parts[1]); if (!Number.isNaN(mm) && !Number.isNaN(ss)) return mm * 60 + ss }
  if (parts.length === 3) { const hh = Number(parts[0]); const mm = Number(parts[1]); const ss = Number(parts[2]); if (!Number.isNaN(hh) && !Number.isNaN(mm) && !Number.isNaN(ss)) return hh * 3600 + mm * 60 + ss }
  return parseTimeHMS(str)
}

function normalizeSummaryRows(rows: string[][]): Array<{ start?: number, end?: number, text: string, category?: string, subcategory?: string, instructionMode?: string, review?: string, comments?: string, rowIndex?: number }> {
  if (!rows.length) return []
  const header = rows[0].map(h => h.trim().toLowerCase())
  let dataRows = rows.slice(1)
  const hasHeaderKeywords = header.some(h => ['start', 'starttime', 'start_time', 'time', 'timestamp', 'end', 'endtime', 'end_time', 'summary', 'text', 'description', 'category', 'sub_category', 'subcategory', 'label', 'tag', 'instruction mode', 'instruction_mode', 'instruction', 'mode', 'review', 'example', 'quality', 'importance', 'comments', 'comment'].includes(h))
  if (!hasHeaderKeywords) dataRows = rows
  const idxStart = (() => {
    let i = header.indexOf('start')
    if (i === -1) i = header.indexOf('starttime')
    if (i === -1) i = header.indexOf('start_time')
    if (i === -1) i = header.indexOf('time')
    if (i === -1) i = header.indexOf('timestamp')
    if (i === -1) i = header.indexOf('start_sec')
    if (i === -1) i = header.indexOf('startseconds')
    return i
  })()
  const idxEnd = (() => {
    let i = header.indexOf('end')
    if (i === -1) i = header.indexOf('endtime')
    if (i === -1) i = header.indexOf('end_time')
    if (i === -1) i = header.indexOf('end_sec')
    if (i === -1) i = header.indexOf('endseconds')
    return i
  })()
  let idxText = header.indexOf('summary'); if (idxText === -1) idxText = header.indexOf('text'); if (idxText === -1) idxText = header.indexOf('description')
  let idxCat = header.indexOf('category'); if (idxCat === -1) idxCat = header.indexOf('label'); if (idxCat === -1) idxCat = header.indexOf('tag')
  let idxSub = header.indexOf('sub_category'); if (idxSub === -1) idxSub = header.indexOf('subcategory');
  let idxInstr = header.indexOf('instruction mode'); if (idxInstr === -1) idxInstr = header.indexOf('instruction_mode'); if (idxInstr === -1) idxInstr = header.indexOf('instruction'); if (idxInstr === -1) idxInstr = header.indexOf('mode');
  let idxReview = header.indexOf('review'); if (idxReview === -1) idxReview = header.indexOf('example'); if (idxReview === -1) idxReview = header.indexOf('quality');
  const idxComments = (() => { let i = header.indexOf('comments'); if (i === -1) i = header.indexOf('comment'); return i })()
  const out: Array<{ start?: number, end?: number, text: string, category?: string, subcategory?: string, instructionMode?: string, review?: string, comments?: string, rowIndex?: number }> = [] as any
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i]
    if (!r || r.length === 0) continue
    if (hasHeaderKeywords) {
      const startVal = idxStart >= 0 ? parseFlexibleTime(r[idxStart]) : NaN
      const endVal = idxEnd >= 0 ? parseFlexibleTime(r[idxEnd]) : undefined
      const textVal = idxText >= 0 ? String(r[idxText] ?? '').trim() : String(r.filter(Boolean).join(' ')).trim()
      const catVal = idxCat >= 0 ? String(r[idxCat] ?? '').trim() : undefined
      const subVal = idxSub >= 0 ? String(r[idxSub] ?? '').trim() : undefined
      const instrVal = idxInstr >= 0 ? String(r[idxInstr] ?? '').trim() : undefined
      const reviewVal = idxReview >= 0 ? String(r[idxReview] ?? '').trim() : undefined
      const commentsVal = idxComments >= 0 ? String(r[idxComments] ?? '').trim() : undefined
      out.push({ start: startVal, end: endVal, text: textVal, category: catVal, subcategory: subVal, instructionMode: instrVal, review: reviewVal, comments: commentsVal, rowIndex: i })
    } else {
      const startVal = parseFlexibleTime(r[0])
      const textVal = String(r[r.length - 1] ?? '').trim()
      const endVal = r.length > 2 ? parseFlexibleTime(r[1]) : undefined
      out.push({ start: startVal, end: endVal, text: textVal, instructionMode: undefined, review: undefined, comments: undefined, rowIndex: i })
    }
  }
  return out as any
}

function normalizePhases(rows: string[][]): Array<{ start: number, end: number, label: string }>{
  if (!rows.length) return []
  const header = rows[0].map(h => h.trim().toLowerCase())
  let dataRows = rows.slice(1)
  const hasHeader = header.some(h => ['start', 'starttime', 'start_time', 'end', 'phase', 'label', 'name'].includes(h))
  if (!hasHeader) dataRows = rows
  const idxStart = (() => {
    let i = header.indexOf('start'); if (i === -1) i = header.indexOf('starttime'); if (i === -1) i = header.indexOf('start_time'); return i
  })()
  const idxEnd = (() => {
    let i = header.indexOf('end'); if (i === -1) i = header.indexOf('endtime'); if (i === -1) i = header.indexOf('end_time'); return i
  })()
  let idxLabel = header.indexOf('phase'); if (idxLabel === -1) idxLabel = header.indexOf('label'); if (idxLabel === -1) idxLabel = header.indexOf('name')
  const out: Array<{ start: number, end: number, label: string }> = []
  for (const r of dataRows) {
    if (!r || r.length === 0) continue
    if (hasHeader) {
      const s = idxStart >= 0 ? parseFlexibleTime(r[idxStart]) : NaN
      const e = idxEnd >= 0 ? parseFlexibleTime(r[idxEnd]) : NaN
      const label = idxLabel >= 0 ? String(r[idxLabel] ?? '').trim() : 'Phase'
      if (Number.isFinite(s) && Number.isFinite(e)) out.push({ start: s, end: e, label })
    } else {
      const s = parseFlexibleTime(r[0])
      const e = r.length > 1 ? parseFlexibleTime(r[1]) : NaN
      const label = r.length > 2 ? String(r[2] ?? '').trim() : 'Phase'
      if (Number.isFinite(s) && Number.isFinite(e)) out.push({ start: s, end: e, label })
    }
  }
  return out
}

function buildCategorySegments(items: Array<{ start?: number, end?: number, text: string, category?: string, subcategory?: string }>): Array<{ start: number, end: number, color: string, label: string }> {
  const segments: Array<{ start: number, end: number, color: string, label: string }> = []
  for (const it of items) {
    if (typeof it.start !== 'number' || !Number.isFinite(it.start)) continue
    if (typeof it.end !== 'number' || !Number.isFinite(it.end)) continue
    const label = (it.subcategory && it.subcategory.length) ? it.subcategory : (it.category && it.category.length ? it.category : 'Segment')
    const color = colorForCategory(label)
    segments.push({ start: it.start, end: it.end, color, label })
  }
  return segments.sort((a, b) => a.start - b.start)
}

function buildSegmentsFromSummaries(items: Array<{ start?: number, end?: number, text: string, instructionMode?: string, review?: string }>, total: number, labelPicker: (it: { start?: number, end?: number, text: string, instructionMode?: string, review?: string }) => string | null): Array<{ start: number, end: number, color: string, label: string }> {
  const raw: Array<{ start: number, end: number, label: string }> = []
  for (const it of items) {
    if (typeof it.start !== 'number' || !Number.isFinite(it.start)) continue
    const label = labelPicker(it)
    if (!label) continue
    const s = Math.max(0, it.start)
    let e = (typeof it.end === 'number' && Number.isFinite(it.end)) ? it.end! : s + 5
    if (!Number.isFinite(e)) e = s + 5
    if (total > 0) {
      e = Math.min(total, e)
    }
    if (e <= s) e = Math.min(total || s + 0.001, s + 0.001)
    raw.push({ start: s, end: e, label })
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end)
  // Merge adjacent segments with the same label if back-to-back
  const merged: Array<{ start: number, end: number, label: string }> = []
  for (const seg of raw) {
    const last = merged[merged.length - 1]
    if (last && last.label === seg.label && seg.start <= last.end + 0.001) {
      last.end = Math.max(last.end, seg.end)
    } else {
      merged.push({ ...seg })
    }
  }
  return merged.map(seg => ({ ...seg, color: colorForCategory(seg.label) }))
}

function colorForCategory(category: string): string {
  const key = String(category || '').toLowerCase()
  if (colorCache.has(key)) return colorCache.get(key) as string
  const palette = ['#4f8cff', '#7bde8a', '#f2c94c', '#f2994a', '#eb5757', '#bb6bd9', '#2dd4bf', '#a3e635', '#f472b6', '#60a5fa']
  const hash = Math.abs([...key].reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0))
  const color = palette[hash % palette.length]
  colorCache.set(key, color)
  return color
}

function normalizeInstructionModeLabel(s?: string): string {
  const v = String(s || '').trim().toLowerCase()
  if (!v) return ''
  if (v === 'bleeding handling' || v === 'bleeding') return 'Bleeding Handling'
  if (v === 'next step plan' || v === 'next step') return 'Next Step Plan'
  if (v === 'anatomy recognition' || v === 'anatomy') return 'Anatomy Recognition'
  if (v === 'action guidance' || v === 'action') return 'Action Guidance'
  if (v === 'hand coordination' || v === 'hand') return 'Hand Coordination'
  if (v === 'camera and view' || v === 'camera & view' || v === 'camera') return 'Camera and View'
  return s || ''
}

function instructionModeRank(s?: string): number {
  const v = normalizeInstructionModeLabel(s).toLowerCase()
  const order = [
    'bleeding handling',
    'next step plan',
    'anatomy recognition',
    'action guidance',
    'hand coordination',
    'camera and view',
  ]
  const idx = order.indexOf(v)
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function instructionModeColor(s?: string): string {
  const v = normalizeInstructionModeLabel(s).toLowerCase()
  if (v === 'bleeding handling') return '#fee2e2'
  if (v === 'next step plan') return '#fef3c7'
  if (v === 'anatomy recognition') return '#dbeafe'
  if (v === 'action guidance') return '#e0e7ff'
  if (v === 'hand coordination') return '#dcfce7'
  if (v === 'camera and view') return '#fce7f3'
  return '#e5e7eb'
}

function baseNameNoExt(path: string): string {
  const n = String(path || '').split('/').pop() || ''
  const idx = n.lastIndexOf('.')
  return (idx >= 0 ? n.slice(0, idx) : n).toLowerCase()
}

function colorForStandingImage(image?: string, fallbackLabel?: string): string {
  const b = baseNameNoExt(String(image || ''))
  if (b === 'a') return '#FBAA86'
  if (b === 'b') return '#D3A5E2'
  if (b === 'c') return '#ABBF41'
  return colorForCategory(fallbackLabel || image || 'Standing')
}

function isLikelyFilename(s: string): boolean {
  const v = String(s || '').toLowerCase().trim()
  return v.endsWith('.png') || v.endsWith('.jpg') || v.endsWith('.jpeg') || v.endsWith('.gif') || v.endsWith('.webp') || v.endsWith('.heic') || v.endsWith('.heif')
}

function normalizeStandingRows(rows: string[][]): Array<{ start?: number, end?: number, label?: string, image?: string }> {
  if (!rows.length) return []
  const header = rows[0].map(h => h.trim().toLowerCase())
  let dataRows = rows.slice(1)
  const hasHeader = header.some(h => ['start', 'end', 'label', 'position', 'standing', 'image', 'img', 'file', 'filename'].includes(h))
  if (!hasHeader) dataRows = rows
  const idxStart = header.indexOf('start')
  const idxEnd = header.indexOf('end')
  let idxLabel = header.indexOf('label'); if (idxLabel === -1) idxLabel = header.indexOf('position'); if (idxLabel === -1) idxLabel = header.indexOf('standing')
  let idxImage = header.indexOf('image'); if (idxImage === -1) idxImage = header.indexOf('img'); if (idxImage === -1) idxImage = header.indexOf('file'); if (idxImage === -1) idxImage = header.indexOf('filename')
  const out: Array<{ start?: number, end?: number, label?: string, image?: string }> = []
  for (const r of dataRows) {
    if (!r || r.length === 0) continue
    if (hasHeader) {
      const startVal = idxStart >= 0 ? parseFlexibleTime(r[idxStart]) : NaN
      const endVal = idxEnd >= 0 ? parseFlexibleTime(r[idxEnd]) : undefined
      const labelVal = idxLabel >= 0 ? String(r[idxLabel] ?? '').trim() : undefined
      let imageVal = idxImage >= 0 ? String(r[idxImage] ?? '').trim() : undefined
      const lowerLabel = (labelVal || '').toLowerCase()
      if (!imageVal && (lowerLabel.endsWith('.png') || lowerLabel.endsWith('.jpg') || lowerLabel.endsWith('.jpeg') || lowerLabel.endsWith('.gif') || lowerLabel.endsWith('.webp') || lowerLabel.endsWith('.heic') || lowerLabel.endsWith('.heif'))) {
        imageVal = labelVal
      }
      out.push({ start: startVal, end: endVal, label: labelVal, image: imageVal })
    } else {
      const startVal = parseFlexibleTime(r[0])
      const endVal = r.length > 1 ? parseFlexibleTime(r[1]) : undefined
      const labelVal = r.length > 2 ? String(r[2] ?? '').trim() : undefined
      const imageVal = r.length > 3 ? String(r[3] ?? '').trim() : undefined
      out.push({ start: startVal, end: endVal, label: labelVal, image: imageVal })
    }
  }
  return out
}

function buildStandingSegments(rows: Array<{ start?: number, end?: number, label?: string, image?: string }>): Array<{ start: number, end: number, label?: string, image?: string }> {
  const segs: Array<{ start: number, end: number, label?: string, image?: string }> = []
  for (const r of rows) {
    if (typeof r.start !== 'number' || !Number.isFinite(r.start)) continue
    if (typeof r.end !== 'number' || !Number.isFinite(r.end)) continue
    segs.push({ start: r.start, end: r.end, label: r.label, image: r.image })
  }
  return segs.sort((a, b) => a.start - b.start)
}


