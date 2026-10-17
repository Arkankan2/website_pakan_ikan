/**
 * SISTEM PAKAN & MONITORING KOLAM IKAN
 * Logika Aplikasi (JavaScript):
 * - Pemantauan Suhu Air (°C)
 * - Pemantauan Kekeruhan Air (NTU)
 * - Perhitungan & Kontrol Gram Pakan yang Dikeluarkan
 * - Kalkulator Kebutuhan Pakan Ikan
 * - Manajemen Jadwal Pakan
 * - Integrasi Hardware Arduino / ESP32 / ESP8266 & Mode Simulasi
 */

// ========================================================
// 1. STATE & DATA AWAL (Disimpan juga di LocalStorage)
// ========================================================
const DEFAULT_STATE = {
  // Mode: 'simulation' atau 'hardware'
  mode: 'simulation',
  arduinoIp: 'http://192.168.1.50',
  feedApiUrl: 'http://192.168.1.50/feed?gram=',
  refreshInterval: 3,

  // Kapasitas Tabung Pakan
  storageCapacity: 1000, // gram
  storageRemaining: 850, // gram

  // Pakan Hari Ini
  feedToday: 120, // gram
  feedTarget: 150, // gram
  feedCountToday: 3,

  // Sensor
  currentTemp: 28.4,
  currentTurbidity: 18,

  // Jadwal Pakan
  schedules: [
    { id: 1, time: '07:30', grams: 50, enabled: true },
    { id: 2, time: '12:30', grams: 50, enabled: true },
    { id: 3, time: '17:00', grams: 50, enabled: true }
  ],

  // Log Aktivitas
  logs: [
    { time: '12:30:15', activity: 'Pakan Otomatis (Jadwal Siang)', grams: 50, status: 'Berhasil' },
    { time: '09:45:00', activity: 'Pakan Manual', grams: 20, status: 'Berhasil' },
    { time: '07:30:08', activity: 'Pakan Otomatis (Jadwal Pagi)', grams: 50, status: 'Berhasil' }
  ]
};

// Ambil state dari localStorage atau gunakan default
let appState = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem('pondmaster_state');
    if (saved) {
      return { ...DEFAULT_STATE, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Gagal memuat state dari storage, memakai default:', e);
  }
  return { ...DEFAULT_STATE };
}

function saveState() {
  try {
    localStorage.setItem('pondmaster_state', JSON.stringify(appState));
  } catch (e) {
    console.warn('Gagal menyimpan state:', e);
  }
}

// ========================================================
// 2. INISIALISASI ELEMEN DOM
// ========================================================
// Parameter Cards
const tempValueEl = document.getElementById('tempValue');
const tempStatusEl = document.getElementById('tempStatus');
const tempBarEl = document.getElementById('tempBar');

const turbidityValueEl = document.getElementById('turbidityValue');
const turbidityStatusEl = document.getElementById('turbidityStatus');
const turbidityBarEl = document.getElementById('turbidityBar');

const feedTodayValueEl = document.getElementById('feedTodayValue');
const feedTargetLabelEl = document.getElementById('feedTargetLabel');
const feedCountTodayEl = document.getElementById('feedCountToday');
const feedPercentTodayEl = document.getElementById('feedPercentToday');
const feedTodayBarEl = document.getElementById('feedTodayBar');

const storageGramsEl = document.getElementById('storageGrams');
const storageStatusEl = document.getElementById('storageStatus');
const storageBarEl = document.getElementById('storageBar');
const btnRefill = document.getElementById('btnRefill');

// Banner & Waktu
const currentDateTimeEl = document.getElementById('currentDateTime');
const nextFeedScheduleBadgeEl = document.getElementById('nextFeedScheduleBadge');
const connectionBadgeEl = document.getElementById('connectionBadge');
const connectionTextEl = document.getElementById('connectionText');

// Kontrol Pakan Cepat
const feedPresetBtns = document.querySelectorAll('.feed-preset-btn');
const customGramInput = document.getElementById('customGramInput');
const btnDispenseFeed = document.getElementById('btnDispenseFeed');
const dispenseGramsLabel = document.getElementById('dispenseGramsLabel');
const feedActionProgress = document.getElementById('feedActionProgress');
const feedActionStatusText = document.getElementById('feedActionStatusText');

