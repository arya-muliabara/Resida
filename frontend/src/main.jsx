import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
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

function useApi() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user") || "null"));

  const request = async (path, options = {}) => {
    const isFormData = options.body instanceof FormData;
    const headers = { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(formatApiError(data));
    return data;
  };

  const login = async (email, password) => {
    const data = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
  };

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return { token, user, setUser, request, login, logout };
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
  const [form, setForm] = useState({ email: "", password: "", complex_id: "", ktp_document: null });
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
        const email = form.email.trim().toLowerCase();
        const complexId = form.complex_id || complexes[0]?.id || "";
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
        data.append("email", email);
        data.append("password", form.password);
        data.append("complex_id", String(complexId));
        data.append("ktp_document", form.ktp_document);
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
        <div className="auth-brand"><div className="brand-mark">R</div><h1>{APP_NAME}</h1></div>
        <p>Rukun dalam satu platform</p>
        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Registrasi</button>
        </div>
        <form onSubmit={submit} className="stack">
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Password" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {mode === "register" && (
            <>
              <select value={form.complex_id} onChange={(e) => setForm({ ...form, complex_id: e.target.value })} required>
                <option value="">Pilih komplek</option>
                {complexes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
              <label className="file-field">
                <span>Upload Dokumen Pendukung (KTP, Domisili)</span>
                <input type="file" accept="image/*,.pdf" onChange={(e) => setForm({ ...form, ktp_document: e.target.files?.[0] || null })} required />
              </label>
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
  const [tab, setTab] = useState("home");
  const [navReset, setNavReset] = useState(0);
  const [complexName, setComplexName] = useState(APP_NAME);
  const [complexLogo, setComplexLogo] = useState("");
  const isAdmin = api.user?.role === "administrator";
  const isSuper = api.user?.role === "superadmin";
  const isSecurity = api.user?.role === "security";
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
  if (!api.user) return <AuthScreen api={api} />;
  const superTabs = ["complex-management", "user-access", "whatsapp-gateway"];
  const activeTab = isSuper ? (superTabs.includes(tab) ? tab : "complex-management") : tab;
  const navItems = isSuper ? superTabs : ["home", "letters", "lapor", "booking", "profile"];
  const goTab = (item) => {
    setTab(item);
    setNavReset((value) => value + 1);
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <strong className="header-brand"><span className="header-logo">{APP_NAME.slice(0, 1)}</span><span>{APP_NAME}</span></strong>
          <span className={isAdmin ? "admin-user" : ""}>Welcome, {api.user.full_name} - {isSuper ? `${APP_NAME} Admin` : complexName}</span>
        </div>
        {!isSuper && <NotificationBell api={api} onNavigate={goTab} />}
        <AccountMenu api={api} complexLogo={complexLogo} />
      </header>
      <main className="content">
        <ErrorBoundary key={`${activeTab}-${navReset}`}>
          {activeTab === "home" && <Home api={api} isAdmin={isAdmin} onNavigate={goTab} />}
          {activeTab === "booking" && <Booking api={api} isAdmin={isAdmin} calendarOnly />}
          {activeTab === "lapor" && <Reports api={api} isAdmin={isAdmin} isSecurity={isSecurity} startOpen={api.user.role === "penghuni"} />}
          {activeTab === "profile" && <Profile api={api} />}
          {activeTab === "letters" && <RequestHub api={api} isAdmin={isAdmin} isSecurity={isSecurity} />}
          {activeTab === "complex-management" && isSuper && <ComplexManagement api={api} />}
          {activeTab === "user-access" && isSuper && <UserAccess api={api} />}
          {activeTab === "whatsapp-gateway" && isSuper && <WhatsAppGateway api={api} />}
        </ErrorBoundary>
      </main>
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <button key={item} className={`${activeTab === item ? "active" : ""} ${item === "lapor" ? "scan-nav" : ""}`} onClick={() => goTab(item)} title={label(item, isAdmin)}>
            <Icon name={navIcon(item)} />
            <span>{label(item, isAdmin)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function label(tab, isAdmin = false) {
  return {
    home: "Beranda",
    booking: "Jadwal",
    lapor: "Lapor",
    profile: isAdmin ? "Komplek" : "Profil",
    letters: "Request",
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
    profile: "building",
    letters: "megaphone",
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
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    megaphone: <><path d="m3 11 14-5v12L3 13z" /><path d="M7 14v5" /><path d="M18 9.5a4 4 0 0 1 0 5" /><path d="M21 8a7 7 0 0 1 0 8" /></>,
    bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
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
  const openItem = async (item) => {
    if (!item.is_read) {
      await api.request(`/notifications/${item.id}/read`, { method: "PATCH" }).catch(() => null);
    }
    setOpen(false);
    load();
    if (["report", "news"].includes(item.link_type)) onNavigate("letters");
    if (item.link_type === "event") onNavigate("booking");
  };
  return (
    <div className="notification-menu">
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

function AccountMenu({ api, complexLogo = "" }) {
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" });
  const [message, setMessage] = useState("");

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
    if (window.confirm("Yakin ingin logout?")) api.logout();
  };

  return (
    <div className="account-menu">
      <button className="profile-button" type="button" onClick={() => setOpen(!open)} title="Profil user">
        {complexLogo ? <img src={publicUrl(complexLogo)} alt="" /> : <span>{(api.user.full_name || "U").slice(0, 1).toUpperCase()}</span>}
      </button>
      {open && (
        <div className="account-dropdown">
          <button type="button" onClick={() => { setOpen(false); setMessage(""); setPasswordOpen(true); }}><Icon name="lock" />Ubah Password</button>
          <button type="button" onClick={confirmLogout}><Icon name="logout" />Logout</button>
        </div>
      )}
      {passwordOpen && (
        <Modal title="Ubah Password" onClose={() => setPasswordOpen(false)}>
          <form className="composer flat" onSubmit={changePassword}>
            {message && <p className="notice">{message}</p>}
            <input type="password" placeholder="Password lama" value={passwordForm.current_password} onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} required />
            <input type="password" placeholder="Password baru" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} required />
            <button className="primary">Ubah password</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

async function uploadFile(api, file, folder) {
  const data = new FormData();
  data.append("file", file);
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
  if (!href) return null;
  const fallback = decodeURIComponent(href.split("/").pop() || "Buka file");
  return (
    <a className="file-link" href={publicUrl(href)} target="_blank" rel="noreferrer">
      <Icon name="file" />{label || fallback}
    </a>
  );
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
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ title: "", content: "", is_active: true });
  const [mediaFiles, setMediaFiles] = useState([]);
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
  const openCreate = () => { setError(""); setEditing(null); setMediaFiles([]); setForm({ title: "", content: "", is_active: true }); setShowForm(true); };
  const openEdit = (item) => { setError(""); setEditing(item); setMediaFiles([]); setForm({ title: item.title || "", content: item.content || "", is_active: item.is_active !== false }); setShowForm(true); };
  const update = async (event) => {
    event.preventDefault();
    try {
      const uploaded = await uploadFiles(api, mediaFiles, "news");
      const payload = { ...form };
      if (uploaded.length) payload.media_urls = uploaded.map((item) => item.url);
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
            <input placeholder="Judul berita" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <textarea placeholder="Isi berita" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
            <label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Aktif</span></label>
            <label className="file-field"><span>Upload attachment opsional</span><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => setMediaFiles(e.target.files)} /></label>
            <button className="primary">{editing ? "Simpan berita" : "Publikasikan"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function NewsCard({ item, api, reload, isAdmin, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
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
        <p>{open ? content : content.slice(0, 120)}</p>
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
      {imagePreview && <Modal title={item.title} onClose={() => setImagePreview("")}><img className="full-image" src={publicUrl(imagePreview)} alt="" /></Modal>}
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

function overlapsCalendarMonth(item, cursor) {
  const start = new Date(item.start_datetime);
  const end = new Date(item.end_datetime || item.start_datetime);
  if (Number.isNaN(start.getTime())) return false;
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
  return start <= monthEnd && end >= monthStart;
}

function RequestHub({ api, isAdmin, isSecurity }) {
  const [section, setSection] = useState(isSecurity ? "reports" : "menu");
  const isResident = api.user.role === "penghuni";
  const baseMenuItems = [
    { key: "reports", icon: "report", title: "Laporan Penghuni", desc: "Laporkan masalah komplek" },
    { key: "letters", icon: "file", title: "Request Surat", desc: "Administrasi surat menyurat" },
    { key: "voting", icon: "vote", title: "Voting Submit", desc: "Lihat dan submit voting warga" },
    { key: "booking", icon: "calendar", title: "Booking Fasilitas", desc: "Ajukan pemakaian fasilitas" },
    { key: "news", icon: "newspaper", title: "News Contribute", desc: "Kirim berita untuk direview admin" },
  ];
  const menuItems = isAdmin
    ? [
      { key: "registrations", icon: "users", title: "Request Pendaftaran", desc: "Validasi pendaftaran penghuni" },
      { key: "residents", icon: "building", title: "Kelola ID Penghuni", desc: "CRUD Penghuni, Security, dan Supports" },
      ...baseMenuItems,
      { key: "events", icon: "calendar", title: "Events", desc: "Agenda komplek untuk kalender" },
    ]
    : baseMenuItems.filter((item) => isResident || !["voting", "booking", "news"].includes(item.key));
  return (
    <section className="page request-page">
      {section === "menu" && (
        <>
          <div className="page-head"><h2>Request</h2></div>
          <div className="request-grid">
            {menuItems.map((item) => (
              <button key={item.key} type="button" className="request-tile" onClick={() => setSection(item.key)}>
                <Icon name={item.icon} />
                <span><strong>{item.title}</strong><small>{item.desc}</small></span>
              </button>
            ))}
          </div>
        </>
      )}
      {section !== "menu" && <div className="subnav"><button type="button" onClick={() => setSection("menu")}>Kembali</button></div>}
      {section === "letters" && <Letters api={api} isAdmin={isAdmin} />}
      {section === "voting" && <Voting api={api} isAdmin={isAdmin} />}
      {section === "booking" && <Booking api={api} isAdmin={isAdmin} />}
      {section === "news" && <NewsContribution api={api} />}
      {section === "reports" && <Reports api={api} isAdmin={isAdmin} isSecurity={isSecurity} />}
      {section === "registrations" && isAdmin && <RegistrationRequests api={api} />}
      {section === "residents" && isAdmin && <ResidentManagement api={api} />}
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
      if (uploaded.length) payload.media_urls = uploaded.map((item) => item.url);
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
  const requestMonthBookings = filteredBookings.filter((booking) => overlapsCalendarMonth(booking, calendarCursor));
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
      {view === "calendar" && <><div className="toolbar-row"><input className="search-input" placeholder="Cari request booking" value={bookingQuery} onChange={(e) => setBookingQuery(e.target.value)} /></div><Calendar bookings={approvedMonthBookings} events={monthEvents} cursor={calendarCursor} onCursorChange={setCalendarCursor} /><div className="list">{requestMonthBookings.map((b) => { const canManageBooking = isAdmin || b.status !== "approved"; return <BookingListItem key={b.id} booking={b}>{isAdmin && <StatusButtons api={api} booking={b} reload={load} />}{canManageBooking && <div className="row actions"><button className="action-edit" type="button" onClick={() => openEditBooking(b)}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={() => deleteBooking(b)}><Icon name="trash" />Delete</button></div>}</BookingListItem>; })}</div></>}
      {facilityModal && <Modal title={editingFacility ? "Edit Fasilitas" : "Tambah Fasilitas"} onClose={() => setFacilityModal(false)}><form className="composer flat" onSubmit={editingFacility ? updateFacility : createFacility}>{message && <p className="notice">{message}</p>}<input placeholder="Nama fasilitas" value={facilityForm.name} onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })} required /><div className="row color-row"><span className="color-preview" style={{ background: facilityForm.color_hex }} /> <input type="color" value={facilityForm.color_hex} onChange={(e) => setFacilityForm({ ...facilityForm, color_hex: e.target.value })} /><input type="number" value={facilityForm.capacity} onChange={(e) => setFacilityForm({ ...facilityForm, capacity: e.target.value })} /></div><label className="file-field"><span>Upload media fasilitas</span><input type="file" accept="image/*" multiple onChange={(e) => setFacilityFiles(e.target.files)} /></label><textarea placeholder="Deskripsi" value={facilityForm.description} onChange={(e) => setFacilityForm({ ...facilityForm, description: e.target.value })} /><button className="primary">{editingFacility ? "Simpan fasilitas" : "Tambah fasilitas"}</button></form></Modal>}
      {bookingModal && <Modal title={editingBooking ? "Edit Booking" : `Booking ${selected?.name || ""}`} onClose={() => setBookingModal(false)}><form className="composer flat" onSubmit={editingBooking ? updateBooking : createBooking}>{message && <p className="notice">{message}</p>}<select value={selected?.id || ""} onChange={(e) => setSelected(facilities.find((facility) => String(facility.id) === e.target.value) || null)}>{asArray(facilities).map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select><input type="datetime-local" value={bookingForm.start_datetime} onChange={(e) => setBookingForm({ ...bookingForm, start_datetime: e.target.value })} required /><input type="datetime-local" value={bookingForm.end_datetime} onChange={(e) => setBookingForm({ ...bookingForm, end_datetime: e.target.value })} required /><textarea placeholder="Catatan" value={bookingForm.notes} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} />{editingBooking && isAdmin && <select value={bookingForm.status} onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value })}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select>}<button className="primary">{editingBooking ? "Simpan booking" : "Ajukan booking"}</button></form></Modal>}
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
  return <section className="page"><div className="page-head"><h2>Voting</h2><input className="search-input" placeholder="Cari voting" value={query} onChange={(e) => setQuery(e.target.value)} />{isAdmin && <button className="primary" type="button" onClick={openCreate}>Tambah Voting</button>}</div>{message && <p className="notice">{message}</p>}<div className="feed">{filteredItems.map((v) => <VotingCard key={v.id} item={v} api={api} reload={load} isAdmin={isAdmin} onEdit={openEdit} onDelete={remove} onTogglePublish={togglePublish} />)}{!filteredItems.length && <Empty text="Belum ada voting aktif." />}</div>{showForm && <Modal title={editing ? "Edit Voting" : "Tambah Voting"} onClose={() => { setShowForm(false); setEditing(null); }}><form className="composer flat" onSubmit={editing ? update : create}>{message && <p className="notice">{message}</p>}<input placeholder="Judul" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /><textarea placeholder="Deskripsi" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /><input placeholder="URL gambar" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /><input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /><input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required /><textarea value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} /><label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Publish</span></label><button className="primary">{editing ? "Simpan voting" : "Buka voting"}</button></form></Modal>}</section>;
}

function VotingCard({ item, api, reload, isAdmin, onEdit, onDelete, onTogglePublish }) {
  const vote = async (option_id) => { await api.request(`/votings/${item.id}/vote`, { method: "POST", body: JSON.stringify({ option_id }) }); reload(); };
  return <article className="card">{item.image_url && <img src={publicUrl(item.image_url)} alt="" />}<div className="card-body"><div className="item-heading"><h3>{item.title}</h3>{isAdmin && <span className={`status ${item.is_active ? "approved" : "pending"}`}>{item.is_active ? "published" : "draft"}</span>}</div><p>{item.description}</p>{asArray(item.options).map((o) => <label className="choice" key={o.id}><input type="radio" checked={item.my_option_id === o.id} onChange={() => vote(o.id)} disabled={isAdmin} /> <span>{o.option_text}</span><b>{o.votes_count}</b>{isAdmin && !!asArray(o.voters).length && <small>{asArray(o.voters).join(", ")}</small>}</label>)}{isAdmin && <div className="row actions"><button type="button" onClick={() => onEdit(item)}>Edit</button><button type="button" onClick={() => onTogglePublish(item)}>{item.is_active ? "Unpublish" : "Publish"}</button><button type="button" onClick={() => onDelete(item)}>Delete</button></div>}</div></article>;
}

function NewsContribution({ api }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: "", content: "", is_active: false });
  const [files, setFiles] = useState([]);
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
    setForm({ title: item.title || "", content: item.content || "", is_active: item.is_active !== false });
    setShowForm(true);
  };
  const saveReview = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const uploaded = await uploadFiles(api, files, "news");
      const payload = { ...form };
      if (uploaded.length) payload.media_urls = uploaded.map((item) => item.url);
      await api.request(`/news/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
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
        {items.map((item) => <div className="list-item" key={item.id}><div className="item-heading"><strong>{item.title}</strong><span className={`status ${item.is_active ? "approved" : "pending"}`}>{item.is_active ? "published" : "review"}</span></div><p>{item.content}</p><div className="attachment-list">{asArray(item.media).map((file) => <UploadedFileLink key={file.id} href={file.file_url} label={file.file_name || "Attachment berita"} />)}</div>{!isResident && <div className="row actions"><button type="button" onClick={() => openEdit(item)}>Edit</button><button type="button" onClick={() => togglePublish(item)}>{item.is_active ? "Unpublish" : "Publish"}</button></div>}</div>)}
        {!items.length && <Empty text="Belum ada kontribusi berita." />}
      </div>
      {showForm && <Modal title={editing ? "Review News" : "News Contribute"} onClose={() => { setShowForm(false); setEditing(null); }}><form className="composer flat" onSubmit={editing ? saveReview : submit}><input placeholder="Judul berita" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /><textarea placeholder="Isi berita" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />{editing && <label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Publish</span></label>}<label className="file-field"><span>Upload attachment opsional</span><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => setFiles(e.target.files)} /></label><button className="primary">{editing ? "Simpan review" : "Kirim review"}</button></form></Modal>}
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
            <div className="attachment-list">{asArray(item.attachments).map((file) => <UploadedFileLink key={file.id} href={file.file_url} label={file.file_name || "Foto laporan"} />)}</div>
            {asArray(item.followups).map((followup) => <p key={followup.id}><strong>{followup.handler_name || "Petugas"}:</strong> {followup.note}</p>)}
            {canHandle && <div className="row actions"><button type="button" onClick={() => setActive(item)}>Tindak lanjut</button>{isAdmin && <button type="button" onClick={() => publish(item, item.published_news_id ? "unpublish" : "publish")}>{item.published_news_id ? "Unpublish News" : "Publish News"}</button>}</div>}
          </div>
        ))}
        {!items.length && <Empty text="Belum ada laporan." />}
      </div>
      {showForm && <Modal title="Buat Laporan" onClose={() => setShowForm(false)}><form className="composer flat" onSubmit={create}><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Keamanan</option><option>Kebersihan</option><option>Fasilitas</option><option>Infrastruktur</option><option>Lainnya</option></select><input placeholder="Judul laporan" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /><textarea placeholder="Detail laporan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /><input placeholder="Lokasi kejadian" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select><label className="file-field"><span>Foto opsional</span><input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} /></label><button className="primary">Kirim laporan</button></form></Modal>}
      {active && <Modal title="Tindak Lanjut" onClose={() => setActive(null)}><form className="composer flat" onSubmit={follow}><textarea placeholder="Update tindak lanjut" value={followForm.note} onChange={(e) => setFollowForm({ ...followForm, note: e.target.value })} required /><select value={followForm.status_after} onChange={(e) => setFollowForm({ ...followForm, status_after: e.target.value })}><option value="open">Open</option><option value="closed">Closed</option></select><label className="file-field"><span>Foto hasil tindak lanjut</span><input type="file" accept="image/*" multiple onChange={(e) => setFollowFiles(e.target.files)} /></label><button className="primary">Simpan update</button></form></Modal>}
    </section>
  );
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
      {showForm && <Modal title={editing ? "Edit Event" : "Tambah Event"} onClose={() => setShowForm(false)}><form className="composer flat" onSubmit={save}><input placeholder="Nama event" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /><input placeholder="Lokasi" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><input type="datetime-local" value={form.start_datetime} onChange={(e) => setForm({ ...form, start_datetime: e.target.value })} required /><input type="datetime-local" value={form.end_datetime} onChange={(e) => setForm({ ...form, end_datetime: e.target.value })} /><textarea placeholder="Deskripsi" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Aktif</span></label><button className="primary">Simpan event</button></form></Modal>}
    </section>
  );
}

function Profile({ api }) {
  const isAdmin = api.user.role === "administrator";
  const [houses, setHouses] = useState([]);
  const [residents, setResidents] = useState([]);
  const [query, setQuery] = useState("");
  const [houseFile, setHouseFile] = useState(null);
  const [houseDocs, setHouseDocs] = useState([]);
  const [houseForm, setHouseForm] = useState({ user_id: "", address: "", block: "", number: "", gps_coordinates: "", house_photo_url: "", house_status: "ditempati" });
  const [memberForm, setMemberForm] = useState({ full_name: "", relationship: "", birth_place: "", birth_date: "", member_type: "anggota_keluarga", phone: "", ktp_number: "" });
  const [memberFile, setMemberFile] = useState(null);
  const [houseModal, setHouseModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [activeTab, setActiveTab] = useState("house");
  const [selectedHouse, setSelectedHouse] = useState(null);
  const [editingHouse, setEditingHouse] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [message, setMessage] = useState("");
  const loadHouses = () => api.request("/profile/houses").then((data) => setHouses(asArray(data))).catch((error) => { setHouses([]); setMessage(error.message); });
  const loadResidents = () => {
    if (!isAdmin) return;
    api.request("/complexes/residents").then((data) => setResidents(asArray(data))).catch(() => setResidents([]));
  };
  useEffect(() => {
    loadHouses();
    loadResidents();
  }, []);
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
    setHouseForm(house ? { user_id: house.user_id || "", address: house.address || "", block: house.block || "", number: house.number || "", gps_coordinates: house.gps_coordinates || "", house_photo_url: house.house_photo_url || "", house_status: house.house_status || "ditempati" } : { user_id: "", address: "", block: "", number: "", gps_coordinates: "", house_photo_url: "", house_status: "ditempati" });
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
      }
      const uploadedDocs = await uploadFiles(api, houseDocs, "house-documents");
      if (uploadedDocs.length) payload.document_urls = uploadedDocs.map((item) => item.url);
      const saved = await api.request(editingHouse ? `/profile/houses/${editingHouse.id}` : "/profile/houses", { method: editingHouse ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setSelectedHouse(saved);
      setHouseFile(null);
      setHouseDocs([]);
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
    setMemberForm(member ? { full_name: member.full_name || "", relationship: member.relationship || "", birth_place: member.birth_place || "", birth_date: (member.birth_date || "").slice(0, 10), member_type: member.member_type || "anggota_keluarga", phone: member.phone || "", ktp_number: member.ktp_number || "" } : { full_name: "", relationship: "", birth_place: "", birth_date: "", member_type: "anggota_keluarga", phone: "", ktp_number: "" });
    setMemberModal(true);
  };
  const saveMember = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      if (!selectedHouse) throw new Error("Pilih rumah terlebih dahulu.");
      const payload = { ...memberForm, birth_date: memberForm.birth_date ? `${memberForm.birth_date}T00:00:00` : null };
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
      await refreshSelected(selectedHouse.id);
    } catch (error) { setMessage(error.message); }
  };
  const deleteMember = async (member) => {
    if (!window.confirm(`Hapus anggota ${member.full_name}?`)) return;
    try { await api.request(`/profile/houses/${selectedHouse.id}/members/${member.id}`, { method: "DELETE" }); await refreshSelected(selectedHouse.id); } catch (error) { setMessage(error.message); }
  };
  const filteredHouses = asArray(houses).filter((house) => [house.owner_name, house.owner_email, house.address, house.block, house.number, house.house_status].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="page">
      <div className="page-head"><h2>Profil Rumah</h2><input className="search-input" placeholder="Cari rumah" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="primary" type="button" onClick={() => openHouseForm()}>Tambah Rumah</button></div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {filteredHouses.map((house) => <div className="list-item clickable house-list-item" key={house.id} onClick={() => openDetail(house)}><span className="house-icon"><Icon name="home" /></span>{house.house_photo_url && <img className="thumb" src={publicUrl(house.house_photo_url)} alt="" />}<div className="item-heading"><strong>Blok {house.block} No. {house.number}</strong><span className="status approved">{house.house_status}</span></div>{isAdmin && <span>{house.owner_name || "Belum terhubung"} - {house.owner_email || `UserID ${house.user_id}`}</span>}<span>{house.address}</span>{house.gps_coordinates && <span>{house.gps_coordinates}</span>}{isAdmin && <div className="attachment-list">{asArray(house.documents).map((doc) => <UploadedFileLink key={doc.id} href={doc.file_url} label={doc.file_name || "Kartu Keluarga"} />)}</div>}<div className="row actions"><button type="button" onClick={(event) => { event.stopPropagation(); openHouseForm(house); }}>Edit</button><button type="button" onClick={(event) => { event.stopPropagation(); deleteHouse(house); }}>Delete</button></div></div>)}
        {!filteredHouses.length && <Empty text="Belum ada data rumah." />}
      </div>
      {detailModal && selectedHouse && <Modal title={`Blok ${selectedHouse.block} No. ${selectedHouse.number}`} onClose={() => setDetailModal(false)}><div className="tabs"><button type="button" className={activeTab === "house" ? "active" : ""} onClick={() => setActiveTab("house")}>Profil Rumah</button><button type="button" className={activeTab === "members" ? "active" : ""} onClick={() => setActiveTab("members")}>Anggota Keluarga</button></div>{activeTab === "house" && <div className="detail-pane">{selectedHouse.house_photo_url && <img className="thumb" src={publicUrl(selectedHouse.house_photo_url)} alt="" />}{isAdmin && <span>{selectedHouse.owner_name || "Belum terhubung"} - UserID {selectedHouse.user_id}</span>}<p>{selectedHouse.address}</p><span>Blok {selectedHouse.block} No. {selectedHouse.number}</span><span>Status: {selectedHouse.house_status}</span>{selectedHouse.gps_coordinates && <span>GPS: {selectedHouse.gps_coordinates}</span>}<div className="attachment-list">{asArray(selectedHouse.documents).map((doc) => <UploadedFileLink key={doc.id} href={doc.file_url} label={doc.file_name || "Kartu Keluarga"} />)}</div><div className="row actions"><button type="button" onClick={() => openHouseForm(selectedHouse)}>Edit</button><button type="button" onClick={() => deleteHouse(selectedHouse)}>Delete</button></div></div>}{activeTab === "members" && <div className="detail-pane"><div className="page-head small"><h2>Anggota</h2><button className="primary" type="button" onClick={() => openMember()}>Tambah Anggota</button></div><div className="list">{asArray(selectedHouse.family_members).map((member) => <div className="list-item" key={member.id}><div className="item-heading"><strong>{member.full_name}</strong><span className="status approved">{familyMemberTypeLabel(member.member_type)}</span></div><span>{member.birth_place || "-"} {member.birth_date ? `- ${new Date(member.birth_date).toLocaleDateString()}` : ""}</span><span>{member.relationship || "-"} - {member.phone || "-"}</span>{member.ktp_number && <span>{member.ktp_number}</span>}<UploadedFileLink href={member.identity_document_url} label={member.identity_document_name || "Identitas anggota"} /><div className="row actions"><button type="button" onClick={() => openMember(member)}>Edit</button><button type="button" onClick={() => deleteMember(member)}>Delete</button></div></div>)}{!asArray(selectedHouse.family_members).length && <Empty text="Belum ada anggota keluarga." />}</div></div>}</Modal>}
      {houseModal && <Modal title={editingHouse ? "Edit Rumah" : "Tambah Rumah"} onClose={() => { setHouseModal(false); setEditingHouse(null); }}><form className="composer flat" onSubmit={saveHouse}>{message && <p className="notice">{message}</p>}{isAdmin && <select value={houseForm.user_id} onChange={(e) => setHouseForm({ ...houseForm, user_id: e.target.value })} required><option value="">Pilih User Access/UserID</option>{asArray(residents).filter((user) => user.role === "penghuni").map((user) => <option key={user.id} value={user.id}>UserID {user.id} - {user.full_name} - {user.email}</option>)}</select>}<textarea placeholder="Alamat rumah" value={houseForm.address} onChange={(e) => setHouseForm({ ...houseForm, address: e.target.value })} required /><div className="row"><input placeholder="Blok" value={houseForm.block} onChange={(e) => setHouseForm({ ...houseForm, block: e.target.value })} required /><input placeholder="Nomor" value={houseForm.number} onChange={(e) => setHouseForm({ ...houseForm, number: e.target.value })} required /></div><div className="row"><input placeholder="Koordinat GPS" value={houseForm.gps_coordinates} onChange={(e) => setHouseForm({ ...houseForm, gps_coordinates: e.target.value })} readOnly={!isAdmin} /><button type="button" className="icon-only" onClick={detectLocation} title="Deteksi lokasi"><Icon name="qr" /></button></div><label className="file-field"><span>Upload foto rumah</span><input type="file" accept="image/*" onChange={(e) => setHouseFile(e.target.files?.[0] || null)} /></label><label className="file-field"><span>Upload Kartu Keluarga</span><input type="file" accept="image/*,.pdf,.doc,.docx" multiple onChange={(e) => setHouseDocs(e.target.files)} /></label><select value={houseForm.house_status} onChange={(e) => setHouseForm({ ...houseForm, house_status: e.target.value })}><option value="ditempati">Ditempati</option><option value="dihuni">Dihuni</option><option value="kosong">Kosong</option></select><button className="primary">Simpan rumah</button></form></Modal>}
      {memberModal && <Modal title={editingMember ? "Edit Anggota" : "Tambah Anggota"} onClose={() => { setMemberModal(false); setEditingMember(null); }}><form className="composer flat" onSubmit={saveMember}>{message && <p className="notice">{message}</p>}<input placeholder="Nama anggota" value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} required /><input placeholder="Hubungan keluarga" value={memberForm.relationship} onChange={(e) => setMemberForm({ ...memberForm, relationship: e.target.value })} /><div className="row"><input placeholder="Tempat lahir" value={memberForm.birth_place} onChange={(e) => setMemberForm({ ...memberForm, birth_place: e.target.value })} /><input type="date" value={memberForm.birth_date} onChange={(e) => setMemberForm({ ...memberForm, birth_date: e.target.value })} /></div><div className="radio-row"><label><input type="radio" checked={memberForm.member_type === "kepala_keluarga"} onChange={() => setMemberForm({ ...memberForm, member_type: "kepala_keluarga" })} /> Kepala keluarga</label><label><input type="radio" checked={memberForm.member_type === "anggota_keluarga"} onChange={() => setMemberForm({ ...memberForm, member_type: "anggota_keluarga" })} /> Anggota keluarga</label><label><input type="radio" checked={memberForm.member_type === "keluarga_tidak_serumah"} onChange={() => setMemberForm({ ...memberForm, member_type: "keluarga_tidak_serumah" })} /> Keluarga Tidak Serumah</label></div><input placeholder="Telepon" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} /><input placeholder="No KTP" value={memberForm.ktp_number} onChange={(e) => setMemberForm({ ...memberForm, ktp_number: e.target.value })} /><UploadedFileLink href={editingMember?.identity_document_url} label={editingMember?.identity_document_name || "Identitas anggota saat ini"} /><label className="file-field"><span>{editingMember?.identity_document_url ? "Upload ulang identitas anggota" : "Upload identitas anggota"}</span><input type="file" accept="image/*,.pdf" onChange={(e) => setMemberFile(e.target.files?.[0] || null)} /></label><button className="primary">{editingMember ? "Simpan anggota" : "Tambah anggota"}</button></form></Modal>}
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
      {(!isAdmin || adminTab === "requests") && <div className="list">{filteredRequests.map((r) => <button className="list-item clickable letter-list-item" key={r.id} type="button" onClick={() => setDetailRequest(r)}><span className="letter-icon"><Icon name="file" /></span><div className="item-heading"><strong>{r.letter_type_name || "Request Surat"}</strong><span className={`status ${r.status}`}>{letterStatusLabel(r.status)}</span></div><span>{r.requester_name || "Saya"} - {formatDateTime(r.submitted_at)}</span><p>{r.description}</p></button>)}{!filteredRequests.length && <Empty text="Belum ada request surat." />}</div>}
      {typeModal && <Modal title={editingType ? "Edit Jenis Surat" : "Tambah Jenis Surat"} onClose={() => { setTypeModal(false); setEditingType(null); }}><form className="composer flat" onSubmit={editingType ? updateType : createType}>{message && <p className="notice">{message}</p>}<input placeholder="Jenis surat" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} required /><textarea placeholder="Deskripsi" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} /><label className="choice"><input type="checkbox" checked={typeForm.is_active} onChange={(e) => setTypeForm({ ...typeForm, is_active: e.target.checked })} /><span>Aktif</span></label><button className="primary">{editingType ? "Simpan jenis" : "Tambah jenis"}</button></form></Modal>}
      {requestModal && <Modal title={editingRequest ? "Edit Request Surat" : "Ajukan Surat"} onClose={() => { setRequestModal(false); setEditingRequest(null); setRequestFile(null); }}><form className="composer flat" onSubmit={editingRequest ? updateRequest : createRequest}>{message && <p className="notice">{message}</p>}<select value={requestForm.letter_type_id || firstTypeId} onChange={(e) => setRequestForm({ ...requestForm, letter_type_id: e.target.value })} disabled={!activeLetterTypes.length}>{activeLetterTypes.length ? activeLetterTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : <option value="">Belum ada tipe surat aktif</option>}</select><textarea placeholder="Keperluan surat" value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} required />{editingRequest && <div className="attachment-list">{asArray(editingRequest.attachments).map((item) => <UploadedFileLink key={item.id} href={item.file_url} label={item.file_name || "Lampiran saat ini"} />)}</div>}<label className="file-field"><span>{editingRequest ? "Upload ulang lampiran surat" : "Lampiran surat"}</span><input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setRequestFile(e.target.files?.[0] || null)} /></label><button className="primary">{editingRequest ? "Simpan request" : "Ajukan surat"}</button></form></Modal>}
      {detailRequest && <Modal title="Detail Request Surat" onClose={() => setDetailRequest(null)}><div className="detail-pane"><div className="item-heading"><strong>{detailRequest.letter_type_name || "Request Surat"}</strong><span className={`status ${detailRequest.status}`}>{letterStatusLabel(detailRequest.status)}</span></div><span>{detailRequest.requester_name || "Saya"} - {formatDateTime(detailRequest.submitted_at)}</span><p>{detailRequest.description}</p><div className="attachment-list">{asArray(detailRequest.attachments).map((item) => <UploadedFileLink key={item.id} href={item.file_url} label={item.file_name || "Lampiran surat"} />)}</div><div className="list">{asArray(detailRequest.replies).map((replyItem) => <div className="list-item" key={replyItem.id}><strong>{letterStatusLabel(replyItem.status_after)}</strong><span>{formatDateTime(replyItem.created_at)}</span><p>{replyItem.note}</p></div>)}</div><div className="row actions">{!isAdmin && <><button className="action-edit" type="button" onClick={() => { setDetailRequest(null); openRequest(detailRequest); }}><Icon name="edit" />Edit</button><button className="action-delete" type="button" onClick={() => deleteRequest(detailRequest)}><Icon name="trash" />Delete</button></>}{isAdmin && !["selesai", "dibatalkan"].includes(detailRequest.status) && <><button className="action-process" type="button" onClick={() => processRequest(detailRequest)}><Icon name="wrench" />Proses</button><button className="action-done" type="button" onClick={() => openCompletion(detailRequest)}><Icon name="vote" />Selesai</button></>}</div></div></Modal>}
      {completionRequest && <Modal title="Selesaikan Request Surat" onClose={() => setCompletionRequest(null)}><form className="composer flat" onSubmit={completeRequest}>{message && <p className="notice">{message}</p>}<textarea placeholder="Detail hasil penyelesaian" value={completionForm.note} onChange={(e) => setCompletionForm({ note: e.target.value })} required /><label className="file-field"><span>Upload file hasil opsional</span><input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setCompletionFile(e.target.files?.[0] || null)} /></label><button className="primary">Simpan hasil</button></form></Modal>}
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
  return <section className="page"><div className="page-head"><h2>WhatsApp Gateway</h2></div><p>Hubungkan gateway WA, pilih sender, lalu notifikasi pengguna yang dicentang akan dikirim melalui sender ini.</p>{message && <p className="notice">{message}</p>}<form className="composer flat" onSubmit={save}><input placeholder="URL wa-gateway, contoh https://notif.asabiz.id" value={form.base_url || ""} onChange={(e) => setForm({ ...form, base_url: e.target.value })} required /><input type="password" placeholder="API key wa-gateway" value={form.api_key || ""} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /><div className="row"><select value={form.sender_id || ""} onChange={(e) => setForm({ ...form, sender_id: e.target.value })} required><option value="">Pilih sender</option>{senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.name || sender.id}{sender.status ? ` (${sender.status})` : ""}</option>)}</select><button type="button" onClick={loadSenders}>Muat sender</button></div><label className="choice"><input type="checkbox" checked={!!form.is_enabled} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} /><span>Aktifkan pengiriman WhatsApp</span></label><button className="primary">Simpan konfigurasi</button></form></section>;
}

const WA_NOTIFICATION_TYPES = [
  ["email_verification", "Request pendaftaran"], ["booking_confirmation", "Permintaan booking"], ["news_published", "Berita dipublikasikan"], ["news_contribution", "Kontribusi berita"], ["voting_reminder", "Pengingat voting"], ["letter_request_update", "Request surat"], ["report_created", "Laporan baru"], ["report_updated", "Update laporan"], ["event_created", "Event baru"],
];
const roleLabel = (role) => ({ administrator: "Administrator", penghuni: "Penghuni", security: "Security", supports: "Support", superadmin: "Superadmin" }[role] || role);

function ResidentManagement({ api }) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
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
  const filtered = asArray(users).filter((user) => [user.full_name, user.email, user.role, user.phone].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="page">
      <div className="page-head"><h2>Kelola ID Penghuni</h2><input className="search-input" placeholder="Cari user" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="primary" type="button" onClick={openCreate}>Tambah</button></div>
      {message && <p className="notice">{message}</p>}
      <div className="list">
        {filtered.map((user) => <div className="list-item" key={user.id}><div className="item-heading"><strong>{user.full_name}</strong><span className={`status ${user.is_active ? "approved" : "rejected"}`}>{user.is_active ? "active" : "non active"}</span></div><span>UserID {user.id} - {user.email}</span><span>Peran: {roleLabel(user.role)}{user.phone ? ` - WA: ${user.phone}` : ""}</span><div className="row actions"><button type="button" onClick={() => openEdit(user)}>Edit</button><button type="button" onClick={() => toggleActive(user)}>{user.is_active ? "Nonaktif" : "Aktif"}</button><button type="button" onClick={() => remove(user)}>Delete</button></div></div>)}
        {!filtered.length && <Empty text="Belum ada user komplek." />}
      </div>
      {showForm && <Modal title={editing ? "Edit User" : "Tambah User"} onClose={() => { setShowForm(false); setEditing(null); }}><form className="composer flat" onSubmit={save}>{message && <p className="notice">{message}</p>}{editing && <div className="tabs"><button type="button" className={formTab === "profile" ? "active" : ""} onClick={() => setFormTab("profile")}>Data User</button><button type="button" className={formTab === "notifications" ? "active" : ""} onClick={() => setFormTab("notifications")}>Kelola Notifikasi</button></div>}{formTab === "profile" && <><input placeholder="Nama user" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /><input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /><input type="password" placeholder={editing ? "Password baru jika ingin diubah" : "Password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} /><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="penghuni">Penghuni</option><option value="security">Security</option><option value="supports">Supports</option></select><input placeholder="Nomor WhatsApp, contoh 0812xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><label className="choice"><input type="checkbox" checked={form.is_email_verified} onChange={(e) => setForm({ ...form, is_email_verified: e.target.checked })} /><span>Email verified</span></label><label className="choice"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Aktif</span></label></>}{editing && formTab === "notifications" && <div><p>Pilih notifikasi WhatsApp yang akan diterima oleh user ini.</p>{WA_NOTIFICATION_TYPES.map(([key, text]) => <label className="choice" key={key}><input type="checkbox" checked={whatsappTypes.includes(key)} onChange={(e) => setWhatsappTypes(e.target.checked ? [...whatsappTypes, key] : whatsappTypes.filter((type) => type !== key))} /><span>{text}</span></label>)}</div>}<button className="primary">{editing ? "Simpan user" : "Buat user"}</button></form></Modal>}
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
              <strong>{item.email}</strong>
              <span className={`status ${item.status}`}>{item.status}</span>
            </div>
            <span>{item.complex_name} - {new Date(item.created_at).toLocaleString()}</span>
            <UploadedFileLink href={item.ktp_document_url} label="Lihat dokumen KTP" />
            {item.admin_notes && <p>Notes: {item.admin_notes}</p>}
            {item.status === "pending" && (
              <>
                <textarea placeholder="Notes validasi administrator" value={notes[item.id] || ""} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} />
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

function Modal({ title, children, onClose }) {
  return createPortal((
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3 id="modal-title">{title}</h3>
          <button className="icon-button" type="button" onClick={onClose} title="Tutup">X</button>
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
            <input placeholder="Nama komplek" value={complexForm.name} onChange={(e) => setComplexForm({ ...complexForm, name: e.target.value })} required />
            <input placeholder="Alamat" value={complexForm.address} onChange={(e) => setComplexForm({ ...complexForm, address: e.target.value })} />
            <textarea placeholder="Deskripsi" value={complexForm.description} onChange={(e) => setComplexForm({ ...complexForm, description: e.target.value })} />
            <label className="file-field"><span>Upload logo komplek</span><input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} /></label>
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
            <input placeholder="Nama user" value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} required />
            <input placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
            <input type="password" placeholder={editing ? "Password baru jika ingin diubah" : "Password"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} required={!editing} />
            <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
              <option value="superadmin">Superadmin</option>
              <option value="administrator">Administrator</option>
              <option value="penghuni">Penghuni</option>
              <option value="security">Security</option>
              <option value="supports">Supports</option>
            </select>
            <select value={userForm.complex_id} onChange={(e) => setUserForm({ ...userForm, complex_id: e.target.value })} required={userForm.role !== "superadmin"} disabled={userForm.role === "superadmin"}>
              <option value="">Pilih komplek</option>
              {asArray(complexes).map((complex) => <option key={complex.id} value={complex.id}>{complex.name}</option>)}
            </select>
            <button className="primary">{editing ? "Simpan user" : "Buat user"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const scope = `${PUBLIC_PATH || ""}/`;
    navigator.serviceWorker.register(`${PUBLIC_PATH}/sw.js`, { scope });
  });
}
