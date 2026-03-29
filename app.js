/* ═══════════════════════════════════════════════════════════════
   PITTSBURGH BRIDGE TRACKER — app.js
   Vanilla JS · Leaflet · LocalStorage · No dependencies
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── STATE ──────────────────────────────────────────────────── */
const state = {
  bridges: [],
  checkins: {},       // { bridgeId: { date: ISO string, count: number } }
  userPos: null,      // { lat, lng }
  userAccuracy: null,
  map: null,
  markers: {},        // { bridgeId: L.marker }
  userMarker: null,
  userCircle: null,
  watchId: null,
  activeTab: 'map',
  activeModal: null,  // bridge object currently shown in modal
  nearestBridge: null,
  nearestDist: null,
};

/* ─── BADGE DEFINITIONS ─────────────────────────────────────── */
const BADGE_DEFS = [
  // — Milestones —
  { id: 'first_steps',     emoji: '🌉', name: 'First Steps',          category: 'milestone', desc: 'Cross your first bridge' },
  { id: 'double_digits',   emoji: '🔟', name: 'Double Digits',        category: 'milestone', desc: 'Cross 10 bridges' },
  { id: 'quarter_century', emoji: '🏅', name: 'Quarter Century',      category: 'milestone', desc: 'Cross 25 bridges' },
  { id: 'fifty_counting',  emoji: '⭐', name: 'Fifty and Counting',   category: 'milestone', desc: 'Cross 50 bridges' },
  { id: 'century_club',    emoji: '💯', name: 'Century Club',         category: 'milestone', desc: 'Cross 100 bridges' },
  { id: 'halfway_there',   emoji: '🏆', name: 'Halfway There',        category: 'milestone', desc: 'Cross half of all bridges in the database' },
  { id: 'bridge_master',   emoji: '👑', name: 'Bridge Master',        category: 'milestone', desc: 'Cross every bridge in the database' },
  // — Rivers —
  { id: 'allegheny',       emoji: '🟡', name: 'Allegheny Explorer',      category: 'river', desc: 'Cross all bridges over the Allegheny River' },
  { id: 'monongahela',     emoji: '🔵', name: 'Monongahela Navigator',   category: 'river', desc: 'Cross all bridges over the Monongahela River' },
  { id: 'ohio',            emoji: '🟢', name: 'Ohio Adventurer',         category: 'river', desc: 'Cross all bridges over the Ohio River' },
  { id: 'three_rivers',    emoji: '🌊', name: 'Three Rivers Champion',   category: 'river', desc: 'Earn all three river badges' },
  // — Speed & Streaks —
  { id: 'bridge_blitz',    emoji: '⚡', name: 'Bridge Blitz',       category: 'speed', desc: 'Cross 5 bridges in a single day' },
  { id: 'on_fire',         emoji: '🔥', name: 'On Fire',             category: 'speed', desc: 'Cross at least one bridge on 3 consecutive days' },
  { id: 'weekly_warrior',  emoji: '🗓️', name: 'Weekly Warrior',     category: 'speed', desc: 'Cross at least one bridge on 7 consecutive days' },
  { id: 'marathon',        emoji: '💪', name: 'Marathon',            category: 'speed', desc: 'Cross 10 bridges in a single day' },
  // — Neighborhoods —
  { id: 'neigh_complete',  emoji: '🏘️', name: 'Neighborhood Complete', category: 'neighborhood', desc: 'Cross every bridge in any single neighborhood' },
  { id: 'well_traveled',   emoji: '🗺️', name: 'Well Traveled',         category: 'neighborhood', desc: 'Cross bridges in 10 different neighborhoods' },
  { id: 'city_explorer',   emoji: '🌍', name: 'City Explorer',          category: 'neighborhood', desc: 'Cross bridges in 20 different neighborhoods' },
  // — Bridge Types —
  { id: 'truss_collector', emoji: '🔺', name: 'Truss Collector',    category: 'type', desc: 'Cross 5 truss bridges' },
  { id: 'arch_enthusiast', emoji: '🌈', name: 'Arch Enthusiast',    category: 'type', desc: 'Cross 5 arch bridges' },
  { id: 'type_sampler',    emoji: '🏗️', name: 'Type Sampler',      category: 'type', desc: 'Cross at least one bridge of every type in the database' },
  // — Special —
  { id: 'history_buff',    emoji: '📸', name: 'History Buff',       category: 'special', desc: 'Cross 10 bridges built before 1930' },
  { id: 'modern_explorer', emoji: '🆕', name: 'Modern Explorer',    category: 'special', desc: 'Cross 5 bridges built after 2000' },
  { id: 'going_distance',  emoji: '📏', name: 'Going the Distance', category: 'special', desc: 'Cross the longest bridge in the database' },
  { id: 'old_faithful',    emoji: '🏛️', name: 'Old Faithful',      category: 'special', desc: 'Cross the oldest bridge in the database' },
];

let _badgeQueue = [];  // badges to show after celebration dismissal

/* ─── FILTER STATE ───────────────────────────────────────────── */
const filterState = {
  status:       'all',     // 'all' | 'crossed' | 'uncrossed'
  sort:         'default', // 'default' | 'distance' | 'date-desc' | 'name' | 'year-asc' | 'year-desc' | 'length-desc'
  neighborhood: '',
  type:         '',
  crosses:      '',        // '' | 'river' | 'highway' | 'railroad' | 'valley' | 'creek'
};

/* ─── WIKIPEDIA IMAGE CACHE ──────────────────────────────────── */
const wikiImageCache = {}; // { articleTitle: url | null }

async function fetchWikiImage(title) {
  if (wikiImageCache[title] !== undefined) return wikiImageCache[title];
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const resp = await fetch(url);
    if (!resp.ok) { wikiImageCache[title] = null; return null; }
    const data = await resp.json();
    const imgUrl = data.thumbnail ? data.thumbnail.source : null;
    wikiImageCache[title] = imgUrl;
    return imgUrl;
  } catch {
    wikiImageCache[title] = null;
    return null;
  }
}

/* ─── CONSTANTS ──────────────────────────────────────────────── */
const STORAGE_KEY     = 'pittsburgh-bridge-checkins';
const CHECKIN_RADIUS  = 152;   // metres (~500 ft)
const PITTSBURGH_LAT  = 40.4406;
const PITTSBURGH_LNG  = -79.9959;
const DEFAULT_ZOOM    = 13;
const CONFETTI_COLORS = ['#FFB612','#4A90D9','#3fb950','#f85149','#ff7b00','#c9d1d9'];

/* ─── INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  // iOS vh fix
  setVH();
  window.addEventListener('resize', setVH);

  loadCheckins();

  try {
    const resp = await fetch('./bridges.json');
    if (!resp.ok) throw new Error('Failed to load bridges.json');
    state.bridges = await resp.json();
  } catch (err) {
    console.error('Bridge data load error:', err);
  }

  populateFilterDropdowns();
  initCollectionFilters();
  initBackupButtons();
  initBadgePopup();

  hideLoading();
  initNav();   // wire up buttons first so UI is always responsive

  try {
    initMap();
  } catch (err) {
    console.error('Map init failed:', err);
    document.getElementById('map').innerHTML =
      '<p style="color:#8b949e;padding:24px;text-align:center">⚠️ Map failed to load.<br>Check your internet connection and reload.</p>';
  }

  startGPS();
  registerSW();
}

function setVH() {
  document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
}

function hideLoading() {
  const screen = document.getElementById('loading-screen');
  const app    = document.getElementById('app');
  screen.classList.add('fade-out');
  app.classList.remove('hidden');
  setTimeout(() => screen.remove(), 500);
}

/* ─── SERVICE WORKER ─────────────────────────────────────────── */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
}

/* ─── LOCAL STORAGE ──────────────────────────────────────────── */
function loadCheckins() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.checkins = raw ? JSON.parse(raw) : {};
  } catch {
    state.checkins = {};
  }
}

function saveCheckins() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.checkins));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('LocalStorage quota exceeded');
    }
  }
}

/* ─── TOAST ──────────────────────────────────────────────────── */
let _toastTimer = null;
function showToast(msg, durationMs = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'toast-hide');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.add('toast-hide');
    setTimeout(() => el.classList.add('hidden'), 350);
  }, durationMs);
}

