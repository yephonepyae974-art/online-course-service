import { useContext, useEffect, useState } from "react";
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { UserContext } from "./context/user-context";
import "./App.css";

async function api(path, method = "GET", body) {
  const response = await fetch(`/api${path}`, {
    method, credentials: "include",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}
const emptyCourse = { name: "", durationDays: 1, topicsText: "", price: 0, maxStudents: 10, status: "Open" };

function Profile({ user, busy, onSave, onDelete }) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  return <section className="panel">
    <h2>My profile <span className="badge">{user.role}</span></h2>
    <form onSubmit={(event) => { event.preventDefault(); onSave({ username, email }); }}>
      <fieldset disabled={busy}>
        <div className="two">
          <label>Username<input required maxLength={100} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        </div>
        <div className="actions"><button>Save profile</button><button type="button" className="danger" onClick={onDelete}>Delete my account</button></div>
      </fieldset>
    </form>
    <p>Teachers must delete their courses first. Students must unenroll before deleting their account.</p>
  </section>;
}

function Dashboard() {
  const { user, setUser } = useContext(UserContext);
  const [checking, setChecking] = useState(true);
  const [register, setRegister] = useState(false);
  const [account, setAccount] = useState({ username: "", email: "", password: "", role: "Student" });
  const [courses, setCourses] = useState([]);
  const [enrolled, setEnrolled] = useState([]);
  const [form, setForm] = useState(emptyCourse);
  const [editingId, setEditingId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState({ name: "", teacher: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const teacher = user?.role === "Teacher";

  useEffect(() => {
    let active = true;
    async function initialize() {
      try { const data = await api("/user"); if (active) setUser(data.user); }
      catch { if (active) setUser(null); }
      finally { if (active) setChecking(false); }
    }
    initialize();
    return () => { active = false; };
  }, [setUser]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) return;
      try {
        const data = await api("/course");
        const mine = user.role === "Student" ? await api("/enrollment") : { courses: [] };
        if (active) { setCourses(data.courses); setEnrolled(mine.courses); }
      } catch (error) { if (active) setMessage(error.message); }
    }
    load();
    return () => { active = false; };
  }, [user]);

  async function refresh() {
    const query = new URLSearchParams(search);
    const data = await api(`/course?${query}`);
    setCourses(data.courses);
    if (!teacher) setEnrolled((await api("/enrollment")).courses);
  }
  async function run(action) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  function clearSession() {
    setUser(null); setCourses([]); setEnrolled([]); setDetail(null);
    setEditingId(null); setForm(emptyCourse); setRegister(false);
    setSearch({ name: "", teacher: "" });
  }
  function login(event) {
    event.preventDefault();
    run(async () => {
      if (register) await api("/user", "POST", account);
      const data = await api("/auth/login", "POST", { email: account.email, password: account.password });
      setUser(data.user); setAccount({ username: "", email: "", password: "", role: "Student" });
      setMessage("Logged in.");
    });
  }
  function logout() {
    run(async () => { await api("/auth/logout", "POST"); clearSession(); setMessage("Logged out."); });
  }
  function saveProfile(profile) {
    run(async () => { const data = await api(`/user/${user.id}`, "PUT", profile); setUser(data.user); setMessage("Profile updated."); });
  }
  function deleteAccount() {
    if (!window.confirm("Permanently delete your account?")) return;
    run(async () => { await api(`/user/${user.id}`, "DELETE"); clearSession(); setMessage("Account deleted."); });
  }
  function saveCourse(event) {
    event.preventDefault();
    run(async () => {
      const body = {
        name: form.name, durationDays: Number(form.durationDays),
        topics: form.topicsText.split(/[,\n]/).map((topic) => topic.trim()).filter(Boolean),
        price: Number(form.price), maxStudents: Number(form.maxStudents), status: form.status,
      };
      const data = await api(editingId ? `/course/${editingId}` : "/course", editingId ? "PUT" : "POST", body);
      if (detail?.id === editingId) setDetail((await api(`/course/${data.course.id}`)).course);
      setEditingId(null); setForm(emptyCourse); await refresh(); setMessage("Course saved.");
    });
  }
  function editCourse(course) {
    setEditingId(course.id);
    setForm({ ...course, topicsText: course.topics.join(", ") });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deleteCourse(course) {
    if (!window.confirm(`Delete ${course.name}?`)) return;
    run(async () => {
      await api(`/course/${course.id}`, "DELETE");
      if (editingId === course.id) { setEditingId(null); setForm(emptyCourse); }
      if (detail?.id === course.id) setDetail(null);
      await refresh(); setMessage("Course deleted.");
    });
  }
  function viewCourse(id) {
    run(async () => { setDetail((await api(`/course/${id}`)).course); });
  }
  function enroll(course, cancel = false) {
    run(async () => {
      await api("/enrollment", cancel ? "DELETE" : "POST", { courseId: course.id });
      await refresh();
      if (detail?.id === course.id) setDetail((await api(`/course/${course.id}`)).course);
      setMessage(cancel ? "Enrollment cancelled." : "Enrolled successfully.");
    });
  }
  function courseCard(course) {
    const joined = enrolled.some((item) => item.id === course.id);
    return <article className="panel" key={course.id}>
      <span className={`badge ${course.status}`}>{course.status}</span>
      <h3>{course.name}</h3><p>Teacher: {course.teacherName}</p>
      <div className="meta"><span>{course.durationDays} days</span><span>Price: {course.price.toFixed(2)}</span><span>{course.enrolledCount}/{course.maxStudents} enrolled</span></div>
      <div className="topics">{course.topics.map((topic) => <span className="topic" key={topic}>{topic}</span>)}</div>
      <p>{course.seatsRemaining} seats remaining</p>
      <div className="actions">
        <button className="secondary" disabled={busy} onClick={() => viewCourse(course.id)}>View details</button>
        {teacher ? <>
          <button disabled={busy} onClick={() => editCourse(course)}>Edit</button>
          <button className="danger" disabled={busy || course.enrolledCount > 0} title={course.enrolledCount ? "Cannot delete a course with enrolled Students" : "Delete course"} onClick={() => deleteCourse(course)}>Delete</button>
        </> : joined ? <button disabled={busy} onClick={() => enroll(course, true)}>Unenroll</button> :
          <button disabled={busy || course.status !== "Open" || course.seatsRemaining === 0} onClick={() => enroll(course)}>Enroll</button>}
      </div>
    </article>;
  }
  if (checking) return <main className="container">Checking your session…</main>;
  return <main className="container">
    <header><div><span className="eyebrow">Online learning</span><h1>Online Course Service</h1><p>{teacher ? "Manage your courses and meet your students." : "Find your next course and start learning."}</p></div>
      {user && <div><span className="badge">{user.role}</span><p>Hello, {user.username}</p><button disabled={busy} onClick={logout}>Log out</button></div>}
    </header>
    {message && <div className="notice" role="status">{message}</div>}
    {!user ? <section className="panel auth"><h2>{register ? "Create an account" : "Welcome back"}</h2>
      <form onSubmit={login}><fieldset disabled={busy}>
        {register && <label>Username<input required maxLength={100} value={account.username} onChange={(event) => setAccount({ ...account, username: event.target.value })} /></label>}
        <label>Email<input required type="email" autoComplete="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} /></label>
        <label>Password<input required type="password" minLength={register ? 8 : undefined} autoComplete={register ? "new-password" : "current-password"} value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} /></label>
        {register && <label>Role<select value={account.role} onChange={(event) => setAccount({ ...account, role: event.target.value })}><option>Student</option><option>Teacher</option></select></label>}
        <div className="actions"><button>{busy ? "Please wait…" : register ? "Register and log in" : "Log in"}</button><button type="button" className="secondary" onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "Back to login" : "Create an account"}</button></div>
      </fieldset></form></section> : <>
      {teacher && <section className="panel"><h2>{editingId ? "Edit course" : "Create course"}</h2>
        <form onSubmit={saveCourse}><fieldset disabled={busy}>
          <label>Course name<input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <div className="two"><label>Duration (days)<input required type="number" min="1" step="1" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} /></label>
            <label>Price<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label></div>
          <label>Topics (separate with commas or new lines)<textarea required value={form.topicsText} onChange={(event) => setForm({ ...form, topicsText: event.target.value })} /></label>
          <div className="two"><label>Max Student<input required type="number" min="1" step="1" value={form.maxStudents} onChange={(event) => setForm({ ...form, maxStudents: event.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Open</option><option>Close</option><option>Cancel</option></select></label></div>
          <div className="actions"><button>{editingId ? "Save changes" : "Create course"}</button>{editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(emptyCourse); }}>Cancel edit</button>}</div>
        </fieldset></form>
      </section>}
      <section className="panel"><h2>{teacher ? "My courses" : "Browse courses"}</h2>
        <form onSubmit={(event) => { event.preventDefault(); run(refresh); }}><fieldset disabled={busy}>
          <div className="two"><label>Course name<input placeholder="Search part of a name" value={search.name} onChange={(event) => setSearch({ ...search, name: event.target.value })} /></label>
            {!teacher && <label>Teacher name<input placeholder="Search part of a Teacher name" value={search.teacher} onChange={(event) => setSearch({ ...search, teacher: event.target.value })} /></label>}</div>
          <button>Filter courses</button>
        </fieldset></form>
      </section>
      <div className="grid">{courses.map(courseCard)}</div>{courses.length === 0 && <p className="empty">No courses match your search.</p>}
      {detail && <section className="panel detail"><div className="actions"><h2>Course details: {detail.name}</h2><button className="secondary" onClick={() => setDetail(null)}>Close details</button></div>
        <p>Teacher: {detail.teacherName} · Status: {detail.status}</p><p>Duration: {detail.durationDays} days · Price: {detail.price.toFixed(2)}</p><p>Topics: {detail.topics.join(", ")}</p><p>{detail.enrolledCount} of {detail.maxStudents} seats filled</p>
        {teacher && <><h3>Enrolled Students</h3>{detail.students?.length ? <div className="table-scroll"><table><thead><tr><th>Username</th><th>Email</th></tr></thead><tbody>{detail.students.map((student) => <tr key={student.id}><td>{student.username}</td><td>{student.email}</td></tr>)}</tbody></table></div> : <p>No Students enrolled.</p>}</>}
      </section>}
      {!teacher && <section style={{ marginTop: 28 }}><h2>My enrolled courses</h2><div className="grid">{enrolled.map(courseCard)}</div>{enrolled.length === 0 && <p className="empty">You have no visible enrolled courses.</p>}</section>}
      <div style={{ marginTop: 28 }}><Profile key={`${user.id}:${user.username}:${user.email}`} user={user} busy={busy} onSave={saveProfile} onDelete={deleteAccount} /></div>
    </>}
    <footer>Open courses accept enrollment while seats remain. Close courses remain visible. Cancel courses are hidden from Students.</footer>
  </main>;
}
export default function App() {
  return <HashRouter><Routes><Route path="/" element={<Dashboard />} /><Route path="*" element={<Link to="/">Go to home</Link>} /></Routes></HashRouter>;
}