// Kalkulator
const calcFishCount = document.getElementById('calcFishCount');
const calcAvgWeight = document.getElementById('calcAvgWeight');
const calcFeedingRate = document.getElementById('calcFeedingRate');
const calcFrequency = document.getElementById('calcFrequency');
const calcTotalBiomass = document.getElementById('calcTotalBiomass');
const calcDailyNeed = document.getElementById('calcDailyNeed');
const calcPerSession = document.getElementById('calcPerSession');
const btnApplyTarget = document.getElementById('btnApplyTarget');

// Jadwal
const btnToggleAddSchedule = document.getElementById('btnToggleAddSchedule');
const addScheduleBox = document.getElementById('addScheduleBox');
const newScheduleTime = document.getElementById('newScheduleTime');
const newScheduleGrams = document.getElementById('newScheduleGrams');
const btnSaveSchedule = document.getElementById('btnSaveSchedule');
const scheduleListContainer = document.getElementById('scheduleListContainer');

// Analisis & Log
const analysisBox = document.getElementById('airAnalysisBox');
const analysisIcon = document.getElementById('analysisIcon');
const analysisTitle = document.getElementById('analysisTitle');
const analysisDesc = document.getElementById('analysisDesc');
const logTableBody = document.getElementById('logTableBody');
const btnClearLog = document.getElementById('btnClearLog');

// Modal Pengaturan
const btnOpenSettings = document.getElementById('btnOpenSettings');
const settingsModal = document.getElementById('settingsModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelSettings = document.getElementById('btnCancelSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const modeSimRadio = document.getElementById('modeSim');
const modeHwRadio = document.getElementById('modeHw');
const hardwareSettingsFields = document.getElementById('hardwareSettingsFields');
const arduinoIpInput = document.getElementById('arduinoIpInput');
const feedApiUrlInput = document.getElementById('feedApiUrlInput');
const refreshIntervalInput = document.getElementById('refreshInterval');
const btnTestConnection = document.getElementById('btnTestConnection');
const testConnectionResult = document.getElementById('testConnectionResult');

let selectedFeedGrams = 25;
let sensorChart = null;
let dataFetchTimer = null;
let lastTriggeredScheduleMinute = '';

// ========================================================
// 3. INISIALISASI APLIKASI
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  initDateTime();
  initChart();
  renderAllState();
  initEventListeners();
  calculateFeedRecommendation();
  startSensorMonitoring();
});

// ========================================================
// 4. WAKTU & JAM SISTEM
// ========================================================
function initDateTime() {
  const updateClock = () => {
    const now = new Date();
    const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('id-ID', optionsDate);
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    currentDateTimeEl.textContent = `${dateStr} • Pukul ${timeStr}`;

    // Cek jadwal pakan per menit
    checkScheduledFeed(now);
  };

  updateClock();
  setInterval(updateClock, 1000);
}

// ========================================================
// 5. UPDATE TAMPILAN SENSOR & PARAMETER (UI)
// ========================================================
function renderAllState() {
  renderSensors();
  renderFeedMetrics();
  renderSchedules();
  renderLogs();
  updateNextScheduleBadge();
  updateConnectionBadge();
}

/**
 * Menghitung & Memperbarui status Suhu Air
 */
function updateTemperature(val) {
  appState.currentTemp = parseFloat(val.toFixed(1));
  tempValueEl.textContent = appState.currentTemp.toFixed(1);

  // Status Suhu:
  // < 25: Dingin, 26 - 30: Ideal, > 30: Hangat/Panas
  const temp = appState.currentTemp;
  let statusText = 'Normal (Ideal)';
  let pillClass = 'status-safe';
  let barPercent = Math.min(100, Math.max(10, ((temp - 20) / (35 - 20)) * 100));

  if (temp < 25) {
    statusText = 'Air Terlalu Dingin';
    pillClass = 'status-warn';
  } else if (temp >= 25 && temp <= 30.5) {
    statusText = 'Ideal (Sehat)';
    pillClass = 'status-safe';
  } else if (temp > 30.5 && temp <= 32) {
    statusText = 'Mulai Hangat';
    pillClass = 'status-warn';
  } else {
    statusText = 'Terlalu Panas (Bahaya)';
    pillClass = 'status-alert';
  }

  tempStatusEl.className = `status-pill ${pillClass}`;
  tempStatusEl.textContent = statusText;
  tempBarEl.style.width = `${barPercent}%`;

  if (temp > 31 || temp < 24) {
    tempBarEl.style.backgroundColor = '#dc2626';
  } else {
    tempBarEl.style.backgroundColor = '#0284c7';
  }
}