/* ─── EXPORT / IMPORT ────────────────────────────────────────── */
function initBackupButtons() {
  document.getElementById('export-btn').addEventListener('click', exportCheckins);
  document.getElementById('share-card-btn').addEventListener('click', generateShareCard);
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';   // reset so same file can be re-selected
    if (file) readBackupFile(file);
  });

  // Confirm modal wiring
  document.getElementById('import-confirm-backdrop').addEventListener('click', closeImportConfirm);
  document.getElementById('import-confirm-cancel').addEventListener('click', closeImportConfirm);
}

function exportCheckins() {
  const exportDate = new Date().toISOString();
  const payload = {
    exportDate,
    appVersion:     'pittsburgh-bridge-tracker',
    bridgesCrossed: getCrossedCount(),
    badgesEarned:   evaluateBadges().filter(r => r.earned).length,
    checkins:       state.checkins,
  };
  const json  = JSON.stringify(payload, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const dateStr = exportDate.slice(0, 10);  // YYYY-MM-DD
  const filename = `bridge-tracker-backup-${dateStr}.json`;

  // Use Web Share API when available (iOS/Android) so it opens the share sheet
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'application/json' })] })) {
    const file = new File([blob], filename, { type: 'application/json' });
    navigator.share({ files: [file], title: 'Bridge Tracker Backup' })
      .then(() => showToast('Backup saved!'))
      .catch(err => { if (err.name !== 'AbortError') showToast('Export failed. Try again.'); });
  } else {
    // Fallback: trigger download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup saved!');
  }
}

/* ─── SHARE PROGRESS CARD ────────────────────────────────────── */
function generateShareCard() {
  showToast('Generating card…');

  // ── Canvas setup ─────────────────────────────────────────────
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Design tokens (match app theme) ──────────────────────────
  const GOLD  = '#FFB612';
  const BLUE  = '#4A90D9';
  const SURF  = '#161b22';
  const SURF2 = '#21262d';
  const SURF3 = '#30363d';
  const TEXT  = '#e6edf3';
  const MUTED = '#8b949e';
  const DIM   = '#484f58';
  const P     = 80;   // horizontal padding

  // ── Gather stats ─────────────────────────────────────────────
  const total   = state.bridges.length;
  const crossed = getCrossedCount();
  const pct     = total > 0 ? crossed / total * 100 : 0;

  const sortedCI = Object.entries(state.checkins)
    .sort(([,a],[,b]) => a.date < b.date ? -1 : 1);

  const crossedBridges = state.bridges.filter(b => state.checkins[b.id]);
  const neighCount = new Set(
    crossedBridges.filter(b => b.neighborhood).map(b => b.neighborhood)
  ).size;

  const badgeResults = evaluateBadges();
  const badgesEarned = badgeResults.filter(r => r.earned).length;
  const badgesTotal  = badgeResults.length;

  const firstCI    = sortedCI[0];
  const lastCI     = sortedCI[sortedCI.length - 1];
  const firstBridge = firstCI ? state.bridges.find(b => b.id === firstCI[0]) : null;
  const lastBridge  = lastCI  ? state.bridges.find(b => b.id === lastCI[0])  : null;

  // ── Helpers ───────────────────────────────────────────────────
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y,     x + r, y,     r);
    ctx.closePath();
  }

  function truncate(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  // ── Background gradient ───────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0d1117');
  bgGrad.addColorStop(1, '#121920');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial glow behind number
  if (crossed > 0) {
    const glow = ctx.createRadialGradient(W / 2, 330, 0, W / 2, 330, 340);
    glow.addColorStop(0, 'rgba(255,182,18,0.07)');
    glow.addColorStop(1, 'rgba(255,182,18,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // Gold top accent bar
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 8);

  // ── App header ────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = '500 30px Arial, sans-serif';
  ctx.fillText('Pittsburgh Bridge Tracker', W / 2, 62);

  // Bridge emoji
  ctx.font = '76px Arial, sans-serif';
  ctx.fillText('🌉', W / 2, 150);

  // ── Main stat ─────────────────────────────────────────────────
  const numberFont = crossed >= 100 ? 150 : (crossed >= 10 ? 190 : 220);
  ctx.fillStyle = crossed > 0 ? GOLD : MUTED;
  ctx.font      = `bold ${numberFont}px Arial, sans-serif`;
  ctx.fillText(String(crossed), W / 2, 378);

  ctx.fillStyle = TEXT;
  ctx.font      = '500 44px Arial, sans-serif';
  ctx.fillText(`of ${total} bridges crossed`, W / 2, 446);

  if (crossed === 0) {
    ctx.fillStyle = DIM;
    ctx.font = '400 32px Arial, sans-serif';
    ctx.fillText('The adventure begins! 🚀', W / 2, 498);
  }

  // ── Progress bar ─────────────────────────────────────────────
  const barTop = 520;
  const barW   = W - P * 2;
  const barH2  = 22;

  roundRect(P, barTop, barW, barH2, 11);
  ctx.fillStyle = SURF2;
  ctx.fill();

  if (pct > 0) {
    const fillW = Math.max(barH2, barW * pct / 100);
    const fGrad = ctx.createLinearGradient(P, 0, P + barW, 0);
    fGrad.addColorStop(0, GOLD);
    fGrad.addColorStop(1, '#ffd060');
    roundRect(P, barTop, fillW, barH2, 11);
    ctx.fillStyle = fGrad;
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font      = '500 28px Arial, sans-serif';
  ctx.fillText(`${pct.toFixed(1)}% complete`, W / 2, barTop + barH2 + 46);

  // ── Divider ───────────────────────────────────────────────────
  const divY = 650;
  ctx.strokeStyle = SURF2;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(P, divY);
  ctx.lineTo(W - P, divY);
  ctx.stroke();

  // ── Stat boxes ────────────────────────────────────────────────
  const boxGap = 20;
  const boxW   = (W - P * 2 - boxGap) / 2;
  const boxH2  = 162;
  const boxTop = 672;
  const boxR   = 18;

  // Box 1: Neighborhoods
  roundRect(P, boxTop, boxW, boxH2, boxR);
  ctx.fillStyle   = SURF;
  ctx.fill();
  ctx.strokeStyle = SURF3;
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = DIM;
  ctx.font      = '700 20px Arial, sans-serif';
  ctx.fillText('NEIGHBORHOODS', P + boxW / 2, boxTop + 40);

  ctx.fillStyle = BLUE;
  ctx.font      = `bold ${neighCount >= 10 ? 72 : 86}px Arial, sans-serif`;
  ctx.fillText(String(neighCount), P + boxW / 2, boxTop + 126);

  ctx.fillStyle = MUTED;
  ctx.font      = '400 22px Arial, sans-serif';
  ctx.fillText('explored', P + boxW / 2, boxTop + 152);

  // Box 2: Badges
  const b2X = P + boxW + boxGap;
  roundRect(b2X, boxTop, boxW, boxH2, boxR);
  ctx.fillStyle   = SURF;
  ctx.fill();
  ctx.strokeStyle = SURF3;
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = DIM;
  ctx.font      = '700 20px Arial, sans-serif';
  ctx.fillText('BADGES EARNED', b2X + boxW / 2, boxTop + 40);

  ctx.fillStyle = GOLD;
  ctx.font      = `bold ${badgesEarned >= 10 ? 72 : 86}px Arial, sans-serif`;
  ctx.fillText(String(badgesEarned), b2X + boxW / 2, boxTop + 116);

  ctx.fillStyle = MUTED;
  ctx.font      = '500 26px Arial, sans-serif';
  ctx.fillText(`of ${badgesTotal}`, b2X + boxW / 2, boxTop + 152);

  // ── Bridge name rows ──────────────────────────────────────────
  const nameMaxW  = W - P * 2;
  let   nameY     = boxTop + boxH2 + 50;
  const lineH     = 44;

  function drawBridgeStat(label, bridgeName, date) {
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.font      = '700 20px Arial, sans-serif';
    ctx.fillText(label, P, nameY);
    nameY += lineH - 4;

    ctx.font      = '600 34px Arial, sans-serif';
    ctx.fillStyle = TEXT;
    ctx.fillText(truncate(bridgeName, nameMaxW), P, nameY);
    nameY += 38;

    ctx.font      = '400 26px Arial, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(date, P, nameY);
    nameY += 52;
  }

  if (firstBridge && firstCI) {
    drawBridgeStat('FIRST BRIDGE CROSSED', firstBridge.name, fmtDate(firstCI[1].date));
  }
  if (lastBridge && lastCI && lastBridge.id !== firstBridge?.id) {
    drawBridgeStat('MOST RECENT', lastBridge.name, fmtDate(lastCI[1].date));
  }

  // ── Tagline ───────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = DIM;
  ctx.font      = '400 28px Arial, sans-serif';
  ctx.fillText('Exploring Pittsburgh, one bridge at a time 🌉', W / 2, H - 60);

  // Blue bottom accent bar
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, H - 8, W, 8);

  // ── Export as PNG ─────────────────────────────────────────────
  canvas.toBlob(blob => {
    if (!blob) { showToast('⚠️ Could not generate card.'); return; }
    const dateStr = new Date().toISOString().slice(0, 10);
    const fname   = `pgh-bridges-${dateStr}.png`;
    const file    = new File([blob], fname, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'My Pittsburgh Bridge Progress' })
        .then(() => showToast('Card shared!'))
        .catch(err => { if (err.name !== 'AbortError') showToast('Share cancelled.'); });
    } else {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Progress card downloaded!');
    }
  }, 'image/png');
}

function readBackupFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch {
      showToast('⚠️ Invalid file — not a valid backup.');
      return;
    }

    // Validate structure
    if (!data || typeof data.checkins !== 'object') {
      showToast('⚠️ Invalid backup file format.');
      return;
    }

    const backupDate   = data.exportDate ? fmtDate(data.exportDate) : 'unknown date';
    const backupCount  = Object.keys(data.checkins).length;
    const currentCount = getCrossedCount();

    // Filter checkins to only known bridge IDs
    const knownIds   = new Set(state.bridges.map(b => b.id));
    const validCheckins = {};
    let skipped = 0;
    for (const [id, val] of Object.entries(data.checkins)) {
      if (knownIds.has(id)) {
        validCheckins[id] = val;
      } else {
        skipped++;
      }
    }
    const validCount = Object.keys(validCheckins).length;

    // Show confirm dialog
    const body = `Backup from ${backupDate} contains ${backupCount} check-in${backupCount !== 1 ? 's' : ''}` +
      (skipped > 0 ? ` (${skipped} bridge${skipped !== 1 ? 's' : ''} not in current data will be skipped)` : '') +
      `.\n\nYou currently have ${currentCount} bridge${currentCount !== 1 ? 's' : ''} checked in.\n\nThis will replace your current check-in data.`;

    document.getElementById('import-confirm-body').textContent = body;

    const okBtn = document.getElementById('import-confirm-ok');
    okBtn.onclick = () => {
      applyImport(validCheckins, validCount, backupDate);
      closeImportConfirm();
    };

    document.getElementById('import-confirm-modal').classList.remove('hidden');
  };

  reader.onerror = () => showToast('⚠️ Could not read file.');
  reader.readAsText(file);
}

function applyImport(validCheckins, count, backupDate) {
  state.checkins = validCheckins;
  saveCheckins();

  // Refresh map markers
  state.bridges.forEach(b => updateMarkerIcon(b.id));
  updateNearestCard();

  if (state.activeTab === 'collection') renderCollection();
  if (state.activeTab === 'badges')    renderBadges();

  showToast(`Restored ${count} bridge check-in${count !== 1 ? 's' : ''} from ${backupDate}`, 4000);
}

function closeImportConfirm() {
  document.getElementById('import-confirm-modal').classList.add('hidden');
}

function isCheckedIn(bridgeId) {
  return Boolean(state.checkins[bridgeId]);
}

function getCrossedCount() {
  return Object.keys(state.checkins).length;
}

/* ─── HAVERSINE DISTANCE ─────────────────────────────────────── */
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371000; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDistance(metres) {
  const feet = metres * 3.28084;
  if (feet < 1000) return `${Math.round(feet)} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}

function getNearestUncrossed() {
  if (!state.userPos || !state.bridges.length) return null;
  let best = null, bestDist = Infinity;
  for (const b of state.bridges) {
    if (isCheckedIn(b.id)) continue;
    const d = haversine(state.userPos.lat, state.userPos.lng, b.latitude, b.longitude);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  return best ? { bridge: best, distanceM: bestDist } : null;
}

/* ─── MAP ────────────────────────────────────────────────────── */
function initMap() {
  state.map = L.map('map', {
    center: [PITTSBURGH_LAT, PITTSBURGH_LNG],
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    attributionControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);

  // Move attribution to top-right to keep bottom clear
  state.map.attributionControl.setPosition('topright');

  // Add zoom control top-right
  L.control.zoom({ position: 'topright' }).addTo(state.map);

  // Add all bridge markers
  for (const bridge of state.bridges) {
    addBridgeMarker(bridge);
  }

  // Locate button
  document.getElementById('locate-btn').addEventListener('click', centerOnUser);
}

function makeMarkerIcon(crossed) {
  return L.divIcon({
    className: '',
    html: `<div class="bridge-marker ${crossed ? 'bridge-marker-crossed' : 'bridge-marker-uncrossed'}">${crossed ? '✓' : '🌉'}</div>`,
    iconSize:   [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function addBridgeMarker(bridge) {
  const crossed = isCheckedIn(bridge.id);
  const marker  = L.marker([bridge.latitude, bridge.longitude], {
    icon: makeMarkerIcon(crossed),
    title: bridge.name,
    riseOnHover: true,
  }).addTo(state.map);

  marker.bindPopup(() => buildPopupHTML(bridge), {
    maxWidth: 260,
    className: 'bridge-popup',
  });

  marker.on('click', () => {
    // Brief delay so popup renders before we attach listeners
    setTimeout(() => attachPopupListeners(bridge), 50);
  });

  state.markers[bridge.id] = marker;
}

function buildPopupHTML(bridge) {
  const crossed = isCheckedIn(bridge.id);
  const checkin = state.checkins[bridge.id];
  const meta    = [bridge.type, bridge.crosses].filter(Boolean).join(' · ');

  return `
    <div class="popup-name">${bridge.name}</div>
    ${crossed ? `<div class="popup-crossed-badge">✅ Crossed${checkin ? ' · ' + fmtDate(checkin.date) : ''}</div>` : ''}
    ${meta ? `<div class="popup-meta">${meta}</div>` : ''}
    <div class="popup-actions">
      <button class="btn btn-ghost btn-sm popup-info-btn" data-id="${bridge.id}">ℹ️ Info</button>
      ${!crossed ? `<button class="btn btn-gold btn-sm popup-checkin-btn" data-id="${bridge.id}">✅ Check In</button>` : ''}
    </div>`;
}

function attachPopupListeners(bridge) {
  document.querySelectorAll('.popup-info-btn').forEach(btn => {
    if (btn.dataset.id === bridge.id) {
      btn.addEventListener('click', () => { state.map.closePopup(); showBridgeModal(bridge); });
    }
  });
  document.querySelectorAll('.popup-checkin-btn').forEach(btn => {
    if (btn.dataset.id === bridge.id) {
      btn.addEventListener('click', () => { state.map.closePopup(); doCheckIn(bridge.id); });
    }
  });
}

function updateMarkerIcon(bridgeId) {
  const marker = state.markers[bridgeId];
  if (marker) marker.setIcon(makeMarkerIcon(isCheckedIn(bridgeId)));
}

function centerOnUser() {
  if (state.userPos) {
    state.map.flyTo([state.userPos.lat, state.userPos.lng], 15, { duration: 1 });
  } else {
    showGPSBanner('📍 Getting your location…');
  }
}

/* ─── GPS ────────────────────────────────────────────────────── */
function startGPS() {
  if (!('geolocation' in navigator)) {
    showGPSBanner('📍 GPS not available on this device.', true);
    return;
  }

  state.watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    onGPSError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function onPositionUpdate(pos) {
  hideGPSBanner();
  state.userPos      = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  state.userAccuracy = pos.coords.accuracy;

  updateUserMarker();
  updateNearestCard();

  // Re-render uncrossed list distance if collection is open
  if (state.activeTab === 'collection') renderCollection();
}

function onGPSError(err) {
  const msgs = {
    1: '📍 Location access denied. Enable in browser settings to use distance features.',
    2: '📍 Location unavailable right now.',
    3: '📍 Location request timed out.',
  };
  showGPSBanner(msgs[err.code] || '📍 Location error.', err.code === 1);
}

function updateUserMarker() {
  if (!state.userPos) return;
  const { lat, lng } = state.userPos;

  if (!state.userMarker) {
    state.userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div class="bridge-marker-user"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      zIndexOffset: 1000,
    }).addTo(state.map);

    state.userCircle = L.circle([lat, lng], {
      radius: state.userAccuracy || 20,
      color: '#4A90D9',
      fillColor: '#4A90D9',
      fillOpacity: 0.08,
      weight: 1,
    }).addTo(state.map);
  } else {
    state.userMarker.setLatLng([lat, lng]);
    state.userCircle.setLatLng([lat, lng]);
    state.userCircle.setRadius(state.userAccuracy || 20);
  }
}

/* ─── GPS BANNER ─────────────────────────────────────────────── */
function showGPSBanner(msg, isError = false) {
  const el = document.getElementById('gps-banner');
  el.textContent = msg;
  el.classList.remove('hidden', 'error');
  if (isError) el.classList.add('error');
}

function hideGPSBanner() {
  document.getElementById('gps-banner').classList.add('hidden');
}

/* ─── NEAREST BRIDGE CARD ────────────────────────────────────── */
function updateNearestCard() {
  const card      = document.getElementById('nearest-card');
  const nameEl    = document.getElementById('nearest-name');
  const distEl    = document.getElementById('nearest-dist');
  const navBtn    = document.getElementById('nearest-navigate-btn');
  const checkinBtn= document.getElementById('nearest-checkin-btn');

  const result = getNearestUncrossed();

  if (!result) {
    if (getCrossedCount() === state.bridges.length && state.bridges.length > 0) {
      nameEl.textContent = '🏆 All bridges crossed!';
      distEl.textContent = 'Amazing achievement!';
      navBtn.classList.add('hidden');
      checkinBtn.classList.add('hidden');
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
    state.nearestBridge = null;
    return;
  }

  const { bridge, distanceM } = result;
  state.nearestBridge = bridge;
  state.nearestDist   = distanceM;

  nameEl.textContent = bridge.name;
  distEl.textContent = formatDistance(distanceM);

  // Show check-in button only within range
  if (distanceM <= CHECKIN_RADIUS) {
    checkinBtn.classList.remove('hidden');
    checkinBtn.onclick = () => doCheckIn(bridge.id);
  } else {
    checkinBtn.classList.add('hidden');
  }

  navBtn.classList.remove('hidden');
  navBtn.onclick = () => navigateTo(bridge);

  card.classList.remove('hidden');

  // Tap card → open modal
  card.onclick = (e) => {
    if (e.target === navBtn || navBtn.contains(e.target)) return;
    if (e.target === checkinBtn || checkinBtn.contains(e.target)) return;
    showBridgeModal(bridge);
  };
}

function navigateTo(bridge) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${bridge.latitude},${bridge.longitude}`;
  window.open(url, '_blank', 'noopener');
}

