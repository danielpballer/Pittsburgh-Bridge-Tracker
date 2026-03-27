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

  hideLoading();
  initNav();   // wire up buttons first so UI is always responsive
  initMap();
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

  const existing = state.checkins[bridgeId];
  state.checkins[bridgeId] = {
    date:  new Date().toISOString(),
    count: existing ? existing.count + 1 : 1,
  };
  saveCheckins();

  updateMarkerIcon(bridgeId);
  updateNearestCard();

  // Close modal if it's showing this bridge
  if (state.activeModal && state.activeModal.id === bridgeId) {
    populateModal(bridge); // refresh modal content
  }

  showCelebration(bridge);

  // Refresh collection if it's open
  if (state.activeTab === 'collection') renderCollection();
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
  if (tab === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 100);
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

  // Stats
  renderStats(crossed);

  // Crossed list (most recent first)
  const crossedBridges = state.bridges
    .filter(b => isCheckedIn(b.id))
    .sort((a, b) => new Date(state.checkins[b.id].date) - new Date(state.checkins[a.id].date));

  const crossedList = document.getElementById('crossed-list');
  if (crossedBridges.length === 0) {
    crossedList.innerHTML = '<p class="empty-state">No bridges crossed yet!<br>Head to the map to get started. 🌉</p>';
  } else {
    crossedList.innerHTML = crossedBridges.map(b => bridgeListItemHTML(b, 'crossed')).join('');
    attachListItemListeners(crossedList);
  }

  // Uncrossed list (nearest first if GPS, else alphabetical)
  const uncrossedBridges = state.bridges.filter(b => !isCheckedIn(b.id));

  if (state.userPos) {
    uncrossedBridges.sort((a, b) =>
      haversine(state.userPos.lat, state.userPos.lng, a.latitude, a.longitude) -
      haversine(state.userPos.lat, state.userPos.lng, b.latitude, b.longitude)
    );
  } else {
    uncrossedBridges.sort((a, b) => a.name.localeCompare(b.name));
  }

  const uncrossedList = document.getElementById('uncrossed-list');
  if (uncrossedBridges.length === 0) {
    uncrossedList.innerHTML = '<p class="empty-state">🏆 You\'ve crossed every bridge! Incredible!</p>';
  } else {
    uncrossedList.innerHTML = uncrossedBridges.map(b => bridgeListItemHTML(b, 'uncrossed')).join('');
    attachListItemListeners(uncrossedList);
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
