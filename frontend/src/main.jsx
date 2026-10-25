import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

function normalizePublicPath(value) {
  const clean = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return clean ? `/${clean}` : "";
}

function inferPublicPath() {
  const configured = normalizePublicPath(typeof __APP_PUBLIC_PATH__ !== "undefined" ? __APP_PUBLIC_PATH__ : "");
  if (configured) return configured;
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments.length ? `/${segments[0]}` : "";
}

const PUBLIC_PATH = inferPublicPath();
const API = `${PUBLIC_PATH}/api`;
const APP_NAME = "RUKUN";
const ADMIN_ROLES = ["administrator", "pengurus"];
const IS_STANDALONE = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const PWA_INSTALLED_STORAGE_KEY = "rukun-pwa-installed";
let deferredInstallPrompt = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY);
    window.dispatchEvent(new Event("rukuninstallpromptavailable"));
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
    window.dispatchEvent(new Event("rukunappinstalled"));
  });
}

function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState(() => deferredInstallPrompt);
  const [isInstalled, setIsInstalled] = useState(() => IS_STANDALONE || (!deferredInstallPrompt && localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === "1"));
  const [helpOpen, setHelpOpen] = useState(false);
  const userAgent = window.navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  const isAndroid = /Android/i.test(userAgent);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => {
      const installed = displayMode.matches || window.navigator.standalone === true;
      if (installed) localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
      setIsInstalled(installed || (!deferredInstallPrompt && localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === "1"));
    };
    const onInstallPromptAvailable = () => {
      localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY);
      setIsInstalled(false);
      setInstallPrompt(deferredInstallPrompt);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
      setHelpOpen(false);
    };
    updateInstalledState();
    displayMode.addEventListener?.("change", updateInstalledState);
    window.addEventListener("rukuninstallpromptavailable", onInstallPromptAvailable);
    window.addEventListener("rukunappinstalled", onAppInstalled);
    return () => {
      displayMode.removeEventListener?.("change", updateInstalledState);
      window.removeEventListener("rukuninstallpromptavailable", onInstallPromptAvailable);
      window.removeEventListener("rukunappinstalled", onAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setHelpOpen(true);
      return "help";
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      deferredInstallPrompt = null;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
        setIsInstalled(true);
      }
      return choice.outcome;
    } catch {
      deferredInstallPrompt = null;
      setInstallPrompt(null);
      setHelpOpen(true);
      return "help";
    }
  };

  return { canInstall: !isInstalled, install, helpOpen, setHelpOpen, isIos, isAndroid };
}

function tokenExpiresAt(token) {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return Number(JSON.parse(window.atob(padded)).exp || 0) * 1000;
  } catch {
    return 0;
  }
}

function validStoredToken() {
  const stored = localStorage.getItem("token") || "";
  if (stored && tokenExpiresAt(stored) > Date.now()) return stored;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  return "";
}

async function checkForAppUpdate() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration(`${PUBLIC_PATH || ""}/`);
    if (registration) {
      await registration.update();
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    }
  }
  await fetch(window.location.href, { cache: "reload" });
  window.location.reload();
}