/* ─── CHECK-IN ───────────────────────────────────────────────── */
function doCheckIn(bridgeId) {
  const bridge = state.bridges.find(b => b.id === bridgeId);
  if (!bridge) return;

  // Snapshot earned badges BEFORE this check-in
  const prevEarnedIds = new Set(evaluateBadges().filter(r => r.earned).map(r => r.def.id));

  const existing = state.checkins[bridgeId];
  state.checkins[bridgeId] = {
    date:  new Date().toISOString(),
    count: existing ? existing.count + 1 : 1,
  };
  saveCheckins();

  updateMarkerIcon(bridgeId);
  updateNearestCard();

  if (state.activeModal && state.activeModal.id === bridgeId) {
    populateModal(bridge);
  }

  // Queue any newly earned badges (shown after celebration is dismissed)
  const newlyEarned = evaluateBadges().filter(r => r.earned && !prevEarnedIds.has(r.def.id));
  _badgeQueue.push(...newlyEarned);

  showCelebration(bridge);

  if (state.activeTab === 'collection') renderCollection();
  if (state.activeTab === 'badges')    renderBadges();
}

function removeCheckIn(bridgeId) {
  if (!state.checkins[bridgeId]) return;
  delete state.checkins[bridgeId];
  saveCheckins();
  updateMarkerIcon(bridgeId);
  updateNearestCard();
  if (state.activeTab === 'collection') renderCollection();
  if (state.activeTab === 'badges')    renderBadges();
}

/* ─── CELEBRATION ────────────────────────────────────────────── */
function showCelebration(bridge) {
  const overlay   = document.getElementById('celebration');
  const emojiEl   = document.getElementById('celebration-emoji');
  const headlineEl= document.getElementById('celebration-headline');
  const subEl     = document.getElementById('celebration-sub');
  const factEl    = document.getElementById('celebration-fact');
  const dismissBtn= document.getElementById('celebration-dismiss');

  const count = getCrossedCount();
  const emojis = ['🌉','🎉','🏆','⭐','🎊','🥳'];
  emojiEl.textContent   = emojis[Math.floor(Math.random() * emojis.length)];
  headlineEl.textContent= `Bridge #${count} Crossed!`;
  subEl.textContent     = bridge.name;

  if (bridge.funFact) {
    factEl.textContent = `⭐ ${bridge.funFact}`;
  } else {
    factEl.textContent = '';
  }

  overlay.classList.remove('hidden');
  spawnConfetti();

  dismissBtn.onclick = hideCelebration;
  overlay.onclick = (e) => { if (e.target === overlay) hideCelebration(); };
}

function hideCelebration() {
  document.getElementById('celebration').classList.add('hidden');
  document.getElementById('confetti-container').innerHTML = '';
  showNextBadgePopup();
}

/* ─── BADGE POPUP ────────────────────────────────────────────── */
function initBadgePopup() {
  document.getElementById('badge-popup-dismiss').addEventListener('click', () => {
    document.getElementById('badge-popup').classList.add('hidden');
    showNextBadgePopup();
  });
}

