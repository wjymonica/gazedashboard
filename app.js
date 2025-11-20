// State container for loaded data and UI references
const state = {
  videoUrl: null,
  gazeVideoUrl: null,
  useGazeVideo: false,
  duration: 0,
  transcriptCues: [], // {index,start,end,text}
  summaryItems: [], // {start,end?,text}
  categorySegments: [], // {start,end,category,color}
  categoryColorFor: new Map(),
  needsTimelineRerender: false,
};

// DOM references
const videoEl = document.getElementById('video');
const inputVideo = document.getElementById('input-video');
const inputSrt = document.getElementById('input-srt');
const inputSummary = document.getElementById('input-summary');
const inputCategories = document.getElementById('input-categories');
const transcriptListEl = document.getElementById('transcript-list');
const summaryListEl = document.getElementById('summary-list');
const timelineEl = document.getElementById('timeline');
const playheadEl = document.getElementById('playhead');
const legendEl = document.getElementById('timeline-legend');
const gazeToggleBtn = document.getElementById('btn-gaze-toggle');
const inputVideoGaze = document.getElementById('input-video-gaze');
const inputFps = document.getElementById('input-fps');

// File handlers
inputVideo.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  if (!state.useGazeVideo) {
    videoEl.src = state.videoUrl;
  }
});

inputSrt.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  state.transcriptCues = parseSrt(text);
  renderTranscript(state.transcriptCues);
});

inputSummary.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  state.summaryItems = normalizeSummaryRows(rows);
  renderSummary(state.summaryItems);
});

inputCategories.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  state.categorySegments = normalizeCategoryRows(rows).map((seg) => ({
    ...seg,
    color: colorForCategory((seg.subcategory && seg.subcategory.length) ? seg.subcategory : seg.category),
  }));
  maybeRenderTimeline();
});

// Gaze toggle
if (gazeToggleBtn) {
  gazeToggleBtn.addEventListener('click', () => {
    const pressed = gazeToggleBtn.getAttribute('aria-pressed') === 'true';
    const next = !pressed;
    gazeToggleBtn.setAttribute('aria-pressed', String(next));
    gazeToggleBtn.textContent = next ? 'Video + Gaze' : 'Video Only';
    switchVideoSource(next);
  });
}

// Gaze NPY loader
if (inputVideoGaze) {
  inputVideoGaze.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (state.gazeVideoUrl) URL.revokeObjectURL(state.gazeVideoUrl);
    state.gazeVideoUrl = URL.createObjectURL(file);
    if (state.useGazeVideo) {
      const cur = videoEl.currentTime || 0;
      const paused = videoEl.paused;
      videoEl.src = state.gazeVideoUrl;
      const onLoaded = () => {
        videoEl.currentTime = Math.min(cur, videoEl.duration || cur);
        if (!paused) videoEl.play().catch(() => {});
        videoEl.removeEventListener('loadedmetadata', onLoaded);
      };
      videoEl.addEventListener('loadedmetadata', onLoaded);
    }
  });
}

// Draw gaze dot synced to current time
videoEl.addEventListener('timeupdate', () => {
  if (!state.useGazeVideo) return;
  drawGazeAt(videoEl.currentTime);
});

function drawGazeAt(tSec) {
  if (!state.gaze || state.gaze.length === 0) return;
  // binary search nearest
  let lo = 0, hi = state.gaze.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (state.gaze[mid].t < tSec) lo = mid + 1; else hi = mid;
  }
  const idx = lo;
  const sample = state.gaze[Math.min(Math.max(idx, 0), state.gaze.length - 1)];
  const container = videoEl.parentElement;
  if (!container) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  const cx = clamp(sample.x, 0, 1) * w;
  const cy = clamp(sample.y, 0, 1) * h;
  // Render as a small circle using CSS transform
  gazeOverlayEl.innerHTML = '';
  const dot = document.createElement('div');
  dot.style.position = 'absolute';
  dot.style.width = '14px';
  dot.style.height = '14px';
  dot.style.borderRadius = '9999px';
  dot.style.background = 'rgba(255,0,0,0.9)';
  dot.style.boxShadow = '0 0 10px rgba(255,0,0,0.7)';
  dot.style.transform = `translate(${Math.max(0, cx - 7)}px, ${Math.max(0, cy - 7)}px)`;
  gazeOverlayEl.appendChild(dot);
}