/**
 * Menghitung & Memperbarui status Kekeruhan Air (NTU)
 */
function updateTurbidity(val) {
  appState.currentTurbidity = Math.round(val);
  turbidityValueEl.textContent = appState.currentTurbidity;

  const ntu = appState.currentTurbidity;
  let statusText = 'Air Jernih';
  let pillClass = 'status-safe';
  let barPercent = Math.min(100, Math.max(10, (ntu / 100) * 100));

  if (ntu < 25) {
    statusText = 'Air Jernih (Bagus)';
    pillClass = 'status-safe';
  } else if (ntu >= 25 && ntu <= 50) {
    statusText = 'Mulai Sedikit Keruh';
    pillClass = 'status-warn';
  } else {
    statusText = 'Air Keruh (Perlu Ganti)';
    pillClass = 'status-alert';
  }

  turbidityStatusEl.className = `status-pill ${pillClass}`;
  turbidityStatusEl.textContent = statusText;
  turbidityBarEl.style.width = `${barPercent}%`;

  if (ntu > 50) {
    turbidityBarEl.style.backgroundColor = '#dc2626';
  } else if (ntu >= 25) {
    turbidityBarEl.style.backgroundColor = '#d97706';
  } else {
    turbidityBarEl.style.backgroundColor = '#0284c7';
  }

  // Update ringkasan analisis kualitas air
  updateWaterAnalysis();
}

function renderSensors() {
  updateTemperature(appState.currentTemp);
  updateTurbidity(appState.currentTurbidity);
}

/**
 * Update Analisis Kondisi Air dan Saran Tindakan
 */
function updateWaterAnalysis() {
  const temp = appState.currentTemp;
  const ntu = appState.currentTurbidity;

  if (ntu > 50 && temp > 31) {
    analysisBox.style.backgroundColor = '#fee2e2';
    analysisBox.style.borderColor = 'rgba(220, 38, 38, 0.3)';
    analysisIcon.textContent = '⚠️';
    analysisTitle.textContent = 'Peringatan: Air Keruh & Suhu Hangat!';
    analysisDesc.textContent = `Kekeruhan tinggi (${ntu} NTU) dan suhu (${temp}°C) mengurangi kadar oksigen kolam. Disarankan segera kuras/sirkulasi air 30% dan kurangi takaran pakan sementara waktu agar sisa pakan tidak membusuk.`;
  } else if (ntu > 50) {
    analysisBox.style.backgroundColor = '#fef3c7';
    analysisBox.style.borderColor = 'rgba(217, 119, 6, 0.3)';
    analysisIcon.textContent = '💧';
    analysisTitle.textContent = 'Kondisi Air Mulai Keruh';
    analysisDesc.textContent = `Tingkat kekeruhan ${ntu} NTU terdeteksi cukup pekat. Periksa filter kolam atau bersihkan endapan kotoran di dasar kolam agar nafsu makan ikan tetap terjaga.`;
  } else if (temp < 24) {
    analysisBox.style.backgroundColor = '#fef3c7';
    analysisBox.style.borderColor = 'rgba(217, 119, 6, 0.3)';
    analysisIcon.textContent = '❄️';
    analysisTitle.textContent = 'Suhu Air Cenderung Dingin';
    analysisDesc.textContent = `Suhu kolam saat ini ${temp}°C. Metabolisme ikan melambat pada suhu dingin, ikan mungkin lambat merespons pakan. Beri pakan dalam porsi sedikit demi sedikit.`;
  } else {
    analysisBox.style.backgroundColor = '#dcfce7';
    analysisBox.style.borderColor = 'rgba(22, 163, 74, 0.3)';
    analysisIcon.textContent = '✅';
    analysisTitle.textContent = 'Kondisi Air Kolam Sangat Baik';
    analysisDesc.textContent = `Suhu ${temp}°C dan kekeruhan ${ntu} NTU berada pada rentang ideal budidaya. Ikan nyaman, metabolisme optimal, dan dapat mengonsumsi pakan dengan lahap.`;
  }
}