function showNextBadgePopup() {
  if (_badgeQueue.length === 0) return;
  const { def } = _badgeQueue.shift();
  document.getElementById('badge-popup-emoji').textContent = def.emoji;
  document.getElementById('badge-popup-name').textContent  = def.name;
  document.getElementById('badge-popup-desc').textContent  = def.desc;
  document.getElementById('badge-popup').classList.remove('hidden');
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]};
      width: ${6 + Math.random() * 8}px;
      height: ${6 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.5}s;
    `;
    container.appendChild(el);
  }
}

/* ─── BRIDGE INFO MODAL ──────────────────────────────────────── */
function showBridgeModal(bridge) {
  state.activeModal = bridge;
  populateModal(bridge);
  document.getElementById('bridge-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeBridgeModal() {
  document.getElementById('bridge-modal').classList.add('hidden');
  document.body.style.overflow = '';
  state.activeModal = null;
}

function populateModal(bridge) {
  const crossed = isCheckedIn(bridge.id);
  const checkin = state.checkins[bridge.id];

  // Name & badge
  document.getElementById('modal-bridge-name').textContent = bridge.name;
  const badge = document.getElementById('modal-status-badge');
  badge.textContent = crossed ? '✅ Crossed' : '⬜ Not yet';
  badge.className   = `modal-status-badge ${crossed ? 'crossed' : 'uncrossed'}`;

  // Check-in date
  const dateEl = document.getElementById('modal-checkin-date');
  if (crossed && checkin) {
    dateEl.textContent = `✅ Crossed on ${fmtDate(checkin.date)}${checkin.count > 1 ? ` (${checkin.count}× visited)` : ''}`;
    dateEl.classList.remove('hidden');
  } else {
    dateEl.classList.add('hidden');
  }

  // Details
  document.getElementById('modal-type').textContent         = capitalise(bridge.type)         || '—';
  document.getElementById('modal-year').textContent         = bridge.yearBuilt                 || '—';
  document.getElementById('modal-length').textContent       = bridge.length ? `${bridge.length.toLocaleString()} ft` : '—';
  document.getElementById('modal-neighborhood').textContent = bridge.neighborhood              || '—';
  document.getElementById('modal-crosses').textContent      = bridge.crosses                   || '—';
  document.getElementById('modal-carries').textContent      = bridge.carries                   || '—';

  // Photo
  const photoWrap = document.getElementById('modal-photo');
  const photoImg  = document.getElementById('modal-photo-img');

  function showPhoto(url) {
    photoImg.onerror = () => {
      photoImg.src = '';
      photoImg.classList.add('hidden');
      photoWrap.classList.remove('has-image');
    };
    photoImg.src = url;
    photoImg.alt = `${bridge.name} photo`;
    photoImg.classList.remove('hidden');
    photoWrap.classList.add('has-image');
  }

  function clearPhoto() {
    photoImg.onerror = null;
    photoImg.src = '';
    photoImg.alt = '';
    photoImg.classList.add('hidden');
    photoWrap.classList.remove('has-image');
  }

  if (bridge.image) {
    showPhoto(bridge.image);
  } else if (bridge.wikipedia) {
    clearPhoto();
    fetchWikiImage(bridge.wikipedia).then(url => {
      // Only update if this modal is still open for the same bridge
      if (url && state.activeModal && state.activeModal.id === bridge.id) {
        showPhoto(url);
      }
    });
  } else {
    clearPhoto();
  }

  // Fun fact
  const factWrap = document.getElementById('modal-fun-fact-wrap');
  const factText = document.getElementById('modal-fun-fact');
  if (bridge.funFact) {
    factText.textContent = bridge.funFact;
    factWrap.style.display = '';
  } else {
    factWrap.style.display = 'none';
  }

  // Check-in button
  const checkinBtn = document.getElementById('modal-checkin-btn');
  checkinBtn.textContent = crossed ? '✅ Check In Again' : '✅ Check In at This Bridge!';
  checkinBtn.onclick = () => { doCheckIn(bridge.id); closeBridgeModal(); };

  // Remove check-in button (only visible when crossed)
  const removeBtn = document.getElementById('modal-remove-checkin-btn');
  if (crossed) {
    removeBtn.classList.remove('hidden');
    removeBtn.onclick = () => { removeCheckIn(bridge.id); closeBridgeModal(); };
  } else {
    removeBtn.classList.add('hidden');
  }

  // Navigate button
  document.getElementById('modal-navigate-btn').onclick = () => navigateTo(bridge);
}

// Wire up modal close buttons
document.getElementById('modal-close-btn').addEventListener('click', closeBridgeModal);
document.getElementById('modal-backdrop').addEventListener('click', closeBridgeModal);

/* ─── NAVIGATION ─────────────────────────────────────────────── */
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  if (state.activeTab === tab) return;
  state.activeTab = tab;

  // Update view visibility
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${tab}-view`).classList.add('active');

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
    btn.setAttribute('aria-selected', btn.dataset.tab === tab);
  });

  if (tab === 'collection') renderCollection();
  if (tab === 'search')     renderSearch('');
  if (tab === 'badges')     renderBadges();
  if (tab === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 100);
}