// Minimal NPY parser (NumPy .npy v1.0+ little-endian, C order)
function parseNpy(arrayBuffer) {
  const magic = new Uint8Array(arrayBuffer, 0, 6);
  const magicStr = String.fromCharCode(...magic);
  if (!magicStr.startsWith('\u0093NUMPY') && magicStr !== '\u0093NUMPY') {
    // Allow raw bytes that decode to same
  }
  const view = new DataView(arrayBuffer);
  const major = view.getUint8(6);
  const minor = view.getUint8(7);
  const headerLen = major >= 2 ? view.getUint32(8, true) : view.getUint16(8, true);
  const headerOffset = major >= 2 ? 12 : 10;
  const headerBytes = new Uint8Array(arrayBuffer, headerOffset, headerLen);
  const headerStr = new TextDecoder('utf-8').decode(headerBytes).trim();
  // header is a Python dict-like string, e.g. {'descr': '<f8', 'fortran_order': False, 'shape': (3, 2), }
  const descrMatch = headerStr.match(/'descr':\s*'([^']+)'/);
  const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
  const shapeMatch = headerStr.match(/'shape':\s*\(([^\)]*)\)/);
  if (!descrMatch || !shapeMatch) throw new Error('Invalid NPY header');
  const descr = descrMatch[1];
  const fortran = fortranMatch ? fortranMatch[1] === 'True' : false;
  const shape = shapeMatch[1].split(',').map(s => s.trim()).filter(Boolean).map(s => Number(s));
  if (fortran) console.warn('Fortran-order arrays are not supported; interpreting as C-order.');

  const littleEndian = descr.startsWith('<') || descr.startsWith('|');
  const typeCode = descr.slice(1); // e.g. f8, f4
  const dataOffset = headerOffset + headerLen;
  const length = shape.reduce((a, b) => a * b, 1);

  let data;
  if (typeCode === 'f8') {
    data = new Float64Array(arrayBuffer, dataOffset, length);
  } else if (typeCode === 'f4') {
    data = new Float32Array(arrayBuffer, dataOffset, length);
  } else if (typeCode === 'i4') {
    data = new Int32Array(arrayBuffer, dataOffset, length);
  } else if (typeCode === 'i2') {
    data = new Int16Array(arrayBuffer, dataOffset, length);
  } else if (typeCode === 'i1' || typeCode === 'b1') {
    data = new Int8Array(arrayBuffer, dataOffset, length);
  } else if (typeCode === 'u4') {
    data = new Uint32Array(arrayBuffer, dataOffset, length);
  } else if (typeCode === 'u2') {
    data = new Uint16Array(arrayBuffer, dataOffset, length);
  } else if (typeCode === 'u1') {
    data = new Uint8Array(arrayBuffer, dataOffset, length);
  } else {
    throw new Error(`Unsupported NPY dtype: ${descr}`);
  }
  if (!littleEndian) console.warn('Big-endian arrays may be misread');
  return { data, shape, descr };
}

// Video events
videoEl.addEventListener('loadedmetadata', () => {
  state.duration = videoEl.duration || 0;
  maybeRenderTimeline();
});

videoEl.addEventListener('timeupdate', () => {
  updateActiveCue(videoEl.currentTime);
  updatePlayhead(videoEl.currentTime, state.duration);
});

// Rendering functions
function renderTranscript(cues) {
  transcriptListEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const cue of cues) {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.start = String(cue.start);
    item.dataset.end = String(cue.end);
    item.dataset.clickable = 'true';
    const timeEl = document.createElement('div');
    timeEl.className = 'item-time';
    timeEl.textContent = `${formatTime(cue.start)} → ${formatTime(cue.end)}`;
    const textEl = document.createElement('div');
    textEl.className = 'item-text';
    textEl.textContent = cue.text;
    item.appendChild(timeEl);
    item.appendChild(textEl);
    item.addEventListener('click', () => seekTo(cue.start));
    frag.appendChild(item);
  }
  transcriptListEl.appendChild(frag);
}

function renderSummary(items) {
  summaryListEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const row of items) {
    const item = document.createElement('div');
    const hasStart = typeof row.start === 'number' && !Number.isNaN(row.start);
    const hasAnyTime = hasStart;
    item.className = 'item';
    item.dataset.clickable = hasAnyTime ? 'true' : 'false';
    if (hasStart) {
      item.dataset.start = String(row.start);
    }
    if (typeof row.end === 'number') {
      item.dataset.end = String(row.end);
    }
    if (hasAnyTime) {
      const timeEl = document.createElement('div');
      timeEl.className = 'item-time';
      if (typeof row.end === 'number') {
        timeEl.textContent = `${formatTime(row.start)} → ${formatTime(row.end)}`;
      } else {
        timeEl.textContent = `${formatTime(row.start)}`;
      }
      item.appendChild(timeEl);
    }
    const textEl = document.createElement('div');
    textEl.className = 'item-text';
    textEl.textContent = row.text;
    item.appendChild(textEl);
    if (hasStart) {
      item.addEventListener('click', () => seekTo(row.start));
    }
    frag.appendChild(item);
  }
  summaryListEl.appendChild(frag);
}