/**
 * Menghitung & Menampilkan Metrik Pakan (Hari Ini & Sisa Tabung)
 */
function renderFeedMetrics() {
  // Pakan Hari Ini
  feedTodayValueEl.textContent = appState.feedToday;
  feedTargetLabelEl.textContent = `${appState.feedTarget}g`;
  feedCountTodayEl.textContent = `${appState.feedCountToday} kali`;

  const percentToday = Math.min(100, Math.round((appState.feedToday / appState.feedTarget) * 100));
  feedPercentTodayEl.textContent = `${percentToday}%`;
  feedTodayBarEl.style.width = `${percentToday}%`;

  // Sisa di Tabung Dispenser
  storageGramsEl.textContent = appState.storageRemaining;
  const storagePercent = Math.max(0, Math.round((appState.storageRemaining / appState.storageCapacity) * 100));
  storageBarEl.style.width = `${storagePercent}%`;

  if (storagePercent <= 15) {
    storageStatusEl.className = 'status-pill status-alert';
    storageStatusEl.textContent = `Kritis (${storagePercent}%) - Segera Isi`;
    storageBarEl.style.backgroundColor = '#dc2626';
  } else if (storagePercent <= 30) {
    storageStatusEl.className = 'status-pill status-warn';
    storageStatusEl.textContent = `Tersisa ${storagePercent}%`;
    storageBarEl.style.backgroundColor = '#d97706';
  } else {
    storageStatusEl.className = 'status-pill status-safe';
    storageStatusEl.textContent = `Kapasitas ${storagePercent}%`;
    storageBarEl.style.backgroundColor = '#0c8599';
  }
}

// ========================================================
// 6. LOGIKA PEMBERIAN PAKAN (DISPENSER)
// ========================================================

/**
 * Eksekusi pengeluaran pakan (manual maupun dari jadwal)
 */
async function dispenseFeed(grams, source = 'Manual') {
  if (appState.storageRemaining < grams) {
    alert(`Pakan di tabung tidak mencukupi! Sisa hanya ${appState.storageRemaining} gram, sedangkan permintaan ${grams} gram. Harap isi ulang tabung pakan.`);
    return false;
  }

  // Tampilkan loading / status servo
  feedActionProgress.style.display = 'flex';
  btnDispenseFeed.disabled = true;
  feedActionStatusText.textContent = `Mengeluarkan ${grams} gram pakan (${source})...`;

  let success = false;

  if (appState.mode === 'hardware') {
    // Mode Hardware: Kirim request HTTP ke Arduino / ESP32
    try {
      const url = `${appState.feedApiUrl}${grams}`;
      const response = await fetch(url, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        success = true;
      } else {
        throw new Error(`HTTP Status ${response.status}`);
      }
    } catch (err) {
      console.error('Gagal menghubungi ESP32/Arduino:', err);
      // Fallback atau notifikasi
      alert(`Peringatan: Gagal mengirim sinyal ke Arduino (${err.message}). Sistem tetap mencatat simulasi lokal.`);
      success = true; // izinkan pencatatan lokal agar alur tidak terputus
    }
  } else {
    // Mode Simulasi: Beri jeda 1.2 detik menirukan putaran servo
    await new Promise(r => setTimeout(r, 1200));
    success = true;
  }

  if (success) {
    // Hitung pengurangan di tabung & penambahan hari ini
    appState.storageRemaining -= grams;
    appState.feedToday += grams;
    appState.feedCountToday += 1;

    // Catat ke Log
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    appState.logs.unshift({
      time: timeStr,
      activity: source === 'Manual' ? 'Pakan Manual' : `Pakan Otomatis (${source})`,
      grams: grams,
      status: 'Berhasil'
    });

    // Batasi log maksimal 20 item
    if (appState.logs.length > 20) {
      appState.logs.pop();
    }

    saveState();
    renderFeedMetrics();
    renderLogs();

    feedActionStatusText.textContent = `Berhasil! ${grams} gram pakan telah dituangkan.`;
    setTimeout(() => {
      feedActionProgress.style.display = 'none';
      btnDispenseFeed.disabled = false;
    }, 2000);

    return true;
  } else {
    feedActionProgress.style.display = 'none';
    btnDispenseFeed.disabled = false;
    return false;
  }
}

