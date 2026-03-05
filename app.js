import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/*
  ===========================
  Firebase configuratie invullen
  ===========================
  1) Maak een Firebase project
  2) Zet Authentication > Sign-in method > Anonymous = Enable
  3) Maak Firestore Database aan
  4) Vul hieronder je web app config in (uit Firebase Console)
*/
const firebaseConfig = {
  apiKey: "AIzaSyDr2RWAZQmFlL6GT_GJrWGOA1CVkS9SQw4",
  authDomain: "buy-bye-bike.firebaseapp.com",
  projectId: "buy-bye-bike",
  storageBucket: "buy-bye-bike.firebasestorage.app",
  messagingSenderId: "126651860931",
  appId: "1:126651860931:web:240e079a62d3fc05d65f76",
  measurementId: "G-CC33FEFCL3"
};

const DEFAULTS = {
  version: 1,
  childName: "Larah Fae",
  familyId: "larah-fae-" + randomToken(8),
  childId: "larah-fae",
  parentPin: "1976",
  startDate: "2026-03-02",
  // Laatste schooldag voor start zomervakantie regio Midden (kan in oudermodus aangepast worden)
  endDate: "2026-07-17",
  rates: {
    bike: 1.00,      // + per rit
    bus: -5.00,      // - per rit
    car: -2.50,      // - per rit gebracht/gehaald
    carpool: 0.00    // 0 per rit
  },
  // Handmatige vrije dagen (weekenden worden automatisch als vrij behandeld)
  freeDays: [
    // voorbeelden:
    // "2026-04-27", // Koningsdag
    // "2026-05-05"  // Bevrijdingsdag
  ]
};

const CHOICES_OUTBOUND = [
  { key: "bike", label: "🚲 Fiets", sub: "+€1" },
  { key: "bus", label: "🚌 Bus", sub: "-€5" },
  { key: "car_drop", label: "🚗 Gebracht", sub: "-€2,50" },
  { key: "carpool", label: "🚗 Carpool", sub: "€0" },
  { key: "na", label: "⛔ Vrij", sub: "n.v.t." }
];

const CHOICES_INBOUND = [
  { key: "bike", label: "🚲 Fiets", sub: "+€1" },
  { key: "bus", label: "🚌 Bus", sub: "-€5" },
  { key: "car_pickup", label: "🚗 Gehaald", sub: "-€2,50" },
  { key: "carpool", label: "🚗 Carpool", sub: "€0" },
  { key: "na", label: "⛔ Vrij", sub: "n.v.t." }
];


const state = {
  authReady: false,
  user: null,
  db: null,
  unsubSettings: null,
  unsubRides: null,
  settings: null,
  rides: new Map(), // dateId -> ride doc
  selectedDate: todayLocalDateString(),
  parentModeUnlocked: false,
  firebaseEnabled: true
};

const els = {};
document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheEls();
  wireStaticUI();
  renderChoiceButtons();
  loadLocalFallbackSettings();
  loadLocalFallbackRides();
  applySettingsToForm();
  renderAll();

  try {
    validateFirebaseConfig(firebaseConfig);
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    state.db = db;

    onAuthStateChanged(auth, (user) => {
      if (user) {
        state.user = user;
        state.authReady = true;
        setSyncState(`Verbonden (anoniem)`);
        startFirestoreListeners();
      }
    });

    await signInAnonymously(auth);
  } catch (err) {
    console.error(err);
    state.firebaseEnabled = false;
    setSyncState("Firebase niet ingesteld — lokale modus");
    toast("Firebase config nog niet ingevuld. App werkt nu lokaal.");
  }
}

function cacheEls() {
  [
    "dateTitle","dateSub","balanceValue","dayValue","dateInput","prevDayBtn","nextDayBtn","dayStatus",
    "outboundButtons","inboundButtons","markVrijBtn","copyLinkBtn",
    "statBikeRides","statFullBikeDays","statBusRides","statCarRides","statCarpoolRides","statFamilyCost",
    "scenarioDays","scenarioExtra","scenarioTotal","recentList","syncState",
    "settingsCard","parentModeBtn","openParentModeBtn","closeSettingsBtn",
    "childNameInput","startDateInput","endDateInput","familyIdInput","childIdInput","pinInput",
    "rateBikeInput","rateBusInput","rateCarInput","rateCarpoolInput","freeDaysTextarea",
    "saveSettingsBtn","exportJsonBtn","importJsonInput",
    "pinModal","pinModalInput","pinCancelBtn","pinSubmitBtn","pinError","toast"
  ].forEach(id => els[id] = document.getElementById(id));
}