function maybeRenderTimeline() {
  if (!state.categorySegments.length || !state.duration) return;
  renderTimeline(state.categorySegments, state.duration);
}

function renderTimeline(segments, duration) {
  timelineEl.innerHTML = '';
  legendEl.innerHTML = '';
  const total = duration > 0 ? duration : 0;
  const frag = document.createDocumentFragment();
  for (const seg of segments) {
    const clampedStart = clamp(seg.start, 0, total);
    const clampedEnd = clamp(seg.end ?? total, clampedStart, total);
    const segDur = Math.max(0, clampedEnd - clampedStart);
    const widthPct = total > 0 ? (segDur / total) * 100 : 0;
    const div = document.createElement('div');
    div.className = 'segment';
    div.style.width = `${widthPct}%`;
    div.style.background = seg.color;
    const labelKey = (seg.subcategory && seg.subcategory.length) ? seg.subcategory : seg.category;
    div.title = `${labelKey} • ${formatTime(clampedStart)} → ${formatTime(clampedEnd)}`;
    div.addEventListener('click', () => seekTo(clampedStart));
    frag.appendChild(div);
  }
  timelineEl.appendChild(frag);

  const uniqueLabels = Array.from(new Set(segments.map(s => (s.subcategory && s.subcategory.length) ? s.subcategory : s.category)));
  const legendFrag = document.createDocumentFragment();
  for (const labelText of uniqueLabels) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    const color = colorForCategory(labelText);
    swatch.style.background = color;
    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.color = color;
    item.appendChild(swatch);
    item.appendChild(label);
    legendFrag.appendChild(item);
  }
  legendEl.appendChild(legendFrag);
}

function updateActiveCue(currentTime) {
  if (!state.transcriptCues.length) return;
  const idx = state.transcriptCues.findIndex(c => currentTime >= c.start && currentTime < c.end);
  const items = transcriptListEl.querySelectorAll('.item');
  let activeChanged = false;
  items.forEach((el, i) => {
    const shouldActive = i === idx;
    if (shouldActive !== el.classList.contains('active')) {
      el.classList.toggle('active', shouldActive);
      if (shouldActive) activeChanged = true;
    }
  });
  if (activeChanged && idx >= 0) {
    const activeEl = items[idx];
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

function updatePlayhead(currentTime, duration) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  playheadEl.style.left = `${pct}%`;
}

function seekTo(timeSec) {
  if (typeof timeSec !== 'number' || Number.isNaN(timeSec)) return;
  videoEl.currentTime = Math.max(0, Math.min(timeSec, state.duration || Infinity));
  videoEl.play().catch(() => {});
}

// Swap video source while preserving currentTime
function switchVideoSource(useGaze) {
  const current = videoEl.currentTime || 0;
  const wasPaused = videoEl.paused;
  state.useGazeVideo = useGaze;
  if (useGaze && state.gazeVideoUrl) {
    videoEl.src = state.gazeVideoUrl;
  } else if (!useGaze && state.videoUrl) {
    videoEl.src = state.videoUrl;
  }
  const onLoaded = () => {
    videoEl.currentTime = Math.min(current, videoEl.duration || current);
    if (!wasPaused) videoEl.play().catch(() => {});
    videoEl.removeEventListener('loadedmetadata', onLoaded);
  };
  videoEl.addEventListener('loadedmetadata', onLoaded);
}

// Parsing utilities
function parseSrt(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    // Skip empty lines
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;
    // Optional index line
    let index = null;
    if (/^\d+$/.test(lines[i].trim())) {
      index = Number(lines[i].trim());
      i++;
    }
    // Time range line
    const timeLine = lines[i++] || '';
    const match = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/);
    if (!match) {
      // Malformed block; skip until next blank
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }
    const start = parseTime(match[1]);
    const end = parseTime(match[2]);
    // Accumulate text
    const textLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i++]);
    }
    const cueText = textLines.join('\n').replace(/<[^>]+>/g, '').trim();
    if (Number.isFinite(start) && Number.isFinite(end)) {
      cues.push({ index: index ?? cues.length + 1, start, end, text: cueText });
    }
  }
  return cues;
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // Ignore empty trailing row
    if (row.length === 1 && row[0].trim() === '') {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };
  const s = text;
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ',') {
        pushField();
        i++;
        continue;
      }
      if (ch === '\n') {
        pushField();
        pushRow();
        i++;
        continue;
      }
      if (ch === '\r') { i++; continue; }
      field += ch;
      i++;
    }
  }
  // Flush last field/row
  pushField();
  pushRow();
  return rows;
}