/* ─── BADGE EVALUATION ───────────────────────────────────────── */
function evaluateBadges() {
  if (!state.bridges.length) {
    return BADGE_DEFS.map(def => ({ def, earned: false, earnedDate: null, progress: null, hint: def.desc }));
  }

  const checkedIds      = new Set(Object.keys(state.checkins));
  const crossedBridges  = state.bridges.filter(b => checkedIds.has(b.id));
  const total           = crossedBridges.length;
  const totalBridges    = state.bridges.length;

  // Check-ins sorted ascending by date
  const sortedCI = Object.entries(state.checkins)
    .sort(([,a],[,b]) => a.date < b.date ? -1 : 1);

  // Nth check-in date (1-indexed)
  const nthDate = n => sortedCI.length >= n ? sortedCI[n-1][1].date : null;

  // Max check-in date among a set of bridges
  const maxDateOf = bs => {
    const dates = bs.filter(b => checkedIds.has(b.id)).map(b => state.checkins[b.id].date);
    return dates.length ? dates.reduce((a, b) => a > b ? a : b) : null;
  };

  // Nth date from a sorted array of crossed bridges (by check-in date)
  const nthCrossedDate = (bs, n) => {
    if (bs.length < n) return null;
    return [...bs].map(b => state.checkins[b.id].date).sort()[n - 1];
  };

  // ── River data ──────────────────────────────────────────────
  const rivBridges = {
    a: state.bridges.filter(b => (b.crosses||'').includes('Allegheny River')),
    m: state.bridges.filter(b => (b.crosses||'').includes('Monongahela River')),
    o: state.bridges.filter(b => (b.crosses||'').includes('Ohio River')),
  };
  const rivCrossed = {
    a: rivBridges.a.filter(b => checkedIds.has(b.id)).length,
    m: rivBridges.m.filter(b => checkedIds.has(b.id)).length,
    o: rivBridges.o.filter(b => checkedIds.has(b.id)).length,
  };
  const rivDone = {
    a: rivCrossed.a === rivBridges.a.length,
    m: rivCrossed.m === rivBridges.m.length,
    o: rivCrossed.o === rivBridges.o.length,
  };
  const rivDate = {
    a: rivDone.a ? maxDateOf(rivBridges.a) : null,
    m: rivDone.m ? maxDateOf(rivBridges.m) : null,
    o: rivDone.o ? maxDateOf(rivBridges.o) : null,
  };
  const threeRiversDone = rivDone.a && rivDone.m && rivDone.o;
  const threeRiversDate = threeRiversDone
    ? [rivDate.a, rivDate.m, rivDate.o].reduce((a, b) => a > b ? a : b)
    : null;

  // ── Streak data ──────────────────────────────────────────────
  const uniqueDays = [...new Set(sortedCI.map(([,v]) => v.date.slice(0, 10)))].sort();
  let maxStreak = uniqueDays.length > 0 ? 1 : 0;
  let curStreak = uniqueDays.length > 0 ? 1 : 0;
  let streak3Date = null, streak7Date = null;
  for (let i = 1; i < uniqueDays.length; i++) {
    const diff = Math.round(
      (new Date(uniqueDays[i] + 'T12:00:00Z') - new Date(uniqueDays[i-1] + 'T12:00:00Z')) / 86400000
    );
    if (diff === 1) {
      curStreak++;
      maxStreak = Math.max(maxStreak, curStreak);
      if (curStreak >= 3 && !streak3Date) streak3Date = uniqueDays[i] + 'T23:59:59.000Z';
      if (curStreak >= 7 && !streak7Date) streak7Date = uniqueDays[i] + 'T23:59:59.000Z';
    } else {
      curStreak = 1;
    }
  }

  // ── Per-day counts ────────────────────────────────────────────
  const dayMap = {};
  for (const [,v] of sortedCI) {
    const d = v.date.slice(0, 10);
    if (!dayMap[d]) dayMap[d] = { count: 0, lastDate: null };
    dayMap[d].count++;
    dayMap[d].lastDate = v.date;
  }
  let blitzDate = null, marathonDate = null, maxDayCount = 0;
  for (const [day, info] of Object.entries(dayMap).sort(([a],[b]) => a < b ? -1 : 1)) {
    maxDayCount = Math.max(maxDayCount, info.count);
    if (info.count >= 5  && !blitzDate)   blitzDate   = info.lastDate;
    if (info.count >= 10 && !marathonDate) marathonDate = info.lastDate;
  }

  // ── Neighborhood data ─────────────────────────────────────────
  const neighMap = {};
  for (const b of state.bridges) {
    const n = b.neighborhood; if (!n) continue;
    if (!neighMap[n]) neighMap[n] = { total: 0, crossed: 0, dates: [] };
    neighMap[n].total++;
    if (checkedIds.has(b.id)) {
      neighMap[n].crossed++;
      neighMap[n].dates.push(state.checkins[b.id].date);
    }
  }
  const completedNeighs = Object.entries(neighMap)
    .filter(([,v]) => v.crossed === v.total && v.total > 0)
    .map(([,v]) => ({ date: v.dates.reduce((a, b) => a > b ? a : b) }))
    .sort((a, b) => a.date < b.date ? -1 : 1);

  const crossedNeighCount = new Set(
    crossedBridges.filter(b => b.neighborhood).map(b => b.neighborhood)
  ).size;

  // Date when Nth unique neighborhood was first entered
  const neighDateForN = n => {
    if (crossedNeighCount < n) return null;
    const seen = new Set();
    for (const [id, v] of sortedCI) {
      const bridge = state.bridges.find(b => b.id === id);
      if (bridge && bridge.neighborhood && !seen.has(bridge.neighborhood)) {
        seen.add(bridge.neighborhood);
        if (seen.size === n) return v.date;
      }
    }
    return null;
  };

  // Best locked neighborhood for hint
  const bestLockedNeigh = Object.entries(neighMap)
    .filter(([,v]) => v.crossed < v.total && v.total > 1)
    .sort(([,a],[,b]) => (b.crossed / b.total) - (a.crossed / a.total))[0];

  // ── Type data ─────────────────────────────────────────────────
  const allTypes       = [...new Set(state.bridges.map(b => b.type).filter(Boolean))];
  const trussCrossed   = crossedBridges.filter(b => (b.type||'').toLowerCase().includes('truss'));
  const archCrossed    = crossedBridges.filter(b => (b.type||'').toLowerCase().includes('arch'));
  const crossedTypeSet = new Set(crossedBridges.map(b => b.type).filter(Boolean));

  // When all types were first sampled
  const typeSamplerDate = (() => {
    if (crossedTypeSet.size < allTypes.length) return null;
    const firstSeen = {};
    for (const [id, v] of sortedCI) {
      const bridge = state.bridges.find(b => b.id === id);
      if (bridge && bridge.type && !firstSeen[bridge.type]) firstSeen[bridge.type] = v.date;
    }
    return allTypes.every(t => firstSeen[t])
      ? allTypes.map(t => firstSeen[t]).reduce((a, b) => a > b ? a : b)
      : null;
  })();

  // ── Special bridges ───────────────────────────────────────────
  const before1930 = crossedBridges.filter(b => b.yearBuilt && b.yearBuilt < 1930);
  const after2000  = crossedBridges.filter(b => b.yearBuilt && b.yearBuilt > 2000);

  const longestBridge = [...state.bridges].sort((a, b) => (b.length||0) - (a.length||0))[0];
  const oldestBridge  = state.bridges.filter(b => b.yearBuilt).sort((a, b) => a.yearBuilt - b.yearBuilt)[0];

  const halfway = Math.ceil(totalBridges / 2);

  // ── Evaluate each badge ───────────────────────────────────────
  return BADGE_DEFS.map(def => {
    let earned = false, earnedDate = null, progress = null, hint = def.desc;

    switch (def.id) {
      case 'first_steps':
        earned = total >= 1;  earnedDate = nthDate(1);
        progress = { current: Math.min(total, 1), target: 1 };
        hint = total < 1 ? 'Cross your first bridge' : hint;
        break;
      case 'double_digits':
        earned = total >= 10; earnedDate = nthDate(10);
        progress = { current: Math.min(total, 10), target: 10 };
        hint = `Cross 10 bridges — ${total}/10`;
        break;
      case 'quarter_century':
        earned = total >= 25; earnedDate = nthDate(25);
        progress = { current: Math.min(total, 25), target: 25 };
        hint = `Cross 25 bridges — ${total}/25`;
        break;
      case 'fifty_counting':
        earned = total >= 50; earnedDate = nthDate(50);
        progress = { current: Math.min(total, 50), target: 50 };
        hint = `Cross 50 bridges — ${total}/50`;
        break;
      case 'century_club':
        earned = total >= 100; earnedDate = nthDate(100);
        progress = { current: Math.min(total, 100), target: 100 };
        hint = `Cross 100 bridges — ${total}/100`;
        break;
      case 'halfway_there':
        earned = total >= halfway; earnedDate = nthDate(halfway);
        progress = { current: Math.min(total, halfway), target: halfway };
        hint = `Cross ${halfway} of ${totalBridges} bridges — ${total}/${halfway}`;
        break;
      case 'bridge_master':
        earned = total >= totalBridges; earnedDate = nthDate(totalBridges);
        progress = { current: total, target: totalBridges };
        hint = `Cross all ${totalBridges} bridges — ${total}/${totalBridges}`;
        break;

      case 'allegheny':
        earned = rivDone.a; earnedDate = rivDate.a;
        progress = { current: rivCrossed.a, target: rivBridges.a.length };
        hint = `Cross all ${rivBridges.a.length} Allegheny River bridges — ${rivCrossed.a}/${rivBridges.a.length}`;
        break;
      case 'monongahela':
        earned = rivDone.m; earnedDate = rivDate.m;
        progress = { current: rivCrossed.m, target: rivBridges.m.length };
        hint = `Cross all ${rivBridges.m.length} Monongahela River bridges — ${rivCrossed.m}/${rivBridges.m.length}`;
        break;
      case 'ohio':
        earned = rivDone.o; earnedDate = rivDate.o;
        progress = { current: rivCrossed.o, target: rivBridges.o.length };
        hint = `Cross all ${rivBridges.o.length} Ohio River bridges — ${rivCrossed.o}/${rivBridges.o.length}`;
        break;
      case 'three_rivers':
        earned = threeRiversDone; earnedDate = threeRiversDate;
        progress = {
          current: (rivDone.a ? 1 : 0) + (rivDone.m ? 1 : 0) + (rivDone.o ? 1 : 0),
          target: 3,
        };
        hint = `Earn all 3 river badges — ${progress.current}/3`;
        break;

      case 'bridge_blitz':
        earned = maxDayCount >= 5; earnedDate = blitzDate;
        progress = { current: Math.min(maxDayCount, 5), target: 5 };
        hint = `Cross 5 bridges in one day — best: ${maxDayCount}/5`;
        break;
      case 'on_fire':
        earned = maxStreak >= 3; earnedDate = streak3Date;
        progress = { current: Math.min(maxStreak, 3), target: 3 };
        hint = `3 days in a row — best streak: ${maxStreak} day${maxStreak !== 1 ? 's' : ''}`;
        break;
      case 'weekly_warrior':
        earned = maxStreak >= 7; earnedDate = streak7Date;
        progress = { current: Math.min(maxStreak, 7), target: 7 };
        hint = `7 days in a row — best streak: ${maxStreak} day${maxStreak !== 1 ? 's' : ''}`;
        break;
      case 'marathon':
        earned = maxDayCount >= 10; earnedDate = marathonDate;
        progress = { current: Math.min(maxDayCount, 10), target: 10 };
        hint = `Cross 10 bridges in one day — best: ${maxDayCount}/10`;
        break;

      case 'neigh_complete':
        earned = completedNeighs.length > 0; earnedDate = completedNeighs[0]?.date ?? null;
        progress = null;
        hint = bestLockedNeigh
          ? `Complete any neighborhood — ${bestLockedNeigh[0]}: ${bestLockedNeigh[1].crossed}/${bestLockedNeigh[1].total}`
          : 'Cross every bridge in any single neighborhood';
        break;
      case 'well_traveled':
        earned = crossedNeighCount >= 10; earnedDate = neighDateForN(10);
        progress = { current: Math.min(crossedNeighCount, 10), target: 10 };
        hint = `Bridges in 10 neighborhoods — ${crossedNeighCount}/10`;
        break;
      case 'city_explorer':
        earned = crossedNeighCount >= 20; earnedDate = neighDateForN(20);
        progress = { current: Math.min(crossedNeighCount, 20), target: 20 };
        hint = `Bridges in 20 neighborhoods — ${crossedNeighCount}/20`;
        break;

      case 'truss_collector':
        earned = trussCrossed.length >= 5; earnedDate = nthCrossedDate(trussCrossed, 5);
        progress = { current: Math.min(trussCrossed.length, 5), target: 5 };
        hint = `Cross 5 truss bridges — ${trussCrossed.length}/5`;
        break;
      case 'arch_enthusiast':
        earned = archCrossed.length >= 5; earnedDate = nthCrossedDate(archCrossed, 5);
        progress = { current: Math.min(archCrossed.length, 5), target: 5 };
        hint = `Cross 5 arch bridges — ${archCrossed.length}/5`;
        break;
      case 'type_sampler':
        earned = crossedTypeSet.size >= allTypes.length; earnedDate = typeSamplerDate;
        progress = { current: crossedTypeSet.size, target: allTypes.length };
        hint = `One of every bridge type — ${crossedTypeSet.size}/${allTypes.length} types`;
        break;

      case 'history_buff':
        earned = before1930.length >= 10; earnedDate = nthCrossedDate(before1930, 10);
        progress = { current: Math.min(before1930.length, 10), target: 10 };
        hint = `Cross 10 pre-1930 bridges — ${before1930.length}/10`;
        break;
      case 'modern_explorer':
        earned = after2000.length >= 5; earnedDate = nthCrossedDate(after2000, 5);
        progress = { current: Math.min(after2000.length, 5), target: 5 };
        hint = `Cross 5 post-2000 bridges — ${after2000.length}/5`;
        break;
      case 'going_distance':
        earned = longestBridge && checkedIds.has(longestBridge.id);
        earnedDate = earned ? state.checkins[longestBridge.id].date : null;
        progress = null;
        hint = longestBridge
          ? `Cross ${longestBridge.name} (${(longestBridge.length||0).toLocaleString()} ft)`
          : def.desc;
        break;
      case 'old_faithful':
        earned = oldestBridge && checkedIds.has(oldestBridge.id);
        earnedDate = earned ? state.checkins[oldestBridge.id].date : null;
        progress = null;
        hint = oldestBridge
          ? `Cross ${oldestBridge.name} (built ${oldestBridge.yearBuilt})`
          : def.desc;
        break;
    }

    return { def, earned: Boolean(earned), earnedDate, progress, hint };
  });
}