function wireStaticUI() {
  els.dateInput.value = state.selectedDate;

  els.prevDayBtn.addEventListener("click", () => shiftSelectedDate(-1));
  els.nextDayBtn.addEventListener("click", () => shiftSelectedDate(1));
  els.dateInput.addEventListener("change", (e) => {
    if (e.target.value) {
      state.selectedDate = e.target.value;
      renderAll();
    }
  });

  els.markVrijBtn.addEventListener("click", () => saveRideForSelectedDate({ outbound: "na", inbound: "na" }));
  els.copyLinkBtn.addEventListener("click", copyShareLink);

  els.parentModeBtn.addEventListener("click", () => openPinModal());
  els.openParentModeBtn.addEventListener("click", () => lockParentMode());
  els.closeSettingsBtn.addEventListener("click", () => closeSettings());

  els.pinCancelBtn.addEventListener("click", closePinModal);
  els.pinSubmitBtn.addEventListener("click", submitPin);
  els.pinModalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPin();
  });

  els.saveSettingsBtn.addEventListener("click", saveSettingsFromForm);
  els.exportJsonBtn.addEventListener("click", exportDataAsJson);
  els.importJsonInput.addEventListener("change", importDataFromJson);
}

function renderChoiceButtons() {
  els.outboundButtons.innerHTML = "";
  els.inboundButtons.innerHTML = "";

  CHOICES_OUTBOUND.forEach(choice => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn choice-btn";
    btn.dataset.choice = choice.key;
    btn.dataset.route = "outbound";
    btn.innerHTML = `${choice.label}<span class="sub">${choice.sub}</span>`;
    btn.addEventListener("click", () => applySingleChoice("outbound", choice.key));
    els.outboundButtons.appendChild(btn);
  });

  CHOICES_INBOUND.forEach(choice => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn choice-btn";
    btn.dataset.choice = choice.key;
    btn.dataset.route = "inbound";
    btn.innerHTML = `${choice.label}<span class="sub">${choice.sub}</span>`;
    btn.addEventListener("click", () => applySingleChoice("inbound", choice.key));
    els.inboundButtons.appendChild(btn);
  });
}


function currentSettings() {
  return state.settings || structuredClone(DEFAULTS);
}

function loadLocalFallbackRides() {
  try {
    const raw = JSON.parse(localStorage.getItem("fietsTegoed.rides.local") || "{}");
    for (const [k, v] of Object.entries(raw)) {
      if (validDateId(k)) state.rides.set(k, v);
    }
  } catch {
    // ignore
  }
}

function loadLocalFallbackSettings() {
  try {
    const saved = localStorage.getItem("fietsTegoed.settings.local");
    if (saved) {
      const parsed = JSON.parse(saved);
      state.settings = sanitizeSettings(parsed);
    } else {
      const params = new URLSearchParams(location.search);
      const defaults = structuredClone(DEFAULTS);
      const qFamily = params.get("family");
      if (qFamily) defaults.familyId = slugify(qFamily);
      state.settings = sanitizeSettings(defaults);
    }
  } catch {
    state.settings = structuredClone(DEFAULTS);
  }
  state.selectedDate = todayLocalDateString();
  els.dateInput.value = state.selectedDate;
}

function validateFirebaseConfig(cfg) {
  const values = [cfg.apiKey, cfg.authDomain, cfg.projectId, cfg.appId];
  if (values.some(v => !v || String(v).includes("VUL_HIER"))) {
    throw new Error("Firebase config niet ingevuld");
  }
}