// ========================================================
// 7. KALKULATOR KEBUTUHAN PAKAN
// ========================================================
function calculateFeedRecommendation() {
  const fishCount = parseInt(calcFishCount.value) || 0;
  const avgWeight = parseFloat(calcAvgWeight.value) || 0; // gram
  const feedRate = parseFloat(calcFeedingRate.value) || 0.03; // e.g. 0.03 = 3%
  const frequency = parseInt(calcFrequency.value) || 3;

  // Total biomassa dalam kilogram
  const totalBiomassKg = (fishCount * avgWeight) / 1000;
  // Total gram pakan per hari = Biomassa (gram) * feedRate
  const totalDailyGrams = (fishCount * avgWeight) * feedRate;
  // Porsi per sesi
  const perSessionGrams = frequency > 0 ? (totalDailyGrams / frequency) : 0;

  calcTotalBiomass.textContent = `${totalBiomassKg.toFixed(2)} kg`;
  calcDailyNeed.textContent = `${Math.round(totalDailyGrams)} Gram/hari`;
  calcPerSession.textContent = `${Math.round(perSessionGrams)} Gram/sesi`;

  return Math.round(totalDailyGrams);
}

// ========================================================
// 8. JADWAL PAKAN OTOMATIS
// ========================================================
function renderSchedules() {
  scheduleListContainer.innerHTML = '';

  if (appState.schedules.length === 0) {
    scheduleListContainer.innerHTML = '<p class="section-desc" style="text-align:center;">Belum ada jadwal pakan aktif.</p>';
    return;
  }

  // Urutkan jadwal berdasarkan jam
  appState.schedules.sort((a, b) => a.time.localeCompare(b.time));

  appState.schedules.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = `schedule-item ${item.enabled ? '' : 'disabled'}`;
    itemEl.innerHTML = `
      <div class="schedule-left">
        <span class="schedule-time">${item.time}</span>
        <span class="schedule-grams">Takaran: <strong>${item.grams} gram</strong></span>
      </div>
      <div class="schedule-actions">
        <label class="switch" title="${item.enabled ? 'Nonaktifkan' : 'Aktifkan'}">
          <input type="checkbox" ${item.enabled ? 'checked' : ''} data-id="${item.id}" class="schedule-toggle">
          <span class="slider"></span>
        </label>
        <button class="btn-icon-danger btn-delete-schedule" data-id="${item.id}" title="Hapus Jadwal">✕</button>
      </div>
    `;
    scheduleListContainer.appendChild(itemEl);
  });

  // Event listener tombol toggle & hapus
  document.querySelectorAll('.schedule-toggle').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const schedule = appState.schedules.find(s => s.id === id);
      if (schedule) {
        schedule.enabled = e.target.checked;
        saveState();
        renderSchedules();
        updateNextScheduleBadge();
      }
    });
  });

  document.querySelectorAll('.btn-delete-schedule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      appState.schedules = appState.schedules.filter(s => s.id !== id);
      saveState();
      renderSchedules();
      updateNextScheduleBadge();
    });
  });
}

function updateNextScheduleBadge() {
  const now = new Date();
  const currentHM = now.toTimeString().substring(0, 5); // "HH:MM"

  // Cari jadwal hari ini yang belum lewat
  const activeSchedules = appState.schedules.filter(s => s.enabled);
  if (activeSchedules.length === 0) {
    nextFeedScheduleBadgeEl.textContent = 'Tidak Ada Jadwal Aktif';
    return;
  }

  const upcoming = activeSchedules.find(s => s.time > currentHM);
  if (upcoming) {
    nextFeedScheduleBadgeEl.textContent = `${upcoming.time} (${upcoming.grams} gr)`;
  } else {
    // Lewat semua hari ini, tampilkan yang pertama besok
    nextFeedScheduleBadgeEl.textContent = `${activeSchedules[0].time} (${activeSchedules[0].grams} gr - Besok)`;
  }
}

/**
 * Pengecekan otomatis jam jadwal pakan
 */