/* ─── RENDER BADGES ──────────────────────────────────────────── */
function renderBadges() {
  const results    = evaluateBadges();
  const earnedCount = results.filter(r => r.earned).length;

  document.getElementById('badges-summary').innerHTML =
    `<span class="badges-earned-count">${earnedCount}</span> of ${results.length} badges unlocked`;

  const categories = [
    { key: 'milestone',    label: '🏁 Milestones' },
    { key: 'river',        label: '🌊 River Badges' },
    { key: 'speed',        label: '⚡ Speed & Streaks' },
    { key: 'neighborhood', label: '🏘️ Neighborhoods' },
    { key: 'type',         label: '🔺 Bridge Types' },
    { key: 'special',      label: '✨ Special' },
  ];

  document.getElementById('badges-grid').innerHTML = categories.map(cat => {
    const badges = results.filter(r => r.def.category === cat.key);
    return `
      <div class="badge-category">
        <h2 class="badge-cat-label">${cat.label}</h2>
        <div class="badge-grid-row">
          ${badges.map(r => badgeCardHTML(r)).join('')}
        </div>
      </div>`;
  }).join('');
}

function badgeCardHTML({ def, earned, earnedDate, progress, hint }) {
  if (earned) {
    return `
      <div class="badge-card badge-earned">
        <span class="badge-emoji">${def.emoji}</span>
        <div class="badge-name">${def.name}</div>
        <div class="badge-earned-date">Earned ${earnedDate ? fmtDate(earnedDate) : '✓'}</div>
      </div>`;
  }

  let progressHTML = '';
  if (progress) {
    const pct = Math.min(100, Math.round((progress.current / progress.target) * 100));
    progressHTML = `
      <div class="badge-progress">
        <div class="badge-progress-bar">
          <div class="badge-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="badge-progress-text">${progress.current} / ${progress.target}</div>
      </div>`;
  }

  return `
    <div class="badge-card badge-locked">
      <span class="badge-emoji badge-emoji-locked">${def.emoji}</span>
      <div class="badge-name badge-name-locked">${def.name}</div>
      <div class="badge-hint">${escHtml(hint)}</div>
      ${progressHTML}
    </div>`;
}

/* ─── COLLECTION FILTERS ─────────────────────────────────────── */
function getCrossesCategory(bridge) {
  const c = (bridge.crosses || '').toLowerCase();
  if (c.includes('river'))    return 'river';
  if (c.includes('creek') || c.includes('run') || c.includes('hollow') && c.includes('fern'))
                               return 'creek';
  if (c.includes('i-') || c.includes('parkway'))  return 'highway';
  if (c.includes('railroad') || c.includes('rail')) return 'railroad';
  if (c.includes('hollow') || c.includes('ravine') || c.includes('valley')) return 'valley';
  return '';
}

function populateFilterDropdowns() {
  const neighborhoods = [...new Set(
    state.bridges.map(b => b.neighborhood).filter(Boolean)
  )].sort();
  const types = [...new Set(
    state.bridges.map(b => b.type).filter(Boolean)
  )].sort();

  const nSel = document.getElementById('filter-neighborhood');
  neighborhoods.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    nSel.appendChild(opt);
  });

  const tSel = document.getElementById('filter-type');
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    tSel.appendChild(opt);
  });
}

function initCollectionFilters() {
  // Status pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      filterState.status = pill.dataset.status;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderCollection();
    });
  });

  // Dropdowns
  document.getElementById('filter-sort').addEventListener('change', e => {
    filterState.sort = e.target.value;
    renderCollection();
  });
  document.getElementById('filter-neighborhood').addEventListener('change', e => {
    filterState.neighborhood = e.target.value;
    renderCollection();
  });
  document.getElementById('filter-type').addEventListener('change', e => {
    filterState.type = e.target.value;
    renderCollection();
  });
  document.getElementById('filter-crosses').addEventListener('change', e => {
    filterState.crosses = e.target.value;
    renderCollection();
  });

  // Clear button
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    filterState.status       = 'all';
    filterState.sort         = 'default';
    filterState.neighborhood = '';
    filterState.type         = '';
    filterState.crosses      = '';

    document.querySelectorAll('.filter-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.status === 'all'));
    document.getElementById('filter-sort').value         = 'default';
    document.getElementById('filter-neighborhood').value = '';
    document.getElementById('filter-type').value         = '';
    document.getElementById('filter-crosses').value      = '';

    renderCollection();
  });
}

function isFiltersActive() {
  return filterState.status       !== 'all'     ||
         filterState.sort         !== 'default'  ||
         filterState.neighborhood !== ''         ||
         filterState.type         !== ''         ||
         filterState.crosses      !== '';
}

function applyBaseFilters(bridges) {
  return bridges.filter(b => {
    if (filterState.neighborhood && b.neighborhood !== filterState.neighborhood) return false;
    if (filterState.type         && b.type         !== filterState.type)         return false;
    if (filterState.crosses      && getCrossesCategory(b) !== filterState.crosses) return false;
    return true;
  });
}

function applySort(bridges, defaultCrossedSort) {
  const sort = filterState.sort;
  if (sort === 'default') {
    if (defaultCrossedSort === 'date') {
      return [...bridges].sort((a, b) =>
        new Date(state.checkins[b.id].date) - new Date(state.checkins[a.id].date));
    }
    if (state.userPos) {
      return [...bridges].sort((a, b) =>
        haversine(state.userPos.lat, state.userPos.lng, a.latitude, a.longitude) -
        haversine(state.userPos.lat, state.userPos.lng, b.latitude, b.longitude));
    }
    return [...bridges].sort((a, b) => a.name.localeCompare(b.name));
  }
  const arr = [...bridges];
  switch (sort) {
    case 'distance':
      if (state.userPos) {
        arr.sort((a, b) =>
          haversine(state.userPos.lat, state.userPos.lng, a.latitude, a.longitude) -
          haversine(state.userPos.lat, state.userPos.lng, b.latitude, b.longitude));
      } else {
        arr.sort((a, b) => a.name.localeCompare(b.name));
      }
      break;
    case 'date-desc':
      arr.sort((a, b) => {
        const da = state.checkins[a.id] ? new Date(state.checkins[a.id].date) : new Date(0);
        const db = state.checkins[b.id] ? new Date(state.checkins[b.id].date) : new Date(0);
        return db - da;
      });
      break;
    case 'name':
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'year-asc':
      arr.sort((a, b) => (a.yearBuilt || 9999) - (b.yearBuilt || 9999));
      break;
    case 'year-desc':
      arr.sort((a, b) => (b.yearBuilt || 0) - (a.yearBuilt || 0));
      break;
    case 'length-desc':
      arr.sort((a, b) => (b.length || 0) - (a.length || 0));
      break;
  }
  return arr;
}

