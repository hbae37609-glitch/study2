// State Management
let currentUserId = 1;
let me = null;
let allUsers = [];
let cafes = [];
let friends = [];
let activeBattle = null;
let activeTab = 'map';
let rankingScope = 'cafe'; // 'cafe' or 'school'
let rankingPeriod = 'today'; // 'today' or 'week'

// Timer State
let isStudying = false;
let timerSeconds = 0;
let timerInterval = null;
let lastTickSyncTime = 0;

// Map & Markers
let map = null;
let markers = [];
let selectedOpponent = null;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadAllUsers();
  await refreshAll();
  
  // Set up periodic sync (every 5 seconds)
  setInterval(async () => {
    if (isStudying) {
      syncTimerTick(3);
    }
    await loadActiveBattle();
  }, 3000);
});

// Toast notification helper
function showToast(msg, icon = '✨') {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').innerText = msg;
  document.getElementById('toastIcon').innerText = icon;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

// 1. Initialize Leaflet Map
function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  // Center around Gangnam / Yeoksam station
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([37.4990, 127.0320], 14);

  // Dark/Modern OpenStreetMap tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
}

// Render Map Markers for Study Cafes
function renderMapMarkers() {
  if (!map) return;
  // Clear previous
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  cafes.forEach(cafe => {
    const friendCount = cafe.friends_here ? cafe.friends_here.length : 0;
    const hasFriends = friendCount > 0;

    const iconHtml = `
      <div class="relative cursor-pointer transition-transform hover:scale-110">
        <div class="w-10 h-10 rounded-2xl ${hasFriends ? 'bg-gradient-to-tr from-orange-500 to-amber-500 glow-battle ring-2 ring-white' : 'bg-blue-600'} flex items-center justify-center text-white shadow-lg shadow-black/40">
          <span class="text-base font-bold">${hasFriends ? '👥' : '📖'}</span>
        </div>
        ${hasFriends ? `<span class="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-red-600 text-[10px] font-black text-white border-2 border-slate-900">${friendCount}명</span>` : ''}
        <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 text-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-700 pointer-events-none">
          ${cafe.name.split(' ')[0]}
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'cafe-marker-pin',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    const marker = L.marker([cafe.lat, cafe.lng], { icon: customIcon }).addTo(map);
    
    // Popup
    const popupContent = `
      <div class="text-slate-900 p-1 text-xs">
        <div class="font-bold text-sm text-blue-900">${cafe.name} ${cafe.branch}</div>
        <div class="text-[11px] text-slate-600 mb-1">${cafe.address}</div>
        <div class="text-[11px] font-semibold ${hasFriends ? 'text-orange-600' : 'text-slate-500'}">
          ${hasFriends ? `🔥 친구 ${friendCount}명이 열공 중!` : '현재 친구 없음'}
        </div>
        <button onclick="checkInToCafe(${cafe.id})" class="mt-2 w-full py-1 bg-blue-600 text-white rounded font-bold text-[11px]">
          이 스카로 체크인
        </button>
      </div>
    `;
    marker.bindPopup(popupContent);
    markers.push(marker);
  });
}

function locateMe() {
  if (cafes.length > 0 && map) {
    // Zoom to first cafe or user's current cafe
    const target = cafes.find(c => c.id === me?.current_cafe_id) || cafes[0];
    map.flyTo([target.lat, target.lng], 15);
  }
}

// 2. Load All Users & Populate Selector
async function loadAllUsers() {
  try {
    const res = await fetch('/api/users');
    allUsers = await res.json();
    const selector = document.getElementById('userSelector');
    selector.innerHTML = allUsers.map(u => `
      <option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
        ${u.name} (${u.grade})
      </option>
    `).join('');
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

async function switchCurrentUser(userId) {
  currentUserId = parseInt(userId);
  showToast(`'${allUsers.find(u => u.id === currentUserId)?.name}'(으)로 전환되었습니다.`);
  await refreshAll();
}

// 3. Refresh All Data
async function refreshAll() {
  await loadMyProfile();
  await loadCafes();
  await loadFriends();
  await loadActiveBattle();
  await loadRankings();
}

// 4. Load Current User Profile
async function loadMyProfile() {
  try {
    const res = await fetch(`/api/me?user_id=${currentUserId}`);
    me = await res.json();

    // Update Header Status
    const dot = document.getElementById('myStatusDot');
    const cafeName = document.getElementById('myCafeName');
    const statusText = document.getElementById('myStatusText');
    const checkBtn = document.getElementById('checkInOutBtn');

    if (me.current_cafe) {
      cafeName.innerText = `${me.current_cafe.name} ${me.current_cafe.branch}`;
      checkBtn.innerText = '퇴실하기';
      checkBtn.className = 'text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition';
    } else {
      cafeName.innerText = '미입실 (외출/집)';
      checkBtn.innerText = '스카 선택';
      checkBtn.className = 'text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition';
    }

    if (me.status === 'STUDYING') {
      dot.className = 'w-3 h-3 rounded-full bg-emerald-500 animate-pulse';
      statusText.innerText = `열공 중 🔥 (${formatTime(me.today_study_seconds)})`;
      statusText.className = 'text-[11px] text-emerald-400 font-medium';
      isStudying = true;
      startLocalStopwatch();
    } else if (me.status === 'RESTING') {
      dot.className = 'w-3 h-3 rounded-full bg-amber-500';
      statusText.innerText = `휴식 중 ☕ (${formatTime(me.today_study_seconds)})`;
      statusText.className = 'text-[11px] text-amber-400 font-medium';
      isStudying = false;
      stopLocalStopwatch();
    } else {
      dot.className = 'w-3 h-3 rounded-full bg-slate-500';
      statusText.innerText = '퇴실 / 미입실 💤';
      statusText.className = 'text-[11px] text-slate-400 font-medium';
      isStudying = false;
      stopLocalStopwatch();
    }

    // Timer Tab info
    timerSeconds = me.today_study_seconds || 0;
    updateTimerDisplay();
    document.getElementById('timerCafeBadge').innerText = me.current_cafe 
      ? `📍 ${me.current_cafe.name}` 
      : '📍 스카 미입실';

  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

// 5. Load Study Cafes
async function loadCafes() {
  try {
    const res = await fetch(`/api/cafes?current_user_id=${currentUserId}`);
    cafes = await res.json();
    renderMapMarkers();
    renderCafesList(cafes);
  } catch (err) {
    console.error('Failed to load cafes:', err);
  }
}

function filterCafes(type) {
  document.querySelectorAll('.cafe-filter-btn').forEach(b => {
    b.className = 'cafe-filter-btn px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white font-medium';
  });
  document.getElementById(`filter-${type}`).className = 'cafe-filter-btn px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium shadow-sm';

  let filtered = cafes;
  if (type === 'friends') {
    filtered = cafes.filter(c => c.friends_here && c.friends_here.length > 0);
  } else if (type === 'school') {
    filtered = [...cafes].sort((a, b) => (b.schoolmates_here.length + b.friends_here.length) - (a.schoolmates_here.length + a.friends_here.length));
  }
  renderCafesList(filtered);
}

function renderCafesList(list) {
  const container = document.getElementById('cafesList');
  document.getElementById('cafeCountText').innerText = `총 ${list.length}개 지점`;

  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">해당 조건의 스터디카페가 없습니다.</div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const isMyCurrent = me?.current_cafe_id === c.id;
    const friendsCount = c.friends_here.length;
    const schoolCount = c.schoolmates_here.length + (friendsCount);

    return `
      <div class="bg-slate-800/90 border ${isMyCurrent ? 'border-blue-500 shadow-blue-500/20' : 'border-slate-700/80'} rounded-2xl p-4 shadow-lg space-y-3 transition hover:border-slate-600">
        <!-- Cafe Header -->
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-white">${c.name} <span class="text-xs font-semibold text-blue-400">${c.branch}</span></h3>
              ${isMyCurrent ? '<span class="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500 text-white">현재 내 위치</span>' : ''}
            </div>
            <p class="text-[11px] text-slate-400 mt-0.5">${c.address}</p>
          </div>
          <span class="text-[11px] font-medium text-slate-300 bg-slate-700/80 px-2 py-1 rounded-lg">
            좌석: <strong class="text-blue-400">${c.occupied_seats}</strong>/${c.total_seats}석
          </span>
        </div>

        <!-- Friends & Schoolmates Status in this Cafe (핵심 기능) -->
        <div class="bg-slate-900/70 rounded-xl p-2.5 border border-slate-700/50 space-y-2">
          <!-- Friends here -->
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5">
              <span class="text-orange-400">🔥</span>
              <span class="font-bold text-slate-200">내 친구</span>
              <span class="text-orange-400 font-extrabold">${friendsCount}명</span>
            </div>
            ${friendsCount > 0 ? `
              <div class="flex items-center -space-x-2">
                ${c.friends_here.map(f => `
                  <img src="${f.avatar}" title="${f.name} (${f.status === 'STUDYING' ? '열공 중' : '휴식 중'})" class="w-6 h-6 rounded-full border-2 border-slate-800 object-cover">
                `).join('')}
              </div>
            ` : '<span class="text-[11px] text-slate-500">현재 친구 없음</span>'}
          </div>

          <!-- Schoolmates here -->
          <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
            <div class="flex items-center gap-1.5">
              <span class="text-blue-400">🏫</span>
              <span class="text-slate-300">한국고 재학생</span>
              <span class="text-blue-400 font-bold">${schoolCount}명 공부 중</span>
            </div>
            <button onclick="openCafeStudentsModal(${c.id})" class="text-[11px] text-slate-400 hover:text-white underline">
              학생 명단 보기 &gt;
            </button>
          </div>
        </div>

        <!-- Features & Amenities -->
        <div class="text-[11px] text-slate-400 flex items-center gap-1">
          <span class="text-slate-500">편의:</span> ${c.features}
        </div>

        <!-- Action Buttons -->
        <div class="flex space-x-2 pt-1">
          ${isMyCurrent ? `
            <button onclick="checkOutFromCafe()" class="flex-1 py-2 rounded-xl bg-slate-700 text-red-300 hover:bg-slate-600 font-bold text-xs transition">
              퇴실 처리
            </button>
          ` : `
            <button onclick="checkInToCafe(${c.id})" class="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition">
              이 스카로 체크인(입실) 📍
            </button>
          `}
          ${friendsCount > 0 ? `
            <button onclick="requestBattleFromCafe(${c.id})" class="px-3 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold text-xs shadow-md transition flex items-center gap-1">
              <span>⚔️</span> 대결 신청
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// 6. Check-in & Check-out Handlers
async function checkInToCafe(cafeId) {
  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, cafe_id: cafeId, action: 'CHECKIN' })
    });
    if (res.ok) {
      showToast('스터디카페에 체크인되었습니다! 순공 타이머가 시작됩니다. 🔥');
      await refreshAll();
      showTab('timer');
    }
  } catch (err) {
    showToast('체크인에 실패했습니다.', '❌');
  }
}

async function checkOutFromCafe() {
  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, action: 'CHECKOUT' })
    });
    if (res.ok) {
      showToast('퇴실 완료되었습니다. 수고하셨습니다!');
      await refreshAll();
    }
  } catch (err) {
    showToast('퇴실에 실패했습니다.', '❌');
  }
}

function toggleCheckIn() {
  if (me?.current_cafe_id) {
    checkOutFromCafe();
  } else {
    showTab('map');
    showToast('방문할 스터디카페를 선택하여 체크인하세요 📍');
  }
}

// 7. Pure Study Timer Logic
function startLocalStopwatch() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopLocalStopwatch() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  const display = document.getElementById('studyTimerDisplay');
  if (display) display.innerText = formatTime(timerSeconds);

  // Goal percentage (5 hours = 18000s)
  const percent = Math.min(100, Math.round((timerSeconds / 18000) * 100));
  const goalEl = document.getElementById('goalPercent');
  if (goalEl) goalEl.innerText = `${percent}%`;

  const btnText = document.getElementById('timerPlayText');
  const btnIcon = document.getElementById('timerPlayIcon');
  const ring = document.getElementById('timerGlowRing');
  const subStatus = document.getElementById('timerSubStatus');

  if (isStudying) {
    if (btnText) btnText.innerText = '일시정지';
    if (btnIcon) btnIcon.innerText = '⏸️';
    if (ring) ring.className = 'absolute inset-0 rounded-full border-4 border-dashed border-emerald-500 glow-studying';
    if (subStatus) {
      subStatus.innerText = '집중 열공 모드 🔥';
      subStatus.className = 'text-xs font-bold mt-2 text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20';
    }
  } else {
    if (btnText) btnText.innerText = '공부 시작';
    if (btnIcon) btnIcon.innerText = '▶️';
    if (ring) ring.className = 'absolute inset-0 rounded-full border-4 border-dashed border-slate-700';
    if (subStatus) {
      subStatus.innerText = '일시 정지 중 ☕';
      subStatus.className = 'text-xs font-bold mt-2 text-amber-400 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20';
    }
  }
}

async function toggleStudyTimer() {
  if (isStudying) {
    // Pause
    isStudying = false;
    stopLocalStopwatch();
    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, status: 'RESTING', status_message: '잠깐 휴식 중 ☕' })
    });
    showToast('공부를 일시정지했습니다.');
  } else {
    // Start
    isStudying = true;
    startLocalStopwatch();
    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, status: 'STUDYING', status_message: '순공 열공 중! 🔥' })
    });
    showToast('순공 타이머가 시작되었습니다! 🔥');
  }
  updateTimerDisplay();
  await loadMyProfile();
}

async function setRestMode() {
  isStudying = false;
  stopLocalStopwatch();
  await fetch('/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: currentUserId, status: 'RESTING', status_message: '휴식 중 ☕' })
  });
  showToast('휴식 모드로 전환되었습니다 ☕');
  updateTimerDisplay();
  await loadMyProfile();
}

async function syncTimerTick(secondsToAdd) {
  try {
    await fetch('/api/timer/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, seconds: secondsToAdd })
    });
  } catch (err) {
    console.error('Tick sync failed:', err);
  }
}

// 8. 1:1 Study Battle Arena
async function loadActiveBattle() {
  try {
    const res = await fetch(`/api/battle/active?user_id=${currentUserId}`);
    activeBattle = await res.json();
    renderActiveBattle();
  } catch (err) {
    console.error('Failed to load battle:', err);
  }
}

function renderActiveBattle() {
  const container = document.getElementById('activeBattleContainer');
  const timerWidget = document.getElementById('timerBattleWidget');

  if (!activeBattle || !activeBattle.has_active_battle) {
    container.innerHTML = `
      <div class="text-center py-8 space-y-3">
        <div class="text-4xl">⚔️</div>
        <h4 class="text-sm font-bold text-slate-200">진행 중인 1:1 대결이 없습니다</h4>
        <p class="text-xs text-slate-400">같은 스카에 있거나 친구인 학생에게 대결을 신청해보세요!</p>
        <button onclick="showTab('friends')" class="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs">
          친구 목록에서 대결 신청하기 &gt;
        </button>
      </div>
    `;
    if (timerWidget) timerWidget.classList.add('hidden');
    return;
  }

  if (timerWidget) timerWidget.classList.remove('hidden');

  const b = activeBattle;
  const mySec = b.my_seconds;
  const oppSec = b.opp_seconds;
  const total = mySec + oppSec || 1;
  const myPct = Math.round((mySec / total) * 100);
  const oppPct = 100 - myPct;
  const h2h = b.h2h;

  // Head-to-Head Badge
  const h2hText = `상대전적: ${h2h.my_wins}승 ${h2h.opp_wins}패 (승률 ${h2h.win_rate}%)`;
  document.getElementById('h2hRecordBadge').innerText = h2hText;
  document.getElementById('widgetH2HBadge').innerText = `${h2h.my_wins}승 ${h2h.opp_wins}패`;

  // Me
  document.getElementById('battleMyAvatar').src = me?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120';
  document.getElementById('battleMyName').innerText = me?.name || '나';
  document.getElementById('battleMyTime').innerText = formatTime(mySec);
  document.getElementById('battleMyPercentText').innerText = `${myPct}%`;

  // Opponent
  document.getElementById('battleOppAvatar').src = b.opp_avatar;
  document.getElementById('battleOppName').innerText = b.opp_name;
  document.getElementById('battleOppTime').innerText = formatTime(oppSec);
  document.getElementById('battleOppPercentText').innerText = `${oppPct}%`;

  // Progress Bar
  document.getElementById('battleMyBar').style.width = `${myPct}%`;
  document.getElementById('battleOppBar').style.width = `${oppPct}%`;
  document.getElementById('widgetMyBar').style.width = `${myPct}%`;
  document.getElementById('widgetOppBar').style.width = `${oppPct}%`;

  // Lead status message
  const diffMinutes = Math.abs(Math.round(b.diff_seconds / 60));
  const leadEl = document.getElementById('battleLeadText');
  const adviceEl = document.getElementById('widgetBattleAdvice');
  const myCrown = document.getElementById('battleMyCrown');
  const oppCrown = document.getElementById('battleOppCrown');

  if (b.diff_seconds > 0) {
    leadEl.innerText = `🔥 내가 +${diffMinutes}분 앞서는 중!`;
    leadEl.className = 'text-blue-400 font-bold';
    adviceEl.innerText = `🔥 상대보다 ${diffMinutes}분 앞서고 있습니다! 이 기세로 굳히기!`;
    myCrown.classList.remove('hidden');
    oppCrown.classList.add('hidden');
  } else if (b.diff_seconds < 0) {
    leadEl.innerText = `⚡ ${b.opp_name} +${diffMinutes}분 앞서는 중!`;
    leadEl.className = 'text-orange-400 font-bold';
    adviceEl.innerText = `⚡ ${b.opp_name} 학생이 ${diffMinutes}분 앞서는 중! 조금만 더 집중해보세요!`;
    myCrown.classList.add('hidden');
    oppCrown.classList.remove('hidden');
  } else {
    leadEl.innerText = '⚖️ 팽팽한 동점!';
    leadEl.className = 'text-slate-300 font-bold';
    adviceEl.innerText = '현재 1초 차이 박빙 동점! 먼저 달리는 사람이 승리!';
    myCrown.classList.add('hidden');
    oppCrown.classList.add('hidden');
  }
}

// Finalize Battle (정산 및 상대전적 영구 반영)
async function finalizeTodayBattle() {
  if (!activeBattle || !activeBattle.id) return;

  try {
    const res = await fetch(`/api/battle/${activeBattle.id}/finalize`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      // Show Result Modal
      const isWinner = data.winner_id === currentUserId;
      const isDraw = data.winner_id === null;

      document.getElementById('resultTitle').innerText = isWinner ? '대결 승리! 🎉' : (isDraw ? '무승부! 🤝' : '아쉬운 패배 😢');
      document.getElementById('resultSubtitle').innerText = isWinner ? '오늘 더 긴 시간 집중하여 승리했습니다!' : '다음 번에 역전 승부를 노려보세요!';
      document.getElementById('resultTrophyIcon').innerText = isWinner ? '🏆' : (isDraw ? '🤝' : '🔥');

      document.getElementById('resultMyName').innerText = me?.name || '나';
      document.getElementById('resultMyTime').innerText = formatTime(activeBattle.my_seconds);
      document.getElementById('resultOppName').innerText = activeBattle.opp_name;
      document.getElementById('resultOppTime').innerText = formatTime(activeBattle.opp_seconds);

      const h2h = data.updated_h2h;
      document.getElementById('resultNewH2H').innerText = `${h2h.my_wins}승 ${h2h.opp_wins}패 (승률 ${h2h.win_rate}%)`;

      document.getElementById('battleResultModal').classList.remove('hidden');
      await refreshAll();
    }
  } catch (err) {
    showToast('대결 정산에 실패했습니다.', '❌');
  }
}

function closeResultModal() {
  document.getElementById('battleResultModal').classList.add('hidden');
}

// 9. Friends List & Battle Candidates
async function loadFriends() {
  try {
    const res = await fetch(`/api/friends?current_user_id=${currentUserId}`);
    friends = await res.json();
    renderFriendsList();
    renderBattleCandidates();
  } catch (err) {
    console.error('Failed to load friends:', err);
  }
}

function renderFriendsList() {
  const container = document.getElementById('friendsListContainer');
  if (!container) return;

  if (friends.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">등록된 친구가 없습니다.</div>`;
    return;
  }

  container.innerHTML = friends.map(f => {
    const h2h = f.h2h;
    const isStudyingFriend = f.status === 'STUDYING';
    const isResting = f.status === 'RESTING';
    const statusColor = isStudyingFriend ? 'bg-emerald-500' : (isResting ? 'bg-amber-500' : 'bg-slate-600');
    const statusText = isStudyingFriend ? '열공 중 🔥' : (isResting ? '휴식 중 ☕' : '미입실 💤');

    return `
      <div class="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between shadow-md">
        <div class="flex items-center space-x-3">
          <div class="relative">
            <img src="${f.avatar}" class="w-11 h-11 rounded-full object-cover border border-slate-600">
            <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full ${statusColor} border-2 border-slate-900"></span>
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-white">${f.name}</span>
              <span class="text-[10px] text-slate-400">${f.grade}</span>
            </div>
            <!-- Friend's current study cafe -->
            <div class="text-[11px] text-blue-400 font-medium">
              ${f.cafe_name ? `📍 ${f.cafe_name} ${f.cafe_branch}` : '📍 스카 미입실'}
            </div>
            <!-- Status & Today Time -->
            <div class="text-[10px] text-slate-400 mt-0.5">
              ${statusText} • 오늘 <strong class="text-slate-200">${formatTime(f.today_study_seconds)}</strong>
            </div>
          </div>
        </div>

        <div class="flex flex-col items-end space-y-1.5">
          <!-- 상대전적 배지 (핵심 요구사항) -->
          <div class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
            전적 ${h2h.my_wins}승 ${h2h.opp_wins}패
          </div>
          <button onclick="openBattleModal(${f.id})" class="text-xs font-bold px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white shadow-sm transition flex items-center gap-1">
            <span>⚔️</span> 대결 신청
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderBattleCandidates() {
  const container = document.getElementById('battleCandidatesList');
  if (!container) return;

  container.innerHTML = friends.map(f => `
    <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800">
      <div class="flex items-center space-x-2.5">
        <img src="${f.avatar}" class="w-8 h-8 rounded-full object-cover">
        <div>
          <div class="text-xs font-bold text-white">${f.name}</div>
          <div class="text-[10px] text-amber-400 font-semibold">이전 상대전적: ${f.h2h.my_wins}승 ${f.h2h.opp_wins}패</div>
        </div>
      </div>
      <button onclick="openBattleModal(${f.id})" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/40 transition">
        대결 신청
      </button>
    </div>
  `).join('');
}

// 10. Battle Challenge Modal & Submission
function openBattleModal(opponentId) {
  selectedOpponent = friends.find(f => f.id === opponentId) || allUsers.find(u => u.id === opponentId);
  if (!selectedOpponent) return;

  document.getElementById('modalOppAvatar').src = selectedOpponent.avatar;
  document.getElementById('modalOppName').innerText = `${selectedOpponent.name} (${selectedOpponent.grade})`;
  document.getElementById('modalOppLocation').innerText = selectedOpponent.cafe_name 
    ? `📍 ${selectedOpponent.cafe_name} ${selectedOpponent.cafe_branch}` 
    : '📍 스터디카페 미입실';

  const h2h = selectedOpponent.h2h || { my_wins: 0, opp_wins: 0, win_rate: 0 };
  document.getElementById('modalH2HRecord').innerText = `${h2h.my_wins}승 ${h2h.opp_wins}패 (승률 ${h2h.win_rate}%)`;

  const tip = document.getElementById('modalH2HTip');
  if (h2h.my_wins > h2h.opp_wins) {
    tip.innerText = '이전 대결에서 내가 앞서고 있어요! 오늘도 승리해보세요. 🔥';
  } else if (h2h.my_wins < h2h.opp_wins) {
    tip.innerText = '상대방에게 뒤쳐지고 있습니다! 이번 대결로 설욕하세요! ⚡';
  } else {
    tip.innerText = '현재 전적이 팽팽합니다! 오늘의 승자가 앞서갑니다!';
  }

  document.getElementById('battleRequestModal').classList.remove('hidden');
}

function closeBattleModal() {
  document.getElementById('battleRequestModal').classList.add('hidden');
  selectedOpponent = null;
}

async function confirmBattleChallenge() {
  if (!selectedOpponent) return;

  try {
    const res = await fetch('/api/battle/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenger_id: currentUserId, opponent_id: selectedOpponent.id })
    });
    const data = await res.json();
    if (data.success) {
      closeBattleModal();
      showToast(`${selectedOpponent.name} 학생과의 순공 대결이 시작되었습니다! 🔥`);
      await loadActiveBattle();
      showTab('battle');
    }
  } catch (err) {
    showToast('대결 신청에 실패했습니다.', '❌');
  }
}

function requestBattleFromCafe(cafeId) {
  const targetCafe = cafes.find(c => c.id === cafeId);
  if (targetCafe && targetCafe.friends_here && targetCafe.friends_here.length > 0) {
    openBattleModal(targetCafe.friends_here[0].id);
  } else {
    showToast('해당 스카에 접속 중인 친구가 없습니다.');
  }
}

// 11. Rankings
async function loadRankings() {
  try {
    const cafeParam = (rankingScope === 'cafe' && me?.current_cafe_id) ? `&cafe_id=${me.current_cafe_id}` : '';
    const res = await fetch(`/api/rankings?period=${rankingPeriod}&current_user_id=${currentUserId}${cafeParam}`);
    const list = await res.json();
    renderRankingsList(list);
  } catch (err) {
    console.error('Failed to load rankings:', err);
  }
}

function renderRankingsList(list) {
  const container = document.getElementById('rankingsList');
  if (!container) return;

  const title = document.getElementById('rankingSubTitle');
  if (rankingScope === 'cafe') {
    title.innerText = me?.current_cafe 
      ? `📍 ${me.current_cafe.name} ${me.current_cafe.branch} 학생 순위`
      : '📍 내가 체크인한 스카 학생 순위';
  } else {
    title.innerText = '🏫 한국고등학교 전체 학생 순공 순위';
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">순위 데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = list.map(item => {
    let rankBadge = '';
    if (item.rank === 1) rankBadge = '<span class="text-xl">🥇</span>';
    else if (item.rank === 2) rankBadge = '<span class="text-xl">🥈</span>';
    else if (item.rank === 3) rankBadge = '<span class="text-xl">🥉</span>';
    else rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center">${item.rank}</span>`;

    return `
      <div class="bg-slate-800/90 border ${item.is_me ? 'border-blue-500 bg-blue-950/20' : 'border-slate-700/70'} rounded-2xl p-3 flex items-center justify-between shadow-sm">
        <div class="flex items-center space-x-3">
          <div class="w-8 flex justify-center">${rankBadge}</div>
          <img src="${item.avatar}" class="w-10 h-10 rounded-full object-cover border border-slate-600">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-white">${item.name}</span>
              ${item.is_me ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-blue-500 text-white font-bold">나</span>' : ''}
              <span class="text-[10px] text-slate-400">${item.grade}</span>
            </div>
            <div class="text-[10px] text-blue-400">
              ${item.cafe_name ? `📍 ${item.cafe_name}` : '📍 미입실'}
            </div>
          </div>
        </div>

        <div class="text-right">
          <div class="text-sm font-black text-amber-300 font-mono">${formatTime(item.seconds)}</div>
          <span class="text-[10px] text-slate-400 font-medium">순공 누적</span>
        </div>
      </div>
    `;
  }).join('');
}

function setRankingScope(scope) {
  rankingScope = scope;
  document.getElementById('rankScopeCafe').className = scope === 'cafe' ? 'flex-1 py-1.5 rounded-lg bg-blue-600 text-white font-bold transition' : 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white font-medium transition';
  document.getElementById('rankScopeSchool').className = scope === 'school' ? 'flex-1 py-1.5 rounded-lg bg-blue-600 text-white font-bold transition' : 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white font-medium transition';
  loadRankings();
}

function setRankingPeriod(period) {
  rankingPeriod = period;
  document.getElementById('periodToday').className = period === 'today' ? 'px-2.5 py-1 rounded bg-slate-700 text-blue-400 font-bold' : 'px-2.5 py-1 rounded text-slate-400 hover:text-white';
  document.getElementById('periodWeek').className = period === 'week' ? 'px-2.5 py-1 rounded bg-slate-700 text-blue-400 font-bold' : 'px-2.5 py-1 rounded text-slate-400 hover:text-white';
  loadRankings();
}

// 12. Schoolmates Modal
function openCafeStudentsModal(cafeId) {
  const cafe = cafes.find(c => c.id === cafeId);
  if (!cafe) return;

  document.getElementById('modalCafeTitle').innerText = `${cafe.name} ${cafe.branch}`;
  const listEl = document.getElementById('modalCafeStudentsList');

  const allHere = [...(cafe.friends_here || []), ...(cafe.schoolmates_here || [])];

  if (allHere.length === 0) {
    listEl.innerHTML = `<div class="text-center py-6 text-xs text-slate-500">현재 이 스카에 등록된 한국고 학생이 없습니다.</div>`;
  } else {
    listEl.innerHTML = allHere.map(s => `
      <div class="flex items-center justify-between p-2 rounded-xl bg-slate-800 border border-slate-700">
        <div class="flex items-center space-x-2.5">
          <img src="${s.avatar}" class="w-8 h-8 rounded-full object-cover">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-white">${s.name}</span>
              ${s.is_friend ? '<span class="text-[9px] px-1 bg-orange-500/20 text-orange-400 rounded font-semibold">친구</span>' : ''}
            </div>
            <div class="text-[10px] text-slate-400">${s.grade} • ${s.status === 'STUDYING' ? '열공 중 🔥' : '휴식 중 ☕'}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs font-mono font-bold text-blue-400">${formatTime(s.today_study_seconds)}</div>
          <button onclick="closeCafeStudentsModal(); openBattleModal(${s.id})" class="text-[10px] text-orange-400 underline font-semibold mt-0.5">
            대결 신청
          </button>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('cafeStudentsModal').classList.remove('hidden');
}

function closeCafeStudentsModal() {
  document.getElementById('cafeStudentsModal').classList.add('hidden');
}

// Sub tab in Friends Tab
function switchFriendSubTab(tab) {
  const friendsContainer = document.getElementById('friendsListContainer');
  const schoolContainer = document.getElementById('schoolmatesContainer');
  const btnF = document.getElementById('subtab-friends-btn');
  const btnS = document.getElementById('subtab-school-btn');

  if (tab === 'friends') {
    friendsContainer.classList.remove('hidden');
    schoolContainer.classList.add('hidden');
    btnF.className = 'pb-2 px-3 text-xs font-bold border-b-2 border-blue-500 text-blue-400';
    btnS.className = 'pb-2 px-3 text-xs font-medium text-slate-400 hover:text-slate-200';
  } else {
    friendsContainer.classList.add('hidden');
    schoolContainer.classList.remove('hidden');
    btnF.className = 'pb-2 px-3 text-xs font-medium text-slate-400 hover:text-slate-200';
    btnS.className = 'pb-2 px-3 text-xs font-bold border-b-2 border-blue-500 text-blue-400';
    renderSchoolmatesDirectory();
  }
}

function renderSchoolmatesDirectory() {
  const container = document.getElementById('schoolmatesContainer');
  container.innerHTML = allUsers.map(u => `
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <img src="${u.avatar}" class="w-10 h-10 rounded-full object-cover">
        <div>
          <div class="text-xs font-bold text-white">${u.name} <span class="text-[10px] text-slate-400">(${u.grade})</span></div>
          <div class="text-[10px] text-blue-400">${u.status === 'STUDYING' ? '열공 중 🔥' : (u.status === 'RESTING' ? '휴식 중 ☕' : '미입실 💤')}</div>
        </div>
      </div>
      <div class="text-right">
        <div class="text-xs font-mono font-bold text-slate-200">${formatTime(u.today_study_seconds)}</div>
        ${u.id !== currentUserId ? `
          <button onclick="openBattleModal(${u.id})" class="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 mt-1">
            대결 신청
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// 13. Tab Navigation
function showTab(tabId) {
  activeTab = tabId;

  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  // Remove active from nav buttons
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  // Show selected panel
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.remove('hidden');

  // Highlight button
  const btn = document.getElementById(`btn-tab-${tabId}`);
  if (btn) btn.classList.add('active');

  // If map tab, trigger map resize
  if (tabId === 'map' && map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }
}

// Helper: Format seconds to HH:MM:SS
function formatTime(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds)) return '00:00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