function checkScheduledFeed(nowDate) {
  const currentHM = nowDate.toTimeString().substring(0, 5); // "HH:MM"

  // Hindari eksekusi berulang dalam menit yang sama
  if (lastTriggeredScheduleMinute === currentHM) return;

  const matchSchedule = appState.schedules.find(s => s.enabled && s.time === currentHM);
  if (matchSchedule) {
    lastTriggeredScheduleMinute = currentHM;
    console.log(`Menjalankan jadwal pakan otomatis jam ${currentHM}: ${matchSchedule.grams} gram.`);
    dispenseFeed(matchSchedule.grams, `Jadwal Jam ${currentHM}`);
  }
}

// ========================================================
// 9. LOG AKTIVITAS (RIWAYAT PAKAN)
// ========================================================
function renderLogs() {
  logTableBody.innerHTML = '';
  if (appState.logs.length === 0) {
    logTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding: 1rem;">Belum ada riwayat pakan</td></tr>';
    return;
  }

  appState.logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${log.time}</td>
      <td><strong>${log.activity}</strong></td>
      <td>${log.grams} gr</td>
      <td><span class="status-pill status-safe">${log.status}</span></td>
    `;
    logTableBody.appendChild(tr);
  });
}

// ========================================================
// 10. GRAFIK SENSOR (CHART.JS)
// ========================================================
function initChart() {
  const ctx = document.getElementById('sensorChart').getContext('2d');

  // Label waktu awal
  const initialLabels = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
  const initialTempData = [27.8, 28.1, 28.5, 28.7, 28.6, 28.4, 28.5];
  const initialTurbData = [15, 16, 17, 19, 18, 17, 18];

  sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: initialLabels,
      datasets: [
        {
          label: 'Suhu Air (°C)',
          data: initialTempData,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.08)',
          fill: true,
          tension: 0.35,
          yAxisID: 'yTemp',
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: 'Kekeruhan (NTU)',
          data: initialTurbData,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          fill: true,
          tension: 0.35,
          yAxisID: 'yTurb',
          borderWidth: 2,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false // Menggunakan legend kustom yang lebih rapi di header card
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleFont: { family: 'Plus Jakarta Sans', size: 12 },
          bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
          padding: 8,
          cornerRadius: 6
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, family: 'Plus Jakarta Sans' }, color: '#94a3b8' }
        },
        yTemp: {
          type: 'linear',
          position: 'left',
          min: 20,
          max: 36,
          ticks: {
            callback: value => `${value}°C`,
            font: { size: 11, family: 'Plus Jakarta Sans' },
            color: '#f97316'
          },
          grid: { color: '#f1f5f9' }
        },
        yTurb: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 80,
          ticks: {
            callback: value => `${value} NTU`,
            font: { size: 11, family: 'Plus Jakarta Sans' },
            color: '#0284c7'
          },
          grid: { display: false }
        }
      }
    }
  });
}

function appendChartData(timeLabel, temp, turb) {
  if (!sensorChart) return;

  sensorChart.data.labels.push(timeLabel);
  sensorChart.data.datasets[0].data.push(temp);
  sensorChart.data.datasets[1].data.push(turb);

  // Pertahankan maksimal 12 titik agar grafik tidak terlalu padat
  if (sensorChart.data.labels.length > 12) {
    sensorChart.data.labels.shift();
    sensorChart.data.datasets[0].data.shift();
    sensorChart.data.datasets[1].data.shift();
  }

  sensorChart.update();
}

// ========================================================
// 11. MONITORING SENSOR & INTEGRASI ARDUINO
// ========================================================
function startSensorMonitoring() {
  if (dataFetchTimer) clearInterval(dataFetchTimer);

  const fetchLoop = async () => {
    if (appState.mode === 'hardware') {
      try {
        const endpoint = `${appState.arduinoIp}/data`;
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          // Format respons JSON yang diharapkan dari ESP32/Arduino:
          // { "suhu": 28.3, "kekeruhan": 19, "sisa_pakan": 800 }
          if (data.suhu !== undefined) updateTemperature(data.suhu);
          if (data.kekeruhan !== undefined) updateTurbidity(data.kekeruhan);
          if (data.sisa_pakan !== undefined) {
            appState.storageRemaining = data.sisa_pakan;
            renderFeedMetrics();
          }

          updateConnectionBadge(true);

          const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          appendChartData(timeLabel, appState.currentTemp, appState.currentTurbidity);
        } else {
          updateConnectionBadge(false);
        }
      } catch (e) {
        console.warn('Gagal membaca data dari Arduino:', e);
        updateConnectionBadge(false);
      }
    } else {
      // Mode Simulasi: berikan sedikit fluktuasi alami yang realistis
      // Fluktuasi suhu: ±0.1 ~ 0.2 °C
      const deltaTemp = (Math.random() - 0.5) * 0.2;
      let newTemp = appState.currentTemp + deltaTemp;
      newTemp = Math.max(26.0, Math.min(31.5, newTemp));
      updateTemperature(newTemp);

      // Fluktuasi kekeruhan: ±1 NTU
      const deltaTurb = Math.floor((Math.random() - 0.48) * 3);
      let newTurb = appState.currentTurbidity + deltaTurb;
      newTurb = Math.max(12, Math.min(45, newTurb));
      updateTurbidity(newTurb);

      const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      appendChartData(timeLabel, appState.currentTemp, appState.currentTurbidity);
    }
  };

  // Jalankan interval (default 3 detik pada simulasi, atau sesuai setting)
  const intervalSec = (appState.refreshInterval || 3) * 1000;
  dataFetchTimer = setInterval(fetchLoop, intervalSec);
}

function updateConnectionBadge(isOnline = true) {
  if (appState.mode === 'simulation') {
    connectionBadgeEl.innerHTML = `<span class="status-dot online"></span> <span>Mode Simulasi (Demo)</span>`;
  } else {
    if (isOnline) {
      connectionBadgeEl.innerHTML = `<span class="status-dot online"></span> <span>ESP32 Terhubung</span>`;
    } else {
      connectionBadgeEl.innerHTML = `<span class="status-dot offline"></span> <span>Arduino Tidak Terjangkau</span>`;
    }
  }
}

// ========================================================
// 12. EVENT LISTENERS
// ========================================================
function initEventListeners() {
  // Preset Porsi Pakan
  feedPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      feedPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFeedGrams = parseInt(btn.dataset.grams);
      customGramInput.value = selectedFeedGrams;
      dispenseGramsLabel.textContent = selectedFeedGrams;
    });
  });

  // Input Gram Manual
  customGramInput.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (!isNaN(val) && val > 0) {
      selectedFeedGrams = val;
      dispenseGramsLabel.textContent = val;
      // Lepas active di preset jika tidak pas
      feedPresetBtns.forEach(b => {
        if (parseInt(b.dataset.grams) === val) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    }
  });

  // Tombol Keluarkan Pakan
  btnDispenseFeed.addEventListener('click', () => {
    dispenseFeed(selectedFeedGrams, 'Manual');
  });

  // Tombol Isi Ulang Tabung Pakan
  btnRefill.addEventListener('click', () => {
    const tambah = prompt('Masukkan jumlah pakan yang diisi ke tabung (Gram):', '500');
    if (tambah !== null) {
      const g = parseInt(tambah);
      if (!isNaN(g) && g > 0) {
        appState.storageRemaining = Math.min(appState.storageCapacity, appState.storageRemaining + g);
        saveState();
        renderFeedMetrics();
        alert(`Berhasil mengisi tabung pakan! Total pakan saat ini: ${appState.storageRemaining} gram.`);
      }
    }
  });

  // Input Kalkulator
  [calcFishCount, calcAvgWeight, calcFeedingRate, calcFrequency].forEach(el => {
    el.addEventListener('input', calculateFeedRecommendation);
    el.addEventListener('change', calculateFeedRecommendation);
  });

  // Terapkan Target Pakan Harian dari Kalkulator
  btnApplyTarget.addEventListener('click', () => {
    const recGrams = calculateFeedRecommendation();
    appState.feedTarget = recGrams;
    saveState();
    renderFeedMetrics();
    alert(`Target pakan harian berhasil diperbarui menjadi ${recGrams} Gram/hari!`);
  });

  // Toggle Box Tambah Jadwal
  btnToggleAddSchedule.addEventListener('click', () => {
    if (addScheduleBox.style.display === 'none') {
      addScheduleBox.style.display = 'block';
      btnToggleAddSchedule.textContent = '✕ Tutup';
    } else {
      addScheduleBox.style.display = 'none';
      btnToggleAddSchedule.textContent = '+ Tambah Jam';
    }
  });

  // Simpan Jadwal Baru
  btnSaveSchedule.addEventListener('click', () => {
    const time = newScheduleTime.value;
    const grams = parseInt(newScheduleGrams.value);

    if (!time || isNaN(grams) || grams <= 0) {
      alert('Harap masukkan jam dan jumlah gram pakan yang valid!');
      return;
    }

    const newId = appState.schedules.length > 0 ? Math.max(...appState.schedules.map(s => s.id)) + 1 : 1;
    appState.schedules.push({
      id: newId,
      time: time,
      grams: grams,
      enabled: true
    });

    saveState();
    renderSchedules();
    updateNextScheduleBadge();

    addScheduleBox.style.display = 'none';
    btnToggleAddSchedule.textContent = '+ Tambah Jam';
  });

  // Hapus Log
  btnClearLog.addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin menghapus seluruh catatan riwayat pakan?')) {
      appState.logs = [];
      saveState();
      renderLogs();
    }
  });

  // Modal Pengaturan Arduino
  btnOpenSettings.addEventListener('click', openSettingsModal);
  btnCloseModal.addEventListener('click', closeSettingsModal);
  btnCancelSettings.addEventListener('click', closeSettingsModal);
  btnSaveSettings.addEventListener('click', saveSettingsModal);

  modeSimRadio.addEventListener('change', () => {
    hardwareSettingsFields.style.display = 'none';
  });

  modeHwRadio.addEventListener('change', () => {
    hardwareSettingsFields.style.display = 'block';
  });

  btnTestConnection.addEventListener('click', testArduinoConnection);
}

// ========================================================
// 13. PENGATURAN KONEKSI ARDUINO / ESP32
// ========================================================
function openSettingsModal() {
  if (appState.mode === 'hardware') {
    modeHwRadio.checked = true;
    hardwareSettingsFields.style.display = 'block';
  } else {
    modeSimRadio.checked = true;
    hardwareSettingsFields.style.display = 'none';
  }

  arduinoIpInput.value = appState.arduinoIp || 'http://192.168.1.50';
  feedApiUrlInput.value = appState.feedApiUrl || 'http://192.168.1.50/feed?gram=';
  refreshIntervalInput.value = appState.refreshInterval || 3;
  testConnectionResult.style.display = 'none';

  settingsModal.style.display = 'flex';
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

function saveSettingsModal() {
  appState.mode = modeHwRadio.checked ? 'hardware' : 'simulation';
  appState.arduinoIp = arduinoIpInput.value.trim().replace(/\/$/, '');
  appState.feedApiUrl = feedApiUrlInput.value.trim();
  appState.refreshInterval = parseInt(refreshIntervalInput.value) || 3;

  saveState();
  closeSettingsModal();
  updateConnectionBadge();
  startSensorMonitoring();

  alert(`Pengaturan berhasil disimpan! Mode aktif: ${appState.mode === 'hardware' ? 'Hardware Arduino Nyata' : 'Mode Simulasi'}`);
}

async function testArduinoConnection() {
  const ip = arduinoIpInput.value.trim();
  if (!ip) {
    alert('Masukkan IP / URL Arduino terlebih dahulu.');
    return;
  }

  testConnectionResult.style.display = 'block';
  testConnectionResult.style.backgroundColor = '#e0f2fe';
  testConnectionResult.style.color = '#0369a1';
  testConnectionResult.textContent = 'Mencoba menghubungi mikrokontroler...';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${ip}/data`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      testConnectionResult.style.backgroundColor = '#dcfce7';
      testConnectionResult.style.color = '#15803d';
      testConnectionResult.textContent = '✅ Berhasil tersambung ke Arduino/ESP32! Sensor siap dibaca.';
    } else {
      throw new Error(`Respons kode HTTP ${res.status}`);
    }
  } catch (err) {
    testConnectionResult.style.backgroundColor = '#fee2e2';
    testConnectionResult.style.color = '#b91c1c';
    testConnectionResult.textContent = `❌ Sambungan gagal: ${err.message}. Pastikan ESP32 satu jaringan WiFi dengan HP / Laptop Anda.`;
  }
}