function startFirestoreListeners() {
  if (!state.authReady || !state.db) return;
  const s = currentSettings();
  persistLocalSettings(s);

  if (state.unsubSettings) state.unsubSettings();
  if (state.unsubRides) state.unsubRides();

  const familyRef = doc(state.db, "families", s.familyId);
  const settingsRef = doc(state.db, "families", s.familyId, "config", "settings");
  const childRef = doc(state.db, "families", s.familyId, "children", s.childId);

  // Zorg dat basisdocs bestaan (idempotent)
  Promise.all([
    setDoc(familyRef, {
      familyId: s.familyId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true }),
    setDoc(settingsRef, serializeSettingsForFirestore(s), { merge: true }),
    setDoc(childRef, {
      childId: s.childId,
      name: s.childName,
      active: true,
      updatedAt: serverTimestamp()
    }, { merge: true })
  ]).catch(err => console.error("Init docs failed", err));

  state.unsubSettings = onSnapshot(settingsRef, (snap) => {
    if (snap.exists()) {
      const remote = deserializeSettingsFromFirestore(snap.data(), s);
      state.settings = sanitizeSettings(remote);
      persistLocalSettings(state.settings);
      applySettingsToForm();
      renderAll();
    }
  }, (err) => {
    console.error("Settings snapshot error", err);
    setSyncState("Fout bij sync instellingen");
  });

  const ridesCol = collection(state.db, "families", s.familyId, "children", s.childId, "rides");
  const ridesQuery = query(ridesCol, orderBy("dateId", "asc"));

  state.unsubRides = onSnapshot(ridesQuery, (snap) => {
    state.rides.clear();
    snap.forEach((d) => {
      state.rides.set(d.id, d.data());
    });
    renderAll();
  }, (err) => {
    console.error("Rides snapshot error", err);
    setSyncState("Fout bij sync ritten");
  });

  setSyncState("Sync actief");
}

function serializeSettingsForFirestore(s) {
  return {
    version: 1,
    childName: s.childName,
    familyId: s.familyId,
    childId: s.childId,
    parentPin: s.parentPin,
    startDate: s.startDate,
    endDate: s.endDate,
    freeDays: (s.freeDays || []).slice().sort(),
    rates: {
      bike: Number(s.rates?.bike ?? 1),
      bus: Number(s.rates?.bus ?? -5),
      car: Number(s.rates?.car ?? -2.5),
      carpool: Number(s.rates?.carpool ?? 0)
    },
    updatedAt: serverTimestamp()
  };
}

function deserializeSettingsFromFirestore(raw, fallback) {
  return sanitizeSettings({
    ...(fallback || currentSettings()),
    ...raw,
    rates: {
      ...(fallback?.rates || currentSettings().rates || {}),
      ...(raw?.rates || {})
    }
  });
}

function sanitizeSettings(s) {
  const out = structuredClone(DEFAULTS);
  out.childName = String(s?.childName || out.childName).trim() || out.childName;
  out.familyId = slugify(String(s?.familyId || out.familyId)) || out.familyId;
  out.childId = slugify(String(s?.childId || out.childId)) || out.childId;
  out.parentPin = String(s?.parentPin || out.parentPin).trim() || out.parentPin;
  out.startDate = validDateId(s?.startDate) ? s.startDate : out.startDate;
  out.endDate = validDateId(s?.endDate) ? s.endDate : out.endDate;

  out.rates = {
    bike: toMoneyNumber(s?.rates?.bike, out.rates.bike),
    bus: toMoneyNumber(s?.rates?.bus, out.rates.bus),
    car: toMoneyNumber(s?.rates?.car, out.rates.car),
    carpool: toMoneyNumber(s?.rates?.carpool, out.rates.carpool),
  };

  const freeDays = Array.isArray(s?.freeDays) ? s.freeDays : [];
  out.freeDays = [...new Set(freeDays.map(String).filter(validDateId))].sort();

  if (out.endDate < out.startDate) out.endDate = out.startDate;
  return out;
}

function applySettingsToForm() {
  const s = currentSettings();
  document.title = `Fiets Tegoed • ${s.childName}`;
  els.childNameInput.value = s.childName;
  els.startDateInput.value = s.startDate;
  els.endDateInput.value = s.endDate;
  els.familyIdInput.value = s.familyId;
  els.childIdInput.value = s.childId;
  els.pinInput.value = s.parentPin;
  els.rateBikeInput.value = s.rates.bike;
  els.rateBusInput.value = Math.abs(s.rates.bus);
  els.rateCarInput.value = Math.abs(s.rates.car);
  els.rateCarpoolInput.value = s.rates.carpool;
  els.freeDaysTextarea.value = (s.freeDays || []).join("\n");
}