function normalizeSummaryRows(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  let dataRows = rows.slice(1);
  const hasHeaderKeywords = header.some(h => ['start', 'end', 'summary', 'text', 'description'].includes(h));
  if (!hasHeaderKeywords) {
    // No header; treat all rows as data
    dataRows = rows;
  }
  const idxStart = header.indexOf('start');
  const idxEnd = header.indexOf('end');
  let idxText = header.indexOf('summary');
  if (idxText === -1) idxText = header.indexOf('text');
  if (idxText === -1) idxText = header.indexOf('description');

  const out = [];
  for (const r of dataRows) {
    if (!r || r.length === 0) continue;
    if (hasHeaderKeywords) {
      const startVal = idxStart >= 0 ? parseFlexibleTime(r[idxStart]) : NaN;
      const endVal = idxEnd >= 0 ? parseFlexibleTime(r[idxEnd]) : undefined;
      const textVal = idxText >= 0 ? String(r[idxText] ?? '').trim() : String(r.filter(Boolean).join(' ')).trim();
      out.push({ start: startVal, end: endVal, text: textVal });
    } else {
      // heuristic: first col start?, last col text
      const startVal = parseFlexibleTime(r[0]);
      const textVal = String(r[r.length - 1] ?? '').trim();
      const endVal = r.length > 2 ? parseFlexibleTime(r[1]) : undefined;
      out.push({ start: startVal, end: endVal, text: textVal });
    }
  }
  return out;
}

function normalizeCategoryRows(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  let dataRows = rows.slice(1);
  const hasHeaderKeywords = header.some(h => ['start', 'end', 'category', 'label', 'tag'].includes(h));
  if (!hasHeaderKeywords) {
    dataRows = rows;
  }
  const idxStart = header.indexOf('start');
  const idxEnd = header.indexOf('end');
  let idxCat = header.indexOf('category');
  if (idxCat === -1) idxCat = header.indexOf('label');
  if (idxCat === -1) idxCat = header.indexOf('tag');
  // optional subcategory index
  let idxSub = header.indexOf('subcategory');
  if (idxSub === -1) idxSub = header.indexOf('sub_category');
  if (idxSub === -1) idxSub = header.indexOf('subcat');
  if (idxSub === -1) idxSub = header.indexOf('sub');

  const out = [];
  for (const r of dataRows) {
    if (!r || r.length === 0) continue;
    if (hasHeaderKeywords) {
      const startVal = idxStart >= 0 ? parseFlexibleTime(r[idxStart]) : NaN;
      const endVal = idxEnd >= 0 ? parseFlexibleTime(r[idxEnd]) : NaN;
      const catVal = idxCat >= 0 ? String(r[idxCat] ?? '').trim() : 'Segment';
      const subVal = idxSub >= 0 ? String(r[idxSub] ?? '').trim() : undefined;
      if (Number.isFinite(startVal) && Number.isFinite(endVal)) {
        out.push({ start: startVal, end: endVal, category: catVal, subcategory: subVal });
      }
    } else {
      // heuristic: start, end, category, [subcategory]
      const startVal = parseFlexibleTime(r[0]);
      const endVal = parseFlexibleTime(r[1]);
      const catVal = String(r[2] ?? 'Segment').trim();
      const subVal = r.length > 3 ? String(r[3] ?? '').trim() : undefined;
      if (Number.isFinite(startVal) && Number.isFinite(endVal)) {
        out.push({ start: startVal, end: endVal, category: catVal, subcategory: subVal });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// Color mapping
function colorForCategory(category) {
  const key = String(category || '').toLowerCase();
  if (state.categoryColorFor.has(key)) return state.categoryColorFor.get(key);
  const palette = [
    '#4f8cff', '#7bde8a', '#f2c94c', '#f2994a', '#eb5757', '#bb6bd9', '#2dd4bf', '#a3e635', '#f472b6', '#60a5fa'
  ];
  const hash = Math.abs([...key].reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0));
  const color = palette[hash % palette.length];
  state.categoryColorFor.set(key, color);
  return color;
}

// Time helpers
function parseTime(hms) {
  const cleaned = hms.replace(',', '.');
  const m = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number(m[4] || 0);
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

function parseFlexibleTime(s) {
  if (s == null) return NaN;
  const str = String(s).trim();
  if (str === '') return NaN;
  if (/^\d+(?:\.\d+)?$/.test(str)) {
    return Number(str);
  }
  // mm:ss[.ms] or hh:mm:ss[.ms]
  const parts = str.replace(',', '.').split(':');
  if (parts.length === 2) {
    const mm = Number(parts[0]);
    const ss = Number(parts[1]);
    if (!Number.isNaN(mm) && !Number.isNaN(ss)) return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    const ss = Number(parts[2]);
    if (!Number.isNaN(hh) && !Number.isNaN(mm) && !Number.isNaN(ss)) return hh * 3600 + mm * 60 + ss;
  }
  // srt-like
  const t = parseTime(str);
  return t;
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}


