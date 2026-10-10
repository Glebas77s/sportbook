/* =========================================================
   SportBook — приложение с Supabase (retry + таймауты)
   ========================================================= */

   let currentUser = null;
   let currentProfile = null;
   let currentBooking = null;
   let currentClient = null;
   let allBookings = [];
   let allActivities = [];
   let allClients = [];
   let statusChart = null;
   let activityChart = null;
   
   let clientsLoaded = false;
   let analyticsLoaded = false;
   
   const $ = (id) => document.getElementById(id);
   
   /* ---------- ТАЙМАУТ + RETRY ---------- */
   const REQ_TIMEOUT = 25000;
   const REQ_RETRIES = 2;
   
   function withTimeout(promise, ms = REQ_TIMEOUT, label = "") {
     return Promise.race([
       promise,
       new Promise((_, reject) =>
         setTimeout(() => reject(new Error("Превышено время ожидания" + (label ? " (" + label + ")" : ""))), ms)
       )
     ]);
   }
   
   async function sbCall(queryFn, label = "", retries = REQ_RETRIES) {
     let lastErr = null;
     for (let i = 0; i < retries; i++) {
       try {
         const res = await withTimeout(queryFn(), REQ_TIMEOUT, label);
         if (res && res.error && /timeout|fetch|network|QUIC/i.test(res.error.message || "")) {
           lastErr = res.error;
           console.warn(`[sbCall] "${label}" попытка ${i + 1} ошибка:`, res.error.message);
           continue;
         }
         return res;
       } catch (e) {
         lastErr = e;
         console.warn(`[sbCall] "${label}" попытка ${i + 1} исключение:`, e.message);
         await new Promise(r => setTimeout(r, 800));
       }
     }
     return { data: null, error: lastErr };
   }
   
   /* ---------- УТИЛИТЫ ---------- */
   function showToast(msg, type = "success") {
     const t = $("toast");
     t.textContent = msg;
     t.className = `toast ${type} show`;
     clearTimeout(t._timer);
     t._timer = setTimeout(() => t.classList.remove("show"), 3500);
   }
   
   function esc(v) {
     return String(v ?? "")
       .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
       .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
   }
   
   function fmtDate(iso) {
     if (!iso) return "";
     const d = new Date(iso + "T00:00:00");
     if (isNaN(d)) return iso;
     return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
   }
   
   function fmtPrice(v) {
     if (v == null || v === "") return "—";
     const n = Number(v);
     if (isNaN(n)) return "—";
     if (n === 0) return "Бесплатно";
     return n.toLocaleString("ru-RU") + " ₽";
   }
   
   function statusClass(s) {
     if (s === "Подтверждена") return "green";
     if (s === "Посещено") return "blue";
     if (s === "Отменена") return "red";
     return "green";
   }
   
   function getActivityMeta(activityName) {
     const a = (activityName || "").toLowerCase();
     if (a.includes("йога") || a.includes("yoga") || a.includes("растяж") || a.includes("пилат"))
       return { icon: "🧘", bg: "var(--purple-bg)", fg: "var(--purple-fg)" };
     if (a.includes("плава") || a.includes("бассейн") || a.includes("swim") || a.includes("аква"))
       return { icon: "🏊", bg: "var(--blue-bg)", fg: "var(--blue-fg)" };
     if (a.includes("футбол") || a.includes("football") || a.includes("soccer"))
       return { icon: "⚽", bg: "var(--green-bg)", fg: "var(--green-fg)" };
     if (a.includes("баскет") || a.includes("basket"))
       return { icon: "🏀", bg: "var(--orange-bg)", fg: "var(--orange-fg)" };
     if (a.includes("волей") || a.includes("volley"))
       return { icon: "🏐", bg: "var(--orange-bg)", fg: "var(--orange-fg)" };
     if (a.includes("теннис") || a.includes("tennis") || a.includes("бадминтон") || a.includes("пинг"))
       return { icon: "🎾", bg: "var(--green-bg)", fg: "var(--green-fg)" };
     if (a.includes("зал") || a.includes("тренаж") || a.includes("gym") || a.includes("силов") || a.includes("штанг"))
       return { icon: "🏋️", bg: "var(--red-bg)", fg: "var(--red-fg)" };
     if (a.includes("бег") || a.includes("кросс") || a.includes("run") || a.includes("кардио"))
       return { icon: "🏃", bg: "var(--orange-bg)", fg: "var(--orange-fg)" };
     if (a.includes("бокс") || a.includes("box") || a.includes("борьб") || a.includes("карате") || a.includes("дзюдо"))
       return { icon: "🥊", bg: "var(--red-bg)", fg: "var(--red-fg)" };
     if (a.includes("велос") || a.includes("bike") || a.includes("cycle"))
       return { icon: "🚴", bg: "var(--blue-bg)", fg: "var(--blue-fg)" };
     if (a.includes("шахмат") || a.includes("chess") || a.includes("шашк"))
       return { icon: "♟️", bg: "var(--purple-bg)", fg: "var(--purple-fg)" };
     if (a.includes("лыж") || a.includes("коньк") || a.includes("ski") || a.includes("skate"))
       return { icon: "⛷️", bg: "var(--blue-bg)", fg: "var(--blue-fg)" };
     if (a.includes("гимнаст") || a.includes("танц") || a.includes("аэроб") || a.includes("зумб"))
       return { icon: "🤸", bg: "var(--purple-bg)", fg: "var(--purple-fg)" };
     return { icon: "🏅", bg: "var(--green-bg)", fg: "var(--green-fg)" };
   }
   
   function getTimeLimit(dateStr) {
     if (!dateStr) return { min: 6*60, max: 20*60, label: "06:00–20:00", isWeekend: false };
     const d = new Date(dateStr + "T00:00:00");
     const dow = d.getDay();
     const isWeekend = (dow === 0 || dow === 6);
     if (isWeekend) return { min: 6*60, max: 17*60, label: "06:00–17:00 (выходной)", isWeekend: true };
     return { min: 6*60, max: 20*60, label: "06:00–20:00", isWeekend: false };
   }
   
   function validateBookingTime(dateStr, timeStr) {
     if (!dateStr || !timeStr) return null;
     const [h, m] = timeStr.split(":").map(Number);
     const total = h * 60 + m;
     const { min, max, isWeekend } = getTimeLimit(dateStr);
     if (total < min) return `Записи доступны с 06:00. Вы указали ${timeStr}.`;
     if (total > max) {
       return isWeekend
         ? `В выходные максимальное время записи — 17:00. Вы указали ${timeStr}.`
         : `В будние дни максимальное время записи — 20:00. Вы указали ${timeStr}.`;
     }
     return null;
   }
   
   function setError(id, msg) {
     const f = $(id), e = $(id + "Error");
     if (f) f.classList.add("input-error");
     if (e) e.textContent = msg;
   }
   
   function clearErrors(ids) {
     ids.forEach((id) => {
       const f = $(id), e = $(id + "Error");
       if (f) f.classList.remove("input-error");
       if (e) e.textContent = "";
     });
   }
   
   /* ---------- КЭШ АКТИВНОСТЕЙ ---------- */
   const ACT_CACHE_KEY = "sportbook_activities_v2";
   const ACT_CACHE_TIME = "sportbook_activities_time_v2";
   const ACT_CACHE_TTL = 5 * 60 * 1000;
   
   function loadActivitiesFromCache() {
     try {
       const raw = localStorage.getItem(ACT_CACHE_KEY);
       const time = Number(localStorage.getItem(ACT_CACHE_TIME) || 0);
       if (raw && Date.now() - time < ACT_CACHE_TTL) return JSON.parse(raw);
     } catch {}
     return null;
   }
   
   function saveActivitiesToCache(list) {
     try {
       localStorage.setItem(ACT_CACHE_KEY, JSON.stringify(list));
       localStorage.setItem(ACT_CACHE_TIME, Date.now().toString());
     } catch {}
   }
   
   function renderActivitiesSelect() {
     const select = $("activity");
     select.innerHTML = '<option value="">Выберите занятие...</option>' +
       allActivities.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
     updateActivityInfo();
   }
   
   function updateActivityInfo() {
     const info = $("activityInfo");
     if (!info) return;
     const id = Number($("activity").value);
     const a = allActivities.find(x => x.id === id);
     if (!a) { info.style.display = "none"; info.textContent = ""; return; }
   
     const parts = [];
     if (a.address) parts.push("📍 " + a.address);
     if (a.price != null && a.price !== "") parts.push("💰 " + fmtPrice(a.price));
     info.textContent = parts.join("  ·  ");
     info.style.display = parts.length ? "block" : "none";
     info.style.color = "var(--text)";
   }
   
   /* ---------- AUTH ---------- */
   $("showRegister").onclick = () => {
     $("loginForm").classList.add("hidden");
     $("registerForm").classList.remove("hidden");
   };
   $("showLogin").onclick = () => {
     $("registerForm").classList.add("hidden");
     $("loginForm").classList.remove("hidden");
   };
   
   $("formLogin").onsubmit = async (e) => {
     e.preventDefault();
     clearErrors(["loginEmail", "loginPassword"]);
     const email = $("loginEmail").value.trim();
     const password = $("loginPassword").value;
     if (!email) return setError("loginEmail", "Введите email.");
     if (!password) return setError("loginPassword", "Введите пароль.");
   
     const btn = $("loginSubmit");
     btn.disabled = true;
     btn.classList.add("is-loading");
     btn.textContent = "Вход...";
     try {
       const { error } = await withTimeout(
         sb.auth.signInWithPassword({ email, password }), 25000, "вход"
       );
       if (error) throw error;
       showToast("Вход выполнен.");
       await new Promise(r => setTimeout(r, 200));
       await loadApp(true);
     } catch (err) {
       console.error("Login error:", err);
       showToast(err.message || "Не удалось войти.", "error");
     } finally {
       btn.disabled = false;
       btn.classList.remove("is-loading");
       btn.textContent = "Войти";
     }
   };
   
   $("formRegister").onsubmit = async (e) => {
     e.preventDefault();
     clearErrors(["regName", "regEmail", "regPassword", "regPassword2"]);
     const name = $("regName").value.trim();
     const email = $("regEmail").value.trim();
     const password = $("regPassword").value;
     const password2 = $("regPassword2").value;
   
     let ok = true;
     if (!name || name.length < 2) { setError("regName", "Минимум 2 символа."); ok = false; }
     if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError("regEmail", "Некорректный email."); ok = false; }
     if (!password || password.length < 6) { setError("regPassword", "Минимум 6 символов."); ok = false; }
     if (password !== password2) { setError("regPassword2", "Пароли не совпадают."); ok = false; }
     if (!ok) return;
   
     const btn = $("registerSubmit");
     btn.disabled = true;
     btn.classList.add("is-loading");
     btn.textContent = "Регистрация...";
     try {
       const { data, error } = await withTimeout(
         sb.auth.signUp({ email, password, options: { data: { full_name: name } } }),
         25000, "регистрация"
       );
       if (error) throw error;
       if (data.user && !data.session) {
         showToast("Проверьте email для подтверждения.", "info");
       } else {
         showToast("Регистрация успешна.");
         await new Promise(r => setTimeout(r, 200));
         await loadApp(true);
       }
     } catch (err) {
       console.error("Signup error:", err);
       showToast(err.message || "Не удалось зарегистрироваться.", "error");
     } finally {
       btn.disabled = false;
       btn.classList.remove("is-loading");
       btn.textContent = "Зарегистрироваться";
     }
   };
   
   $("logoutBtn").onclick = async () => {
     await sb.auth.signOut();
     currentUser = null;
     currentProfile = null;
     clientsLoaded = false;
     analyticsLoaded = false;
     location.href = location.pathname;
   };
   
   /* ---------- ЗАГРУЗКА ---------- */
   async function loadApp(forceActivities = false) {
     const splash = $("loadingSplash");
     const showSplash = !currentProfile;
     if (showSplash) splash.style.display = "grid";
   
     try {
       const { data: { session }, error: sessionErr } = await withTimeout(
         sb.auth.getSession(), 8000, "сессия"
       );
       if (sessionErr) throw sessionErr;
       if (!session) { splash.style.display = "none"; showAuth(); return; }
   
       currentUser = session.user;
   
       const profileRes = await sbCall(
         () => sb.from("profiles").select("*").eq("id", session.user.id).single(),
         "профиль"
       );
       const { data: profile, error: profErr } = profileRes;
       if (profErr || !profile) {
         console.error("Profile error:", profErr);
         splash.style.display = "none";
         showToast("Профиль не найден.", "error");
         await sb.auth.signOut();
         showAuth();
         return;
       }
       currentProfile = profile;
   
       let activitiesOk = false;
       if (!forceActivities) {
         const cached = loadActivitiesFromCache();
         if (cached) {
           allActivities = cached;
           renderActivitiesSelect();
           activitiesOk = true;
         }
       }
       if (!activitiesOk) {
         const res = await sbCall(
           () => sb.from("activities").select("id, name, address, price").order("name"),
           "занятия"
         );
         if (res.data) {
           allActivities = res.data;
           saveActivitiesToCache(allActivities);
           renderActivitiesSelect();
         }
       }
   
       $("mainNav").style.display = "flex";
       $("userName").textContent = profile.full_name || profile.email;
       $("userRole").textContent = profile.role;
       $("userRole").className = `role ${profile.role === "admin" ? "admin" : ""}`;
       $("adminNavLink").hidden = profile.role !== "admin";
   
       $("page-auth").classList.add("hidden");
       splash.style.display = "none";
       navigate("list");
     } catch (err) {
       console.error("loadApp error:", err);
       splash.style.display = "none";
       showToast("Ошибка загрузки: " + err.message, "error");
       showAuth();
     }
   }
   
   function showAuth() {
     $("mainNav").style.display = "none";
     document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
     $("page-auth").classList.remove("hidden");
   }
   
   /* ---------- NAVIGATION ---------- */
   document.addEventListener("click", (e) => {
     const t = e.target.closest("[data-page]");
     if (!t) return;
     if (!currentUser) {
       showToast("Войдите, чтобы продолжить.", "info");
       showAuth();
       return;
     }
     navigate(t.dataset.page);
   });
   
   function navigate(page) {
     if (!currentUser) { showAuth(); return; }
   
     document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
     document.querySelectorAll(".nav-link").forEach((l) => {
       l.classList.toggle("active", l.dataset.page === page);
     });
   
     const map = { list:"page-list", form:"page-form", detail:"page-detail", admin:"page-admin", client:"page-client" };
     const target = $(map[page]);
     if (!target) return;
     target.classList.remove("hidden");
   
     if (page === "list") loadBookings();
     if (page === "form") {
       window.scrollTo({ top: 0, behavior: "smooth" });
       $("activity").focus({ preventScroll: true });
       applyDateLimits();
       updateTimeHint();
       updateActivityInfo();
     }
     if (page === "admin") {
       if (!currentProfile || currentProfile.role !== "admin") {
         showToast("Доступ только для администратора.", "error");
         navigate("list");
         return;
       }
       const dateEl = $("adminDate");
       if (dateEl) dateEl.textContent = new Date().toLocaleDateString("ru-RU", { weekday:"long", day:"numeric", month:"long" });
       const avatar = $("adminAvatar");
       if (avatar) avatar.textContent = (currentProfile.full_name || currentProfile.email || "А")[0].toUpperCase();
   
       document.querySelectorAll("[data-admin-view]").forEach(b =>
         b.classList.toggle("active", b.dataset.adminView === "clients")
       );
       $("adminViewClients").classList.remove("hidden");
       $("adminViewAnalytics").classList.add("hidden");
       if (!clientsLoaded) loadClients();
     }
   }
   
   /* ---------- BOOKINGS LIST ---------- */
   async function loadBookings() {
     const list = $("bookingList");
     list.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Загрузка записей...</p></div>`;
   
     const isAdmin = currentProfile.role === "admin";
     const res = await sbCall(() => {
       let q = sb.from("bookings").select(`
         id, booking_date, booking_time, status, created_at, profiles_id,
         activity:activities(id, name, address, price),
         profile:profiles(id, full_name, email)
       `).order("created_at", { ascending: false });
       if (!isAdmin) q = q.eq("profiles_id", currentUser.id);
       return q;
     }, "записи");
   
     if (res.error || !res.data) {
       list.innerHTML = `
         <div class="error-state">
           <h2>Не удалось загрузить записи</h2>
           <p>${esc(res.error?.message || "Нет ответа")}</p>
           <button class="btn btn-primary" type="button" onclick="window.__reloadBookings()">Повторить</button>
         </div>`;
       return;
     }
   
     allBookings = res.data;
     applyFilters();
   }
   window.__reloadBookings = loadBookings;
   
   function applyFilters() {
     const status = $("filterStatus").value;
     const date = $("filterDate").value;
     let filtered = allBookings;
     if (status) filtered = filtered.filter((b) => b.status === status);
     if (date) filtered = filtered.filter((b) => b.booking_date === date);
     renderBookings(filtered);
   }
   
   $("filterStatus").onchange = applyFilters;
   $("filterDate").onchange = applyFilters;
   $("resetFilters").onclick = () => {
     $("filterStatus").value = "";
     $("filterDate").value = "";
     applyFilters();
   };
   
   function renderBookings(items) {
     const list = $("bookingList");
     if (!items.length) {
       list.innerHTML = `
         <div class="empty">
           <div class="empty-icon">📅</div>
           <h2>У вас пока нет записей</h2>
           <p>Выберите занятие, дату и время тренировки в форме новой записи.</p>
           <button class="btn btn-primary" type="button" data-page="form">Записаться</button>
         </div>`;
       return;
     }
     list.innerHTML = items.map((b) => {
       const cls = statusClass(b.status);
       const meta = getActivityMeta(b.activity?.name);
       const owner = (currentProfile.role === "admin" && b.profile)
         ? ` · ${esc(b.profile.full_name || b.profile.email)}` : "";
       const addr = b.activity?.address ? `📍 ${esc(b.activity.address)}` : "";
       const price = b.activity?.price != null && b.activity.price !== ""
         ? `💰 ${esc(fmtPrice(b.activity.price))}` : "";
       const metaLine = [addr, price].filter(Boolean).join("  ·  ");
       return `
         <article class="booking-card" tabindex="0" data-id="${b.id}">
           <div class="booking-icon" style="background:${meta.bg};color:${meta.fg}">${meta.icon}</div>
           <div class="booking-info">
             <div class="booking-num">№${b.id}${owner}</div>
             <div class="booking-title">${esc(b.activity?.name || "—")}</div>
             ${metaLine ? `<div class="booking-num" style="margin-top:4px">${metaLine}</div>` : ""}
           </div>
           <div class="booking-date">
             Дата и время<br>
             <b>${fmtDate(b.booking_date)}, ${esc((b.booking_time || "").slice(0,5))}</b>
           </div>
           <span class="badge badge-${cls}">${esc(b.status)}</span>
         </article>`;
     }).join("");
   }
   
   $("bookingList").onclick = (e) => {
     const card = e.target.closest("[data-id]");
     if (card) openDetail(Number(card.dataset.id));
   };
   $("bookingList").onkeydown = (e) => {
     if (e.key === "Enter" || e.key === " ") {
       const card = e.target.closest("[data-id]");
       if (card) { e.preventDefault(); openDetail(Number(card.dataset.id)); }
     }
   };
   
   /* ---------- ДАТЫ ---------- */
   function applyDateLimits() {
     const input = $("date");
     if (!input) return;
     const today = new Date();
     const maxDate = new Date();
     maxDate.setFullYear(today.getFullYear() + 1);
     const fmt = (d) => d.toISOString().slice(0, 10);
     input.min = fmt(today);
     input.max = fmt(maxDate);
   }
   
   function updateTimeHint() {
     const date = $("date").value;
     const hint = $("timeHint");
     const timeInput = $("time");
     const { isWeekend } = getTimeLimit(date);
     if (isWeekend) {
       hint.textContent = "Выходной: 06:00–17:00";
       hint.style.color = "var(--orange-fg)";
       timeInput.max = "17:00";
     } else {
       hint.textContent = "Будний день: 06:00–20:00";
       hint.style.color = "var(--muted)";
       timeInput.max = "20:00";
     }
   }
   
   $("date").addEventListener("change", () => {
     updateTimeHint();
     const time = $("time").value;
     if (time) {
       clearErrors(["time"]);
       const err = validateBookingTime($("date").value, time);
       if (err) setError("time", err);
     }
   });
   
   $("time").addEventListener("change", () => {
     clearErrors(["time"]);
     const err = validateBookingTime($("date").value, $("time").value);
     if (err) setError("time", err);
   });
   
   $("activity").addEventListener("change", updateActivityInfo);
   
   /* ---------- CREATE BOOKING ---------- */
   $("bookingForm").onsubmit = async (e) => {
     e.preventDefault();
     clearErrors(["activity", "date", "time"]);
     const activityId = $("activity").value;
     const date = $("date").value;
     const time = $("time").value;
   
     let ok = true;
     if (!activityId) { setError("activity", "Выберите занятие."); ok = false; }
     if (!date) { setError("date", "Укажите дату."); ok = false; }
     else {
       const today = new Date(); today.setHours(0,0,0,0);
       const maxDate = new Date(); maxDate.setFullYear(today.getFullYear() + 1);
       const d = new Date(date + "T00:00:00");
       if (d < today) { setError("date", "Дата не может быть в прошлом."); ok = false; }
       else if (d > maxDate) { setError("date", "Можно записаться не более чем на год вперёд."); ok = false; }
     }
     if (!time) { setError("time", "Укажите время."); ok = false; }
     else {
       const timeErr = validateBookingTime(date, time);
       if (timeErr) { setError("time", timeErr); ok = false; }
     }
     if (!ok) { showToast("Исправьте ошибки в форме.", "error"); return; }
   
     const btn = $("submitBtn");
     btn.disabled = true;
     btn.classList.add("is-loading");
     btn.textContent = "Сохранение...";
   
     const res = await sbCall(
       () => sb.from("bookings").insert({
         profiles_id: currentUser.id,
         activity_id: Number(activityId),
         booking_date: date,
         booking_time: time,
         status: "Подтверждена"
       }),
       "создание"
     );
   
     if (res.error) {
       let msg = res.error.message || "Не удалось сохранить запись. Повторите попытку.";
       if (msg.includes("Нет свободных мест")) msg = "На выбранное время нет свободных мест.";
       if (msg.includes("duplicate key")) msg = "Вы уже записаны на это занятие в это время.";
       if (msg.includes("bookings_date_range")) msg = "Дата вне допустимого диапазона.";
       showToast(msg, "error");
     } else {
       showToast("Запись успешно создана.");
       $("bookingForm").reset();
       updateTimeHint();
       updateActivityInfo();
       applyDateLimits();
       clientsLoaded = false;
       analyticsLoaded = false;
       await loadBookings();
       navigate("list");
     }
     btn.disabled = false;
     btn.classList.remove("is-loading");
     btn.textContent = "Записаться";
   };
   
   /* ---------- DETAIL ---------- */
   async function openDetail(id) {
     const detail = $("bookingDetail");
     detail.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
     navigate("detail");
   
     const res = await sbCall(
       () => sb.from("bookings").select(`
         id, booking_date, booking_time, status, created_at, profiles_id,
         activity:activities(id, name, description, address, price),
         profile:profiles(id, full_name, email)
       `).eq("id", id).single(),
       "запись"
     );
   
     if (res.error || !res.data) {
       detail.innerHTML = `<div class="error-state"><h2>Не удалось загрузить</h2><p>${esc(res.error?.message || "Нет данных")}</p></div>`;
       return;
     }
   
     const data = res.data;
     currentBooking = data;
     const isOwner = data.profile.id === currentUser.id;
     const isAdmin = currentProfile.role === "admin";
     const canCancel = data.status === "Подтверждена" && (isOwner || isAdmin);
     const canMarkVisited = data.status === "Подтверждена" && isAdmin;
     const cls = statusClass(data.status);
     const meta = getActivityMeta(data.activity?.name);
   
     let history = [];
     const hres = await sbCall(
       () => sb.from("status_history").select("old_status, new_status, changed_at")
         .eq("booking_id", id).order("changed_at", { ascending: false }),
       "история", 1
     );
     if (hres.data) history = hres.data;
   
     let notice = "";
     if (data.status === "Посещено") notice = `<div class="notice notice-blue">ⓘ Отмена невозможна: занятие уже посещено.</div>`;
     else if (data.status === "Отменена") notice = `<div class="notice notice-red">ⓘ Отмена невозможна: запись уже отменена.</div>`;
   
     detail.innerHTML = `
       <div class="detail">
         <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
           <div class="booking-icon" style="background:${meta.bg};color:${meta.fg};width:56px;height:56px;font-size:28px;border-radius:14px">${meta.icon}</div>
           <h1 style="margin:0">Запись №${data.id}</h1>
         </div>
         <dl style="margin:0">
           <div class="detail-row"><dt>Занятие</dt><dd>${esc(data.activity?.name || "—")}</dd></div>
           <div class="detail-row"><dt>Адрес</dt><dd>${esc(data.activity?.address || "—")}</dd></div>
           <div class="detail-row"><dt>Стоимость</dt><dd>${esc(fmtPrice(data.activity?.price))}</dd></div>
           <div class="detail-row"><dt>Дата</dt><dd>${fmtDate(data.booking_date)}</dd></div>
           <div class="detail-row"><dt>Время</dt><dd>${esc((data.booking_time || "").slice(0,5))}</dd></div>
           <div class="detail-row"><dt>Записан</dt><dd>${esc(data.profile.full_name || data.profile.email)}</dd></div>
           <div class="detail-row"><dt>Статус</dt><dd><span class="badge badge-${cls}">${esc(data.status)}</span></dd></div>
           <div class="detail-row"><dt>Создана</dt><dd>${new Date(data.created_at).toLocaleString("ru-RU")}</dd></div>
         </dl>
         ${notice}
         <div class="detail-actions">
           ${canCancel ? `<button class="btn btn-danger" id="cancelBtn" type="button">🗑 Отменить запись</button>` : ""}
           ${canMarkVisited ? `<button class="btn btn-primary" id="visitedBtn" type="button">✓ Отметить как посещено</button>` : ""}
         </div>
         ${history.length ? `
           <div class="history">
             <h2>История изменений</h2>
             ${history.map(h => `
               <div class="history-item">
                 <div class="history-dot"></div>
                 <div class="history-text">
                   ${h.old_status ? `«${esc(h.old_status)}» → ` : ""}<b>«${esc(h.new_status)}»</b>
                   <br><small>${new Date(h.changed_at).toLocaleString("ru-RU")}</small>
                 </div>
               </div>`).join("")}
           </div>` : ""}
       </div>
     `;
   
     const cancelBtn = $("cancelBtn");
     if (cancelBtn) cancelBtn.onclick = () => $("confirmDialog").showModal();
   
     const visitedBtn = $("visitedBtn");
     if (visitedBtn) visitedBtn.onclick = async () => {
       visitedBtn.disabled = true;
       visitedBtn.classList.add("is-loading");
       const r = await sbCall(() => sb.from("bookings").update({ status: "Посещено" }).eq("id", id), "статус");
       if (r.error) showToast(r.error.message, "error");
       else {
         showToast("Отмечено как посещено.");
         clientsLoaded = false; analyticsLoaded = false;
         await openDetail(id);
       }
       visitedBtn.disabled = false;
       visitedBtn.classList.remove("is-loading");
     };
   }
   
   $("confirmYes").onclick = async () => {
     if (!currentBooking) return;
     const r = await sbCall(() => sb.from("bookings").update({
       status: "Отменена",
       cancelled_at: new Date().toISOString()
     }).eq("id", currentBooking.id), "отмена");
     $("confirmDialog").close();
     if (r.error) { showToast(r.error.message || "Не удалось отменить.", "error"); return; }
     showToast("Запись №" + currentBooking.id + " успешно отменена.", "info");
     clientsLoaded = false; analyticsLoaded = false;
     await loadBookings();
     navigate("list");
   };
   
   $("confirmNo").onclick = () => $("confirmDialog").close();
   
   /* =========================================================
      АДМИН-ПАНЕЛЬ
      ========================================================= */
   document.addEventListener("click", (e) => {
     const btn = e.target.closest("[data-admin-view]");
     if (!btn) return;
     document.querySelectorAll("[data-admin-view]").forEach(b => b.classList.toggle("active", b === btn));
     const view = btn.dataset.adminView;
     $("adminViewClients").classList.toggle("hidden", view !== "clients");
     $("adminViewAnalytics").classList.toggle("hidden", view !== "analytics");
     if (view === "clients" && !clientsLoaded) loadClients();
     if (view === "analytics" && !analyticsLoaded) loadAnalytics();
   });
   
   /* ---------- КЛИЕНТЫ ---------- */
   async function loadClients() {
     const el = $("adminClients");
     el.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Загрузка клиентов...</p></div>`;
   
     const res = await sbCall(
       () => sb.from("profiles").select(`id, email, full_name, role, created_at`).order("created_at", { ascending: false }),
       "клиенты"
     );
   
     if (res.error || !res.data) {
       el.innerHTML = `
         <div class="error-state">
           <h2>Не удалось загрузить</h2>
           <p>${esc(res.error?.message || "Нет ответа")}</p>
           <button class="btn btn-primary" type="button" onclick="window.__reloadClients()">Повторить</button>
         </div>`;
       return;
     }
   
     // Считаем количество записей отдельным лёгким запросом
     const allBookingsRes = await sbCall(
       () => sb.from("bookings").select("profiles_id"),
       "кол-во записей", 1
     );
     const counts = {};
     (allBookingsRes.data || []).forEach(b => { counts[b.profiles_id] = (counts[b.profiles_id] || 0) + 1; });
   
     allClients = res.data.map(p => ({
       id: p.id,
       email: p.email,
       full_name: p.full_name || "—",
       role: p.role,
       created_at: p.created_at,
       bookingsCount: counts[p.id] || 0
     }));
   
     clientsLoaded = true;
     applyClientFilters();
   
     $("adminClientSearch").oninput = applyClientFilters;
     $("adminRoleFilter").onchange = applyClientFilters;
     $("resetClientFilters").onclick = () => {
       $("adminClientSearch").value = "";
       $("adminRoleFilter").value = "";
       applyClientFilters();
     };
   }
   window.__reloadClients = loadClients;
   
   function applyClientFilters() {
     const q = ($("adminClientSearch").value || "").toLowerCase().trim();
     const role = $("adminRoleFilter").value;
     let filtered = allClients;
     if (q) filtered = filtered.filter(c => c.email.toLowerCase().includes(q) || c.full_name.toLowerCase().includes(q));
     if (role) filtered = filtered.filter(c => c.role === role);
     renderClients(filtered);
   }
   
   function renderClients(items) {
     const el = $("adminClients");
     if (!items.length) {
       el.innerHTML = `<div class="empty"><div class="empty-icon">👥</div><h2>Клиенты не найдены</h2><p>Измените фильтры или поиск.</p></div>`;
       return;
     }
     el.innerHTML = `
       <table class="users-table">
         <thead><tr>
           <th>Пользователь</th><th>Email</th><th>Роль</th><th>Записей</th><th>Регистрация</th>
         </tr></thead>
         <tbody>
           ${items.map(u => `
             <tr data-client-id="${u.id}" tabindex="0">
               <td><div class="user-cell">
                 <div class="user-avatar">${esc((u.full_name || u.email)[0].toUpperCase())}</div>
                 <span>${esc(u.full_name)}</span>
               </div></td>
               <td>${esc(u.email)}</td>
               <td><span class="user-role-badge user-role-${u.role}">${u.role === "admin" ? "★ Админ" : "Пользователь"}</span></td>
               <td><span class="user-count">${u.bookingsCount}</span></td>
               <td>${new Date(u.created_at).toLocaleDateString("ru-RU")}</td>
             </tr>`).join("")}
         </tbody>
       </table>`;
   
     el.querySelectorAll("[data-client-id]").forEach(row => {
       row.addEventListener("click", () => openClient(row.dataset.clientId));
       row.addEventListener("keydown", (e) => {
         if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openClient(row.dataset.clientId); }
       });
     });
   }
   
   /* ---------- КАРТОЧКА КЛИЕНТА ---------- */
   async function openClient(clientId) {
     const wrap = $("clientDetail");
     wrap.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Загрузка клиента...</p></div>`;
     navigate("client");
   
     const pres = await sbCall(
       () => sb.from("profiles").select("id, email, full_name, role, created_at").eq("id", clientId).single(),
       "профиль клиента"
     );
   
     if (pres.error || !pres.data) {
       wrap.innerHTML = `
         <div class="error-state">
           <h2>Не удалось загрузить клиента</h2>
           <p>${esc(pres.error?.message || "Клиент не найден")}</p>
           <button class="btn btn-primary" type="button" data-page="admin">← К списку клиентов</button>
         </div>`;
       return;
     }
   
     const p = pres.data;
     currentClient = p;
   
     const bres = await sbCall(
       () => sb.from("bookings").select(`
         id, booking_date, booking_time, status, created_at,
         activity:activities(id, name, address, price)
       `).eq("profiles_id", clientId).order("booking_date", { ascending: false }),
       "записи клиента"
     );
   
     const bookings = bres.data || [];
   
     const total = bookings.length;
     const byStatus = bookings.reduce((a, b) => { a[b.status] = (a[b.status] || 0) + 1; return a; }, {});
     const confirmed = byStatus["Подтверждена"] || 0;
     const visited = byStatus["Посещено"] || 0;
     const cancelled = byStatus["Отменена"] || 0;
     const totalSpent = bookings.filter(b => b.status !== "Отменена")
       .reduce((s, b) => s + (Number(b.activity?.price) || 0), 0);
   
     const initials = (p.full_name || p.email || "?").trim()[0].toUpperCase();
     const roleLabel = p.role === "admin" ? "★ Администратор" : "Пользователь";
     const roleClass = p.role === "admin" ? "user-role-admin" : "user-role-user";
   
     let bookingsHtml = "";
     if (!bookings.length) {
       bookingsHtml = `<div class="client-empty">У этого клиента пока нет записей.</div>`;
     } else {
       bookingsHtml = bookings.map(b => {
         const cls = statusClass(b.status);
         const meta = getActivityMeta(b.activity?.name);
         const addr = b.activity?.address ? `📍 ${esc(b.activity.address)}` : "";
         const price = b.activity?.price != null && b.activity.price !== "" ? `💰 ${esc(fmtPrice(b.activity.price))}` : "";
         const metaLine = [addr, price].filter(Boolean).join("  ·  ");
         return `
           <article class="booking-card" tabindex="0" data-id="${b.id}">
             <div class="booking-icon" style="background:${meta.bg};color:${meta.fg}">${meta.icon}</div>
             <div class="booking-info">
               <div class="booking-num">№${b.id}</div>
               <div class="booking-title">${esc(b.activity?.name || "—")}</div>
               ${metaLine ? `<div class="booking-num" style="margin-top:4px">${metaLine}</div>` : ""}
             </div>
             <div class="booking-date">
               Дата и время<br>
               <b>${fmtDate(b.booking_date)}, ${esc((b.booking_time || "").slice(0,5))}</b>
             </div>
             <span class="badge badge-${cls}">${esc(b.status)}</span>
           </article>`;
       }).join("");
     }
   
     wrap.innerHTML = `
       <div class="detail">
         <div class="client-head">
           <div class="user-avatar">${esc(initials)}</div>
           <div style="flex:1;min-width:0">
             <h1>${esc(p.full_name || "—")}</h1>
             <p>${esc(p.email)} · <span class="user-role-badge ${roleClass}">${roleLabel}</span></p>
             <p style="margin-top:4px">Зарегистрирован: ${new Date(p.created_at).toLocaleString("ru-RU")}</p>
           </div>
         </div>
         <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
           <div class="stat-card"><div class="stat-label">Всего записей</div><div class="stat-value">${total}</div></div>
           <div class="stat-card"><div class="stat-label">Подтверждено</div><div class="stat-value">${confirmed}</div></div>
           <div class="stat-card"><div class="stat-label">Посещено</div><div class="stat-value">${visited}</div></div>
           <div class="stat-card"><div class="stat-label">Отменено</div><div class="stat-value">${cancelled}</div></div>
           <div class="stat-card"><div class="stat-label">Потрачено</div><div class="stat-value">${totalSpent.toLocaleString("ru-RU")} ₽</div></div>
         </div>
         <h2 style="margin-top:8px">Записи клиента</h2>
         <div class="client-bookings">${bookingsHtml}</div>
       </div>
     `;
   
     wrap.querySelectorAll(".client-bookings [data-id]").forEach(card => {
       card.addEventListener("click", () => openDetail(Number(card.dataset.id)));
       card.addEventListener("keydown", (e) => {
         if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(Number(card.dataset.id)); }
       });
     });
   }
   
   /* ---------- АНАЛИТИКА ---------- */
   async function loadAnalytics() {
     const statsGrid = $("statsGrid");
     statsGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Загрузка аналитики...</p></div>`;
   
     const res = await sbCall(
       () => sb.from("bookings").select("id, status, activity_id, activity:activities(name)"),
       "аналитика"
     );
   
     if (res.error || !res.data) {
       statsGrid.innerHTML = `
         <div class="error-state">
           <h2>Не удалось загрузить аналитику</h2>
           <p>${esc(res.error?.message || "Нет ответа")}</p>
           <button class="btn btn-primary" type="button" onclick="window.__reloadAnalytics()">Повторить</button>
         </div>`;
       return;
     }
   
     const bookings = res.data;
     const byStatus = bookings.reduce((a, b) => { a[b.status] = (a[b.status] || 0) + 1; return a; }, {});
     const byActivity = bookings.reduce((a, b) => {
       const n = b.activity?.name || "—"; a[n] = (a[n] || 0) + 1; return a;
     }, {});
   
     let usersCount = 0;
     const ures = await sbCall(
       () => sb.from("profiles").select("*", { count: "exact", head: true }),
       "пользователи", 1
     );
     if (ures.count != null) usersCount = ures.count;
   
     statsGrid.innerHTML = `
       <div class="stat-card"><div class="stat-label">Всего записей</div><div class="stat-value">${bookings.length}</div></div>
       <div class="stat-card"><div class="stat-label">Подтверждено</div><div class="stat-value">${byStatus["Подтверждена"] || 0}</div></div>
       <div class="stat-card"><div class="stat-label">Посещено</div><div class="stat-value">${byStatus["Посещено"] || 0}</div></div>
       <div class="stat-card"><div class="stat-label">Отменено</div><div class="stat-value">${byStatus["Отменена"] || 0}</div></div>
       <div class="stat-card"><div class="stat-label">Пользователей</div><div class="stat-value">${usersCount}</div></div>
     `;
   
     if (statusChart) statusChart.destroy();
     statusChart = new Chart($("statusChart"), {
       type: "bar",
       data: {
         labels: ["Подтверждена", "Посещено", "Отменена"],
         datasets: [{
           label: "Записей",
           data: [byStatus["Подтверждена"] || 0, byStatus["Посещено"] || 0, byStatus["Отменена"] || 0],
           backgroundColor: ["#1b5e20", "#0d47a1", "#b00020"],
           borderRadius: 8
         }]
       },
       options: { responsive: true, maintainAspectRatio: false,
         plugins: { legend: { display: false } },
         scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
     });
   
     if (activityChart) activityChart.destroy();
     activityChart = new Chart($("activityChart"), {
       type: "doughnut",
       data: {
         labels: Object.keys(byActivity),
         datasets: [{
           data: Object.values(byActivity),
           backgroundColor: ["#1b5e20","#0d47a1","#b00020","#6b7280","#f59e0b","#8b5cf6","#ec4899","#06b6d4"]
         }]
       },
       options: { responsive: true, maintainAspectRatio: false }
     });
   
     analyticsLoaded = true;
   }
   window.__reloadAnalytics = loadAnalytics;
   
   /* =========================================================
      СТАРТ
      ========================================================= */
   sb.auth.onAuthStateChange((event) => {
     if (event === "SIGNED_OUT") {
       currentUser = null;
       currentProfile = null;
       clientsLoaded = false;
       analyticsLoaded = false;
       showAuth();
     }
   });
   
   (async () => {
     const splash = $("loadingSplash");
     splash.style.display = "grid";
     try {
       const { data: { session } } = await sb.auth.getSession();
       if (session) await loadApp(false);
       else { splash.style.display = "none"; showAuth(); }
     } catch (err) {
       console.error("Initial load error:", err);
       splash.style.display = "none";
       showAuth();
     }
   })();