function collectSettingsFromForm() {
  const freeDays = els.freeDaysTextarea.value
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  return sanitizeSettings({
    ...currentSettings(),
    childName: els.childNameInput.value,
    startDate: els.startDateInput.value || currentSettings().startDate,
    endDate: els.endDateInput.value || currentSettings().endDate,
    familyId: els.familyIdInput.value,
    childId: els.childIdInput.value,
    parentPin: els.pinInput.value,
    rates: {
      bike: Number(els.rateBikeInput.value || 0),
      bus: -Math.abs(Number(els.rateBusInput.value || 0)),
      car: -Math.abs(Number(els.rateCarInput.value || 0)),
      carpool: Number(els.rateCarpoolInput.value || 0)
    },
    freeDays
  });
}

async function saveSettingsFromForm() {
  const next = collectSettingsFromForm();
  const familyChanged = next.familyId !== currentSettings().familyId || next.childId !== currentSettings().childId;

  state.settings = next;
  persistLocalSettings(next);

  try {
    if (state.firebaseEnabled && state.db && state.authReady) {
      const settingsRef = doc(state.db, "families", next.familyId, "config", "settings");
      const childRef = doc(state.db, "families", next.familyId, "children", next.childId);
      const familyRef = doc(state.db, "families", next.familyId);
      await setDoc(familyRef, { familyId: next.familyId, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(settingsRef, serializeSettingsForFirestore(next), { merge: true });
      await setDoc(childRef, { childId: next.childId, name: next.childName, active: true, updatedAt: serverTimestamp() }, { merge: true });
      toast("Instellingen opgeslagen");
    } else {
      toast("Instellingen lokaal opgeslagen");
    }

    if (familyChanged) {
      state.rides.clear();
      startFirestoreListeners();
    } else {
      renderAll();
    }
  } catch (err) {
    console.error(err);
    toast("Opslaan instellingen mislukt");
  }
}

function persistLocalSettings(s) {
  localStorage.setItem("fietsTegoed.settings.local", JSON.stringify(s));
}

function rideRefForDate(dateId) {
  const s = currentSettings();
  return doc(state.db, "families", s.familyId, "children", s.childId, "rides", dateId);
}

async function saveRideForSelectedDate({ outbound, inbound }) {
  const dateId = state.selectedDate;
  const s = currentSettings();
  const schoolInfo = classifyDate(dateId, s);

  if (!schoolInfo.inRange) {
    toast("Datum ligt buiten ingestelde periode");
    return;
  }

  const computed = computeDayTotals({ outbound, inbound }, s);
  const payload = {
    dateId,
    date: dateId,
    outbound,
    inbound,
    isFreeDay: schoolInfo.isFreeDay,
    weekday: weekdayIndex(dateId),
    total: computed.total,
    familyCost: computed.familyCost,
    bikeRides: computed.bikeRides,
    busRides: computed.busRides,
    carRides: computed.carRides,
    carpoolRides: computed.carpoolRides,
    updatedAt: serverTimestamp(),
    updatedBy: state.user?.uid || "local"
  };

  if (state.firebaseEnabled && state.db && state.authReady) {
    try {
      await setDoc(rideRefForDate(dateId), payload, { merge: true });
      setSyncState("Gesynchroniseerd");
      toast("Opgeslagen");
    } catch (err) {
      console.error(err);
      toast("Opslaan in Firebase mislukt");
      setSyncState("Opslaan mislukt");
    }
  } else {
    // lokale fallback
    const local = JSON.parse(localStorage.getItem("fietsTegoed.rides.local") || "{}");
    local[dateId] = {
      ...payload,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem("fietsTegoed.rides.local", JSON.stringify(local));
    state.rides.set(dateId, local[dateId]);
    renderAll();
    toast("Lokaal opgeslagen");
  }
}

async function applySingleChoice(route, choiceKey) {
  const existing = getRideForDate(state.selectedDate);
  const outbound = route === "outbound" ? choiceKey : (existing?.outbound || "na");
  const inbound = route === "inbound" ? choiceKey : (existing?.inbound || "na");
  await saveRideForSelectedDate({ outbound, inbound });
}

function getRideForDate(dateId) {
  if (state.rides.has(dateId)) return state.rides.get(dateId);
  try {
    const local = JSON.parse(localStorage.getItem("fietsTegoed.rides.local") || "{}");
    return local[dateId] || null;
  } catch {
    return null;
  }
}

function renderAll() {
  const s = currentSettings();
  const selected = state.selectedDate;
  els.dateInput.value = selected;

  const info = classifyDate(selected, s);
  const ride = getRideForDate(selected);
  const computed = computeDayTotals({
    outbound: ride?.outbound ?? "na",
    inbound: ride?.inbound ?? "na"
  }, s);

  // top info
  const d = parseDateLocal(selected);
  els.dateTitle.textContent = formatLongDateNL(d);
  els.dateSub.textContent = `Dag van invoer • ${info.label}`;
  els.dayValue.textContent = `Vandaag: ${formatEUR(ride?.total ?? 0)}`;

  // status pills
  const pills = [];
  pills.push(pillHtml("info", `Periode: ${s.startDate} t/m ${s.endDate}`));
  if (!info.inRange) pills.push(pillHtml("bad", "Buiten periode"));
  else if (info.isWeekend) pills.push(pillHtml("warn", "Weekend (vrij)"));
  else if (info.isManualFreeDay) pills.push(pillHtml("warn", "Vakantie / vrije dag"));
  else pills.push(pillHtml("good", "Schooldag"));
  if (ride) pills.push(pillHtml(ride.total >= 0 ? "good" : "bad", `Opgeslagen: ${formatEUR(ride.total)}`));
  els.dayStatus.innerHTML = pills.join("");

  // Enable/disable quick buttons outside range
  const disabledForRange = !info.inRange;  els.markVrijBtn.disabled = disabledForRange;
  [...els.outboundButtons.querySelectorAll("button"), ...els.inboundButtons.querySelectorAll("button")].forEach(btn => btn.disabled = disabledForRange);

  highlightChoiceButtons(ride);

  // summary totals
  const totals = computePeriodTotals(s);
  els.balanceValue.textContent = formatEUR(totals.balance);
  els.statBikeRides.textContent = String(totals.bikeRides);
  els.statFullBikeDays.textContent = String(totals.fullBikeDays);
  els.statBusRides.textContent = String(totals.busRides);
  els.statCarRides.textContent = String(totals.carRides);
  els.statCarpoolRides.textContent = String(totals.carpoolRides);
  els.statFamilyCost.textContent = formatEUR(totals.familyCost);

  const scenario = computeScenarioFromDate(selected, s, totals.balance);
  els.scenarioDays.textContent = String(scenario.remainingSchoolDays);
  els.scenarioExtra.textContent = formatEUR(scenario.extraPossible);
  els.scenarioTotal.textContent = formatEUR(scenario.expectedEndBalance);

  renderRecentList(s);
}

function highlightChoiceButtons(ride) {
  const outbound = ride?.outbound;
  const inbound = ride?.inbound;
  els.outboundButtons.querySelectorAll("button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.choice === outbound);
  });
  els.inboundButtons.querySelectorAll("button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.choice === inbound);
  });
}

function renderRecentList(s) {
  const items = Array.from(state.rides.values())
    .filter(r => validDateId(r.dateId) && r.dateId >= s.startDate && r.dateId <= s.endDate)
    .sort((a,b) => (a.dateId < b.dateId ? 1 : -1))
    .slice(0, 12);

  if (!items.length) {
    els.recentList.innerHTML = `<div class="muted small">Nog geen registraties.</div>`;
    return;
  }

  els.recentList.innerHTML = items.map(item => {
    const dateStr = formatShortDateNL(parseDateLocal(item.dateId));
    const tags = [
      choiceLabel("outbound", item.outbound),
      choiceLabel("inbound", item.inbound),
      formatEUR(item.total ?? 0)
    ];
    return `
      <div class="recent-item">
        <div>
          <div class="recent-date">${dateStr}</div>
          <div class="muted small">${item.dateId}</div>
        </div>
        <div class="recent-meta">
          ${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function computeDayTotals(ride, s) {
  const rates = s.rates || DEFAULTS.rates;
  const outbound = ride?.outbound || "na";
  const inbound = ride?.inbound || "na";

  const arr = [outbound, inbound];
  let total = 0;
  let familyCost = 0;
  let bikeRides = 0;
  let busRides = 0;
  let carRides = 0;
  let carpoolRides = 0;

  for (const k of arr) {
    if (k === "bike") {
      total += rates.bike;
      bikeRides++;
    } else if (k === "bus") {
      total += rates.bus;
      familyCost += Math.abs(rates.bus);
      busRides++;
    } else if (k === "car_drop" || k === "car_pickup") {
      total += rates.car;
      familyCost += Math.abs(rates.car);
      carRides++;
    } else if (k === "carpool") {
      total += rates.carpool;
      if (rates.carpool < 0) familyCost += Math.abs(rates.carpool);
      carpoolRides++;
    } else if (k === "na") {
      // no-op
    }
  }

  return {
    total: round2(total),
    familyCost: round2(familyCost),
    bikeRides,
    busRides,
    carRides,
    carpoolRides
  };
}

function computePeriodTotals(s) {
  let balance = 0;
  let bikeRides = 0;
  let busRides = 0;
  let carRides = 0;
  let carpoolRides = 0;
  let familyCost = 0;
  let fullBikeDays = 0;

  for (const [dateId, ride] of state.rides.entries()) {
    if (dateId < s.startDate || dateId > s.endDate) continue;
    balance += Number(ride.total || 0);
    bikeRides += Number(ride.bikeRides || 0);
    busRides += Number(ride.busRides || 0);
    carRides += Number(ride.carRides || 0);
    carpoolRides += Number(ride.carpoolRides || 0);
    familyCost += Number(ride.familyCost || 0);
    if (ride.outbound === "bike" && ride.inbound === "bike") fullBikeDays++;
  }

  return {
    balance: round2(balance),
    bikeRides,
    busRides,
    carRides,
    carpoolRides,
    familyCost: round2(familyCost),
    fullBikeDays
  };
}

function computeScenarioFromDate(dateId, s, currentBalance) {
  const from = clampDate(dateId, s.startDate, s.endDate);
  let remainingSchoolDays = 0;

  for (const d of iterateDates(from, s.endDate)) {
    const c = classifyDate(d, s);
    if (c.inRange && !c.isFreeDay) remainingSchoolDays++;
  }

  const extraPossible = round2(remainingSchoolDays * ((s.rates?.bike || 0) * 2));
  return {
    remainingSchoolDays,
    extraPossible,
    expectedEndBalance: round2(currentBalance + extraPossible)
  };
}

function classifyDate(dateId, s) {
  const inRange = dateId >= s.startDate && dateId <= s.endDate;
  const wd = weekdayIndex(dateId);
  const isWeekend = wd === 0 || wd === 6;
  const isManualFreeDay = (s.freeDays || []).includes(dateId);
  const isFreeDay = isWeekend || isManualFreeDay;
  let label = "Schooldag";
  if (!inRange) label = "Buiten periode";
  else if (isWeekend) label = "Weekend";
  else if (isManualFreeDay) label = "Vakantie / vrije dag";
  return { inRange, isWeekend, isManualFreeDay, isFreeDay, label };
}

function shiftSelectedDate(delta) {
  const d = parseDateLocal(state.selectedDate);
  d.setDate(d.getDate() + delta);
  state.selectedDate = formatDateIdLocal(d);
  renderAll();
}

function openPinModal() {
  els.pinError.textContent = "";
  els.pinModalInput.value = "";
  els.pinModal.classList.remove("hidden");
  els.pinModal.setAttribute("aria-hidden", "false");
  setTimeout(() => els.pinModalInput.focus(), 10);
}
function closePinModal() {
  els.pinModal.classList.add("hidden");
  els.pinModal.setAttribute("aria-hidden", "true");
}
function submitPin() {
  const pin = els.pinModalInput.value.trim();
  const actual = currentSettings().parentPin;
  if (pin === actual) {
    state.parentModeUnlocked = true;
    els.settingsCard.classList.remove("hidden");
    closePinModal();
    toast("Oudermodus geopend");
  } else {
    els.pinError.textContent = "Onjuiste pincode";
  }
}
function closeSettings() {
  els.settingsCard.classList.add("hidden");
}
function lockParentMode() {
  state.parentModeUnlocked = false;
  closeSettings();
  toast("Oudermodus vergrendeld");
}

async function copyShareLink() {
  const s = currentSettings();
  const url = new URL(location.href);
  url.searchParams.set("family", s.familyId);
  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Link gekopieerd");
  } catch {
    toast("Kopiëren mislukt");
  }
}

function exportDataAsJson() {
  const s = currentSettings();
  const ridesObj = Object.fromEntries(Array.from(state.rides.entries()).sort((a,b)=>a[0].localeCompare(b[0])));
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "fiets-tegoed-firebase",
    settings: s,
    rides: ridesObj
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fiets-tegoed-${s.childId}-${todayLocalDateString()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importDataFromJson(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed.settings) {
      state.settings = sanitizeSettings(parsed.settings);
      persistLocalSettings(state.settings);
      applySettingsToForm();
    }

    const rides = parsed.rides || {};
    for (const [dateId, ride] of Object.entries(rides)) {
      if (!validDateId(dateId)) continue;
      const payload = {
        dateId,
        date: dateId,
        outbound: validChoice(ride.outbound) ? ride.outbound : "na",
        inbound: validChoice(ride.inbound) ? ride.inbound : "na",
        weekday: weekdayIndex(dateId),
        ...computeDayTotals(ride, currentSettings()),
        updatedAt: state.firebaseEnabled ? serverTimestamp() : new Date().toISOString(),
        updatedBy: state.user?.uid || "import"
      };
      if (state.firebaseEnabled && state.db && state.authReady) {
        await setDoc(rideRefForDate(dateId), payload, { merge: true });
      } else {
        state.rides.set(dateId, payload);
      }
    }

    if (!state.firebaseEnabled) {
      localStorage.setItem("fietsTegoed.rides.local", JSON.stringify(Object.fromEntries(state.rides)));
    }

    if (state.firebaseEnabled && state.authReady) {
      await saveSettingsFromForm();
    }
    renderAll();
    toast("Import voltooid");
  } catch (err) {
    console.error(err);
    toast("Import mislukt");
  } finally {
    e.target.value = "";
  }
}

function setSyncState(text) {
  els.syncState.textContent = text;
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add("hidden"), 1800);
}

// Helpers
function pillHtml(type, text) {
  return `<span class="pill ${type}">${escapeHtml(text)}</span>`;
}
function choiceLabel(route, key) {
  const list = route === "outbound" ? CHOICES_OUTBOUND : CHOICES_INBOUND;
  return list.find(x => x.key === key)?.label || key;
}
function toMoneyNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : fallback;
}
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function formatEUR(n) {
  const value = Number(n || 0);
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
}
function todayLocalDateString() {
  const d = new Date();
  return formatDateIdLocal(d);
}
function formatDateIdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseDateLocal(dateId) {
  const [y,m,d] = dateId.split("-").map(Number);
  return new Date(y, m-1, d);
}
function validDateId(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}
function weekdayIndex(dateId) {
  return parseDateLocal(dateId).getDay(); // 0 Sun - 6 Sat
}
function formatLongDateNL(d) {
  return new Intl.DateTimeFormat("nl-NL", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(d);
}
function formatShortDateNL(d) {
  return new Intl.DateTimeFormat("nl-NL", { weekday:"short", day:"2-digit", month:"2-digit" }).format(d);
}
function slugify(text) {
  return String(text || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
function randomToken(len = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i=0; i<len; i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function clampDate(dateId, min, max) {
  if (dateId < min) return min;
  if (dateId > max) return max;
  return dateId;
}
function *iterateDates(startId, endId) {
  let d = parseDateLocal(startId);
  const end = parseDateLocal(endId);
  while (d <= end) {
    yield formatDateIdLocal(d);
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate()+1);
  }
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function validChoice(k) {
  return ["bike","bus","car_drop","car_pickup","carpool","na"].includes(String(k));
}