function useApi() {
  const [token, setToken] = useState(validStoredToken);
  const [user, setUser] = useState(() => {
    if (!localStorage.getItem("token")) return null;
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  });
  const [loadingCount, setLoadingCount] = useState(0);

  const clearSession = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  useEffect(() => {
    if (!token) return undefined;
    const enforceExpiry = () => {
      if (tokenExpiresAt(token) <= Date.now()) clearSession();
    };
    enforceExpiry();
    const interval = window.setInterval(enforceExpiry, 60000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") enforceExpiry();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [token]);

  const request = async (path, options = {}) => {
    setLoadingCount((count) => count + 1);
    try {
      const isFormData = options.body instanceof FormData;
      const headers = { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API}${path}`, { ...options, headers });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (response.status === 401 && path !== "/auth/login") {
        clearSession();
        throw new Error("Sesi login telah berakhir. Silakan masuk kembali.");
      }
      if (!response.ok) throw new Error(formatApiError(data));
      return data;
    } finally {
      setLoadingCount((count) => Math.max(0, count - 1));
    }
  };

  const login = async (email, password) => {
    const data = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
  };

  const logout = () => {
    clearSession();
  };

  return { token, user, setUser, request, login, logout, isLoading: loadingCount > 0 };
}

function formatApiError(data) {
  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(".") : "";
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .join("; ");
  }
  return data?.detail || "Request gagal";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function userOptionLabel(user) {
  return [user?.full_name, user?.email].filter(Boolean).join(" - ");
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <section className="page">
          <div className="page-head"><h2>Halaman belum bisa dimuat</h2></div>
          <p className="notice">{this.state.error.message || "Terjadi error pada tampilan aplikasi."}</p>
        </section>
      );
    }
    return this.props.children;
  }
}

function AuthScreen({ api }) {
  const [mode, setMode] = useState("login");
  const [complexes, setComplexes] = useState([]);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "", complex_id: "", ktp_document: null });
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.request("/complexes")
      .then(setComplexes)
      .catch(() => {
        setComplexes([]);
        setMessage("Data komplek belum bisa dimuat. Pastikan database aktif dan minimal satu komplek sudah dibuat oleh superadmin.");
      });
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      if (mode === "login") {
        await api.login(form.email, form.password);
      } else {
        const fullName = form.full_name.trim().replace(/\s+/g, " ");
        const phone = form.phone.trim();
        const email = form.email.trim().toLowerCase();
        const complexId = form.complex_id || complexes[0]?.id || "";
        if (fullName.length < 2) {
          throw new Error("Nama lengkap wajib diisi");
        }
        const phoneDigits = phone.replace(/\D/g, "");
        if (phoneDigits.length < 8 || phoneDigits.length > 15) {
          throw new Error("Nomor telepon harus terdiri dari 8 sampai 15 digit");
        }
        if (!form.ktp_document) {
          throw new Error("Dokumen pendukung wajib diupload");
        }
        if (!email) {
          throw new Error("Email wajib diisi");
        }
        if (form.password.length < 8) {
          throw new Error("Password minimal 8 karakter");
        }
        if (!complexId) {
          throw new Error("Pilih komplek terlebih dahulu. Jika daftar komplek kosong, login sebagai superadmin lalu buat komplek.");
        }
        const data = new FormData();
        data.append("full_name", fullName);
        data.append("phone", phone);
        data.append("email", email);
        data.append("password", form.password);
        data.append("complex_id", String(complexId));
        data.append("ktp_document", await compressImageFile(form.ktp_document));
        await api.request("/auth/register", {
          method: "POST",
          body: data,
        });
        setMessage("Registrasi berhasil dikirim. Administrator komplek akan memvalidasi data dan dokumen pendukung Anda.");
      }
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><img className="brand-mark" src="/images/rukun-logo.png" alt="Logo RUKUN" /><h1>{APP_NAME}</h1></div>
        <p>Management Rukun dalam satu platform</p>
        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Registrasi</button>
        </div>
        <form onSubmit={submit} className="stack">
          {mode === "register" && <FormField label="Nama Lengkap"><input placeholder="Masukkan nama lengkap" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} minLength={2} maxLength={150} required /></FormField>}
          {mode === "register" && <FormField label="Nomor Telepon"><input type="tel" inputMode="tel" placeholder="Contoh: 081234567890" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} minLength={8} maxLength={20} required /></FormField>}
          <FormField label="Email"><input placeholder="contoh@email.com" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></FormField>
          <FormField label="Password"><input placeholder="Minimal 8 karakter" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></FormField>
          {mode === "register" && (
            <>
              <FormField label="Komplek"><select value={form.complex_id} onChange={(e) => setForm({ ...form, complex_id: e.target.value })} required>
                <option value="">Pilih komplek</option>
                {complexes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select></FormField>
              <div className="file-field">
                <span>Upload Dokumen Pendukung (KTP, Domisili)</span>
                <div className="upload-inputs">
                  <input type="file" accept="image/*,.pdf" onChange={(e) => setForm({ ...form, ktp_document: e.target.files?.[0] || null })} />
                  <label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setForm({ ...form, ktp_document: e.target.files?.[0] || null })} /></label>
                </div>
                <ImageUploadPreview files={form.ktp_document} />
              </div>
            </>
          )}
          <button className="primary" disabled={mode === "register" && !complexes.length}>{mode === "login" ? "Masuk" : "Daftar"}</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>
    </main>
  );
}

function App() {
  const api = useApi();
  const pwa = usePwaInstall();
  const [tab, setTab] = useState("home");
  const [navReset, setNavReset] = useState(0);
  const [complexName, setComplexName] = useState(APP_NAME);
  const [complexLogo, setComplexLogo] = useState("");
  const isAdmin = ADMIN_ROLES.includes(api.user?.role);
  const isAdministrator = api.user?.role === "administrator";
  const isSuper = api.user?.role === "superadmin";
  const isSecurity = api.user?.role === "security";
  const isManagementStaff = ["security", "supports"].includes(api.user?.role);
  const tabRef = useRef(tab);
  const userRef = useRef(api.user);
  const isSuperRef = useRef(isSuper);
  tabRef.current = tab;
  userRef.current = api.user;
  isSuperRef.current = isSuper;

  useEffect(() => {
    const defaultTab = isSuperRef.current ? "complex-management" : "home";
    const initialTab = userRef.current ? defaultTab : null;
    const { rukunModalId, rukunSubview, rukunSection, ...currentState } = window.history.state || {};
    window.history.replaceState({ ...currentState, rukunApp: true, rukunRoot: true, rukunTab: initialTab }, "");
    if (IS_STANDALONE) {
      window.history.pushState({ ...currentState, rukunApp: true, rukunRoot: false, rukunTab: initialTab }, "");
    }

    const handlePopState = (event) => {
      if (event.state?.rukunModalId) return;
      const currentUser = userRef.current;
      const allowedTabs = isSuperRef.current
        ? ["complex-management", "user-access"]
        : ["home", "letters", "lapor", "booking", "profile"];
      const fallbackTab = isSuperRef.current ? "complex-management" : "home";
      const nextTab = allowedTabs.includes(event.state?.rukunTab) ? event.state.rukunTab : tabRef.current || fallbackTab;

      if (currentUser && nextTab !== tabRef.current) {
        tabRef.current = nextTab;
        setTab(nextTab);
        setNavReset((value) => value + 1);
      }

      if (IS_STANDALONE && (!event.state?.rukunApp || event.state?.rukunRoot)) {
        window.history.pushState({ rukunApp: true, rukunRoot: false, rukunTab: currentUser ? nextTab : null }, "");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const defaultTab = isSuper ? "complex-management" : "home";
    tabRef.current = defaultTab;
    setTab(defaultTab);
    const { rukunModalId, rukunSubview, rukunSection, ...currentState } = window.history.state || {};
    window.history.replaceState({ ...currentState, rukunApp: true, rukunRoot: false, rukunTab: api.user ? defaultTab : null }, "");
  }, [api.user?.id, isSuper]);

  useEffect(() => {
    if (!api.user || isSuper || !api.user.complex_id) {
      setComplexName(APP_NAME);
      setComplexLogo("");
      return;
    }
    api.request("/complexes")
      .then((rows) => {
        const complex = asArray(rows).find((item) => String(item.id) === String(api.user.complex_id));
        setComplexName(complex?.name || APP_NAME);
        setComplexLogo(complex?.logo_url || "");
      })
      .catch(() => {
        setComplexName(APP_NAME);
        setComplexLogo("");
      });
  }, [api.user?.complex_id, isSuper]);
  const superTabs = ["complex-management", "user-access", "whatsapp-gateway"];
  const activeTab = isSuper ? (superTabs.includes(tab) ? tab : "complex-management") : tab;
  const navItems = isSuper ? superTabs : ["home", "letters", "lapor", "booking", "profile"];
  const goTab = (item) => {
    if (item !== activeTab) {
      const { rukunModalId, rukunSubview, rukunSection, ...currentState } = window.history.state || {};
      window.history.pushState({ ...currentState, rukunApp: true, rukunRoot: false, rukunTab: item }, "");
    }
    tabRef.current = item;
    setTab(item);
    setNavReset((value) => value + 1);
  };
  if (!api.user) return <><AuthScreen api={api} /><PwaInstallNotice pwa={pwa} /><PwaInstallHelp pwa={pwa} />{api.isLoading && <LoadingModal />}</>;
  return (
    <>
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <strong className="header-brand"><img className="header-logo" src="/images/rukun-logo.png" alt="" /><span className="header-brand-name">{APP_NAME}</span></strong>
          <span className={isAdmin ? "admin-user" : ""}>Welcome, {api.user.full_name} - {isSuper ? `${APP_NAME} Admin` : complexName}</span>
        </div>
        {!isSuper && <NotificationBell api={api} onNavigate={goTab} />}
        <AccountMenu api={api} complexLogo={complexLogo} pwa={pwa} />
      </header>
      <main className="content">
        <ErrorBoundary key={`${activeTab}-${navReset}`}>
          {activeTab === "home" && <Home api={api} isAdmin={isAdmin} onNavigate={goTab} />}
          {activeTab === "booking" && <Booking api={api} isAdmin={isAdmin} calendarOnly />}
          {activeTab === "lapor" && (isManagementStaff ? <ManagementReports api={api} isAdmin={isAdmin} /> : <Reports api={api} isAdmin={isAdmin} isSecurity={isSecurity} startOpen={api.user.role === "penghuni"} />)}
          {activeTab === "profile" && <Profile api={api} />}
          {activeTab === "letters" && <RequestHub api={api} isAdmin={isAdmin} isSecurity={isSecurity} />}
          {activeTab === "complex-management" && isSuper && <ComplexManagement api={api} />}
          {activeTab === "user-access" && isSuper && <UserAccess api={api} />}
          {activeTab === "whatsapp-gateway" && isSuper && <WhatsAppGateway api={api} />}
        </ErrorBoundary>
      </main>
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <button key={item} className={`${activeTab === item ? "active" : ""} ${item === "lapor" ? "scan-nav" : ""}`} onClick={() => goTab(item)} title={label(item, isAdministrator)}>
            <Icon name={navIcon(item)} />
            <span>{label(item, isAdministrator)}</span>
          </button>
        ))}
      </nav>
      {api.isLoading && <LoadingModal />}
    </div>
    <PwaInstallNotice pwa={pwa} />
    <PwaInstallHelp pwa={pwa} />
    </>
  );
}

function label(tab, isAdmin = false) {
  return {
    home: "Beranda",
    booking: "Jadwal",
    lapor: "Lapor",
    profile: isAdmin ? "Komplek" : "Profil",
    letters: "Navigasi",
    registrations: "Daftar",
    "complex-management": "Manajemen Komplek",
    "user-access": "User Access",
    "whatsapp-gateway": "WhatsApp Gateway",
  }[tab] || tab;
}

function navIcon(tab) {
  return {
    home: "home",
    booking: "calendar",
    lapor: "report",
    profile: "users",
    letters: "grid",
    registrations: "users",
    "complex-management": "building",
    "user-access": "users",
    "whatsapp-gateway": "megaphone",
  }[tab] || "circle";
}

function Icon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const paths = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    calendar: <><path d="M8 2v4" /><path d="M16 2v4" /><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /></>,
    qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2z" /><path d="M18 14h2v6h-6v-2" /><path d="M14 20v-2" /></>,
    camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="4" /></>,
    location: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    megaphone: <><path d="m3 11 14-5v12L3 13z" /><path d="M7 14v5" /><path d="M18 9.5a4 4 0 0 1 0 5" /><path d="M21 8a7 7 0 0 1 0 8" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /></>,
    heart: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6z" />,
    comment: <><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.4-5.4A8 8 0 1 1 21 12z" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
    bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 11a3 3 0 0 0 0-6" /><path d="M22 21a7 7 0 0 0-5-6.7" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-4h6v4" /><path d="M8 7h.01" /><path d="M12 7h.01" /><path d="M16 7h.01" /><path d="M8 11h.01" /><path d="M12 11h.01" /><path d="M16 11h.01" /></>,
    report: <><path d="M10.3 3.3 2.7 16.5A2 2 0 0 0 4.4 19h15.2a2 2 0 0 0 1.7-2.5L13.7 3.3a2 2 0 0 0-3.4 0z" /><path d="M12 8v5" /><path d="M12 16h.01" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></>,
    vote: <><path d="M9 12h6" /><path d="m10 15 2 2 4-4" /><path d="M4 4h16v16H4z" /></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.8 2.8-2-2z" /></>,
    newspaper: <><path d="M4 5h13a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z" /><path d="M7 8h7" /><path d="M7 12h10" /><path d="M7 16h6" /></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 3v18" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 9" /><path d="M17.9 15a7 7 0 0 1-11.5 2.6L4 15" /></>,
    circle: <circle cx="12" cy="12" r="8" />,
  };
  return <svg className="ui-icon" {...common}>{paths[name] || paths.circle}</svg>;
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function NotificationBell({ api, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const menuRef = useRef(null);
  const load = () => {
    api.request("/notifications")
      .then((data) => {
        const rows = asArray(data);
        setItems(rows);
        setCount(rows.filter((item) => !item.is_read).length);
      })
      .catch(() => {
        setItems([]);
        setCount(0);
      });
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);
  const openItem = async (item) => {
    if (!item.is_read) {
      await api.request(`/notifications/${item.id}/read`, { method: "PATCH" }).catch(() => null);
    }
    setOpen(false);
    load();
    if (["report", "news", "purchase_request", "management_report"].includes(item.link_type)) onNavigate("letters");
    if (item.link_type === "event") onNavigate("booking");
  };
  return (
    <div className="notification-menu" ref={menuRef}>
      <button className="bell-button" type="button" onClick={() => { setOpen(!open); if (!open) load(); }} title="Notifikasi">
        <Icon name="bell" />
        {!!count && <span>{count}</span>}
      </button>
      {open && (
        <div className="notification-dropdown">
          <div className="notification-head">
            <strong>Notifikasi</strong>
            <button type="button" onClick={() => api.request("/notifications/read-all", { method: "PATCH" }).then(load)}>Tandai dibaca</button>
          </div>
          {items.map((item) => (
            <button key={item.id} className={item.is_read ? "" : "unread"} type="button" onClick={() => openItem(item)}>
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </button>
          ))}
          {!items.length && <p>Belum ada notifikasi.</p>}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ api, complexLogo = "", pwa }) {
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" });
  const [message, setMessage] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const changePassword = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.request("/profile/password", { method: "PATCH", body: JSON.stringify(passwordForm) });
      setPasswordForm({ current_password: "", new_password: "" });
      setPasswordOpen(false);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const confirmLogout = () => {
    setOpen(false);
    setLogoutOpen(true);
  };

  const installApp = () => {
    setOpen(false);
    pwa.install();
  };

  const refreshApp = async () => {
    setOpen(false);
    try {
      await checkForAppUpdate();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="account-menu" ref={menuRef}>
      <button className="profile-button" type="button" onClick={() => setOpen(!open)} title="Profil user">
        {complexLogo ? <img src={publicUrl(complexLogo)} alt="" /> : <span>{(api.user.full_name || "U").slice(0, 1).toUpperCase()}</span>}
      </button>
      {open && (
        <div className="account-dropdown">
          <div className="account-identity">
            <Icon name="profile" />
            <div><strong>{api.user.full_name || "User"}</strong><span>{roleLabel(api.user.role)}</span></div>
          </div>
          <button type="button" onClick={() => { setOpen(false); setMessage(""); setPasswordOpen(true); }}><Icon name="lock" />Ubah Password</button>
          <button type="button" onClick={refreshApp}><Icon name="refresh" />Check update</button>
          {pwa.canInstall && <button type="button" onClick={installApp}><Icon name="download" />Install Aplikasi</button>}
          <button type="button" onClick={confirmLogout}><Icon name="logout" />Logout</button>
        </div>
      )}
      {passwordOpen && (
        <Modal title="Ubah Password" onClose={() => setPasswordOpen(false)}>
          <form className="composer flat" onSubmit={changePassword}>
            {message && <p className="notice">{message}</p>}
            <FormField label="Password Lama"><input type="password" placeholder="Masukkan password lama" value={passwordForm.current_password} onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} required /></FormField>
            <FormField label="Password Baru"><input type="password" placeholder="Minimal 8 karakter" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} required /></FormField>
            <button className="primary">Ubah password</button>
          </form>
        </Modal>
      )}
      {logoutOpen && (
        <Modal title="Konfirmasi Logout" onClose={() => setLogoutOpen(false)}>
          <div className="logout-confirm">
            <p>Anda yakin ingin keluar dari aplikasi RUKUN?</p>
            <div className="row actions">
              <button type="button" onClick={() => setLogoutOpen(false)}>Batal</button>
              <button className="primary" type="button" onClick={api.logout}>Logout</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PwaInstallNotice({ pwa }) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("rukun-install-notice-dismissed") === "1");

  if (!pwa.canInstall || dismissed) return null;
  const dismiss = () => {
    sessionStorage.setItem("rukun-install-notice-dismissed", "1");
    setDismissed(true);
  };
  const install = () => {
    dismiss();
    pwa.install();
  };
  return createPortal(
    <aside className="pwa-install-notice" role="status" aria-live="polite">
      <span className="pwa-install-icon"><Icon name="download" /></span>
      <div><strong>Install aplikasi RUKUN</strong><p>Pasang di layar utama agar akses lebih cepat dan nyaman.</p></div>
      <button className="pwa-install-action" type="button" onClick={install}>Install</button>
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="Tutup notifikasi install">×</button>
    </aside>,
    document.body,
  );
}

function PwaInstallHelp({ pwa }) {
  if (!pwa.helpOpen) return null;
  return (
    <Modal title="Install RUKUN" onClose={() => pwa.setHelpOpen(false)}>
      <div className="detail-pane install-help">
        {pwa.isIos ? <>
          <p>Untuk iPhone atau iPad, gunakan Safari lalu:</p>
          <ol><li>Tekan tombol <strong>Bagikan</strong>.</li><li>Pilih <strong>Tambah ke Layar Utama</strong>.</li><li>Tekan <strong>Tambah</strong>.</li></ol>
        </> : pwa.isAndroid ? <>
          <p>Jika prompt install Android tidak muncul otomatis:</p>
          <ol><li>Buka menu browser <strong>⋮</strong>.</li><li>Pilih <strong>Install aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li><li>Konfirmasi instalasi.</li></ol>
        </> : <>
          <p>Browser ini belum menampilkan prompt install otomatis.</p>
          <ol><li>Buka menu browser.</li><li>Pilih <strong>Install RUKUN</strong> atau <strong>Tambahkan ke layar utama</strong>.</li></ol>
        </>}
      </div>
    </Modal>
  );
}

function roleLabel(role) {
  return {
    superadmin: "Superadmin",
    administrator: "Administrator",
    pengurus: "Pengurus",
    penghuni: "Penghuni",
    security: "Security",
    supports: "Supports",
  }[role] || role || "-";
}

function ImageUploadPreview({ files }) {
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const selected = files instanceof File ? [files] : Array.from(files || []);
    const next = selected
      .filter((file) => file?.type?.startsWith("image/"))
      .map((file) => ({ name: file.name || "Foto", url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);

  if (!previews.length) return null;
  return <div className="image-upload-previews">{previews.map((item, index) => <figure key={`${item.name}-${index}`}><img src={item.url} alt={`Preview ${item.name}`} /><figcaption>{item.name}</figcaption></figure>)}</div>;
}

function ExistingUploadPreviews({ items = [], onRemove, canRemove, emptyText = "" }) {
  const rows = asArray(items).map((item, index) => {
    const value = typeof item === "string" ? { file_url: item } : item;
    const href = value?.file_url || value?.url || value?.image_url || "";
    const fallback = decodeURIComponent(href.split("/").pop() || `File ${index + 1}`);
    return { ...value, href, label: value?.file_name || value?.name || value?.label || fallback, index };
  }).filter((item) => item.href);
  if (!rows.length) return emptyText ? <small className="upload-empty">{emptyText}</small> : null;
  return <div className="existing-upload-previews">{rows.map((item) => <div className="existing-upload-card" key={item.id || `${item.href}-${item.index}`}>
    {isImageFile(item.href) ? <AttachmentImageButton href={item.href} alt={item.label} /> : <UploadedFileLink href={item.href} label={item.label} />}
    <span title={item.label}>{item.label}</span>
    {onRemove && (!canRemove || canRemove(item)) && <button className="existing-upload-remove" type="button" onClick={() => onRemove(item)}><Icon name="trash" />Hapus</button>}
  </div>)}</div>;
}

async function compressImageFile(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/") || ["image/gif", "image/svg+xml"].includes(file.type)) return file;
  let source;
  let objectUrl = "";
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file, { imageOrientation: "from-image" });
    } else {
      objectUrl = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
      });
    }
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    if (!width || !height) return file;
    const scale = Math.min(1, 1920 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return file;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
    if (!blob || blob.size >= file.size) return file;
    const baseName = (file.name || "foto").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    if (typeof source?.close === "function") source.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function uploadFile(api, file, folder) {
  const data = new FormData();
  data.append("file", await compressImageFile(file));
  return api.request(`/uploads?folder=${encodeURIComponent(folder)}`, {
    method: "POST",
    body: data,
  });
}

async function uploadFiles(api, files, folder) {
  const selected = Array.from(files || []);
  const uploaded = [];
  for (const file of selected) {
    uploaded.push(await uploadFile(api, file, folder));
  }
  return uploaded;
}

function UploadedFileLink({ href, label }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!href) return null;
  const fallback = decodeURIComponent(href.split("/").pop() || "Buka file");
  return (
    <>
      <button className="file-link" type="button" onClick={() => setPreviewOpen(true)}>
        <Icon name="file" />{label || fallback}
      </button>
      {previewOpen && <AttachmentPreview href={href} label={label || fallback} onClose={() => setPreviewOpen(false)} />}
    </>
  );
}

function AttachmentPreview({ href, label, onClose }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const url = publicUrl(href);
  const image = isImageFile(href);
  const pdf = /\.pdf(\?|#|$)/i.test(String(href || ""));
  const previewable = image || pdf;
  return <Modal title={label} onClose={onClose}><div className="attachment-preview"><div className="attachment-preview-actions"><a className="action-update" href={url} download><Icon name="download" />Download</a></div>{previewable ? <div className="attachment-preview-frame">{loading && <div className="attachment-loading"><span>Membuka dokumen…</span><div className="loading-progress"><i /></div></div>}{image ? <img className="full-image" src={url} alt={label} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} /> : <iframe title={label} src={url} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />}{failed && <p className="notice">Preview tidak tersedia. Silakan gunakan tombol Download.</p>}</div> : <div className="attachment-unavailable"><Icon name="file" /><p>Preview untuk tipe file ini tidak tersedia di browser. Gunakan tombol Download untuk menyimpan dan membukanya secara lokal.</p></div>}</div></Modal>;
}

function AttachmentImageButton({ href, alt }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return <><button className="attachment-image-button" type="button" onClick={() => setPreviewOpen(true)}><img src={publicUrl(href)} alt={alt || "Attachment"} /></button>{previewOpen && <AttachmentPreview href={href} label={alt || "Attachment"} onClose={() => setPreviewOpen(false)} />}</>;
}

function isImageFile(href) {
  return /\.(avif|gif|jpe?g|png|webp|bmp|svg)(\?|#|$)/i.test(String(href || ""));
}

function publicUrl(href) {
  if (!href || /^(https?:|data:|blob:)/i.test(href)) return href;
  if (!href.startsWith("/")) return href;
  if (PUBLIC_PATH && href.startsWith(`${PUBLIC_PATH}/`)) return href;
  return `${PUBLIC_PATH}${href}`;
}

function Home({ api, isAdmin, onNavigate }) {
  const [activeFeed, setActiveFeed] = useState("news");
  return <section className="page home-page">
    <div className="segmented home-tabs">
      <button className={activeFeed === "news" ? "active" : ""} onClick={() => setActiveFeed("news")}>News & Update</button>
      <button className={activeFeed === "marketplace" ? "active" : ""} onClick={() => setActiveFeed("marketplace")}>Marketplace</button>
    </div>
    {activeFeed === "news" ? <NewsHome api={api} isAdmin={isAdmin} onNavigate={onNavigate} /> : <MarketplaceFeed api={api} />}
  </section>;
}

function NewsHome({ api, isAdmin, onNavigate }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ title: "", content: "", is_active: true });
  const [mediaFiles, setMediaFiles] = useState([]);
  const [existingMedia, setExistingMedia] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const load = () => api.request(`/news${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((data) => setItems(asArray(data))).catch((e) => { setItems([]); setError(e.message); });
  useEffect(() => {
    load();
  }, []);
  const create = async (event) => {
    event.preventDefault();
    try {
      const uploaded = await uploadFiles(api, mediaFiles, "news");
      await api.request("/news", { method: "POST", body: JSON.stringify({ ...form, media_urls: uploaded.map((item) => item.url) }) });
      setForm({ title: "", content: "", is_active: true });
      setMediaFiles([]);
      setShowForm(false);
      load();
    } catch (e) { setError(e.message); }
  };
  const openCreate = () => { setError(""); setEditing(null); setMediaFiles([]); setExistingMedia([]); setForm({ title: "", content: "", is_active: true }); setShowForm(true); };
  const openEdit = (item) => { setError(""); setEditing(item); setMediaFiles([]); setExistingMedia(asArray(item.media)); setForm({ title: item.title || "", content: item.content || "", is_active: item.is_active !== false }); setShowForm(true); };
  const update = async (event) => {
    event.preventDefault();
    try {
      const uploaded = await uploadFiles(api, mediaFiles, "news");
      const payload = { ...form };
      payload.media_urls = [...existingMedia.map((item) => item.file_url), ...uploaded.map((item) => item.url)];
      await api.request(`/news/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      setMediaFiles([]);
      setShowForm(false);
      load();
    } catch (e) { setError(e.message); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Hapus berita ${item.title}?`)) return;
    try {
      await api.request(`/news/${item.id}`, { method: "DELETE" });
      load();
    } catch (e) { setError(e.message); }
  };
  const rows = asArray(items);
  return (
    <section className="page home-page">
      <div className="home-toolbar">
        <input className="search-input" placeholder="Cari berita" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        {isAdmin && <button className="primary fab-icon" type="button" onClick={openCreate} title="Tambah berita"><Icon name="plus" /><span>Tambah</span></button>}
      </div>
      {error && <p className="notice">{error}</p>}
      <div className="feed news-feed">
        {rows.map((item) => <NewsCard key={item.id} item={item} api={api} reload={load} isAdmin={isAdmin} onEdit={openEdit} onDelete={remove} />)}
        {!rows.length && <Empty text="Belum ada berita." />}
      </div>
      {showForm && (
        <Modal title={editing ? "Edit Berita" : "Tambah Berita"} onClose={() => { setShowForm(false); setEditing(null); }}>
          <form className="composer flat" onSubmit={editing ? update : create}>
            {error && <p className="notice">{error}</p>}
            <FormField label="Judul Berita"><input placeholder="Masukkan judul berita" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></FormField>
            <FormField label="Isi Berita"><textarea placeholder="Tulis isi berita" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required /></FormField>
            <label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Aktif</span></label>
            <div className="file-field"><span>Upload attachment opsional</span>{editing && <ExistingUploadPreviews items={existingMedia} onRemove={(item) => setExistingMedia((current) => current.filter((media) => media.id !== item.id))} emptyText="Belum ada attachment tersimpan." />}<div className="upload-inputs"><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => setMediaFiles(e.target.files)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setMediaFiles(e.target.files)} /></label></div><ImageUploadPreview files={mediaFiles} /></div>
            <button className="primary">{editing ? "Simpan berita" : "Publikasikan"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function NewsCard({ item, api, reload, isAdmin, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [slide, setSlide] = useState(0);
  const [imagePreview, setImagePreview] = useState("");
  const content = item.content || "";
  const media = asArray(item.media).length ? asArray(item.media).map((mediaItem) => mediaItem.file_url) : (item.cover_image_url ? [item.cover_image_url] : []);
  const imageMedia = media.filter(isImageFile);
  const attachmentMedia = media.filter((href) => !isImageFile(href));
  const activeSlide = imageMedia[slide % Math.max(imageMedia.length, 1)];
  const dateLabel = formatDisplayDate(item.published_at || item.created_at || item.updated_at);
  const loadComments = () => api.request(`/news/${item.id}/comments`).then((data) => setComments(asArray(data))).catch(() => setComments([]));
  const toggle = async () => {
    setOpen(!open);
    if (!open) loadComments();
  };
  const like = async () => { await api.request(`/news/${item.id}/like`, { method: "POST" }); reload(); };
  const deleteComment = async (commentItem) => {
    if (!window.confirm("Hapus komentar ini?")) return;
    await api.request(`/news/${item.id}/comments/${commentItem.id}`, { method: "DELETE" });
    loadComments();
    reload();
  };
  const postComment = async (e) => {
    e.preventDefault();
    await api.request(`/news/${item.id}/comments`, { method: "POST", body: JSON.stringify({ comment }) });
    setComment("");
    loadComments();
    reload();
  };
  return (
    <article className="card news-card">
      <div className="news-card-head">
        <h3>{item.title}</h3>
        {dateLabel && <time>{dateLabel}</time>}
      </div>
      {activeSlide && (
        <div className="carousel">
          <button className="image-button" type="button" onClick={() => setImagePreview(activeSlide)}><img src={publicUrl(activeSlide)} alt="" /></button>
          {imageMedia.length > 1 && <><button type="button" className="carousel-prev" onClick={() => setSlide((slide + imageMedia.length - 1) % imageMedia.length)}>‹</button><button type="button" className="carousel-next" onClick={() => setSlide((slide + 1) % imageMedia.length)}>›</button><span className="carousel-count">{slide + 1}/{imageMedia.length}</span></>}
        </div>
      )}
      <div className="card-body">
        <p className="preserve-text">{expanded ? content : content.slice(0, 120)}{!expanded && content.length > 120 ? "…" : ""}</p>
        {content.length > 120 && <button className="more-button" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Less" : "More"}</button>}
        {!!attachmentMedia.length && <div className="attachment-list">{attachmentMedia.map((href) => <UploadedFileLink key={href} href={href} label="Attachment berita" />)}</div>}
        <div className="social-actions">
          <button type="button" className={item.liked_by_me ? "liked" : ""} onClick={like} title="Like"><Icon name="heart" /><span>{item.likes_count || 0} Suka</span></button>
          <button type="button" onClick={toggle} title="Komentar"><Icon name="comment" /><span>{item.comments_count || 0} Komentar</span></button>
          <button type="button" title="Bagikan"><Icon name="send" /><span>Bagikan</span></button>
          <button type="button" title="Simpan"><Icon name="bookmark" /></button>
        </div>
        {isAdmin && <div className="row actions"><button type="button" onClick={() => onEdit(item)}>Edit</button><button type="button" onClick={() => onDelete(item)}>Delete</button><span className={`status ${item.is_active ? "approved" : "rejected"}`}>{item.is_active ? "active" : "non active"}</span></div>}
        {open && <div className="comments">{asArray(comments).map((c) => <div className="comment-item" key={c.id}><div><strong>{c.author_name || "Pengguna"}</strong><time>{formatDateTime(c.created_at)}</time></div><p>{c.comment}</p>{c.user_id === api.user.id && <button type="button" onClick={() => deleteComment(c)}>Delete</button>}</div>)}<form onSubmit={postComment} className="inline-form"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tulis komentar" required /><button>Kirim</button></form></div>}
      </div>
      {imagePreview && <AttachmentPreview href={imagePreview} label={item.title} onClose={() => setImagePreview("")} />}
    </article>
  );
}

function formatDisplayDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function TransactionTracking({ createdBy, createdAt, events = [] }) {
  const rows = [{ label: "Transaksi dibuat", actor: createdBy, at: createdAt }, ...events].filter((item) => item.at || item.actor || item.note);
  if (!rows.length) return null;
  return <section className="transaction-tracking"><h4>Tracking Transaksi</h4><div className="tracking-list">{rows.map((item, index) => <div className="tracking-item" key={`${item.label}-${item.at || index}`}><span className="tracking-dot" /><div><strong>{item.label}</strong>{item.actor && <span>Oleh: {item.actor}</span>}{item.at && <time>{formatDateTime(item.at)}</time>}{item.note && <p>{item.note}</p>}</div></div>)}</div></section>;
}

function letterStatusLabel(status) {
  return {
    dikirim: "Dikirim",
    diproses: "Diproses",
    selesai: "Selesai",
    dibatalkan: "Dibatalkan",
  }[status] || status || "-";
}

function familyMemberTypeLabel(type) {
  return {
    kepala_keluarga: "Kepala keluarga",
    anggota_keluarga: "Anggota keluarga",
    keluarga_tidak_serumah: "Keluarga Tidak Serumah",
  }[type] || "Anggota keluarga";
}

function houseStatusLabel(status) {
  return { dihuni: "Dihuni", disewakan: "Disewakan", sita_bank: "Sita Bank", dikosongkan: "Dikosongkan" }[status] || status || "-";
}

function overlapsCalendarMonth(item, cursor) {
  const start = new Date(item.start_datetime);
  const end = new Date(item.end_datetime || item.start_datetime);
  if (Number.isNaN(start.getTime())) return false;
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
  return start <= monthEnd && end >= monthStart;
}

function RequestHub({ api, isAdmin, isSecurity }) {
  const [section, setSection] = useState(() => (
    window.history.state?.rukunSubview === "request" && window.history.state?.rukunSection
      ? window.history.state.rukunSection
      : "menu"
  ));
  const isResident = api.user.role === "penghuni";
  const isAdministrator = api.user.role === "administrator";
  const isPurchaseStaff = ["security", "supports"].includes(api.user.role);
  const canRequestPurchase = isAdmin || isPurchaseStaff;
  const purchaseMenuItem = { key: "purchase-requests", icon: "file", title: "Permintaan Pembelian", desc: "Ajukan dan pantau pembelian operasional" };
  const managementReportMenuItem = { key: "management-reports", icon: "report", title: "Laporan Pengelola", desc: "Laporan shift dan insidensial operasional" };
  const baseMenuItems = [
    { key: "reports", icon: "report", title: "Laporan Penghuni", desc: "Laporkan masalah komplek" },
    { key: "letters", icon: "file", title: "Surat-Menyurat", desc: "Administrasi surat menyurat" },
    { key: "marketplace", icon: "newspaper", title: "Marketplace", desc: "Jual barang atau jasa warga" },
    { key: "voting", icon: "vote", title: "Voting", desc: "Lihat dan submit voting warga" },
    { key: "booking", icon: "calendar", title: "Fasilitas Penghuni", desc: "Ajukan pemakaian fasilitas" },
    { key: "news", icon: "newspaper", title: "Berita dan Update", desc: "Kirim berita untuk direview admin" },
  ];
  const residentReportItem = baseMenuItems[0];
  const letterItem = baseMenuItems[1];
  const marketplaceItem = baseMenuItems[2];
  const votingItem = baseMenuItems[3];
  const bookingItem = baseMenuItems[4];
  const newsItem = baseMenuItems[5];
  const eventItem = { key: "events", icon: "calendar", title: "Acara Penghuni", desc: "Agenda komplek untuk kalender" };
  const accessItems = [
    { key: "registrations", icon: "users", title: "Request Pendaftaran", desc: "Validasi pendaftaran penghuni" },
    { key: "residents", icon: "building", title: "Kelola ID Penghuni", desc: "CRUD Pengurus, Penghuni, Security, dan Supports" },
  ];
  const navigationGroups = isAdmin
    ? [
      { title: "Administrasi", items: [residentReportItem, managementReportMenuItem, purchaseMenuItem, letterItem] },
      { title: "Fasilitas dan Fitur", items: [bookingItem, marketplaceItem, votingItem] },
      { title: "Event & News", items: [newsItem, eventItem] },
      ...(isAdministrator ? [{ title: "Hak Akses Penghuni", items: accessItems }] : []),
    ]
    : isPurchaseStaff
      ? [{ title: "Administrasi", items: [managementReportMenuItem, purchaseMenuItem] }]
      : [
        { title: "Administrasi", items: [residentReportItem, letterItem] },
        { title: "Fasilitas dan Fitur", items: [bookingItem, marketplaceItem, votingItem] },
        { title: "Event & News", items: [newsItem] },
      ];
  const openSection = (nextSection) => {
    const { rukunModalId, ...currentState } = window.history.state || {};
    window.history.pushState({ ...currentState, rukunApp: true, rukunSubview: "request", rukunSection: nextSection }, "");
    setSection(nextSection);
  };
  const closeSection = () => {
    if (window.history.state?.rukunSubview === "request") {
      window.history.back();
    } else {
      setSection("menu");
    }
  };
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state?.rukunModalId) return;
      if (event.state?.rukunSubview === "request" && event.state?.rukunSection) {
        setSection(event.state.rukunSection);
      } else {
        setSection("menu");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  return (
    <section className="page request-page">
      {section === "menu" && (
        <>
          <div className="page-head"><h2>Navigasi</h2></div>
          <div className="navigation-groups">
            {navigationGroups.map((group) => <section className="navigation-group" key={group.title}><h3>{group.title}</h3><div className="request-grid">{group.items.map((item) => <button key={item.key} type="button" className="request-tile" onClick={() => openSection(item.key)}><Icon name={item.icon} /><span><strong>{item.title}</strong><small>{item.desc}</small></span></button>)}</div></section>)}
          </div>
        </>
      )}
      {section !== "menu" && <div className="subnav"><button className="subnav-back" type="button" onClick={closeSection}><Icon name="back" /><span>Kembali</span></button></div>}
      {section === "letters" && <Letters api={api} isAdmin={isAdmin} />}
      {section === "marketplace" && <MarketplaceRequests api={api} isAdmin={isAdmin} />}
      {section === "purchase-requests" && canRequestPurchase && <PurchaseRequests api={api} />}
      {section === "management-reports" && (isAdmin || isPurchaseStaff) && <ManagementReports api={api} isAdmin={isAdmin} />}
      {section === "voting" && <Voting api={api} isAdmin={isAdmin} />}
      {section === "booking" && <Booking api={api} isAdmin={isAdmin} />}
      {section === "news" && <NewsContribution api={api} />}
      {section === "reports" && <Reports api={api} isAdmin={isAdmin} isSecurity={isSecurity} />}
      {section === "registrations" && isAdministrator && <RegistrationRequests api={api} />}
      {section === "residents" && isAdministrator && <ResidentManagement api={api} />}
      {section === "events" && isAdmin && <Events api={api} />}
    </section>
  );
}

function Booking({ api, isAdmin, calendarOnly = false }) {
  const [facilities, setFacilities] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [events, setEvents] = useState([]);
  const [view, setView] = useState("facilities");
  const [facilityQuery, setFacilityQuery] = useState("");
  const [bookingQuery, setBookingQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [facilityForm, setFacilityForm] = useState({ name: "", color_hex: "#2f6690", description: "", capacity: 20 });
  const [facilityFiles, setFacilityFiles] = useState([]);
  const [existingFacilityMedia, setExistingFacilityMedia] = useState([]);
  const [bookingForm, setBookingForm] = useState({ start_datetime: "", end_datetime: "", notes: "" });
  const [facilityModal, setFacilityModal] = useState(false);
  const [bookingModal, setBookingModal] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [editingBooking, setEditingBooking] = useState(null);
  const load = () => {
    setMessage("");
    const bookingPath = calendarOnly ? "/facilities/bookings?scope=calendar" : "/facilities/bookings";
    Promise.all([api.request("/facilities"), api.request(bookingPath), api.request("/events").catch(() => [])])
      .then(([facilityRows, bookingRows, eventRows]) => {
        setFacilities(asArray(facilityRows));
        setBookings(asArray(bookingRows));
        setEvents(asArray(eventRows));
      })
      .catch((error) => {
        setFacilities([]);
        setBookings([]);
        setEvents([]);
        setMessage(error.message);
      });
  };
  useEffect(() => {
    load();
  }, []);
  const createFacility = async (event) => {
    event.preventDefault();
    try {
      const uploaded = await uploadFiles(api, facilityFiles, "facilities");
      await api.request("/facilities", { method: "POST", body: JSON.stringify({ ...facilityForm, capacity: Number(facilityForm.capacity), media_urls: uploaded.map((item) => item.url) }) });
      setFacilityForm({ name: "", color_hex: "#2f6690", description: "", capacity: 20 });
      setFacilityFiles([]);
      setFacilityModal(false);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const updateFacility = async (event) => {
    event.preventDefault();
    try {
      const uploaded = await uploadFiles(api, facilityFiles, "facilities");
      const payload = { ...facilityForm, capacity: Number(facilityForm.capacity) };
      payload.media_urls = [...existingFacilityMedia.map((item) => item.file_url), ...uploaded.map((item) => item.url)];
      await api.request(`/facilities/${editingFacility.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditingFacility(null);
      setFacilityFiles([]);
      setFacilityModal(false);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const openFacility = (facility = null) => {
    setMessage("");
    setEditingFacility(facility);
    setFacilityFiles([]);
    setExistingFacilityMedia(asArray(facility?.media));
    setFacilityForm(facility ? { name: facility.name || "", color_hex: facility.color_hex || "#2f6690", description: facility.description || "", capacity: facility.capacity || 20 } : { name: "", color_hex: "#2f6690", description: "", capacity: 20 });
    setFacilityModal(true);
  };
  const deleteFacility = async (facility) => {
    if (!window.confirm(`Hapus fasilitas ${facility.name}?`)) return;
    try { await api.request(`/facilities/${facility.id}`, { method: "DELETE" }); load(); } catch (error) { setMessage(error.message); }
  };
  const createBooking = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      if (!selected) throw new Error("Pilih fasilitas terlebih dahulu.");
      await api.request("/facilities/bookings", { method: "POST", body: JSON.stringify({ ...bookingForm, facility_id: selected.id }) });
      setBookingForm({ start_datetime: "", end_datetime: "", notes: "" });
      setBookingModal(false);
      load();
    } catch (e) { setMessage(e.message); }
  };
  const openBooking = (facility) => {
    setMessage("");
    setSelected(facility);
    setEditingBooking(null);
    setBookingForm(defaultBookingForm());
    setBookingModal(true);
  };
  const openEditBooking = (booking) => {
    setMessage("");
    setEditingBooking(booking);
    setSelected(facilities.find((facility) => facility.id === booking.facility_id) || null);
    setBookingForm({ start_datetime: toDateTimeLocal(booking.start_datetime), end_datetime: toDateTimeLocal(booking.end_datetime), notes: booking.notes || "", status: booking.status });
    setBookingModal(true);
  };
  const updateBooking = async (event) => {
    event.preventDefault();
    try {
      await api.request(`/facilities/bookings/${editingBooking.id}`, { method: "PATCH", body: JSON.stringify({ ...bookingForm, facility_id: selected?.id || editingBooking.facility_id }) });
      setEditingBooking(null);
      setBookingModal(false);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const deleteBooking = async (booking) => {
    if (!window.confirm(`Hapus booking ${booking.facility_name}?`)) return;
    try { await api.request(`/facilities/bookings/${booking.id}`, { method: "DELETE" }); load(); } catch (error) { setMessage(error.message); }
  };
  const filteredFacilities = asArray(facilities).filter((facility) => [facility.name, facility.description].join(" ").toLowerCase().includes(facilityQuery.toLowerCase()));
  const searchableBookings = asArray(bookings).filter((booking) => statusFilter === "all" || booking.status === statusFilter);
  const filteredBookings = searchableBookings.filter((booking) => [booking.facility_name, booking.requester_name, booking.status, booking.notes].join(" ").toLowerCase().includes(bookingQuery.toLowerCase()));
  const approvedMonthBookings = filteredBookings.filter((booking) => booking.status === "approved" && overlapsCalendarMonth(booking, calendarCursor));
  const monthEvents = asArray(events).filter((event) => overlapsCalendarMonth(event, calendarCursor));
  if (calendarOnly) {
    return (
      <section className="page">
        <div className="page-head"><h2>Jadwal</h2><button type="button" className="icon-only" onClick={load} title="Refresh"><Icon name="calendar" /></button></div>
        {message && <p className="notice">{message}</p>}
        <Calendar bookings={approvedMonthBookings} events={monthEvents} cursor={calendarCursor} onCursorChange={setCalendarCursor} />
        <div className="list">
          {monthEvents.map((item) => <div className="list-item" key={`event-${item.id}`}><strong>{item.title}</strong><span>{new Date(item.start_datetime).toLocaleString()} {item.location ? `- ${item.location}` : ""}</span>{item.description && <p>{item.description}</p>}</div>)}
          {approvedMonthBookings.map((b) => <BookingListItem key={`booking-${b.id}`} booking={b} />)}
        </div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head"><h2>Booking Fasilitas</h2>{isAdmin && <button className="primary" type="button" onClick={() => openFacility()}>Tambah Fasilitas</button>}</div>
      {message && <p className="notice">{message}</p>}
      <div className="tabs"><button className={view === "facilities" ? "active" : ""} type="button" onClick={() => setView("facilities")}>List Fasilitas</button><button className={view === "calendar" ? "active" : ""} type="button" onClick={() => setView("calendar")}>Calendar</button></div>
      {view === "facilities" && <><input className="search-input" placeholder="Cari fasilitas" value={facilityQuery} onChange={(e) => setFacilityQuery(e.target.value)} /><div className="grid">{filteredFacilities.map((item) => { const image = asArray(item.media)[0]?.file_url || item.image_url; return <div key={item.id} className="facility-card" style={{ borderColor: item.color_hex }}>{image && <img src={publicUrl(image)} alt="" />}<div className="facility-swatch" style={{ background: item.color_hex }} /><strong>{item.name}</strong><span>Kapasitas {item.capacity || "-"}</span><div className="row actions facility-actions">{!isAdmin && <button className="action-book" type="button" onClick={() => openBooking(item)}><Icon name="calendar" />Booking</button>}{isAdmin && <><button className="action-edit" type="button" onClick={() => openFacility(item)}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={() => deleteFacility(item)}><Icon name="trash" />Delete</button></>}</div></div>; })}</div></>}
      {view === "calendar" && <><div className="toolbar-row"><input className="search-input" placeholder="Cari booking approved" value={bookingQuery} onChange={(e) => setBookingQuery(e.target.value)} /></div><Calendar bookings={approvedMonthBookings} events={monthEvents} cursor={calendarCursor} onCursorChange={setCalendarCursor} /><div className="list">{approvedMonthBookings.map((b) => <BookingListItem key={b.id} booking={b}>{isAdmin && <StatusButtons api={api} booking={b} reload={load} />}<div className="row actions"><button className="action-edit" type="button" onClick={() => openEditBooking(b)}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={() => deleteBooking(b)}><Icon name="trash" />Delete</button></div></BookingListItem>)}</div>{!isAdmin && asArray(facilities).length > 0 && <button className="floating-add" type="button" onClick={() => openBooking(facilities[0])} aria-label="Tambah booking fasilitas" title="Tambah booking fasilitas"><Icon name="plus" /></button>}</>}
      {facilityModal && <Modal title={editingFacility ? "Edit Fasilitas" : "Tambah Fasilitas"} onClose={() => setFacilityModal(false)}><form className="composer flat" onSubmit={editingFacility ? updateFacility : createFacility}>{message && <p className="notice">{message}</p>}<FormField label="Nama Fasilitas"><input placeholder="Masukkan nama fasilitas" value={facilityForm.name} onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })} required /></FormField><div className="row color-row"><FormField label="Warna"><div className="color-input"><span className="color-preview" style={{ background: facilityForm.color_hex }} /><input type="color" value={facilityForm.color_hex} onChange={(e) => setFacilityForm({ ...facilityForm, color_hex: e.target.value })} /></div></FormField><FormField label="Kapasitas"><input type="number" min="0" placeholder="Jumlah orang" value={facilityForm.capacity} onChange={(e) => setFacilityForm({ ...facilityForm, capacity: e.target.value })} /></FormField></div><div className="file-field"><span>Upload Media Fasilitas</span>{editingFacility && <ExistingUploadPreviews items={existingFacilityMedia} onRemove={(item) => setExistingFacilityMedia((current) => current.filter((media) => media.id !== item.id))} emptyText="Belum ada media tersimpan." />}<div className="upload-inputs"><input type="file" accept="image/*" multiple onChange={(e) => setFacilityFiles(e.target.files)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setFacilityFiles(e.target.files)} /></label></div><ImageUploadPreview files={facilityFiles} /></div><FormField label="Deskripsi"><textarea placeholder="Tulis deskripsi fasilitas" value={facilityForm.description} onChange={(e) => setFacilityForm({ ...facilityForm, description: e.target.value })} /></FormField><button className="primary">{editingFacility ? "Simpan fasilitas" : "Tambah fasilitas"}</button></form></Modal>}
      {bookingModal && <Modal title={editingBooking ? "Edit Booking" : `Booking ${selected?.name || ""}`} onClose={() => setBookingModal(false)}><form className="composer flat" onSubmit={editingBooking ? updateBooking : createBooking}>{message && <p className="notice">{message}</p>}<FormField label="Fasilitas"><select value={selected?.id || ""} onChange={(e) => setSelected(facilities.find((facility) => String(facility.id) === e.target.value) || null)}>{asArray(facilities).map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></FormField><div className="row"><FormField label="Mulai"><input type="datetime-local" value={bookingForm.start_datetime} onChange={(e) => setBookingForm({ ...bookingForm, start_datetime: e.target.value })} required /></FormField><FormField label="Selesai"><input type="datetime-local" value={bookingForm.end_datetime} onChange={(e) => setBookingForm({ ...bookingForm, end_datetime: e.target.value })} required /></FormField></div><FormField label="Catatan"><textarea placeholder="Tambahkan catatan bila diperlukan" value={bookingForm.notes} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} /></FormField>{editingBooking && isAdmin && <FormField label="Status Booking"><select value={bookingForm.status} onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value })}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></FormField>}<button className="primary">{editingBooking ? "Simpan booking" : "Ajukan booking"}</button></form></Modal>}
    </section>
  );
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultBookingForm() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start_datetime: toDateTimeLocal(start.toISOString()), end_datetime: toDateTimeLocal(end.toISOString()), notes: "" };
}

function BookingListItem({ booking, children }) {
  const isMultiDay = new Date(booking.end_datetime).toDateString() !== new Date(booking.start_datetime).toDateString();
  return (
    <div className={`list-item booking-item ${booking.status}`} key={booking.id}>
      <strong>{booking.facility_name}</strong>
      <span>Requester: {booking.requester_name || "Penghuni"}</span>
      <span>{formatDateTime(booking.start_datetime)}{isMultiDay ? ` - ${formatDateTime(booking.end_datetime)}` : ""}</span>
      <span>Status: {booking.status}</span>
      {booking.notes && <p>{booking.notes}</p>}
      {children}
    </div>
  );
}

function StatusButtons({ api, booking, reload }) {
  const setStatus = async (status) => { await api.request(`/facilities/bookings/${booking.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); reload(); };
  if (["approved", "rejected", "cancelled"].includes(booking.status)) return null;
  return <div className="row"><button onClick={() => setStatus("approved")}>Approve</button><button onClick={() => setStatus("rejected")}>Reject</button></div>;
}

function Calendar({ bookings, events = [], cursor: externalCursor, onCursorChange }) {
  const today = new Date();
  const [internalCursor, setInternalCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const cursor = externalCursor || internalCursor;
  const moveCursor = (next) => {
    if (onCursorChange) onCursorChange(next);
    else setInternalCursor(next);
  };
  const rows = asArray(bookings);
  const eventRows = asArray(events);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const cells = [...Array.from({ length: firstDay }, (_, i) => ({ blank: true, key: `b-${i}` })), ...Array.from({ length: totalDays }, (_, i) => ({ day: i + 1, key: `d-${i + 1}` }))];
  const years = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 3 + i);
  const inDayRange = (startValue, endValue, day) => {
    const start = new Date(startValue);
    const end = new Date(endValue || startValue);
    if (Number.isNaN(start.getTime())) return false;
    const current = new Date(year, month, day, 23, 59, 59);
    const dayStart = new Date(year, month, day, 0, 0, 0);
    return start <= current && end >= dayStart;
  };
  return (
    <div className="calendar-wrap">
      <div className="calendar-controls">
        <button type="button" className="icon-only" onClick={() => moveCursor(new Date(year, month - 1, 1))} title="Bulan sebelumnya">‹</button>
        <select value={month} onChange={(e) => moveCursor(new Date(year, Number(e.target.value), 1))}>
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{new Date(2024, i, 1).toLocaleDateString("id-ID", { month: "long" })}</option>)}
        </select>
        <select value={year} onChange={(e) => moveCursor(new Date(Number(e.target.value), month, 1))}>
          {years.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="icon-only" onClick={() => moveCursor(new Date(year, month + 1, 1))} title="Bulan berikutnya">›</button>
      </div>
      <div className="calendar-weekdays">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar">
        {cells.map((cell) => cell.blank ? <div className="day muted-day" key={cell.key} /> : (
          <div className="day" key={cell.key}>
            <span>{cell.day}</span>
            {eventRows.filter((e) => inDayRange(e.start_datetime, e.end_datetime, cell.day)).slice(0, 2).map((e) => <i key={`e-${e.id}`} className="event-dot">{e.title}</i>)}
            {rows.filter((b) => inDayRange(b.start_datetime, b.end_datetime, cell.day)).slice(0, 2).map((b) => <i key={`b-${b.id}`} className="span-line" style={{ background: b.facility_color_hex || "#2b8fbd" }}>{b.facility_name} - {b.requester_name || "Penghuni"}</i>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function QrScanner() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [stream, setStream] = useState(null);
  const videoRef = React.useRef(null);
  const startCamera = async () => {
    setStatus("");
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(nextStream);
      if (videoRef.current) {
        videoRef.current.srcObject = nextStream;
        await videoRef.current.play();
      }
    } catch (error) {
      setStatus(error.message || "Kamera belum bisa dibuka.");
    }
  };
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  return (
    <section className="page qr-page">
      <div className="page-head"><h2>Scan QR</h2><button className="icon-only" type="button" onClick={startCamera} title="Buka kamera"><Icon name="qr" /></button></div>
      {status && <p className="notice">{status}</p>}
      <div className="qr-preview"><video ref={videoRef} muted playsInline /></div>
      <textarea placeholder="Text hasil QR" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="list-item">
        <span>Hasil scan</span>
        <strong>{text || "-"}</strong>
      </div>
    </section>
  );
}

function Voting({ api, isAdmin }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ title: "", description: "", image_url: "", start_date: "", end_date: "", options: "Setuju\nTidak setuju", is_active: false });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => api.request("/votings").then((data) => setItems(asArray(data))).catch((error) => { setItems([]); setMessage(error.message); });
  useEffect(() => {
    load();
  }, []);
  const create = async (e) => {
    e.preventDefault();
    try {
      await api.request("/votings", { method: "POST", body: JSON.stringify({ ...form, options: form.options.split("\n").filter(Boolean) }) });
      setShowForm(false);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const openCreate = () => { setMessage(""); setEditing(null); setForm({ title: "", description: "", image_url: "", start_date: "", end_date: "", options: "Setuju\nTidak setuju", is_active: false }); setShowForm(true); };
  const openEdit = (item) => { setMessage(""); setEditing(item); setForm({ title: item.title || "", description: item.description || "", image_url: item.image_url || "", start_date: toDateTimeLocal(item.start_date), end_date: toDateTimeLocal(item.end_date), options: asArray(item.options).map((option) => option.option_text).join("\n"), is_active: item.is_active === true }); setShowForm(true); };
  const update = async (e) => {
    e.preventDefault();
    try {
      await api.request(`/votings/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...form, options: form.options.split("\n").filter(Boolean) }) });
      setEditing(null);
      setShowForm(false);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Hapus voting ${item.title}?`)) return;
    try { await api.request(`/votings/${item.id}`, { method: "DELETE" }); load(); } catch (error) { setMessage(error.message); }
  };
  const togglePublish = async (item) => {
    try { await api.request(`/votings/${item.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) }); load(); } catch (error) { setMessage(error.message); }
  };
  const filteredItems = asArray(items).filter((item) => [item.title, item.description].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <section className="page"><div className="page-head"><h2>Voting</h2><input className="search-input" placeholder="Cari voting" value={query} onChange={(e) => setQuery(e.target.value)} />{isAdmin && <button className="primary" type="button" onClick={openCreate}>Tambah Voting</button>}</div>{message && <p className="notice">{message}</p>}<div className="feed">{filteredItems.map((v) => <VotingCard key={v.id} item={v} api={api} reload={load} isAdmin={isAdmin} onEdit={openEdit} onDelete={remove} onTogglePublish={togglePublish} />)}{!filteredItems.length && <Empty text="Belum ada voting aktif." />}</div>{showForm && <Modal title={editing ? "Edit Voting" : "Tambah Voting"} onClose={() => { setShowForm(false); setEditing(null); }}><form className="composer flat" onSubmit={editing ? update : create}>{message && <p className="notice">{message}</p>}<FormField label="Judul Voting"><input placeholder="Masukkan judul voting" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></FormField><FormField label="Deskripsi"><textarea placeholder="Jelaskan voting ini" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></FormField><FormField label="URL Gambar"><input placeholder="https://... (opsional)" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></FormField><div className="row"><FormField label="Mulai"><input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></FormField><FormField label="Selesai"><input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required /></FormField></div><FormField label="Pilihan Voting"><textarea placeholder="Satu pilihan per baris" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} /></FormField><label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Publish</span></label><button className="primary">{editing ? "Simpan voting" : "Buka voting"}</button></form></Modal>}</section>;
}

function VotingCard({ item, api, reload, isAdmin, onEdit, onDelete, onTogglePublish }) {
  const vote = async (option_id) => { await api.request(`/votings/${item.id}/vote`, { method: "POST", body: JSON.stringify({ option_id }) }); reload(); };
  return <article className="card">{item.image_url && <img src={publicUrl(item.image_url)} alt="" />}<div className="card-body"><div className="item-heading"><h3>{item.title}</h3>{isAdmin && <span className={`status ${item.is_active ? "approved" : "pending"}`}>{item.is_active ? "published" : "draft"}</span>}</div><p>{item.description}</p>{asArray(item.options).map((o) => <label className="choice" key={o.id}><input type="radio" checked={item.my_option_id === o.id} onChange={() => vote(o.id)} disabled={isAdmin} /> <span>{o.option_text}</span><b>{o.votes_count}</b>{isAdmin && !!asArray(o.voters).length && <small>{asArray(o.voters).join(", ")}</small>}</label>)}{isAdmin && <div className="row actions"><button type="button" onClick={() => onEdit(item)}>Edit</button><button type="button" onClick={() => onTogglePublish(item)}>{item.is_active ? "Unpublish" : "Publish"}</button><button type="button" onClick={() => onDelete(item)}>Delete</button></div>}</div></article>;
}

function NewsContribution({ api }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: "", content: "", is_active: false });
  const [files, setFiles] = useState([]);
  const [existingMedia, setExistingMedia] = useState([]);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const isResident = api.user.role === "penghuni";
  const load = () => api.request(api.user.role === "penghuni" ? "/news/contributions/mine" : "/news").then((data) => setItems(asArray(data))).catch((error) => setMessage(error.message));
  useEffect(() => { load(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const uploaded = await uploadFiles(api, files, "news-contributions");
      await api.request("/news/contributions", { method: "POST", body: JSON.stringify({ ...form, media_urls: uploaded.map((item) => item.url) }) });
      setForm({ title: "", content: "", is_active: false });
      setFiles([]);
      setShowForm(false);
      setMessage("Berita terkirim dan menunggu review Admin Komplek.");
      load();
    } catch (error) { setMessage(error.message); }
  };
  const openEdit = (item) => {
    setEditing(item);
    setFiles([]);
    setExistingMedia(asArray(item.media));
    setForm({ title: item.title || "", content: item.content || "", is_active: item.is_active !== false });
    setShowForm(true);
  };
  const saveReview = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const uploaded = await uploadFiles(api, files, "news");
      const payload = { ...form };
      payload.media_urls = [...existingMedia.map((item) => item.file_url), ...uploaded.map((item) => item.url)];
      await api.request(isResident ? `/news/contributions/${editing.id}` : `/news/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      setFiles([]);
      setShowForm(false);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const togglePublish = async (item) => {
    setMessage("");
    try {
      await api.request(`/news/${item.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) });
      load();
    } catch (error) { setMessage(error.message); }
  };
  return (
    <section className="page">
      <div className="page-head"><h2>News Contribute</h2>{isResident && <button className="primary" type="button" onClick={() => { setEditing(null); setForm({ title: "", content: "", is_active: false }); setShowForm(true); }}>Tambah</button>}</div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {items.map((item) => <div className="list-item" key={item.id}><div className="item-heading"><strong>{item.title}</strong><span className={`status ${item.is_active ? "approved" : "pending"}`}>{item.is_active ? "published" : "review"}</span></div><p>{item.content}</p><div className="attachment-list">{asArray(item.media).map((file) => <UploadedFileLink key={file.id} href={file.file_url} label={file.file_name || "Attachment berita"} />)}</div><div className="row actions"><button type="button" onClick={() => openEdit(item)}>Edit</button>{!isResident && <button type="button" onClick={() => togglePublish(item)}>{item.is_active ? "Unpublish" : "Publish"}</button>}</div></div>)}
        {!items.length && <Empty text="Belum ada kontribusi berita." />}
      </div>
      {showForm && <Modal title={editing ? "Review News" : "News Contribute"} onClose={() => { setShowForm(false); setEditing(null); }}><form className="composer flat" onSubmit={editing ? saveReview : submit}><FormField label="Judul Berita"><input placeholder="Masukkan judul berita" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></FormField><FormField label="Isi Berita"><textarea placeholder="Tulis isi berita" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required /></FormField>{editing && <label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Publish</span></label>}<div className="file-field"><span>Upload Attachment (Opsional)</span>{editing && <ExistingUploadPreviews items={existingMedia} onRemove={(item) => setExistingMedia((current) => current.filter((media) => media.id !== item.id))} emptyText="Belum ada attachment tersimpan." />}<div className="upload-inputs"><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => setFiles(e.target.files)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setFiles(e.target.files)} /></label></div><ImageUploadPreview files={files} /></div><button className="primary">{editing ? "Simpan review" : "Kirim review"}</button></form></Modal>}
    </section>
  );
}

function Reports({ api, isAdmin, isSecurity, startOpen = false }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ category: "Keamanan", title: "", description: "", location: "", priority: "normal" });
  const [followForm, setFollowForm] = useState({ note: "", status_after: "open" });
  const [files, setFiles] = useState([]);
  const [followFiles, setFollowFiles] = useState([]);
  const [active, setActive] = useState(null);
  const [showForm, setShowForm] = useState(startOpen);
  const [message, setMessage] = useState("");
  const canHandle = isAdmin || isSecurity;
  const load = () => api.request("/reports").then((data) => setItems(asArray(data))).catch((error) => { setItems([]); setMessage(error.message); });
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const uploaded = await uploadFiles(api, files, "reports");
      await api.request("/reports", { method: "POST", body: JSON.stringify({ ...form, media_urls: uploaded.map((item) => item.url) }) });
      setForm({ category: "Keamanan", title: "", description: "", location: "", priority: "normal" });
      setFiles([]);
      setShowForm(false);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const follow = async (e) => {
    e.preventDefault();
    if (!active) return;
    setMessage("");
    try {
      const uploaded = await uploadFiles(api, followFiles, "report-followups");
      await api.request(`/reports/${active.id}/followups`, { method: "POST", body: JSON.stringify({ ...followForm, media_urls: uploaded.map((item) => item.url) }) });
      setFollowForm({ note: "", status_after: "open" });
      setFollowFiles([]);
      setActive(null);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const publish = async (item, action) => {
    setMessage("");
    try {
      await api.request(`/reports/${item.id}/${action}`, { method: "POST" });
      load();
    } catch (error) { setMessage(error.message); }
  };
  const removeAttachment = async (item, attachment) => {
    if (!window.confirm(`Hapus ${attachment.label || attachment.file_name || "file laporan"}?`)) return;
    try {
      const updated = await api.request(`/reports/${item.id}/attachments/${attachment.id}`, { method: "DELETE" });
      setItems((current) => current.map((row) => row.id === item.id ? updated : row));
    } catch (error) { setMessage(error.message); }
  };
  return (
    <section className="page">
      <div className="page-head"><h2>Laporan Penghuni</h2>{api.user.role === "penghuni" && <button className="primary" type="button" onClick={() => setShowForm(true)}>Tambah</button>}</div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {items.map((item) => (
          <div className="list-item" key={item.id}>
            <div className="item-heading"><strong>{item.title}</strong><span className={`status ${item.status === "closed" ? "approved" : "pending"}`}>{item.status}</span></div>
            <span>{item.category} - {item.priority} {item.location ? `- ${item.location}` : ""}</span>
            <p>{item.description}</p>
            <ExistingUploadPreviews items={item.attachments} onRemove={(attachment) => removeAttachment(item, attachment)} canRemove={(attachment) => attachment.uploaded_by === api.user.id} />
            <TransactionTracking createdBy={item.reporter_name || "Penghuni"} createdAt={item.created_at} events={asArray(item.followups).map((followup) => ({ label: followup.status_after === "closed" ? "Laporan ditutup" : "Tindak lanjut", actor: followup.handler_name || "Petugas", at: followup.created_at, note: followup.note }))} />
            {canHandle && <div className="row actions"><button className="action-process" type="button" onClick={() => setActive(item)}><Icon name="wrench" />Tindak lanjut</button>{isAdmin && <button className={item.published_news_id ? "action-delete" : "action-done"} type="button" onClick={() => publish(item, item.published_news_id ? "unpublish" : "publish")}><Icon name={item.published_news_id ? "trash" : "megaphone"} />{item.published_news_id ? "Unpublish News" : "Publish News"}</button>}</div>}
          </div>
        ))}
        {!items.length && <Empty text="Belum ada laporan." />}
      </div>
      {showForm && <Modal title="Buat Laporan" onClose={() => setShowForm(false)}><form className="composer flat" onSubmit={create}><FormField label="Kategori"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Keamanan</option><option>Kebersihan</option><option>Fasilitas</option><option>Infrastruktur</option><option>Lainnya</option></select></FormField><FormField label="Judul Laporan"><input placeholder="Masukkan judul laporan" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></FormField><FormField label="Detail Laporan"><textarea placeholder="Jelaskan masalah yang dilaporkan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></FormField><FormField label="Lokasi Kejadian"><input placeholder="Contoh: Blok A, gerbang utama" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></FormField><FormField label="Prioritas"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></FormField><div className="file-field"><span>Foto (Opsional)</span><div className="upload-inputs"><input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setFiles(e.target.files)} /></label></div><ImageUploadPreview files={files} /></div><button className="primary">Kirim laporan</button></form></Modal>}
      {active && <Modal title="Tindak Lanjut" onClose={() => setActive(null)}><form className="composer flat" onSubmit={follow}><FormField label="Update Tindak Lanjut"><textarea placeholder="Tulis pembaruan tindak lanjut" value={followForm.note} onChange={(e) => setFollowForm({ ...followForm, note: e.target.value })} required /></FormField><FormField label="Status Setelah Tindak Lanjut"><select value={followForm.status_after} onChange={(e) => setFollowForm({ ...followForm, status_after: e.target.value })}><option value="open">Open</option><option value="closed">Closed</option></select></FormField><div className="file-field"><span>Foto Hasil Tindak Lanjut</span><div className="upload-inputs"><input type="file" accept="image/*" multiple onChange={(e) => setFollowFiles(e.target.files)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setFollowFiles(e.target.files)} /></label></div><ImageUploadPreview files={followFiles} /></div><button className="primary">Simpan update</button></form></Modal>}
    </section>
  );
}

function ManagementReportMapController({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 17);
  }, [map, position?.[0], position?.[1]]);
  return null;
}

function ManagementReportMapEvents({ onChange }) {
  useMapEvents({
    click(event) {
      if (onChange) onChange(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function ManagementReportLocationPicker({ latitude, longitude, onChange }) {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  const hasPosition = latitude !== "" && longitude !== "" && Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);
  const position = hasPosition ? [parsedLatitude, parsedLongitude] : null;
  const center = position || [-6.2088, 106.8456];
  return <div className="management-location-map"><MapContainer center={center} zoom={position ? 17 : 11} scrollWheelZoom><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><ManagementReportMapEvents onChange={onChange} /><ManagementReportMapController position={position} />{position && <CircleMarker center={position} radius={9} pathOptions={{ color: "#087f8c", fillColor: "#31c8bd", fillOpacity: 0.9 }} />}</MapContainer><small>{onChange ? "Ketuk peta untuk memilih atau mengubah titik lokasi." : "Lokasi yang tersimpan pada laporan."}</small></div>;
}

function managementReportTypeLabel(type) {
  return { shift_change: "Laporan Ganti Shift", work_report: "Laporan Kerja", incidental: "Insidensial" }[type] || type || "-";
}

function managementReportStatusLabel(status) {
  return { pending: "Menunggu Review", approved: "Approved", rejected: "Reject" }[status] || status || "-";
}

function managementReportDateLabel(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function ManagementReportImages({ images = [] }) {
  if (!images.length) return null;
  return <div className="management-report-images">{images.map((url, index) => <AttachmentImageButton href={url} alt={`Foto laporan ${index + 1}`} key={`${url}-${index}`} />)}</div>;
}

function FormField({ label, children }) {
  return <div className="form-field"><span>{label}</span>{children}</div>;
}

function ManagementReports({ api, isAdmin }) {
  const initialForm = () => ({ report_type: "shift_change", report_date: new Date().toISOString().slice(0, 10), report_time: new Date().toTimeString().slice(0, 5), shift_incoming_user_id: "", shift_outgoing_user_id: "", resident_guest_count: "0", ojol_guest_count: "0", electricity_token: "", latitude: "", longitude: "", situation: "aman", notes: "" });
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [filter, setFilter] = useState(isAdmin ? "pending" : "");
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [active, setActive] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [message, setMessage] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const load = () => api.request(`/management-reports${filter ? `?report_status=${filter}` : ""}`).then((data) => setItems(asArray(data))).catch((error) => { setItems([]); setMessage(error.message); });
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { if (!isAdmin) api.request("/management-reports/staff").then((data) => setStaff(asArray(data))).catch(() => setStaff([])); }, [isAdmin]);
  const openDetail = (item) => { setActive(item); setRejectReason(item.rejection_reason || ""); };
  const closeForm = () => { setShowForm(false); setFiles([]); setForm(initialForm()); setLocationMessage(""); };
  const setLocation = (latitude, longitude) => {
    setForm((current) => ({ ...current, latitude: latitude.toFixed(7), longitude: longitude.toFixed(7) }));
    setLocationMessage("Lokasi berhasil dipilih.");
  };
  const detectLocation = () => {
    if (!navigator.geolocation) { setLocationMessage("Perangkat ini tidak mendukung deteksi lokasi."); return; }
    setLocationMessage("Mendeteksi lokasi saat ini…");
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation(position.coords.latitude, position.coords.longitude),
      () => setLocationMessage("Lokasi otomatis tidak tersedia. Izinkan akses lokasi atau pilih titik pada peta."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };
  useEffect(() => {
    if (showForm && form.report_type === "work_report" && !form.latitude && !form.longitude) detectLocation();
  }, [showForm, form.report_type]);
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const uploaded = await uploadFiles(api, files, "management-reports");
      await api.request("/management-reports", { method: "POST", body: JSON.stringify({ ...form, shift_incoming_user_id: form.shift_incoming_user_id ? Number(form.shift_incoming_user_id) : null, shift_outgoing_user_id: form.shift_outgoing_user_id ? Number(form.shift_outgoing_user_id) : null, resident_guest_count: Number(form.resident_guest_count), ojol_guest_count: Number(form.ojol_guest_count), electricity_token: form.electricity_token === "" ? null : Number(form.electricity_token), latitude: form.latitude === "" ? null : Number(form.latitude), longitude: form.longitude === "" ? null : Number(form.longitude), image_urls: uploaded.map((item) => item.url) }) });
      closeForm();
      await load();
      setMessage("Laporan pengelola berhasil dikirim untuk review Admin Komplek.");
    } catch (error) { setMessage(error.message); }
  };
  const review = async (reviewStatus) => {
    if (reviewStatus === "rejected" && !rejectReason.trim()) { setMessage("Alasan reject wajib diisi."); return; }
    try {
      const updated = await api.request(`/management-reports/${active.id}/review`, { method: "PATCH", body: JSON.stringify({ status: reviewStatus, rejection_reason: rejectReason }) });
      setActive(updated);
      await load();
      setMessage(`Laporan ${reviewStatus === "approved" ? "disetujui" : "ditolak"}.`);
    } catch (error) { setMessage(error.message); }
  };
  const removeImage = async (image) => {
    if (!active || !window.confirm("Hapus foto laporan ini?")) return;
    try {
      const updated = await api.request(`/management-reports/${active.id}/images/${image.id}`, { method: "DELETE" });
      setActive(updated);
      await load();
    } catch (error) { setMessage(error.message); }
  };
  return <section className="page management-reports-page">
    <div className="page-head management-page-heading"><div><h2>Laporan Pengelola</h2><span>{isAdmin ? "Review laporan operasional Security dan Support." : "Laporan operasional yang Anda kirim."}</span>{isAdmin && <label className="page-status-filter"><strong>Filter Status</strong><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="pending">Menunggu Review</option><option value="approved">Approved</option><option value="rejected">Reject</option><option value="">Semua status</option></select></label>}</div></div>
    {message && <p className="notice">{message}</p>}
    <div className="list">{items.map((item) => <button type="button" className={`list-item clickable management-report-item ${item.status}`} key={item.id} onClick={() => openDetail(item)}><div className="item-heading"><strong>{managementReportTypeLabel(item.report_type)}</strong><span className={`status ${item.status}`}>{managementReportStatusLabel(item.status)}</span></div><span>{managementReportDateLabel(item.report_date)} · {item.report_time}</span>{isAdmin && <span>Pelapor: {item.reporter_name || "-"}</span>}<span>Situasi: {item.situation}</span>{item.report_type === "work_report" ? <span>Lokasi: {item.latitude}, {item.longitude}</span> : <span>Tamu warga: {item.resident_guest_count} · Tamu Ojol: {item.ojol_guest_count} · Token listrik: {item.electricity_token ?? "-"}</span>}{item.notes && <p>{item.notes}</p>}{item.rejection_reason && <p>Alasan reject: {item.rejection_reason}</p>}<ManagementReportImages images={item.image_urls} /><TransactionTracking createdBy={item.reporter_name || "Petugas"} createdAt={item.created_at} events={[item.reviewed_at && { label: item.status === "rejected" ? "Laporan ditolak" : "Laporan direview", actor: item.reviewer_name || "Admin Komplek", at: item.reviewed_at, note: item.rejection_reason }].filter(Boolean)} /><span className="purchase-open">Buka detail</span></button>)}{!items.length && <Empty text={isAdmin ? "Tidak ada laporan untuk filter ini." : "Belum ada laporan pengelola yang Anda kirim."} />}</div>
    {!isAdmin && !showForm && <button className="floating-add" type="button" onClick={() => { setMessage(""); setShowForm(true); }} aria-label="Tambah laporan pengelola"><Icon name="plus" /></button>}
    {showForm && <Modal title="Tambah Laporan Pengelola" onClose={closeForm}><form className="composer flat management-report-form" onSubmit={submit}>
      <FormField label="Tipe Laporan"><select value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value, shift_incoming_user_id: "", shift_outgoing_user_id: "", latitude: "", longitude: "" })}><option value="shift_change">Laporan Ganti Shift</option><option value="work_report">Laporan Kerja</option><option value="incidental">Insidensial</option></select></FormField>
      <div className="row"><FormField label="Hari / Tanggal"><input type="date" value={form.report_date} onChange={(e) => setForm({ ...form, report_date: e.target.value })} required /></FormField><FormField label="Pukul"><input type="time" value={form.report_time} onChange={(e) => setForm({ ...form, report_time: e.target.value })} required /></FormField></div>
      {form.report_type === "shift_change" && <div className="row"><FormField label="Naik Piket"><select value={form.shift_incoming_user_id} onChange={(e) => setForm({ ...form, shift_incoming_user_id: e.target.value })} required><option value="">Pilih petugas</option>{staff.map((user) => <option key={user.id} value={user.id}>{userOptionLabel(user)}</option>)}</select></FormField><FormField label="Turun Piket"><select value={form.shift_outgoing_user_id} onChange={(e) => setForm({ ...form, shift_outgoing_user_id: e.target.value })} required><option value="">Pilih petugas</option>{staff.map((user) => <option key={user.id} value={user.id}>{userOptionLabel(user)}</option>)}</select></FormField></div>}
      {form.report_type !== "work_report" && <><div className="row"><FormField label="Jumlah Tamu Warga"><input type="number" min="0" value={form.resident_guest_count} onChange={(e) => setForm({ ...form, resident_guest_count: e.target.value })} required /></FormField><FormField label="Jumlah Tamu Ojol"><input type="number" min="0" value={form.ojol_guest_count} onChange={(e) => setForm({ ...form, ojol_guest_count: e.target.value })} required /></FormField></div><FormField label="Token Listrik"><input type="number" step="0.01" min="0" value={form.electricity_token} onChange={(e) => setForm({ ...form, electricity_token: e.target.value })} /></FormField></>}
      {form.report_type === "work_report" && <div className="management-location-field"><div className="page-head small"><div><strong>Lokasi Pekerjaan</strong><span>Lokasi dideteksi otomatis dan dapat dikoreksi melalui peta.</span></div><button className="location-detect-button" type="button" onClick={detectLocation}><Icon name="location" /><span>Ambil Lokasi GPS</span></button></div><div className="row"><FormField label="Latitude"><input type="number" step="any" value={form.latitude} readOnly required /></FormField><FormField label="Longitude"><input type="number" step="any" value={form.longitude} readOnly required /></FormField></div>{locationMessage && <p className="location-message">{locationMessage}</p>}<ManagementReportLocationPicker latitude={form.latitude} longitude={form.longitude} onChange={setLocation} /></div>}
      <FormField label="Situasi"><input value={form.situation} onChange={(e) => setForm({ ...form, situation: e.target.value })} required /></FormField><FormField label="Catatan"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField><div className="file-field"><span>Upload Gambar / Foto</span><div className="upload-inputs"><input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setFiles(e.target.files)} /></label></div><ImageUploadPreview files={files} /></div><button className="primary">Kirim laporan</button>
    </form></Modal>}
    {active && <Modal title="Detail Laporan Pengelola" onClose={() => setActive(null)}><div className="detail-pane management-report-detail"><div className="item-heading"><h3>{managementReportTypeLabel(active.report_type)}</h3><span className={`status ${active.status}`}>{managementReportStatusLabel(active.status)}</span></div><span>Pelapor: {active.reporter_name || "-"}</span><span>{managementReportDateLabel(active.report_date)} · {active.report_time}</span>{active.report_type === "shift_change" && <><span>Naik Piket: {active.shift_incoming_user_name || "-"}</span><span>Turun Piket: {active.shift_outgoing_user_name || "-"}</span></>}{active.report_type !== "work_report" && <><span>Jumlah Tamu warga: {active.resident_guest_count}</span><span>Jumlah Tamu Ojol: {active.ojol_guest_count}</span><span>Token listrik: {active.electricity_token ?? "-"}</span></>}{active.report_type === "work_report" && <><span>Lokasi: {active.latitude}, {active.longitude}</span><a className="map-link" href={`https://www.openstreetmap.org/?mlat=${active.latitude}&mlon=${active.longitude}#map=18/${active.latitude}/${active.longitude}`} target="_blank" rel="noreferrer">Buka lokasi di peta</a><ManagementReportLocationPicker latitude={active.latitude} longitude={active.longitude} /></>}<span>Situasi: {active.situation}</span>{active.notes && <p>Catatan: {active.notes}</p>}{isAdmin ? <ManagementReportImages images={active.image_urls} /> : <ExistingUploadPreviews items={asArray(active.images).map((image) => ({ ...image, file_url: image.image_url, file_name: "Foto laporan" }))} onRemove={removeImage} />}{active.rejection_reason && <p>Alasan reject: {active.rejection_reason}</p>}{isAdmin && active.status === "pending" && <><FormField label="Alasan Reject"><textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></FormField><div className="row actions"><button className="action-done" type="button" onClick={() => review("approved")}><Icon name="vote" />Approve</button><button className="action-delete" type="button" onClick={() => review("rejected")}><Icon name="trash" />Reject</button></div></>}</div></Modal>}
  </section>;
}

function Events({ api }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", location: "", start_datetime: "", end_datetime: "", is_active: true });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => api.request("/events").then((data) => setItems(asArray(data))).catch((error) => setMessage(error.message));
  useEffect(() => { load(); }, []);
  const openForm = (item = null) => {
    setEditing(item);
    setForm(item ? { title: item.title || "", description: item.description || "", location: item.location || "", start_datetime: toDateTimeLocal(item.start_datetime), end_datetime: toDateTimeLocal(item.end_datetime), is_active: item.is_active !== false } : { title: "", description: "", location: "", start_datetime: "", end_datetime: "", is_active: true });
    setShowForm(true);
  };
  const save = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.request(editing ? `/events/${editing.id}` : "/events", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, end_datetime: form.end_datetime || null }) });
      setShowForm(false);
      setEditing(null);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Hapus event ${item.title}?`)) return;
    await api.request(`/events/${item.id}`, { method: "DELETE" });
    load();
  };
  return (
    <section className="page">
      <div className="page-head"><h2>Events</h2><button className="primary" type="button" onClick={() => openForm()}>Tambah</button></div>
      {message && <p className="notice">{message}</p>}
      <div className="list">{items.map((item) => <div className="list-item" key={item.id}><div className="item-heading"><strong>{item.title}</strong><span className={`status ${item.is_active ? "approved" : "rejected"}`}>{item.is_active ? "active" : "non active"}</span></div><span>{new Date(item.start_datetime).toLocaleString()} {item.location ? `- ${item.location}` : ""}</span>{item.description && <p>{item.description}</p>}<div className="row actions"><button type="button" onClick={() => openForm(item)}>Edit</button><button type="button" onClick={() => remove(item)}>Delete</button></div></div>)}</div>
      {showForm && <Modal title={editing ? "Edit Event" : "Tambah Event"} onClose={() => setShowForm(false)}><form className="composer flat" onSubmit={save}><FormField label="Nama Acara"><input placeholder="Masukkan nama acara" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></FormField><FormField label="Lokasi"><input placeholder="Masukkan lokasi acara" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></FormField><div className="row"><FormField label="Mulai"><input type="datetime-local" value={form.start_datetime} onChange={(e) => setForm({ ...form, start_datetime: e.target.value })} required /></FormField><FormField label="Selesai"><input type="datetime-local" value={form.end_datetime} onChange={(e) => setForm({ ...form, end_datetime: e.target.value })} /></FormField></div><FormField label="Deskripsi"><textarea placeholder="Tulis deskripsi acara" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField><label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Aktif</span></label><button className="primary">Simpan event</button></form></Modal>}
    </section>
  );
}

const IPL_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function Profile({ api }) {
  const isAdmin = api.user.role === "administrator";
  const [houses, setHouses] = useState([]);
  const [residents, setResidents] = useState([]);
  const [query, setQuery] = useState("");
  const [houseFile, setHouseFile] = useState(null);
  const [houseDocs, setHouseDocs] = useState([]);
  const [existingHouseDocs, setExistingHouseDocs] = useState([]);
  const [removeHousePhoto, setRemoveHousePhoto] = useState(false);
  const [houseForm, setHouseForm] = useState({ user_id: "", address: "", block: "", number: "", gps_coordinates: "", house_photo_url: "", house_status: "dihuni" });
  const [memberForm, setMemberForm] = useState({ full_name: "", relationship: "", birth_place: "", birth_date: "", member_type: "anggota_keluarga", phone: "", ktp_number: "" });
  const [memberFile, setMemberFile] = useState(null);
  const [removeMemberDocument, setRemoveMemberDocument] = useState(false);
  const [houseModal, setHouseModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [activeTab, setActiveTab] = useState("house");
  const [selectedHouse, setSelectedHouse] = useState(null);
  const [iplYear, setIplYear] = useState(() => new Date().getFullYear());
  const [iplDrafts, setIplDrafts] = useState({});
  const [iplLoading, setIplLoading] = useState(false);
  const [editingHouse, setEditingHouse] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [message, setMessage] = useState("");
  const loadHouses = () => api.request("/profile/houses").then((data) => setHouses(asArray(data))).catch((error) => { setHouses([]); setMessage(error.message); });
  const loadResidents = () => {
    if (!isAdmin) return;
    api.request("/complexes/residents").then((data) => setResidents(asArray(data))).catch(() => setResidents([]));
  };
  const loadIpl = async (houseId, year = iplYear) => {
    if (!houseId) return;
    setIplLoading(true);
    try {
      const payments = asArray(await api.request(`/profile/houses/${houseId}/ipl?year=${year}`));
      const byMonth = new Map(payments.map((payment) => [payment.payment_month, payment]));
      const drafts = {};
      IPL_MONTHS.forEach((_, index) => {
        const month = index + 1;
        const payment = byMonth.get(month);
        const previousAmount = month > 1 ? Number(drafts[month - 1]?.amount || 0) : 0;
        const amount = payment ? Number(payment.amount || 0) : previousAmount;
        drafts[month] = {
          is_paid: payment?.is_paid || false,
          amount: amount ? String(amount) : "",
          use_previous: month > 1 && previousAmount > 0 && (!payment || Number(payment.amount || 0) === previousAmount),
        };
      });
      setIplDrafts(drafts);
    } catch (error) { setMessage(error.message); }
    finally { setIplLoading(false); }
  };
  useEffect(() => {
    loadHouses();
    loadResidents();
  }, []);
  useEffect(() => {
    if (detailModal && activeTab === "ipl" && selectedHouse?.id) loadIpl(selectedHouse.id);
  }, [detailModal, activeTab, selectedHouse?.id, iplYear]);
  const detectLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Browser belum mendukung deteksi lokasi.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setHouseForm((current) => ({ ...current, gps_coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }));
      },
      (error) => setMessage(error.message || "Lokasi belum bisa dideteksi."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const refreshSelected = async (houseId) => {
    const rows = await api.request("/profile/houses");
    setHouses(asArray(rows));
    const found = asArray(rows).find((house) => house.id === houseId);
    if (found) setSelectedHouse(found);
  };
  const openHouseForm = (house = null) => {
    setMessage("");
    setEditingHouse(house);
    setHouseFile(null);
    setHouseDocs([]);
    setExistingHouseDocs(asArray(house?.documents));
    setRemoveHousePhoto(false);
    setHouseForm(house ? { user_id: house.user_id || "", address: house.address || "", block: house.block || "", number: house.number || "", gps_coordinates: house.gps_coordinates || "", house_photo_url: house.house_photo_url || "", house_status: house.house_status || "dihuni" } : { user_id: "", address: "", block: "", number: "", gps_coordinates: "", house_photo_url: "", house_status: "dihuni" });
    setHouseModal(true);
    if (!isAdmin) setTimeout(detectLocation, 0);
  };
  const openDetail = (house) => { setSelectedHouse(house); setActiveTab("house"); setDetailModal(true); };
  const saveHouse = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      let payload = { ...houseForm };
      if (!isAdmin) delete payload.user_id;
      if (isAdmin && payload.user_id) payload.user_id = Number(payload.user_id);
      if (houseFile) {
        const uploaded = await uploadFile(api, houseFile, "houses");
        payload.house_photo_url = uploaded.url;
      } else if (removeHousePhoto) {
        payload.house_photo_url = null;
      }
      const uploadedDocs = await uploadFiles(api, houseDocs, "house-documents");
      payload.document_urls = [...existingHouseDocs.map((item) => item.file_url), ...uploadedDocs.map((item) => item.url)];
      const saved = await api.request(editingHouse ? `/profile/houses/${editingHouse.id}` : "/profile/houses", { method: editingHouse ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setSelectedHouse(saved);
      setHouseFile(null);
      setHouseDocs([]);
      setExistingHouseDocs([]);
      setRemoveHousePhoto(false);
      setEditingHouse(null);
      setHouseModal(false);
      loadHouses();
    } catch (error) { setMessage(error.message); }
  };
  const deleteHouse = async (house) => {
    if (!window.confirm(`Hapus data rumah Blok ${house.block} No. ${house.number}?`)) return;
    try {
      await api.request(`/profile/houses/${house.id}`, { method: "DELETE" });
      if (selectedHouse?.id === house.id) setSelectedHouse(null);
      loadHouses();
    } catch (error) { setMessage(error.message); }
  };
  const openMember = (member = null) => {
    setMessage("");
    setEditingMember(member);
    setMemberFile(null);
    setRemoveMemberDocument(false);
    setMemberForm(member ? { full_name: member.full_name || "", relationship: member.relationship || "", birth_place: member.birth_place || "", birth_date: (member.birth_date || "").slice(0, 10), member_type: member.member_type || "anggota_keluarga", phone: member.phone || "", ktp_number: member.ktp_number || "" } : { full_name: "", relationship: "", birth_place: "", birth_date: "", member_type: "anggota_keluarga", phone: "", ktp_number: "" });
    setMemberModal(true);
  };
  const saveMember = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      if (!selectedHouse) throw new Error("Pilih rumah terlebih dahulu.");
      const payload = { ...memberForm, birth_date: memberForm.birth_date ? `${memberForm.birth_date}T00:00:00` : null };
      if (removeMemberDocument) {
        payload.identity_document_url = null;
        payload.identity_document_name = null;
      }
      if (memberFile) {
        const uploaded = await uploadFile(api, memberFile, "family-identity");
        payload.identity_document_url = uploaded.url;
        payload.identity_document_name = uploaded.filename;
      }
      if (editingMember) {
        await api.request(`/profile/houses/${selectedHouse.id}/members/${editingMember.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api.request(`/profile/houses/${selectedHouse.id}/members`, { method: "POST", body: JSON.stringify(payload) });
      }
      setMemberModal(false);
      setEditingMember(null);
      setMemberFile(null);
      setRemoveMemberDocument(false);
      await refreshSelected(selectedHouse.id);
    } catch (error) { setMessage(error.message); }
  };
  const deleteMember = async (member) => {
    if (!window.confirm(`Hapus anggota ${member.full_name}?`)) return;
    try { await api.request(`/profile/houses/${selectedHouse.id}/members/${member.id}`, { method: "DELETE" }); await refreshSelected(selectedHouse.id); } catch (error) { setMessage(error.message); }
  };
  const updateIplDraft = (month, patch) => setIplDrafts((current) => ({ ...current, [month]: { ...current[month], ...patch } }));
  const saveIplMonth = async (month) => {
    const draft = iplDrafts[month] || {};
    const previousAmount = month > 1 ? Number(iplDrafts[month - 1]?.amount || 0) : 0;
    const amount = draft.use_previous ? previousAmount : Number(draft.amount || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Nominal IPL tidak valid.");
      return;
    }
    try {
      await api.request(`/profile/houses/${selectedHouse.id}/ipl/${iplYear}/${month}`, { method: "PUT", body: JSON.stringify({ is_paid: !!draft.is_paid, amount }) });
      setMessage(`IPL ${IPL_MONTHS[month - 1]} berhasil disimpan.`);
      await loadIpl(selectedHouse.id);
    } catch (error) { setMessage(error.message); }
  };
  const filteredHouses = asArray(houses).filter((house) => [house.owner_name, house.owner_email, house.address, house.block, house.number, house.house_status].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="page">
      <div className="page-head"><h2>Profil Rumah</h2><input className="search-input" placeholder="Cari rumah" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="primary" type="button" onClick={() => openHouseForm()}>Tambah Rumah</button></div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {filteredHouses.map((house) => <div className="list-item clickable house-list-item" key={house.id} onClick={() => openDetail(house)}><span className="house-icon"><Icon name="home" /></span>{house.house_photo_url && <img className="thumb" src={publicUrl(house.house_photo_url)} alt="" />}<div className="item-heading"><strong>Blok {house.block} No. {house.number}</strong><span className="status approved">{houseStatusLabel(house.house_status)}</span></div>{isAdmin && <span>{house.owner_name || "Belum terhubung"} - {house.owner_email || `UserID ${house.user_id}`}</span>}<span>{house.address}</span>{house.gps_coordinates && <span>{house.gps_coordinates}</span>}{isAdmin && <div className="attachment-list">{asArray(house.documents).map((doc) => <UploadedFileLink key={doc.id} href={doc.file_url} label={doc.file_name || "Kartu Keluarga"} />)}</div>}<div className="row actions house-profile-actions"><button className="action-edit" type="button" onClick={(event) => { event.stopPropagation(); openHouseForm(house); }}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={(event) => { event.stopPropagation(); deleteHouse(house); }}><Icon name="trash" />Delete</button><button className="action-update" type="button" onClick={(event) => { event.stopPropagation(); openDetail(house); }}><Icon name="users" />Update Detail</button></div></div>)}
        {!filteredHouses.length && <Empty text="Belum ada data rumah." />}
      </div>
      {detailModal && selectedHouse && (
        <Modal title={`Blok ${selectedHouse.block} No. ${selectedHouse.number}`} onClose={() => setDetailModal(false)}>
          <div className="tabs">
            <button type="button" className={activeTab === "house" ? "active" : ""} onClick={() => setActiveTab("house")}>Profil Rumah</button>
            <button type="button" className={activeTab === "members" ? "active" : ""} onClick={() => setActiveTab("members")}>Anggota Keluarga</button>
            <button type="button" className={activeTab === "ipl" ? "active" : ""} onClick={() => setActiveTab("ipl")}>IPL</button>
          </div>
          {activeTab === "house" && <div className="detail-pane">
            {selectedHouse.house_photo_url && <img className="thumb" src={publicUrl(selectedHouse.house_photo_url)} alt="" />}
            {isAdmin && <span>{selectedHouse.owner_name || "Belum terhubung"} - UserID {selectedHouse.user_id}</span>}
            <p>{selectedHouse.address}</p><span>Blok {selectedHouse.block} No. {selectedHouse.number}</span><span>Status: {houseStatusLabel(selectedHouse.house_status)}</span>
            {selectedHouse.gps_coordinates && <span>GPS: {selectedHouse.gps_coordinates}</span>}
            <div className="attachment-list">{asArray(selectedHouse.documents).map((doc) => <UploadedFileLink key={doc.id} href={doc.file_url} label={doc.file_name || "Kartu Keluarga"} />)}</div>
          </div>}
          {activeTab === "members" && <div className="detail-pane"><div className="page-head small"><h2>Anggota</h2><button className="member-add" type="button" onClick={() => openMember()}><Icon name="plus" />Tambah Anggota</button></div><div className="list">{asArray(selectedHouse.family_members).map((member) => <div className="list-item" key={member.id}><div className="item-heading"><strong>{member.full_name}</strong><span className="status approved">{familyMemberTypeLabel(member.member_type)}</span></div><span>{member.birth_place || "-"} {member.birth_date ? `- ${new Date(member.birth_date).toLocaleDateString()}` : ""}</span><span>{member.relationship || "-"} - {member.phone || "-"}</span>{member.ktp_number && <span>{member.ktp_number}</span>}<UploadedFileLink href={member.identity_document_url} label={member.identity_document_name || "Identitas anggota"} /><div className="row actions"><button className="action-edit" type="button" onClick={() => openMember(member)}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={() => deleteMember(member)}><Icon name="trash" />Delete</button></div></div>)}{!asArray(selectedHouse.family_members).length && <Empty text="Belum ada anggota keluarga." />}</div></div>}
          {activeTab === "ipl" && <div className="detail-pane ipl-pane">
            <div className="ipl-toolbar">
              <FormField label="Tahun IPL"><select value={iplYear} onChange={(event) => setIplYear(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - 3 + index).map((year) => <option key={year} value={year}>{year}</option>)}</select></FormField>
              <div className="ipl-summary"><span>Total nominal sudah dibayar</span><strong>{formatPrice(Object.values(iplDrafts).reduce((total, row) => total + (row.is_paid ? Number(row.amount || 0) : 0), 0))}</strong><small>{Object.values(iplDrafts).filter((row) => row.is_paid).length}/12 bulan sudah bayar</small></div>
            </div>
            {iplLoading ? <p className="notice">Memuat data IPL…</p> : <div className="ipl-list">{IPL_MONTHS.map((monthName, index) => {
              const month = index + 1;
              const draft = iplDrafts[month] || { is_paid: false, amount: "", use_previous: false };
              const previousAmount = month > 1 ? Number(iplDrafts[month - 1]?.amount || 0) : 0;
              const nominal = draft.use_previous ? previousAmount : Number(draft.amount || 0);
              return <div className="ipl-month" key={month}><div className="ipl-month-head"><strong>{monthName}</strong><span className={draft.is_paid ? "ipl-status paid" : "ipl-status unpaid"}>{draft.is_paid ? "Sudah bayar" : "Belum bayar"}</span></div>{isAdmin ? <div className="ipl-month-form"><label className="choice ipl-paid-choice"><input type="checkbox" checked={!!draft.is_paid} onChange={(event) => updateIplDraft(month, { is_paid: event.target.checked })} /><span>Sudah bayar</span></label><FormField label="Nominal IPL (Rupiah)"><select value={draft.use_previous ? "previous" : "custom"} onChange={(event) => updateIplDraft(month, { use_previous: event.target.value === "previous" })}>{month > 1 && previousAmount > 0 && <option value="previous">Sama dengan bulan sebelumnya</option>}<option value="custom">Nominal baru</option></select>{draft.use_previous ? <div className="ipl-inherited-amount">{formatPrice(previousAmount)}</div> : <input className="rupiah-input" type="text" inputMode="numeric" placeholder="Rp 0" value={formatRupiahInput(draft.amount)} onChange={(event) => updateIplDraft(month, { amount: event.target.value.replace(/\D/g, "") })} />}</FormField><button className="action-update" type="button" onClick={() => saveIplMonth(month)}>Simpan</button></div> : <div className="ipl-view"><span>Nominal IPL</span><strong>{formatPrice(nominal)}</strong></div>}</div>;
            })}</div>}
          </div>}
        </Modal>
      )}
      {houseModal && <Modal title={editingHouse ? "Edit Rumah" : "Tambah Rumah"} onClose={() => { setHouseModal(false); setEditingHouse(null); }}><form className="composer flat" onSubmit={saveHouse}>{message && <p className="notice">{message}</p>}{isAdmin && <FormField label="Penghuni"><select value={houseForm.user_id} onChange={(e) => setHouseForm({ ...houseForm, user_id: e.target.value })} required><option value="">Pilih Penghuni</option>{asArray(residents).filter((user) => user.role === "penghuni").map((user) => <option key={user.id} value={user.id}>{userOptionLabel(user)}</option>)}</select></FormField>}<FormField label="Alamat Rumah"><textarea placeholder="Masukkan alamat lengkap rumah" value={houseForm.address} onChange={(e) => setHouseForm({ ...houseForm, address: e.target.value })} required /></FormField><div className="row"><FormField label="Blok"><input placeholder="Contoh: A" value={houseForm.block} onChange={(e) => setHouseForm({ ...houseForm, block: e.target.value })} required /></FormField><FormField label="Nomor"><input placeholder="Contoh: 12" value={houseForm.number} onChange={(e) => setHouseForm({ ...houseForm, number: e.target.value })} required /></FormField></div><div className="row"><FormField label="Koordinat GPS"><input placeholder="Latitude, Longitude" value={houseForm.gps_coordinates} onChange={(e) => setHouseForm({ ...houseForm, gps_coordinates: e.target.value })} readOnly={!isAdmin} /></FormField><button type="button" className="icon-only" onClick={detectLocation} title="Deteksi lokasi"><Icon name="qr" /></button></div><div className="file-field"><span>{editingHouse?.house_photo_url ? "Foto Rumah Saat Ini / Upload Ulang" : "Upload Foto Rumah"}</span>{editingHouse?.house_photo_url && !removeHousePhoto && !houseFile && <ExistingUploadPreviews items={[{ file_url: editingHouse.house_photo_url, file_name: "Foto Rumah" }]} onRemove={() => setRemoveHousePhoto(true)} />}<div className="upload-inputs"><input type="file" accept="image/*" onChange={(e) => { setHouseFile(e.target.files?.[0] || null); setRemoveHousePhoto(false); }} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => { setHouseFile(e.target.files?.[0] || null); setRemoveHousePhoto(false); }} /></label></div><ImageUploadPreview files={houseFile} /></div><div className="file-field"><span>Upload Kartu Keluarga</span><ExistingUploadPreviews items={existingHouseDocs} onRemove={(item) => setExistingHouseDocs((current) => current.filter((document) => document.id !== item.id))} emptyText={editingHouse ? "Belum ada dokumen tersimpan." : ""} /><div className="upload-inputs"><input type="file" accept="image/*,.pdf,.doc,.docx" multiple onChange={(e) => setHouseDocs(e.target.files)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setHouseDocs(e.target.files)} /></label></div><ImageUploadPreview files={houseDocs} /></div><FormField label="Status Rumah"><select value={houseForm.house_status} onChange={(e) => setHouseForm({ ...houseForm, house_status: e.target.value })}><option value="dihuni">Dihuni</option><option value="disewakan">Disewakan</option><option value="sita_bank">Sita Bank</option><option value="dikosongkan">Dikosongkan</option></select></FormField><button className="primary">Simpan rumah</button></form></Modal>}
      {memberModal && (
        <Modal title={editingMember ? "Edit Anggota" : "Tambah Anggota"} onClose={() => { setMemberModal(false); setEditingMember(null); }}>
          <form className="composer flat" onSubmit={saveMember}>
            {message && <p className="notice">{message}</p>}
            <FormField label="Nama Anggota"><input placeholder="Masukkan nama lengkap" value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} required /></FormField>
            <FormField label="Hubungan Keluarga"><input placeholder="Contoh: Anak, pasangan" value={memberForm.relationship} onChange={(e) => setMemberForm({ ...memberForm, relationship: e.target.value })} /></FormField>
            <div className="row">
              <FormField label="Tempat Lahir"><input placeholder="Masukkan tempat lahir" value={memberForm.birth_place} onChange={(e) => setMemberForm({ ...memberForm, birth_place: e.target.value })} /></FormField>
              <FormField label="Tanggal Lahir"><input type="date" value={memberForm.birth_date} onChange={(e) => setMemberForm({ ...memberForm, birth_date: e.target.value })} /></FormField>
            </div>
            <FormField label="Tipe Anggota">
              <select value={memberForm.member_type} onChange={(e) => setMemberForm({ ...memberForm, member_type: e.target.value })} required>
                <option value="kepala_keluarga">Kepala keluarga</option>
                <option value="anggota_keluarga">Anggota keluarga</option>
                <option value="keluarga_tidak_serumah">Keluarga Tidak Serumah</option>
              </select>
            </FormField>
            <FormField label="Telepon"><input placeholder="Masukkan nomor telepon" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} /></FormField>
            <FormField label="Nomor KTP"><input placeholder="Masukkan nomor KTP" value={memberForm.ktp_number} onChange={(e) => setMemberForm({ ...memberForm, ktp_number: e.target.value })} /></FormField>
            {editingMember?.identity_document_url && !removeMemberDocument && !memberFile && <ExistingUploadPreviews items={[{ file_url: editingMember.identity_document_url, file_name: editingMember.identity_document_name || "Identitas anggota saat ini" }]} onRemove={() => setRemoveMemberDocument(true)} />}
            <div className="file-field"><span>{editingMember?.identity_document_url ? "Upload Ulang Identitas Anggota" : "Upload Identitas Anggota"}</span><div className="upload-inputs"><input type="file" accept="image/*,.pdf" onChange={(e) => { setMemberFile(e.target.files?.[0] || null); setRemoveMemberDocument(false); }} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => { setMemberFile(e.target.files?.[0] || null); setRemoveMemberDocument(false); }} /></label></div><ImageUploadPreview files={memberFile} /></div>
            <button className="primary">{editingMember ? "Simpan anggota" : "Tambah anggota"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Letters({ api, isAdmin }) {
  const [types, setTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [adminTab, setAdminTab] = useState("requests");
  const [typeForm, setTypeForm] = useState({ name: "", description: "", is_active: true });
  const [requestForm, setRequestForm] = useState({ letter_type_id: "", description: "" });
  const [completionForm, setCompletionForm] = useState({ note: "" });
  const [requestFile, setRequestFile] = useState(null);
  const [completionFile, setCompletionFile] = useState(null);
  const [typeModal, setTypeModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);
  const [detailRequest, setDetailRequest] = useState(null);
  const [completionRequest, setCompletionRequest] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [editingRequest, setEditingRequest] = useState(null);
  const [message, setMessage] = useState("");
  const activeLetterTypes = asArray(types).filter((type) => type.is_active || type.id === editingRequest?.letter_type_id);
  const firstTypeId = activeLetterTypes[0]?.id ? String(activeLetterTypes[0].id) : "";
  const load = () => {
    setMessage("");
    Promise.all([api.request("/letters/types"), api.request("/letters/requests")])
      .then(([typeRows, requestRows]) => {
        setTypes(asArray(typeRows));
        setRequests(asArray(requestRows));
      })
      .catch((error) => {
        setTypes([]);
        setRequests([]);
        setMessage(error.message);
      });
  };
  useEffect(() => { load(); }, []);
  const createType = async (e) => { e.preventDefault(); try { await api.request("/letters/types", { method: "POST", body: JSON.stringify(typeForm) }); setTypeForm({ name: "", description: "", is_active: true }); setTypeModal(false); load(); } catch (error) { setMessage(error.message); } };
  const openType = (type = null) => { setMessage(""); setEditingType(type); setTypeForm(type ? { name: type.name || "", description: type.description || "", is_active: type.is_active } : { name: "", description: "", is_active: true }); setTypeModal(true); };
  const updateType = async (e) => { e.preventDefault(); try { await api.request(`/letters/types/${editingType.id}`, { method: "PATCH", body: JSON.stringify(typeForm) }); setTypeModal(false); setEditingType(null); load(); } catch (error) { setMessage(error.message); } };
  const deleteType = async (type) => { if (!window.confirm(`Hapus jenis surat ${type.name}?`)) return; try { await api.request(`/letters/types/${type.id}`, { method: "DELETE" }); load(); } catch (error) { setMessage(error.message); } };
  const uploadRequestAttachment = async (requestId, replace = false) => {
    if (!requestFile) return;
    const uploaded = await uploadFile(api, requestFile, "letter-requests");
    await api.request(`/letters/requests/${requestId}/attachments`, {
      method: "POST",
      body: JSON.stringify({ file_url: uploaded.url, file_name: uploaded.filename, replace }),
    });
  };
  const createRequest = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const letterTypeId = Number(requestForm.letter_type_id || firstTypeId);
      if (!letterTypeId) throw new Error("Tipe surat belum tersedia. Hubungi Admin Komplek untuk membuat Master Jenis Surat.");
      const created = await api.request("/letters/requests", { method: "POST", body: JSON.stringify({ ...requestForm, letter_type_id: letterTypeId }) });
      await uploadRequestAttachment(created.id);
      setRequestForm({ letter_type_id: "", description: "" });
      setRequestFile(null);
      setRequestModal(false);
      e.target.reset();
      load();
    } catch (error) { setMessage(error.message); }
  };
  const openRequest = (request = null) => {
    setMessage("");
    setEditingRequest(request);
    setRequestFile(null);
    setRequestForm(request ? { letter_type_id: request.letter_type_id || "", description: request.description || "", status: request.status } : { letter_type_id: firstTypeId, description: "" });
    setRequestModal(true);
  };
  const updateRequest = async (e) => {
    e.preventDefault();
    try {
      const letterTypeId = Number(requestForm.letter_type_id || firstTypeId);
      if (!letterTypeId) throw new Error("Tipe surat belum tersedia.");
      await api.request(`/letters/requests/${editingRequest.id}`, { method: "PATCH", body: JSON.stringify({ ...requestForm, letter_type_id: letterTypeId }) });
      await uploadRequestAttachment(editingRequest.id, true);
      setRequestFile(null);
      setRequestModal(false);
      setEditingRequest(null);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const removeRequestAttachment = async (attachment) => {
    if (!editingRequest || !window.confirm(`Hapus ${attachment.label || attachment.file_name || "lampiran"}?`)) return;
    try {
      const updated = await api.request(`/letters/requests/${editingRequest.id}/attachments/${attachment.id}`, { method: "DELETE" });
      setEditingRequest(updated);
      await load();
    } catch (error) { setMessage(error.message); }
  };
  const deleteRequest = async (request) => { if (!window.confirm(`Hapus request surat ${request.letter_type_name}?`)) return; try { await api.request(`/letters/requests/${request.id}`, { method: "DELETE" }); setDetailRequest(null); load(); } catch (error) { setMessage(error.message); } };
  const processRequest = async (request) => {
    try {
      await api.request(`/letters/requests/${request.id}/reply`, { method: "POST", body: JSON.stringify({ note: "Request sedang diproses.", status_after: "diproses" }) });
      setDetailRequest(null);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const openCompletion = (request) => {
    setCompletionRequest(request);
    setCompletionForm({ note: "" });
    setCompletionFile(null);
    setDetailRequest(null);
  };
  const completeRequest = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.request(`/letters/requests/${completionRequest.id}/reply`, { method: "POST", body: JSON.stringify({ note: completionForm.note, status_after: "selesai" }) });
      if (completionFile) {
        const uploaded = await uploadFile(api, completionFile, "letter-results");
        await api.request(`/letters/requests/${completionRequest.id}/attachments`, { method: "POST", body: JSON.stringify({ file_url: uploaded.url, file_name: uploaded.filename, source: "administrator" }) });
      }
      setCompletionRequest(null);
      setCompletionFile(null);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const filteredTypes = asArray(types).filter((type) => [type.name, type.description].join(" ").toLowerCase().includes(query.toLowerCase()));
  const filteredRequests = asArray(requests).filter((request) => [request.letter_type_name, request.requester_name, request.status, request.description].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="page">
      <div className="page-head"><h2>Surat Menyurat</h2><input className="search-input" placeholder="Cari surat" value={query} onChange={(e) => setQuery(e.target.value)} />{isAdmin && adminTab === "types" ? <button className="primary" type="button" onClick={() => openType()}>Tambah Jenis</button> : !isAdmin && <button className="primary" type="button" onClick={() => openRequest()}>Ajukan Surat</button>}</div>
      {isAdmin && <div className="tabs"><button className={adminTab === "requests" ? "active" : ""} type="button" onClick={() => setAdminTab("requests")}>Request Penghuni</button><button className={adminTab === "types" ? "active" : ""} type="button" onClick={() => setAdminTab("types")}>Master Jenis Surat</button></div>}
      {message && <p className="notice">{message}</p>}
      {isAdmin && adminTab === "types" && <div className="list">{filteredTypes.map((type) => <div className="list-item" key={type.id}><div className="item-heading"><strong>{type.name}</strong><span className={`status ${type.is_active ? "approved" : "rejected"}`}>{type.is_active ? "active" : "non active"}</span></div>{type.description && <p>{type.description}</p>}<div className="row actions"><button className="action-edit" type="button" onClick={() => openType(type)}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={() => deleteType(type)}><Icon name="trash" />Delete</button></div></div>)}{!filteredTypes.length && <Empty text="Belum ada jenis surat." />}</div>}
      {(!isAdmin || adminTab === "requests") && <div className="list">{filteredRequests.map((r) => <button className="list-item clickable letter-list-item" key={r.id} type="button" onClick={() => setDetailRequest(r)}><span className="letter-icon"><Icon name="file" /></span><div className="item-heading"><strong>{r.letter_type_name || "Request Surat"}</strong><span className={`status ${r.status}`}>{letterStatusLabel(r.status)}</span></div><span>{r.requester_name || "Saya"} - {formatDateTime(r.submitted_at)}</span><p>{r.description}</p><TransactionTracking createdBy={r.requester_name || "Penghuni"} createdAt={r.submitted_at} events={asArray(r.replies).map((replyItem) => ({ label: letterStatusLabel(replyItem.status_after), actor: replyItem.user_name || "Petugas", at: replyItem.created_at, note: replyItem.note }))} /></button>)}{!filteredRequests.length && <Empty text="Belum ada request surat." />}</div>}
      {typeModal && <Modal title={editingType ? "Edit Jenis Surat" : "Tambah Jenis Surat"} onClose={() => { setTypeModal(false); setEditingType(null); }}><form className="composer flat" onSubmit={editingType ? updateType : createType}>{message && <p className="notice">{message}</p>}<FormField label="Jenis Surat"><input placeholder="Masukkan jenis surat" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} required /></FormField><FormField label="Deskripsi"><textarea placeholder="Tulis deskripsi jenis surat" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} /></FormField><label className="choice"><input type="checkbox" checked={typeForm.is_active} onChange={(e) => setTypeForm({ ...typeForm, is_active: e.target.checked })} /><span>Aktif</span></label><button className="primary">{editingType ? "Simpan jenis" : "Tambah jenis"}</button></form></Modal>}
      {requestModal && <Modal title={editingRequest ? "Edit Request Surat" : "Ajukan Surat"} onClose={() => { setRequestModal(false); setEditingRequest(null); setRequestFile(null); }}><form className="composer flat" onSubmit={editingRequest ? updateRequest : createRequest}>{message && <p className="notice">{message}</p>}<FormField label="Jenis Surat"><select value={requestForm.letter_type_id || firstTypeId} onChange={(e) => setRequestForm({ ...requestForm, letter_type_id: e.target.value })} disabled={!activeLetterTypes.length}>{activeLetterTypes.length ? activeLetterTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : <option value="">Belum ada tipe surat aktif</option>}</select></FormField><FormField label="Keperluan Surat"><textarea placeholder="Jelaskan keperluan surat" value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} required /></FormField>{editingRequest && <ExistingUploadPreviews items={editingRequest.attachments} onRemove={removeRequestAttachment} canRemove={(item) => item.uploaded_by === api.user.id} emptyText="Belum ada lampiran tersimpan." />}<div className="file-field"><span>{editingRequest ? "Upload Ulang Lampiran Surat" : "Lampiran Surat"}</span><div className="upload-inputs"><input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setRequestFile(e.target.files?.[0] || null)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setRequestFile(e.target.files?.[0] || null)} /></label></div><ImageUploadPreview files={requestFile} /></div><button className="primary">{editingRequest ? "Simpan request" : "Ajukan surat"}</button></form></Modal>}
      {detailRequest && <Modal title="Detail Request Surat" onClose={() => setDetailRequest(null)}><div className="detail-pane"><div className="item-heading"><strong>{detailRequest.letter_type_name || "Request Surat"}</strong><span className={`status ${detailRequest.status}`}>{letterStatusLabel(detailRequest.status)}</span></div><span>Pengaju: {detailRequest.requester_name || "Saya"}</span><p>{detailRequest.description}</p><div className="attachment-list">{asArray(detailRequest.attachments).map((item) => <UploadedFileLink key={item.id} href={item.file_url} label={item.file_name || "Lampiran surat"} />)}</div><div className="row actions">{!isAdmin && <><button className="action-edit" type="button" onClick={() => { setDetailRequest(null); openRequest(detailRequest); }}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={() => deleteRequest(detailRequest)}><Icon name="trash" />Delete</button></>}{isAdmin && !["selesai", "dibatalkan"].includes(detailRequest.status) && <><button className="action-process" type="button" onClick={() => processRequest(detailRequest)}><Icon name="wrench" />Proses</button><button className="action-done" type="button" onClick={() => openCompletion(detailRequest)}><Icon name="vote" />Selesai</button></>}</div></div></Modal>}
      {completionRequest && <Modal title="Selesaikan Request Surat" onClose={() => setCompletionRequest(null)}><form className="composer flat" onSubmit={completeRequest}>{message && <p className="notice">{message}</p>}<FormField label="Detail Hasil Penyelesaian"><textarea placeholder="Tulis detail hasil penyelesaian" value={completionForm.note} onChange={(e) => setCompletionForm({ note: e.target.value })} required /></FormField><div className="file-field"><span>Upload File Hasil (Opsional)</span><div className="upload-inputs"><input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setCompletionFile(e.target.files?.[0] || null)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setCompletionFile(e.target.files?.[0] || null)} /></label></div><ImageUploadPreview files={completionFile} /></div><button className="primary">Simpan hasil</button></form></Modal>}
    </section>
  );
}

function WhatsAppGateway({ api }) {
  const [form, setForm] = useState({ base_url: "", api_key: "", sender_id: "", is_enabled: false });
  const [senders, setSenders] = useState([]);
  const [message, setMessage] = useState("");
  useEffect(() => { api.request("/whatsapp-gateway").then((row) => setForm((old) => ({ ...old, ...row }))).catch((error) => setMessage(error.message)); }, []);
  const save = async (event) => { event.preventDefault(); try { const row = await api.request("/whatsapp-gateway", { method: "PATCH", body: JSON.stringify(form) }); setForm((old) => ({ ...old, ...row })); setMessage("Konfigurasi WhatsApp disimpan."); } catch (error) { setMessage(error.message); } };
  const loadSenders = async () => { try { const rows = await api.request("/whatsapp-gateway/senders"); setSenders(asArray(rows)); setMessage(rows.length ? "Pilih sender aktif dari gateway." : "Tidak ada sender yang tersedia."); } catch (error) { setMessage(error.message); } };
  return <section className="page"><div className="page-head"><h2>WhatsApp Gateway</h2></div><p>Hubungkan gateway WA, pilih sender, lalu notifikasi pengguna yang dicentang akan dikirim melalui sender ini.</p>{message && <p className="notice">{message}</p>}<form className="composer flat" onSubmit={save}><input placeholder="URL wa-gateway, contoh https://notif.asabiz.id" value={form.base_url || ""} onChange={(e) => setForm({ ...form, base_url: e.target.value })} required /><input type="password" placeholder="API key wa-gateway" value={form.api_key || ""} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /><div className="row"><select value={form.sender_id || ""} onChange={(e) => setForm({ ...form, sender_id: e.target.value })}><option value="">Pilih sender setelah koneksi disimpan</option>{senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.name || sender.id}{sender.status ? ` (${sender.status})` : ""}</option>)}</select><button type="button" onClick={loadSenders}>Muat sender</button></div><label className="choice"><input type="checkbox" checked={!!form.is_enabled} disabled={!form.sender_id} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} /><span>Aktifkan pengiriman WhatsApp</span></label><button className="primary">Simpan konfigurasi</button></form></section>;
}

const WA_NOTIFICATION_TYPES = [
  ["email_verification", "Request pendaftaran"], ["booking_confirmation", "Permintaan booking"], ["news_published", "Berita dipublikasikan"], ["news_contribution", "Kontribusi berita"], ["voting_reminder", "Pengingat voting"], ["letter_request_update", "Request surat"], ["report_created", "Laporan baru"], ["report_updated", "Update laporan"], ["event_created", "Event baru"], ["purchase_request", "Permintaan Pembelian"], ["management_report", "Laporan Pengelola"],
];

function ResidentManagement({ api }) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", password: "User12345", role: "penghuni", phone: "", is_email_verified: true, is_active: true });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [formTab, setFormTab] = useState("profile");
  const [whatsappTypes, setWhatsappTypes] = useState([]);
  const load = () => api.request("/complexes/residents").then((data) => setUsers(asArray(data))).catch((error) => { setUsers([]); setMessage(error.message); });
  useEffect(() => { load(); }, []);
  const openCreate = () => {
    setMessage("");
    setEditing(null);
    setFormTab("profile");
    setWhatsappTypes([]);
    setForm({ full_name: "", email: "", password: "User12345", role: "penghuni", phone: "", is_email_verified: true, is_active: true });
    setShowForm(true);
  };
  const openEdit = (user) => {
    setMessage("");
    setEditing(user);
    setFormTab("profile");
    api.request(`/complexes/residents/${user.id}/notification-preferences`).then((data) => setWhatsappTypes(data.whatsapp_types || [])).catch(() => setWhatsappTypes([]));
    setForm({ full_name: user.full_name || "", email: user.email || "", password: "", role: user.role || "penghuni", phone: user.phone || "", is_email_verified: user.is_email_verified !== false, is_active: user.is_active !== false });
    setShowForm(true);
  };
  const save = async (e) => {
    e.preventDefault();
    setMessage("");
    const payload = { ...form };
    if (editing && !payload.password) delete payload.password;
    try {
      await api.request(editing ? `/complexes/residents/${editing.id}` : "/complexes/residents", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      if (editing) await api.request(`/complexes/residents/${editing.id}/notification-preferences`, { method: "PUT", body: JSON.stringify({ whatsapp_types: whatsappTypes }) });
      setShowForm(false);
      setEditing(null);
      load();
    } catch (error) { setMessage(error.message); }
  };
  const toggleActive = async (user) => {
    setMessage("");
    try {
      await api.request(`/complexes/residents/${user.id}/active`, { method: "PATCH", body: JSON.stringify({ is_active: !user.is_active }) });
      load();
    } catch (error) { setMessage(error.message); }
  };
  const remove = async (user) => {
    if (!window.confirm(`Hapus user ${user.full_name}?`)) return;
    setMessage("");
    try {
      await api.request(`/complexes/residents/${user.id}`, { method: "DELETE" });
      load();
    } catch (error) { setMessage(error.message); }
  };
  const filtered = asArray(users).filter((user) => {
    const matchesQuery = [user.full_name, user.email, user.role, user.phone].join(" ").toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!roleFilter || user.role === roleFilter);
  });
  return (
    <section className="page">
      <div className="page-head resident-page-heading"><div><h2>Kelola ID Penghuni</h2><span>Kelola akun pengguna dan akses peran di komplek.</span><div className="resident-filter-row"><input className="search-input" placeholder="Cari user" value={query} onChange={(e) => setQuery(e.target.value)} /><label className="page-status-filter resident-role-filter"><strong>Filter Peran</strong><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="">Semua peran</option><option value="administrator">Administrator</option><option value="pengurus">Pengurus</option><option value="penghuni">Penghuni</option><option value="security">Security</option><option value="supports">Supports</option></select></label></div></div><button className="primary resident-add-button" type="button" onClick={openCreate}><Icon name="plus" />Tambah User</button></div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {filtered.map((user) => <div className="list-item" key={user.id}><div className="item-heading"><strong>{user.full_name}</strong><span className={`status ${user.is_active ? "approved" : "rejected"}`}>{user.is_active ? "active" : "non active"}</span></div><span>UserID {user.id} · {user.email}</span><span>{roleLabel(user.role)}{user.phone ? ` · WA: ${user.phone}` : ""}</span><div className="row actions resident-actions"><button className="action-edit" type="button" onClick={() => openEdit(user)}><Icon name="edit" />Edit</button><button className={user.is_active ? "action-warning" : "action-done"} type="button" onClick={() => toggleActive(user)}><Icon name={user.is_active ? "lock" : "vote"} />{user.is_active ? "Nonaktifkan" : "Aktifkan"}</button><button className="action-delete" type="button" onClick={() => remove(user)}><Icon name="trash" />Delete</button></div></div>)}
        {!filtered.length && <Empty text="Belum ada user komplek." />}
      </div>
      {showForm && <Modal title={editing ? "Edit User" : "Tambah User"} onClose={() => { setShowForm(false); setEditing(null); }}><form className="composer flat" onSubmit={save}>{message && <p className="notice">{message}</p>}{editing && <div className="tabs"><button type="button" className={formTab === "profile" ? "active" : ""} onClick={() => setFormTab("profile")}>Data User</button><button type="button" className={formTab === "notifications" ? "active" : ""} onClick={() => setFormTab("notifications")}>Kelola Notifikasi</button></div>}{formTab === "profile" && <><FormField label="Nama User"><input placeholder="Masukkan nama lengkap" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></FormField><FormField label="Email"><input type="email" placeholder="contoh@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></FormField><FormField label={editing ? "Password Baru" : "Password"}><input type="password" placeholder={editing ? "Kosongkan bila tidak diubah" : "Minimal 8 karakter"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} /></FormField><FormField label="Peran"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="administrator">Administrator</option><option value="pengurus">Pengurus</option><option value="penghuni">Penghuni</option><option value="security">Security</option><option value="supports">Supports</option></select></FormField><FormField label="Nomor WhatsApp"><input placeholder="Contoh: 0812xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField><label className="choice"><input type="checkbox" checked={form.is_email_verified} onChange={(e) => setForm({ ...form, is_email_verified: e.target.checked })} /><span>Email verified</span></label><label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Aktif</span></label></>}{editing && formTab === "notifications" && <div><p>Pilih notifikasi WhatsApp yang akan diterima oleh user ini.</p>{WA_NOTIFICATION_TYPES.map(([key, text]) => <label className="choice" key={key}><input type="checkbox" checked={whatsappTypes.includes(key)} onChange={(e) => setWhatsappTypes(e.target.checked ? [...whatsappTypes, key] : whatsappTypes.filter((type) => type !== key))} /><span>{text}</span></label>)}</div>}<button className="primary resident-save-button"><Icon name={editing ? "edit" : "plus"} />{editing ? "Simpan User" : "Buat User"}</button></form></Modal>}
    </section>
  );
}

function RegistrationRequests({ api }) {
  const [requests, setRequests] = useState([]);
  const [notes, setNotes] = useState({});
  const [message, setMessage] = useState("");
  const load = () => api.request("/registrations").then((data) => setRequests(asArray(data))).catch((e) => { setRequests([]); setMessage(e.message); });
  useEffect(() => {
    load();
  }, []);
  const review = async (id, status) => {
    const admin_notes = notes[id] || "";
    if (!admin_notes.trim()) {
      setMessage("Notes wajib diisi sebelum approve atau reject.");
      return;
    }
    setMessage("");
    await api.request(`/registrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, admin_notes }),
    });
    setNotes({ ...notes, [id]: "" });
    load();
  };
  return (
    <section className="page">
      <div className="page-head"><h2>Request Pendaftaran</h2><button onClick={load}>Refresh</button></div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {asArray(requests).map((item) => (
          <div className="list-item" key={item.id}>
            <div className="item-heading">
              <strong>{item.full_name || "Nama belum tersedia"}</strong>
              <span className={`status ${item.status}`}>{item.status}</span>
            </div>
            <span>{item.email}</span>
            {item.phone && <span>Telepon: {item.phone}</span>}
            <span>{item.complex_name} - {new Date(item.created_at).toLocaleString()}</span>
            <UploadedFileLink href={item.ktp_document_url} label="Lihat dokumen KTP" />
            {item.admin_notes && <p>Notes: {item.admin_notes}</p>}
            {item.status === "pending" && (
              <>
                <FormField label="Catatan Validasi Administrator"><textarea placeholder="Tulis catatan validasi" value={notes[item.id] || ""} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} /></FormField>
                <div className="row">
                  <button className="primary" onClick={() => review(item.id, "approved")}>Approve</button>
                  <button onClick={() => review(item.id, "rejected")}>Reject</button>
                </div>
              </>
            )}
          </div>
        ))}
        {!requests.length && <Empty text="Belum ada request pendaftaran." />}
      </div>
    </section>
  );
}

function LoadingModal() {
  return createPortal((
    <div className="loading-backdrop" role="dialog" aria-modal="true" aria-live="polite" aria-label="Menunggu respons server">
      <div className="loading-panel">
        <span className="loading-spinner" aria-hidden="true" />
        <strong>Mohon tunggu</strong>
        <span>Memproses permintaan...</span>
      </div>
    </div>
  ), document.body);
}

function Modal({ title, children, onClose }) {
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef(`rukun-modal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  onCloseRef.current = onClose;

  useEffect(() => {
    const modalId = modalIdRef.current;
    const currentState = window.history.state || {};
    window.history.pushState({ ...currentState, rukunApp: true, rukunModalId: modalId }, "");
    let closedByHistory = false;

    const handlePopState = (event) => {
      if (event.state?.rukunModalId !== modalId) {
        closedByHistory = true;
        onCloseRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!closedByHistory && window.history.state?.rukunModalId === modalId) {
        window.history.back();
      }
    };
  }, []);

  const close = () => {
    if (window.history.state?.rukunModalId === modalIdRef.current) {
      window.history.back();
    } else {
      onCloseRef.current();
    }
  };

  return createPortal((
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3 id="modal-title">{title}</h3>
          <button className="icon-button" type="button" onClick={close} title="Tutup">X</button>
        </div>
        {children}
      </div>
    </div>
  ), document.body);
}

function ComplexManagement({ api }) {
  const [complexes, setComplexes] = useState([]);
  const [query, setQuery] = useState("");
  const [complexForm, setComplexForm] = useState({ name: "", address: "", description: "" });
  const [logoFile, setLogoFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => api.request("/complexes").then((data) => setComplexes(asArray(data))).catch((error) => { setComplexes([]); setMessage(error.message); });
  useEffect(() => {
    load();
  }, []);
  const createComplex = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const payload = { ...complexForm };
      if (logoFile) {
        const uploaded = await uploadFile(api, logoFile, "complex-logos");
        payload.logo_url = uploaded.url;
      }
      await api.request("/complexes", { method: "POST", body: JSON.stringify(payload) });
      setComplexForm({ name: "", address: "", description: "" });
      setLogoFile(null);
      setShowForm(false);
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const openCreate = () => {
    setMessage("");
    setEditing(null);
    setComplexForm({ name: "", address: "", description: "" });
    setLogoFile(null);
    setShowForm(true);
  };
  const openEdit = (complex) => {
    setMessage("");
    setEditing(complex);
    setComplexForm({ name: complex.name || "", address: complex.address || "", description: complex.description || "", logo_url: complex.logo_url || "" });
    setLogoFile(null);
    setShowForm(true);
  };
  const updateComplex = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const payload = { ...complexForm };
      if (logoFile) {
        const uploaded = await uploadFile(api, logoFile, "complex-logos");
        payload.logo_url = uploaded.url;
      }
      await api.request(`/complexes/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setLogoFile(null);
      setShowForm(false);
      setEditing(null);
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const toggleComplex = async (complex) => {
    setMessage("");
    try {
      await api.request(`/complexes/${complex.id}/active`, { method: "PATCH", body: JSON.stringify({ is_active: !complex.is_active }) });
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const deleteComplex = async (complex) => {
    if (!window.confirm(`Hapus komplek ${complex.name}?`)) return;
    setMessage("");
    try {
      await api.request(`/complexes/${complex.id}`, { method: "DELETE" });
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const filteredComplexes = asArray(complexes).filter((complex) => [complex.name, complex.address, complex.description].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="page">
      <div className="page-head">
        <h2>Manajemen Komplek</h2>
        <input className="search-input" placeholder="Cari komplek" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="primary" type="button" onClick={openCreate}>Tambah Komplek</button>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {filteredComplexes.map((complex) => (
          <div className="list-item" key={complex.id}>
            <div className="item-heading">
              <strong className="complex-title">{complex.logo_url && <img src={publicUrl(complex.logo_url)} alt="" />}{complex.name}</strong>
              <span className={`status ${complex.is_active ? "approved" : "rejected"}`}>{complex.is_active ? "active" : "non active"}</span>
            </div>
            {complex.address && <span>{complex.address}</span>}
            {complex.description && <p>{complex.description}</p>}
            <div className="row actions">
              <button type="button" onClick={() => openEdit(complex)}>Edit</button>
              <button type="button" onClick={() => toggleComplex(complex)}>{complex.is_active ? "Nonaktif" : "Aktif"}</button>
              <button type="button" onClick={() => deleteComplex(complex)}>Delete</button>
            </div>
          </div>
        ))}
        {!filteredComplexes.length && <Empty text="Belum ada komplek." />}
      </div>
      {showForm && (
        <Modal title={editing ? "Edit Komplek" : "Tambah Komplek"} onClose={() => { setMessage(""); setShowForm(false); setEditing(null); setLogoFile(null); }}>
          <form className="composer flat" onSubmit={editing ? updateComplex : createComplex}>
            {message && <p className="notice">{message}</p>}
            <FormField label="Nama Komplek"><input placeholder="Masukkan nama komplek" value={complexForm.name} onChange={(e) => setComplexForm({ ...complexForm, name: e.target.value })} required /></FormField>
            <FormField label="Alamat"><input placeholder="Masukkan alamat komplek" value={complexForm.address} onChange={(e) => setComplexForm({ ...complexForm, address: e.target.value })} /></FormField>
            <FormField label="Deskripsi"><textarea placeholder="Tulis deskripsi komplek" value={complexForm.description} onChange={(e) => setComplexForm({ ...complexForm, description: e.target.value })} /></FormField>
            <div className="file-field"><span>Upload Logo Komplek</span>{editing?.logo_url && complexForm.logo_url && !logoFile && <ExistingUploadPreviews items={[{ file_url: complexForm.logo_url, file_name: "Logo Komplek" }]} onRemove={() => setComplexForm({ ...complexForm, logo_url: "" })} />}<div className="upload-inputs"><input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} /></label></div><ImageUploadPreview files={logoFile} /></div>
            <button className="primary">{editing ? "Simpan komplek" : "Buat komplek"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function UserAccess({ api }) {
  const [complexes, setComplexes] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [userForm, setUserForm] = useState({ full_name: "", email: "", password: "Admin123!", role: "administrator", complex_id: "" });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => {
    setMessage("");
    Promise.all([api.request("/complexes"), api.request("/complexes/users")])
      .then(([complexData, userData]) => {
        setComplexes(asArray(complexData));
        setUsers(asArray(userData));
      })
      .catch((error) => {
        setComplexes([]);
        setUsers([]);
        setMessage(error.message);
      });
  };
  useEffect(() => {
    load();
  }, []);
  const complexName = (id) => complexes.find((complex) => String(complex.id) === String(id))?.name || "Tanpa komplek";
  const createUser = async (e) => {
    e.preventDefault();
    setMessage("");
    const payload = { ...userForm, complex_id: userForm.role === "superadmin" ? null : Number(userForm.complex_id || complexes[0]?.id) };
    try {
      await api.request("/complexes/users", { method: "POST", body: JSON.stringify(payload) });
      setUserForm({ ...userForm, full_name: "", email: "", password: "Admin123!" });
      setShowForm(false);
      setMessage("User berhasil dibuat.");
    } catch (error) {
      setMessage(error.message);
    }
  };
  const openCreate = () => {
    setMessage("");
    setEditing(null);
    setUserForm({ full_name: "", email: "", password: "Admin123!", role: "administrator", complex_id: "" });
    setShowForm(true);
  };
  const openEdit = (user) => {
    setMessage("");
    setEditing(user);
    setUserForm({
      full_name: user.full_name || "",
      email: user.email || "",
      password: "",
      role: user.role || "penghuni",
      complex_id: user.complex_id || "",
    });
    setShowForm(true);
  };
  const updateUser = async (e) => {
    e.preventDefault();
    setMessage("");
    const payload = { ...userForm, complex_id: userForm.role === "superadmin" ? null : Number(userForm.complex_id || complexes[0]?.id) };
    if (!payload.password) delete payload.password;
    try {
      await api.request(`/complexes/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setShowForm(false);
      setEditing(null);
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const toggleUser = async (user) => {
    setMessage("");
    try {
      await api.request(`/complexes/users/${user.id}/active`, { method: "PATCH", body: JSON.stringify({ is_active: !user.is_active }) });
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const deleteUser = async (user) => {
    if (!window.confirm(`Hapus user ${user.full_name}?`)) return;
    setMessage("");
    try {
      await api.request(`/complexes/users/${user.id}`, { method: "DELETE" });
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const filteredUsers = asArray(users).filter((user) => [user.full_name, user.email, user.role, complexName(user.complex_id)].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="page">
      <div className="page-head">
        <h2>User Access</h2>
        <input className="search-input" placeholder="Cari user" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="primary" type="button" onClick={openCreate} disabled={!complexes.length}>Tambah User</button>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {filteredUsers.map((user) => (
          <div className="list-item" key={user.id}>
            <div className="item-heading">
              <strong>{user.full_name}</strong>
              <span className={`status ${user.is_active ? "approved" : "rejected"}`}>{user.is_active ? "active" : "non active"}</span>
            </div>
            <span>{user.email} - {user.role}</span>
            <span>{complexName(user.complex_id)}</span>
            <div className="row actions">
              <button type="button" onClick={() => openEdit(user)}>Edit</button>
              <button type="button" onClick={() => toggleUser(user)}>{user.is_active ? "Nonaktif" : "Aktif"}</button>
              <button type="button" onClick={() => deleteUser(user)}>Delete</button>
            </div>
          </div>
        ))}
        {!filteredUsers.length && <Empty text={complexes.length ? "Belum ada user." : "Buat komplek terlebih dahulu sebelum menambah user."} />}
      </div>
      {showForm && (
        <Modal title={editing ? "Edit User" : "Tambah User"} onClose={() => { setMessage(""); setShowForm(false); setEditing(null); }}>
          <form className="composer flat" onSubmit={editing ? updateUser : createUser}>
            {message && <p className="notice">{message}</p>}
            <FormField label="Nama User"><input placeholder="Masukkan nama lengkap" value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} required /></FormField>
            <FormField label="Email"><input placeholder="contoh@email.com" type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required /></FormField>
            <FormField label={editing ? "Password Baru" : "Password"}><input type="password" placeholder={editing ? "Kosongkan bila tidak diubah" : "Minimal 8 karakter"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} required={!editing} /></FormField>
            <FormField label="Peran"><select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
              <option value="superadmin">Superadmin</option>
              <option value="administrator">Administrator</option>
              <option value="pengurus">Pengurus</option>
              <option value="penghuni">Penghuni</option>
              <option value="security">Security</option>
              <option value="supports">Supports</option>
            </select></FormField>
            <FormField label="Komplek"><select value={userForm.complex_id} onChange={(e) => setUserForm({ ...userForm, complex_id: e.target.value })} required={userForm.role !== "superadmin"} disabled={userForm.role === "superadmin"}>
              <option value="">Pilih komplek</option>
              {asArray(complexes).map((complex) => <option key={complex.id} value={complex.id}>{complex.name}</option>)}
            </select></FormField>
            <button className="primary">{editing ? "Simpan user" : "Buat user"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);

const splash = document.getElementById("app-splash");
if (splash) {
  requestAnimationFrame(() => {
    splash.classList.add("is-hidden");
    window.setTimeout(() => splash.remove(), 350);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const scope = `${PUBLIC_PATH || ""}/`;
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
    navigator.serviceWorker.register(`${PUBLIC_PATH}/sw.js`, { scope, updateViaCache: "none" }).then((registration) => {
      const update = () => registration.update().catch(() => undefined);
      update();
      const interval = window.setInterval(update, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") update();
      });
      window.addEventListener("beforeunload", () => window.clearInterval(interval), { once: true });
    }).catch(() => undefined);
  });
}

function formatPrice(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
}

function formatRupiahInput(value) {
  const amount = Number(value || 0);
  if (!amount) return "";
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}

function MarketplaceImages({ images = [], alt = "" }) {
  const [active, setActive] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!images.length) return null;
  const index = Math.min(active, images.length - 1);
  return <><div className="marketplace-images"><button className="marketplace-image-button" type="button" onClick={() => setPreviewOpen(true)}><img src={publicUrl(images[index])} alt={alt} /></button>{images.length > 1 && <><span className="image-counter">{index + 1}/{images.length}</span><div className="image-dots">{images.map((_, itemIndex) => <button type="button" aria-label={`Foto ${itemIndex + 1}`} className={itemIndex === index ? "active" : ""} onClick={() => setActive(itemIndex)} key={itemIndex} />)}</div></>}</div>{previewOpen && <AttachmentPreview href={images[index]} label={alt || `Foto ${index + 1}`} onClose={() => setPreviewOpen(false)} />}</>;
}

function MarketplaceFeed({ api }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const load = () => api.request(`/marketplace${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((data) => setItems(asArray(data))).catch((error) => { setItems([]); setMessage(error.message); });
  useEffect(() => { load(); }, []);
  return <>
    <div className="home-toolbar"><input className="search-input" placeholder="Cari barang atau jasa" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} /></div>
    {message && <p className="notice">{message}</p>}
    <div className="feed news-feed">{items.map((item) => <MarketplaceCard item={item} api={api} reload={load} key={item.id} />)}{!items.length && <Empty text="Belum ada posting marketplace yang disetujui." />}</div>
  </>;
}

function MarketplaceCard({ item, api, reload }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const loadComments = () => api.request(`/marketplace/${item.id}/comments`).then((data) => setComments(asArray(data))).catch(() => setComments([]));
  const toggle = () => { setOpen(!open); if (!open) loadComments(); };
  const like = async () => { await api.request(`/marketplace/${item.id}/like`, { method: "POST" }); reload(); };
  const postComment = async (event) => { event.preventDefault(); await api.request(`/marketplace/${item.id}/comments`, { method: "POST", body: JSON.stringify({ comment }) }); setComment(""); loadComments(); reload(); };
  const description = item.description || "";
  return <article className="card marketplace-card">
    <MarketplaceImages images={item.image_urls} alt={item.title} />
    <div className="card-body">
      <div className="item-heading"><div><span className="marketplace-author">{item.author_name}</span><h3>{item.title}</h3></div><span className="status approved">{item.item_type}</span></div>
      <strong className="marketplace-price">{formatPrice(item.price)}</strong>
      <p className="preserve-text">{expanded ? description : description.slice(0, 140)}{!expanded && description.length > 140 ? "…" : ""}</p>
      {description.length > 140 && <button className="more-button" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Less" : "More"}</button>}
      {item.phone && <a className="marketplace-phone" href={`tel:${item.phone}`}>Hubungi: {item.phone}</a>}
      <div className="social-actions"><button type="button" className={item.liked_by_me ? "liked" : ""} onClick={like}><Icon name="heart" /><span>{item.likes_count || 0} Suka</span></button><button type="button" onClick={toggle}><Icon name="comment" /><span>{item.comments_count || 0} Komentar</span></button><button type="button" title="Bagikan"><Icon name="send" /><span>Bagikan</span></button><button type="button" title="Simpan"><Icon name="bookmark" /></button></div>
      {open && <div className="comments">{comments.map((entry) => <div className="comment-item" key={entry.id}><strong>{entry.user_name || "Penghuni"}</strong><p>{entry.comment}</p></div>)}<form className="inline-form" onSubmit={postComment}><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tulis komentar" required /><button>Kirim</button></form></div>}
    </div>
  </article>;
}

function MarketplaceRequests({ api, isAdmin }) {
  return isAdmin ? <MarketplaceReviewQueue api={api} /> : <MarketplaceManager api={api} />;
}

function MarketplaceManager({ api }) {
  const emptyForm = { title: "", description: "", item_type: "barang", price: "", phone: "" };
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [imageUrls, setImageUrls] = useState([]);
  const [files, setFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => api.request("/marketplace/mine").then((data) => setItems(asArray(data))).catch((error) => { setItems([]); setMessage(error.message); });
  useEffect(() => { load(); }, []);
  const reset = () => { setForm(emptyForm); setImageUrls([]); setFiles([]); setEditingId(null); setOpenForm(false); };
  const save = async (event) => {
    event.preventDefault();
    try {
      const uploaded = await Promise.all(files.map((file) => uploadFile(api, file, "marketplace")));
      const allImages = [...imageUrls, ...uploaded.map((item) => item.url)];
      if (!allImages.length) throw new Error("Minimal satu foto barang atau jasa wajib diupload.");
      const body = { ...form, price: Number(form.price), image_urls: allImages };
      await api.request(editingId ? `/marketplace/${editingId}` : "/marketplace", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
      reset(); await load(); setMessage("Posting marketplace dikirim dan menunggu persetujuan administrator/pengurus.");
    } catch (error) { setMessage(error.message); }
  };
  const edit = (item) => { setEditingId(item.id); setForm({ title: item.title, description: item.description, item_type: item.item_type, price: String(item.price), phone: item.phone || "" }); setImageUrls(item.image_urls || []); setFiles([]); setOpenForm(true); };
  const remove = async (item) => { if (!window.confirm(`Hapus posting ${item.title}?`)) return; try { await api.request(`/marketplace/${item.id}`, { method: "DELETE" }); await load(); setMessage("Posting berhasil dihapus."); } catch (error) { setMessage(error.message); } };
  return <section className="page marketplace-manager">
    <div className="page-head"><div><h3>Posting Saya</h3><span>Hanya Anda yang dapat melihat daftar ini.</span></div><button onClick={load}>Refresh</button></div>
    {message && <p className="notice">{message}</p>}
    {openForm && <Modal title={editingId ? "Ubah posting marketplace" : "Tambah posting marketplace"} onClose={reset}><form className="composer flat marketplace-form" onSubmit={save}>
      <h3>{editingId ? "Ubah posting" : "Tambah posting marketplace"}</h3>
      <div className="row"><FormField label="Judul Barang atau Jasa"><input placeholder="Masukkan judul posting" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></FormField><FormField label="Tipe"><select value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}><option value="barang">Barang</option><option value="jasa">Jasa</option></select></FormField></div>
      <div className="row"><FormField label="Harga (Rp)"><input type="number" min="0" placeholder="Masukkan harga" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></FormField><FormField label="Nomor Telepon"><input type="tel" placeholder="Masukkan nomor kontak" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></FormField></div>
      <FormField label="Deskripsi"><textarea placeholder="Jelaskan kondisi barang atau detail layanan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></FormField>
      <div className="file-field"><span>Foto barang/jasa — bisa pilih lebih dari satu</span><div className="upload-inputs"><input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></label></div><ImageUploadPreview files={files} /></div>
      {!!imageUrls.length && <div className="photo-preview">{imageUrls.map((url, index) => <button type="button" className="photo-thumb" key={url} onClick={() => setImageUrls(imageUrls.filter((_, itemIndex) => itemIndex !== index))}><img src={publicUrl(url)} alt="" /><span>×</span></button>)}</div>}
      {!!files.length && <span className="upload-count">{files.length} foto baru dipilih</span>}
      <div className="row"><button className="primary">{editingId ? "Simpan & ajukan ulang" : "Kirim untuk persetujuan"}</button><button type="button" onClick={reset}>Batal</button></div>
    </form></Modal>}
    <div className="list">{items.map((item) => <div className="list-item marketplace-list-item" key={item.id}><div className="item-heading"><strong>{item.title}</strong><span className={`status ${item.status}`}>{item.status}</span></div><span>{item.item_type} · {formatPrice(item.price)}</span>{item.phone && <span>Telepon: {item.phone}</span>}<MarketplaceImages images={item.image_urls} alt={item.title} /><TransactionTracking createdBy={item.author_name || "Saya"} createdAt={item.created_at} events={[item.reviewed_at && { label: item.status === "rejected" ? "Posting ditolak" : "Posting direview", actor: item.reviewer_name || "Admin Komplek", at: item.reviewed_at, note: item.rejection_reason }].filter(Boolean)} />{item.rejection_reason && <p>Alasan reject: {item.rejection_reason}</p>}<div className="row actions"><button className="action-edit" type="button" onClick={() => edit(item)}><Icon name="edit" />Ubah</button><button className="action-delete" type="button" onClick={() => remove(item)}><Icon name="trash" />Hapus</button></div></div>)}{!items.length && <Empty text="Belum ada posting marketplace." />}</div>
    {!openForm && <button className="floating-add" onClick={() => { reset(); setOpenForm(true); }} aria-label="Tambah posting marketplace">+</button>}
  </section>;
}

function MarketplaceReviewQueue({ api }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [reasons, setReasons] = useState({});
  const [message, setMessage] = useState("");
  const load = () => api.request(`/marketplace/requests${filter ? `?review_status=${filter}` : ""}`).then((data) => setItems(asArray(data))).catch((error) => { setItems([]); setMessage(error.message); });
  useEffect(() => { load(); }, [filter]);
  const review = async (item, status) => {
    const rejection_reason = reasons[item.id] || "";
    if (status === "rejected" && !rejection_reason.trim()) { setMessage("Alasan reject wajib diisi."); return; }
    try { await api.request(`/marketplace/${item.id}/review`, { method: "PATCH", body: JSON.stringify({ status, rejection_reason }) }); setReasons({ ...reasons, [item.id]: "" }); await load(); setMessage(`Posting ${status === "approved" ? "disetujui" : "ditolak"}.`); } catch (error) { setMessage(error.message); }
  };
  return <section className="page marketplace-review">
    <div className="page-head marketplace-page-heading"><div><h3>Request Marketplace</h3><span>Setujui atau tolak posting penghuni pada komplek Anda.</span><label className="page-status-filter"><strong>Filter Status</strong><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="pending">Menunggu</option><option value="approved">Disetujui</option><option value="rejected">Reject</option><option value="">Semua status</option></select></label></div></div>
    {message && <p className="notice">{message}</p>}
    <div className="list">{items.map((item) => <div className="list-item marketplace-list-item" key={item.id}><div className="item-heading"><strong>{item.title}</strong><span className={`status ${item.status}`}>{item.status}</span></div><span>{item.author_name} · {item.item_type} · {formatPrice(item.price)}</span><p>{item.description}</p><MarketplaceImages images={item.image_urls} alt={item.title} /><TransactionTracking createdBy={item.author_name || "Penghuni"} createdAt={item.created_at} events={[item.reviewed_at && { label: item.status === "rejected" ? "Posting ditolak" : "Posting direview", actor: item.reviewer_name || "Admin Komplek", at: item.reviewed_at, note: item.rejection_reason }].filter(Boolean)} />{item.rejection_reason && <p>Alasan reject: {item.rejection_reason}</p>}<FormField label="Alasan Reject"><textarea placeholder="Wajib diisi bila menolak" value={reasons[item.id] || ""} onChange={(e) => setReasons({ ...reasons, [item.id]: e.target.value })} /></FormField><div className="row actions"><button className="action-done" type="button" onClick={() => review(item, "approved")}><Icon name="vote" />Approve</button><button className="action-delete" type="button" onClick={() => review(item, "rejected")}><Icon name="trash" />Reject</button></div></div>)}{!items.length && <Empty text="Tidak ada posting untuk filter ini." />}</div>
  </section>;
}


function purchaseStatusLabel(status) {
  return {
    requested: "Permintaan",
    approved: "Approved",
    rejected: "Reject",
    completed: "Diterima & Selesai",
  }[status] || status || "-";
}

function PurchaseRequests({ api }) {
  const isAdministrator = api.user.role === "administrator";
  const canCreate = ["pengurus", "security", "supports"].includes(api.user.role);
  const canComplete = ["administrator", "pengurus"].includes(api.user.role);
  const emptyItem = () => ({ item_name: "", quantity: 1, estimated_price: "" });
  const emptyForm = () => ({ header: "", items: [emptyItem()] });
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState(isAdministrator ? "requested" : "");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [completion, setCompletion] = useState({ actual_amount: "", completion_note: "" });
  const [transactionProof, setTransactionProof] = useState(null);
  const [message, setMessage] = useState("");
  const load = () => {
    const path = `/purchase-requests${filter ? `?request_status=${filter}` : ""}`;
    api.request(path).then((data) => setItems(asArray(data))).catch((error) => { setItems([]); setMessage(error.message); });
  };
  useEffect(() => { load(); }, [filter]);
  const total = (request) => request.items.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.estimated_price || 0), 0);
  const resetForm = () => { setForm(emptyForm()); setEditing(null); setFormOpen(false); };
  const openCreate = () => { setMessage(""); setForm(emptyForm()); setEditing(null); setFormOpen(true); };
  const openEdit = (request) => {
    setMessage("");
    setEditing(request);
    setForm({ header: request.header, items: request.items.map((row) => ({ item_name: row.item_name, quantity: row.quantity, estimated_price: String(row.estimated_price) })) });
    setFormOpen(true);
  };
  const updateLine = (index, changes) => setForm({ ...form, items: form.items.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row) });
  const addLine = () => setForm({ ...form, items: [...form.items, emptyItem()] });
  const removeLine = (index) => setForm({ ...form, items: form.items.filter((_, rowIndex) => rowIndex !== index) });
  const save = async (event) => {
    event.preventDefault();
    setMessage("");
    const payload = {
      header: form.header.trim(),
      items: form.items.map((row) => ({ item_name: row.item_name.trim(), quantity: Number(row.quantity), estimated_price: Number(row.estimated_price) })),
    };
    if (!payload.items.length || payload.items.some((row) => !row.item_name || row.quantity < 1 || row.estimated_price < 0)) {
      setMessage("Lengkapi minimal satu item pembelian beserta jumlah dan estimasi harga.");
      return;
    }
    try {
      await api.request(editing ? `/purchase-requests/${editing.id}` : "/purchase-requests", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      resetForm();
      await load();
      setMessage(editing ? "Permintaan diperbarui dan diajukan kembali untuk review." : "Permintaan pembelian berhasil diajukan.");
    } catch (error) { setMessage(error.message); }
  };
  const openDetail = (request) => {
    setDetail(request);
    setRejectReason(request.rejection_reason || "");
    setCompletion({ actual_amount: request.actual_amount == null ? "" : String(request.actual_amount), completion_note: request.completion_note || "" });
    setTransactionProof(null);
  };
  const review = async (reviewStatus) => {
    if (reviewStatus === "rejected" && !rejectReason.trim()) { setMessage("Alasan reject wajib diisi."); return; }
    try {
      const updated = await api.request(`/purchase-requests/${detail.id}/review`, { method: "PATCH", body: JSON.stringify({ status: reviewStatus, rejection_reason: rejectReason }) });
      setDetail(updated); await load(); setMessage(`Permintaan ${reviewStatus === "approved" ? "disetujui" : "ditolak"}.`);
    } catch (error) { setMessage(error.message); }
  };
  const complete = async (event) => {
    event.preventDefault();
    if (!transactionProof) { setMessage("Bukti transaksi wajib diunggah sebelum permintaan diselesaikan."); return; }
    try {
      const uploaded = await uploadFile(api, transactionProof, "purchase-transaction-proofs");
      const updated = await api.request(`/purchase-requests/${detail.id}/complete`, { method: "PATCH", body: JSON.stringify({ actual_amount: Number(completion.actual_amount), completion_note: completion.completion_note, transaction_proof_url: uploaded.url, transaction_proof_name: uploaded.filename || transactionProof.name }) });
      setTransactionProof(null); setDetail(updated); await load(); setMessage("Permintaan ditandai Diterima & Selesai.");
    } catch (error) { setMessage(error.message); }
  };
  const removeTransactionProof = async () => {
    if (!detail || !window.confirm("Hapus bukti transaksi ini?")) return;
    try {
      const updated = await api.request(`/purchase-requests/${detail.id}/transaction-proof`, { method: "DELETE" });
      setDetail(updated); setTransactionProof(null); await load();
    } catch (error) { setMessage(error.message); }
  };
  const replaceTransactionProof = async () => {
    if (!detail || !transactionProof) { setMessage("Pilih bukti transaksi terlebih dahulu."); return; }
    try {
      const uploaded = await uploadFile(api, transactionProof, "purchase-transaction-proofs");
      const updated = await api.request(`/purchase-requests/${detail.id}/transaction-proof`, { method: "PATCH", body: JSON.stringify({ transaction_proof_url: uploaded.url, transaction_proof_name: uploaded.filename || transactionProof.name }) });
      setDetail(updated); setTransactionProof(null); await load(); setMessage("Bukti transaksi berhasil diperbarui.");
    } catch (error) { setMessage(error.message); }
  };
  const remove = async () => {
    if (!detail || !window.confirm(`Hapus transaksi “${detail.header}”? Transaksi tidak akan tampil lagi.`)) return;
    try {
      await api.request(`/purchase-requests/${detail.id}`, { method: "DELETE" });
      setDetail(null);
      setTransactionProof(null);
      await load();
      setMessage("Transaksi permintaan pembelian berhasil dihapus.");
    } catch (error) { setMessage(error.message); }
  };
  return <section className="page purchase-request-page">
    <div className="page-head purchase-page-heading"><div><h3>Permintaan Pembelian</h3><span>{isAdministrator ? "Review permintaan dan catat realisasi dana pembelian." : "Daftar permintaan pembelian yang Anda ajukan."}</span>{isAdministrator && <label className="purchase-status-filter"><strong>Filter Status</strong><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="requested">Permintaan</option><option value="approved">Approved</option><option value="rejected">Reject</option><option value="completed">Diterima & Selesai</option><option value="">Semua status</option></select></label>}</div></div>
    {message && <p className="notice">{message}</p>}
    <div className="list">{items.map((request) => <button type="button" className={`list-item clickable purchase-request-item ${request.status}`} key={request.id} onClick={() => openDetail(request)}><div className="item-heading"><strong>{request.header}</strong><span className={`status ${request.status}`}>{purchaseStatusLabel(request.status)}</span></div><span>{isAdministrator ? `${request.requester_name || "Staff"} · ` : ""}{request.items.length} item · {formatPrice(request.estimated_total)}</span><span>Diajukan {request.created_at ? new Date(request.created_at).toLocaleDateString("id-ID") : "-"}</span>{request.rejection_reason && <p>Alasan reject: {request.rejection_reason}</p>}{request.status === "completed" && <strong>Realisasi: {formatPrice(request.actual_amount)}</strong>}<div className="purchase-item-preview">{request.items.slice(0, 2).map((row) => <span key={row.id}>{row.quantity} × {row.item_name}</span>)}{request.items.length > 2 && <span>+{request.items.length - 2} item lain</span>}</div><TransactionTracking createdBy={request.requester_name || "Staff"} createdAt={request.created_at} events={[request.reviewed_at && { label: request.status === "rejected" ? "Permintaan ditolak" : "Permintaan direview", actor: request.reviewer_name || "Admin Komplek", at: request.reviewed_at, note: request.rejection_reason }, request.completed_at && { label: "Diterima & selesai", actor: request.completed_by_name || request.reviewer_name || "Admin Komplek", at: request.completed_at, note: request.completion_note }].filter(Boolean)} /><span className="purchase-open">Buka detail</span></button>)}{!items.length && <Empty text={isAdministrator ? "Tidak ada permintaan pada status ini." : "Belum ada permintaan pembelian yang Anda ajukan."} />}</div>
    {canCreate && !formOpen && <button className="floating-add" type="button" onClick={openCreate} aria-label="Tambah transaksi pembelian" title="Add Transaksi"><Icon name="plus" /></button>}
    {formOpen && <Modal title={editing ? "Ubah Permintaan Pembelian" : "Tambah Permintaan Pembelian"} onClose={resetForm}><form className="composer flat purchase-form" onSubmit={save}><FormField label="Header Permintaan"><input placeholder="Contoh: Pengadaan perlengkapan keamanan" value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })} required /></FormField><div className="purchase-form-head"><strong>Item Barang</strong><button type="button" onClick={addLine}>+ Tambah item</button></div><div className="purchase-lines">{form.items.map((row, index) => <div className="purchase-line" key={index}><FormField label="Nama Barang"><input placeholder="Masukkan nama barang" value={row.item_name} onChange={(e) => updateLine(index, { item_name: e.target.value })} required /></FormField><FormField label="Jumlah"><input type="number" min="1" placeholder="0" value={row.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} required /></FormField><FormField label="Estimasi Harga (Rp)"><input type="number" min="0" placeholder="0" value={row.estimated_price} onChange={(e) => updateLine(index, { estimated_price: e.target.value })} required /></FormField>{form.items.length > 1 && <button type="button" className="icon-only" onClick={() => removeLine(index)} aria-label="Hapus item">×</button>}</div>)}</div><strong className="purchase-total">Total estimasi: {formatPrice(total({ items: form.items }))}</strong><div className="row"><button className="primary">{editing ? "Simpan & ajukan ulang" : "Ajukan pembelian"}</button><button type="button" onClick={resetForm}>Batal</button></div></form></Modal>}
    {detail && <Modal title="Detail Permintaan Pembelian" onClose={() => { setDetail(null); setTransactionProof(null); }}><div className="detail-pane purchase-detail"><div className="item-heading"><h3>{detail.header}</h3><span className={`status ${detail.status}`}>{purchaseStatusLabel(detail.status)}</span></div><span>Pengaju: {detail.requester_name || "-"}</span><span>Total estimasi: <strong>{formatPrice(detail.estimated_total)}</strong></span><div className="purchase-detail-items">{detail.items.map((row) => <div key={row.id}><span>{row.item_name}</span><span>{row.quantity} × {formatPrice(row.estimated_price)}</span><strong>{formatPrice(row.quantity * row.estimated_price)}</strong></div>)}</div>{detail.rejection_reason && <p>Alasan reject: {detail.rejection_reason}</p>}{detail.status === "completed" && <><strong>Nominal pemakaian dana: {formatPrice(detail.actual_amount)}</strong>{detail.completion_note && <p>Catatan: {detail.completion_note}</p>}<ExistingUploadPreviews items={detail.transaction_proof_url ? [{ file_url: detail.transaction_proof_url, file_name: detail.transaction_proof_name || "Bukti transaksi" }] : []} onRemove={detail.completed_by === api.user.id ? removeTransactionProof : null} emptyText="Bukti transaksi belum tersedia." />{detail.completed_by === api.user.id && !detail.transaction_proof_url && <div className="file-field"><span>Upload Ulang Bukti Transaksi</span><div className="upload-inputs"><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setTransactionProof(e.target.files?.[0] || null)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setTransactionProof(e.target.files?.[0] || null)} /></label></div><ImageUploadPreview files={transactionProof} />{transactionProof && <button className="action-update" type="button" onClick={replaceTransactionProof}>Simpan bukti baru</button>}</div>}</>}{canCreate && detail.status !== "completed" && <button className="action-edit" type="button" onClick={() => { setDetail(null); openEdit(detail); }}><Icon name="edit" />Ubah permintaan</button>}{isAdministrator && ["requested", "rejected"].includes(detail.status) && <><FormField label="Alasan Reject"><textarea placeholder="Wajib diisi bila menolak" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></FormField><div className="row actions"><button className="action-done" type="button" onClick={() => review("approved")}><Icon name="vote" />Approve</button><button className="action-delete" type="button" onClick={() => review("rejected")}><Icon name="trash" />Reject</button></div></>}{canComplete && detail.status === "approved" && <form className="composer flat purchase-completion" onSubmit={complete}><h3>Diterima & Selesai</h3><FormField label="Nominal Pemakaian Dana (Rp)"><input type="number" min="0" placeholder="Masukkan nominal realisasi" value={completion.actual_amount} onChange={(e) => setCompletion({ ...completion, actual_amount: e.target.value })} required /></FormField><div className="file-field"><span>Bukti Transaksi (Foto / Dokumen) — wajib</span><div className="upload-inputs"><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setTransactionProof(e.target.files?.[0] || null)} /><label className="camera-file-button"><Icon name="camera" /><span>Ambil Foto</span><input className="camera-capture-input" type="file" capture="environment" accept="image/*" onChange={(e) => setTransactionProof(e.target.files?.[0] || null)} /></label></div><ImageUploadPreview files={transactionProof} /></div>{transactionProof && <span className="upload-count">File dipilih: {transactionProof.name}</span>}<FormField label="Catatan Penyelesaian"><textarea placeholder="Opsional" value={completion.completion_note} onChange={(e) => setCompletion({ ...completion, completion_note: e.target.value })} /></FormField><button className="primary"><Icon name="vote" />Simpan penerimaan & selesai</button></form>}{isAdministrator && <button className="action-delete purchase-delete-button" type="button" onClick={remove}><Icon name="trash" />Hapus transaksi</button>}</div></Modal>}
  </section>;
}