/* ─── COLLECTION VIEW ────────────────────────────────────────── */
function renderCollection() {
  const total   = state.bridges.length;
  const crossed = getCrossedCount();
  const pct     = total > 0 ? Math.round((crossed / total) * 100) : 0;

  document.getElementById('crossed-count').textContent = crossed;
  document.getElementById('total-count').textContent   = total;

  const fill = document.getElementById('progress-bar-fill');
  fill.style.width = pct + '%';
  document.getElementById('progress-bar-wrap').setAttribute('aria-valuenow', pct);

  renderStats(crossed);

  // Determine which sections to show
  const showCrossed   = filterState.status !== 'uncrossed';
  const showUncrossed = filterState.status !== 'crossed';
  document.getElementById('crossed-section').style.display   = showCrossed   ? '' : 'none';
  document.getElementById('uncrossed-section').style.display = showUncrossed ? '' : 'none';

  // Base-filtered pools (neighborhood / type / crosses filters)
  const allFiltered = applyBaseFilters(state.bridges);

  let crossedCount = 0;
  let uncrossedCount = 0;

  // Crossed list
  if (showCrossed) {
    let crossedBridges = allFiltered.filter(b => isCheckedIn(b.id));
    crossedBridges = applySort(crossedBridges, 'date');
    crossedCount = crossedBridges.length;

    const crossedList = document.getElementById('crossed-list');
    if (crossedBridges.length === 0) {
      crossedList.innerHTML = '<p class="empty-state">No crossed bridges match your filters.</p>';
    } else {
      crossedList.innerHTML = crossedBridges.map(b => bridgeListItemHTML(b, 'crossed')).join('');
      attachListItemListeners(crossedList);
    }
  }

  // Uncrossed list
  if (showUncrossed) {
    let uncrossedBridges = allFiltered.filter(b => !isCheckedIn(b.id));
    uncrossedBridges = applySort(uncrossedBridges, 'distance');
    uncrossedCount = uncrossedBridges.length;

    const uncrossedList = document.getElementById('uncrossed-list');
    if (uncrossedBridges.length === 0) {
      const msg = filterState.status === 'uncrossed' && !isFiltersActive()
        ? '<p class="empty-state">🏆 You\'ve crossed every bridge! Incredible!</p>'
        : '<p class="empty-state">No uncrossed bridges match your filters.</p>';
      uncrossedList.innerHTML = msg;
    } else {
      uncrossedList.innerHTML = uncrossedBridges.map(b => bridgeListItemHTML(b, 'uncrossed')).join('');
      attachListItemListeners(uncrossedList);
    }
  }

  // Highlight active filter selects
  ['filter-sort', 'filter-neighborhood', 'filter-type', 'filter-crosses'].forEach(id => {
    const sel = document.getElementById(id);
    const isActive = id === 'filter-sort'
      ? filterState.sort !== 'default'
      : sel.value !== '';
    sel.classList.toggle('active-filter', isActive);
  });

  // Clear button & result count
  const clearBtn   = document.getElementById('clear-filters-btn');
  const countEl    = document.getElementById('filter-count');
  const filtersOn  = isFiltersActive();
  clearBtn.classList.toggle('hidden', !filtersOn);

  if (filtersOn) {
    const showing = (showCrossed ? crossedCount : 0) + (showUncrossed ? uncrossedCount : 0);
    countEl.textContent = `Showing ${showing} of ${total} bridges`;
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }
}

function renderStats(crossedCount) {
  const statsEl = document.getElementById('stats-row');
  const entries = Object.entries(state.checkins)
    .sort(([,a],[,b]) => new Date(a.date) - new Date(b.date));

  const parts = [];

  if (entries.length > 0) {
    const firstId     = entries[0][0];
    const firstBridge = state.bridges.find(b => b.id === firstId);
    if (firstBridge) {
      parts.push({ label: 'First Bridge', value: firstBridge.name });
    }

    const lastId     = entries[entries.length-1][0];
    const lastBridge = state.bridges.find(b => b.id === lastId);
    if (lastBridge && lastId !== firstId) {
      parts.push({ label: 'Most Recent', value: lastBridge.name });
    }

    const lastDate = new Date(entries[entries.length-1][1].date);
    parts.push({ label: 'Last Crossed', value: fmtDate(lastDate.toISOString()) });
  }

  if (state.bridges.length > 0) {
    const pct = Math.round((crossedCount / state.bridges.length) * 100);
    parts.push({ label: 'Progress', value: `${pct}% complete` });
  }

  statsEl.innerHTML = parts.map(p => `
    <div class="stat-item">
      <div class="stat-label">${p.label}</div>
      <div class="stat-value">${p.value}</div>
    </div>`).join('');
}

function bridgeListItemHTML(bridge, type) {
  const checkin = state.checkins[bridge.id];
  let meta = '';

  if (type === 'crossed' && checkin) {
    meta = fmtDate(checkin.date);
  } else if (type === 'uncrossed' && state.userPos) {
    const d = haversine(state.userPos.lat, state.userPos.lng, bridge.latitude, bridge.longitude);
    meta = formatDistance(d);
  } else {
    meta = [bridge.type, bridge.neighborhood].filter(Boolean).join(' · ');
  }

  return `
    <div class="bridge-list-item" data-id="${bridge.id}" role="listitem">
      <div class="bridge-list-icon ${type}">${type === 'crossed' ? '✅' : '🌉'}</div>
      <div class="bridge-list-info">
        <div class="bridge-list-name">${bridge.name}</div>
        <div class="bridge-list-meta">${meta}</div>
      </div>
      <div class="bridge-list-chevron">›</div>
    </div>`;
}

function attachListItemListeners(container) {
  container.querySelectorAll('.bridge-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const bridge = state.bridges.find(b => b.id === item.dataset.id);
      if (bridge) showBridgeModal(bridge);
    });
  });
}

/* ─── SEARCH VIEW ────────────────────────────────────────────── */
function renderSearch(query) {
  const results = document.getElementById('search-results');
  const q       = query.trim().toLowerCase();

  if (!q) {
    results.innerHTML = '<p class="empty-state">Type above to search bridges 🔍</p>';
    return;
  }

  const matches = state.bridges.filter(b =>
    b.name.toLowerCase().includes(q) ||
    (b.neighborhood && b.neighborhood.toLowerCase().includes(q)) ||
    (b.crosses && b.crosses.toLowerCase().includes(q)) ||
    (b.type && b.type.toLowerCase().includes(q))
  );

  if (matches.length === 0) {
    results.innerHTML = `<p class="empty-state">No bridges found for "<strong>${escHtml(query)}</strong>"</p>`;
    return;
  }

  results.innerHTML = matches.map(b => {
    const type = state.activeTab === 'collection'
      ? (isCheckedIn(b.id) ? 'crossed' : 'uncrossed')
      : (isCheckedIn(b.id) ? 'crossed' : 'uncrossed');
    return bridgeListItemHTML(b, type);
  }).join('');

  attachSearchResultListeners(results);
}

function attachSearchResultListeners(container) {
  container.querySelectorAll('.bridge-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const bridge = state.bridges.find(b => b.id === item.dataset.id);
      if (!bridge) return;
      // Switch to map, pan to bridge, show modal
      switchTab('map');
      state.map.flyTo([bridge.latitude, bridge.longitude], 16, { duration: 1.2 });
      setTimeout(() => showBridgeModal(bridge), 800);
    });
  });
}

// Wire up search input
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('search-input');
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderSearch(input.value), 200);
  });
});

/* ─── HELPERS ────────────────────────────────────────────────── */
function fmtDate(isoString) {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch { return ''; }
}

function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── KEYBOARD: close modal on Escape ───────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('celebration').classList.contains('hidden')) {
      hideCelebration();
    } else if (!document.getElementById('bridge-modal').classList.contains('hidden')) {
      closeBridgeModal();
    }
  }
});
