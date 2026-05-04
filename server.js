'use strict';
const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Loki     = require('lokijs');
const { generateCertificate } = require('./certGenerator');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Directories ──────────────────────────────────────────────
const DATA_DIR    = process.env.DATA_DIR    || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const CERT_DIR    = path.join(UPLOADS_DIR, 'certs');
[DATA_DIR, UPLOADS_DIR, CERT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Database ─────────────────────────────────────────────────
const DB_PATH = path.join(DATA_DIR, 'bebrave.db');
const db = new Loki(DB_PATH, {
  autoload: true, autosave: true, autosaveInterval: 2000,
  autoloadCallback: dbReady
});

let Users, Students, Teachers, Lessons, Files, Notes, Certificates, DeletedStudents;

function dbReady() {
  Users        = db.getCollection('users')        || db.addCollection('users',        { indices: ['login'] });
  Students     = db.getCollection('students')     || db.addCollection('students',     { indices: ['matricula', 'teacherLogin'] });
  Teachers     = db.getCollection('teachers')     || db.addCollection('teachers',     { indices: ['login'] });
  Lessons      = db.getCollection('lessons')      || db.addCollection('lessons',      { indices: ['studentMatricula', 'teacherLogin'] });
  Files        = db.getCollection('files')        || db.addCollection('files',        { indices: ['studentMatricula', 'teacherLogin'] });
  Notes        = db.getCollection('notes')        || db.addCollection('notes',        { indices: ['studentMatricula'] });
  Certificates    = db.getCollection('certificates')    || db.addCollection('certificates',    { indices: ['studentMatricula', 'certId'] });
  DeletedStudents = db.getCollection('deletedStudents') || db.addCollection('deletedStudents', { indices: ['matricula'] });

  if (!Users.findOne({ role: 'admin' })) {
    Users.insert({ login: 'ADMIN', password: bcrypt.hashSync('05012018', 10), role: 'admin', name: 'Administrador', createdAt: now() });
    console.log('✅ Admin criado: ADMIN / 05012018');
  }
  console.log(`📦 DB: ${Users.count()} usuários | ${Teachers.count()} professores | ${Students.count()} alunos`);
}

// ── Helpers ──────────────────────────────────────────────────
const now   = () => new Date().toISOString();
const today = () => new Date().toISOString().split('T')[0];

function genMatricula() {
  let m;
  do { m = String(Math.floor(100000 + Math.random() * 900000)); }
  while (Students.findOne({ matricula: m }));
  return m;
}
function genCertId() {
  return 'CERT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function initials(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
const PALETTE = [
  { color: '#3b6ef5', bg: '#e8eeff' }, { color: '#10b981', bg: '#d1fae5' },
  { color: '#8b5cf6', bg: '#ede9fe' }, { color: '#f59e0b', bg: '#fef3c7' },
  { color: '#ec4899', bg: '#fce7f3' }, { color: '#06b6d4', bg: '#e0f7fa' },
  { color: '#ef4444', bg: '#fee2e2' }, { color: '#84cc16', bg: '#f0fdf4' },
];
function pickColor(idx) { return PALETTE[idx % PALETTE.length]; }

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const PUBLIC_DIR = __dirname;
app.use(express.static(PUBLIC_DIR));
// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', dir: __dirname, files: require('fs').readdirSync(__dirname).filter(f => f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.css')) }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bebrave-secret-xK9pQ2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Auth Guards ──────────────────────────────────────────────
const auth         = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Não autenticado' });
const isAdmin      = (req, res, next) => req.session.user?.role === 'admin'   ? next() : res.status(403).json({ error: 'Acesso negado' });
const isTeach      = (req, res, next) => req.session.user?.role === 'teacher' ? next() : res.status(403).json({ error: 'Acesso negado' });
const isAdminOrTeach = (req, res, next) => ['admin','teacher'].includes(req.session.user?.role) ? next() : res.status(403).json({ error: 'Acesso negado' });

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  const user = Users.findOne({ login: login.trim().toUpperCase() });
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Login ou senha incorretos' });
  req.session.user = { id: user.$loki, login: user.login, role: user.role, name: user.name };
  res.json({ role: user.role, name: user.name, login: user.login });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  const u = req.session.user;
  if (u.role === 'student') {
    const s = Students.findOne({ matricula: u.login });
    return res.json({ ...u, level: s?.level || 'A1', teacherName: s?.teacherName || '' });
  }
  res.json(u);
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
  const user = Users.findOne({ login: req.session.user.login });
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'Senha atual incorreta' });
  user.password = bcrypt.hashSync(newPassword, 10);
  Users.update(user);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  ADMIN — TEACHERS
// ════════════════════════════════════════════════════════════
app.get('/api/admin/teachers', auth, isAdmin, (req, res) => {
  const teachers = Teachers.find().map(t => ({ ...t, studentCount: Students.find({ teacherLogin: t.login }).length }));
  res.json(teachers);
});

app.post('/api/admin/teachers', auth, isAdmin, (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const ini = initials(name);
  let login;
  do { login = ini + String(Math.floor(1000 + Math.random() * 9000)); }
  while (Users.findOne({ login }));
  const { color, bg } = pickColor(Teachers.count());
  Users.insert({ login, password: bcrypt.hashSync('1234', 10), role: 'teacher', name: name.trim(), createdAt: now() });
  Teachers.insert({ login, name: name.trim(), email: email || '', initials: ini, color, bg, createdAt: now() });
  res.json({ ok: true, login, defaultPassword: '1234', name: name.trim() });
});

app.put('/api/admin/reset-password', auth, isAdmin, (req, res) => {
  const { login, newPassword } = req.body;
  if (!login || !newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Dados inválidos' });
  const user = Users.findOne({ login: login.toUpperCase() }) || Users.findOne({ login });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  user.password = bcrypt.hashSync(newPassword, 10);
  Users.update(user);
  res.json({ ok: true });
});

app.delete('/api/admin/teachers/:login', auth, isAdmin, (req, res) => {
  const login = req.params.login;
  const t = Teachers.findOne({ login });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  Teachers.remove(t);
  const u = Users.findOne({ login }); if (u) Users.remove(u);
  Students.find({ teacherLogin: login }).forEach(s => {
    Lessons.find({ studentMatricula: s.matricula }).forEach(l => Lessons.remove(l));
    Files.find({ studentMatricula: s.matricula }).forEach(f => { if(f.filename){ try{ fs.unlinkSync(path.join(UPLOADS_DIR,f.filename)); }catch(e){} } Files.remove(f); });
    Notes.find({ studentMatricula: s.matricula }).forEach(n => Notes.remove(n));
    Certificates.find({ studentMatricula: s.matricula }).forEach(c => { if(c.filename){ try{ fs.unlinkSync(path.join(CERT_DIR,c.filename)); }catch(e){} } Certificates.remove(c); });
    const su = Users.findOne({ login: s.matricula }); if (su) Users.remove(su);
    Students.remove(s);
  });
  res.json({ ok: true });
});

app.get('/api/admin/students', auth, isAdmin, (req, res) => {
  res.json(Students.find().map(s => ({ ...s, lessonCount: Lessons.find({ studentMatricula: s.matricula }).length })));
});

app.delete('/api/admin/students/:matricula', auth, isAdmin, (req, res) => {
  const mat = req.params.matricula;
  const s = Students.findOne({ matricula: mat });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  // Archive before deleting (strip LokiJS metadata)
  const { $loki: _l2, meta: _m2, ...sClean2 } = s;
  DeletedStudents.insert({ ...sClean2, deletedAt: now(), deletedBy: req.session.user.login, lessonCount: Lessons.find({ studentMatricula: mat }).length });
  Lessons.find({ studentMatricula: mat }).forEach(l => Lessons.remove(l));
  Files.find({ studentMatricula: mat }).forEach(f => { if(f.filename){ try{ fs.unlinkSync(path.join(UPLOADS_DIR,f.filename)); }catch(e){} } Files.remove(f); });
  Notes.find({ studentMatricula: mat }).forEach(n => Notes.remove(n));
  Certificates.find({ studentMatricula: mat }).forEach(c => { if(c.filename){ try{ fs.unlinkSync(path.join(CERT_DIR,c.filename)); }catch(e){} } Certificates.remove(c); });
  const u = Users.findOne({ login: mat }); if (u) Users.remove(u);
  Students.remove(s);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  STUDENTS
// ════════════════════════════════════════════════════════════
app.get('/api/students', auth, isAdminOrTeach, (req, res) => {
  const filter = req.session.user.role === 'admin' ? {} : { teacherLogin: req.session.user.login };
  res.json(Students.find(filter).map(s => ({
    ...s,
    lessonsDone:      Lessons.find({ studentMatricula: s.matricula, status: 'done' }).length,
    lessonsScheduled: Lessons.find({ studentMatricula: s.matricula, status: 'scheduled' }).length,
  })));
});

app.post('/api/students', auth, isTeach, (req, res) => {
  const { name, level } = req.body;
  if (!name || !level) return res.status(400).json({ error: 'Nome e nível são obrigatórios' });
  const teacher = Teachers.findOne({ login: req.session.user.login });
  const matricula = genMatricula();
  const ini = initials(name);
  const { color, bg } = pickColor(Students.count());
  Users.insert({ login: matricula, password: bcrypt.hashSync('1234', 10), role: 'student', name: name.trim(), createdAt: now() });
  Students.insert({ matricula, name: name.trim(), initials: ini, level, color, bg, teacherLogin: req.session.user.login, teacherName: teacher?.name || req.session.user.name, createdAt: now() });
  res.json({ ok: true, matricula, defaultPassword: '1234', name: name.trim(), level });
});

app.put('/api/students/:matricula', auth, isAdminOrTeach, (req, res) => {
  const s = Students.findOne({ matricula: req.params.matricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  if (req.body.level) s.level = req.body.level;
  Students.update(s);
  res.json({ ok: true });
});

app.delete('/api/students/:matricula', auth, isAdminOrTeach, (req, res) => {
  const mat = req.params.matricula;
  const s = Students.findOne({ matricula: mat });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  if (req.session.user.role === 'teacher' && s.teacherLogin !== req.session.user.login) return res.status(403).json({ error: 'Sem permissão' });
  // Archive before deleting
  DeletedStudents.insert({ ...s, deletedAt: now(), deletedBy: req.session.user.login, lessonCount: Lessons.find({ studentMatricula: mat }).length });
  Lessons.find({ studentMatricula: mat }).forEach(l => Lessons.remove(l));
  Files.find({ studentMatricula: mat }).forEach(f => { if(f.filename){ try{ fs.unlinkSync(path.join(UPLOADS_DIR,f.filename)); }catch(e){} } Files.remove(f); });
  Notes.find({ studentMatricula: mat }).forEach(n => Notes.remove(n));
  Certificates.find({ studentMatricula: mat }).forEach(c => { if(c.filename){ try{ fs.unlinkSync(path.join(CERT_DIR,c.filename)); }catch(e){} } Certificates.remove(c); });
  const u = Users.findOne({ login: mat }); if (u) Users.remove(u);
  Students.remove(s);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  LESSONS
// ════════════════════════════════════════════════════════════
app.get('/api/lessons', auth, (req, res) => {
  const u = req.session.user;
  let lessons;
  if (u.role === 'student') lessons = Lessons.find({ studentMatricula: u.login });
  else if (u.role === 'teacher') lessons = Lessons.find({ teacherLogin: u.login });
  else lessons = Lessons.find();
  res.json(lessons.sort((a, b) => a.date.localeCompare(b.date)));
});

app.post('/api/lessons', auth, isTeach, (req, res) => {
  const { studentMatricula, date, time, topic, duration, meetLink, subject } = req.body;
  if (!studentMatricula || !date || !time || !topic) return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  const s = Students.findOne({ matricula: studentMatricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  const lesson = Lessons.insert({ studentMatricula, studentName: s.name, teacherLogin: req.session.user.login, teacherName: req.session.user.name, date, time, topic, subject: subject || topic, duration: parseInt(duration) || 60, status: 'scheduled', meetLink: meetLink || '', createdAt: now() });
  res.json(lesson);
});

app.put('/api/lessons/:id', auth, isTeach, (req, res) => {
  const l = Lessons.get(parseInt(req.params.id));
  if (!l) return res.status(404).json({ error: 'Aula não encontrada' });
  ['status','meetLink','topic','subject','date','time','duration','feedback','homework'].forEach(k => { if (req.body[k] !== undefined) l[k] = req.body[k]; });
  Lessons.update(l);
  res.json(l);
});

app.delete('/api/lessons/:id', auth, isTeach, (req, res) => {
  const l = Lessons.get(parseInt(req.params.id));
  if (!l) return res.status(404).json({ error: 'Aula não encontrada' });
  Lessons.remove(l);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  FILES
// ════════════════════════════════════════════════════════════
app.get('/api/files', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') return res.json(Files.find({ studentMatricula: u.login }));
  if (u.role === 'teacher') return res.json(Files.find({ teacherLogin: u.login }));
  res.json(Files.find());
});

app.post('/api/files', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const u = req.session.user;
  let studentMatricula, studentName, teacherLogin;
  if (u.role === 'teacher') {
    studentMatricula = req.body.studentMatricula;
    const s = Students.findOne({ matricula: studentMatricula });
    if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
    studentName = s.name; teacherLogin = u.login;
  } else {
    studentMatricula = u.login; studentName = u.name;
    const s = Students.findOne({ matricula: u.login });
    teacherLogin = s?.teacherLogin || '';
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  const type = ext === '.pdf' ? 'pdf' : ['.mp3','.wav','.m4a'].includes(ext) ? 'audio' : ['.mp4','.mov'].includes(ext) ? 'video' : ['.jpg','.jpeg','.png','.gif','.webp'].includes(ext) ? 'img' : 'doc';
  const size = req.file.size < 1048576 ? Math.round(req.file.size/1024) + ' KB' : (req.file.size/1048576).toFixed(1) + ' MB';
  const rec = Files.insert({ studentMatricula, studentName, teacherLogin, name: req.file.originalname, filename: req.file.filename, type, size, date: today(), from: u.role === 'teacher' ? 'teacher' : 'student', uploader: u.name, createdAt: now() });
  res.json(rec);
});

app.delete('/api/files/:id', auth, (req, res) => {
  const f = Files.get(parseInt(req.params.id));
  if (!f) return res.status(404).json({ error: 'Arquivo não encontrado' });
  if (f.filename) { try { fs.unlinkSync(path.join(UPLOADS_DIR, f.filename)); } catch(e) {} }
  Files.remove(f);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  NOTES
// ════════════════════════════════════════════════════════════
app.get('/api/notes', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') return res.json(Notes.find({ studentMatricula: u.login }));
  if (u.role === 'teacher') return res.json(Notes.find({ teacherLogin: u.login }));
  res.json(Notes.find());
});

app.post('/api/notes', auth, isTeach, (req, res) => {
  const { studentMatricula, text } = req.body;
  if (!studentMatricula || !text) return res.status(400).json({ error: 'Dados inválidos' });
  const s = Students.findOne({ matricula: studentMatricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  const n = Notes.insert({ studentMatricula, studentName: s.name, teacherLogin: req.session.user.login, text, date: today(), createdAt: now() });
  res.json(n);
});

app.delete('/api/notes/:id', auth, isTeach, (req, res) => {
  const n = Notes.get(parseInt(req.params.id));
  if (!n) return res.status(404).json({ error: 'Nota não encontrada' });
  Notes.remove(n);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  CERTIFICATES
// ════════════════════════════════════════════════════════════
app.get('/api/certificates', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') return res.json(Certificates.find({ studentMatricula: u.login }));
  if (u.role === 'teacher') return res.json(Certificates.find({ teacherLogin: u.login }));
  res.json(Certificates.find());
});

app.post('/api/certificates/preview', auth, isTeach, async (req, res) => {
  const data = req.body;
  if (!data.student_name || !data.module) return res.status(400).json({ error: 'Dados incompletos' });
  data.cert_id = 'PREVIEW';
  try {
    const pdfBuf = await generateCertificate(data);
    res.json({ pdf: pdfBuf.toString('base64') });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar certificado' }); }
});

app.post('/api/certificates', auth, isTeach, async (req, res) => {
  const { studentMatricula, module, level, hours, period, location, teacher_signature } = req.body;
  if (!studentMatricula || !module) return res.status(400).json({ error: 'Dados incompletos' });
  const s = Students.findOne({ matricula: studentMatricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  const certId   = genCertId();
  const filename = certId + '.pdf';
  const outPath  = path.join(CERT_DIR, filename);
  const issuedDate = new Date().toLocaleDateString('pt-BR');
  const data = { student_name: s.name, teacher_name: req.session.user.name, module, level, hours, period, location: location || 'Brasil', issued_date: issuedDate, cert_id: certId, teacher_signature: teacher_signature || '', student_signature: '' };
  try {
    const pdfBuf = await generateCertificate(data);
    fs.writeFileSync(outPath, pdfBuf);
    const cert = Certificates.insert({ certId, filename, studentMatricula, studentName: s.name, teacherLogin: req.session.user.login, teacherName: req.session.user.name, module, level, hours, period, location: location || 'Brasil', issuedDate, teacherSignature: teacher_signature || '', studentSignature: '', status: 'pending_student', createdAt: now() });
    res.json({ ok: true, certId, $loki: cert.$loki });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar certificado' }); }
});

app.put('/api/certificates/:id/student-sign', auth, async (req, res) => {
  const cert = Certificates.get(parseInt(req.params.id));
  if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
  if (req.session.user.role === 'student' && cert.studentMatricula !== req.session.user.login) return res.status(403).json({ error: 'Sem permissão' });
  const { student_signature } = req.body;
  if (!student_signature) return res.status(400).json({ error: 'Assinatura obrigatória' });
  const data = { student_name: cert.studentName, teacher_name: cert.teacherName, module: cert.module, level: cert.level, hours: cert.hours, period: cert.period, location: cert.location, issued_date: cert.issuedDate, cert_id: cert.certId, teacher_signature: cert.teacherSignature, student_signature };
  try {
    const pdfBuf = await generateCertificate(data);
    fs.writeFileSync(path.join(CERT_DIR, cert.filename), pdfBuf);
    cert.studentSignature = student_signature;
    cert.status = 'complete';
    Certificates.update(cert);
    res.json({ ok: true, certId: cert.certId });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao regenerar certificado' }); }
});

app.get('/api/certificates/:certId/download', auth, (req, res) => {
  const cert = Certificates.findOne({ certId: req.params.certId });
  if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
  const u = req.session.user;
  if (u.role === 'student' && cert.studentMatricula !== u.login) return res.status(403).json({ error: 'Sem permissão' });
  if (u.role === 'teacher' && cert.teacherLogin !== u.login)     return res.status(403).json({ error: 'Sem permissão' });
  const filePath = path.join(CERT_DIR, cert.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.download(filePath, `Certificado_${cert.studentName.replace(/\s+/g,'_')}_${cert.module.replace(/\s+/g,'_')}.pdf`);
});

app.delete('/api/certificates/:id', auth, isTeach, (req, res) => {
  const cert = Certificates.get(parseInt(req.params.id));
  if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
  const fp = path.join(CERT_DIR, cert.filename);
  if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch(e) {}
  Certificates.remove(cert);
  res.json({ ok: true });
});

// ── SPA fallback ─────────────────────────────────────────────

// ── Setup route — resets admin password (remove after first use) ──
app.get('/setup-admin-bebrave2025', (req, res) => {
  const bcrypt = require('bcryptjs');
  let user = Users.findOne({ login: 'ADMIN' });
  if (user) {
    user.password = bcrypt.hashSync('05012018', 10);
    Users.update(user);
    res.json({ ok: true, msg: 'Admin resetado! Login: ADMIN | Senha: 05012018' });
  } else {
    Users.insert({ login: 'ADMIN', password: bcrypt.hashSync('05012018', 10), role: 'admin', name: 'Administrador', createdAt: new Date().toISOString() });
    res.json({ ok: true, msg: 'Admin criado! Login: ADMIN | Senha: 05012018' });
  }
});


// ════════════════════════════════════════════════════════════════
//  DELETED STUDENTS (Admin)
// ════════════════════════════════════════════════════════════════
app.get('/api/admin/students/deleted', auth, isAdmin, (req, res) => {
  res.json(DeletedStudents.find().map(s => ({
    ...s,
    lessonCount: s.lessonCount || 0
  })));
});

app.post('/api/admin/students/reactivate', auth, isAdmin, (req, res) => {
  const { matricula } = req.body;
  if (!matricula) return res.status(400).json({ error: 'Matrícula obrigatória' });
  const deleted = DeletedStudents.findOne({ matricula });
  if (!deleted) return res.status(404).json({ error: 'Aluno excluído não encontrado' });
  // Check if matricula is still free
  if (Students.findOne({ matricula })) return res.status(409).json({ error: 'Matrícula já em uso' });
  // Restore user login
  const existingUser = Users.findOne({ login: matricula });
  if (!existingUser) {
    Users.insert({ login: matricula, password: bcrypt.hashSync('1234', 10), role: 'student', name: deleted.name, createdAt: now() });
  }
  // Restore student record (clean loki meta)
  const { $loki, meta, deletedAt, deletedBy, ...studentData } = deleted;
  Students.insert({ ...studentData, reactivatedAt: now() });
  DeletedStudents.remove(deleted);
  res.json({ ok: true, name: deleted.name, matricula });
});

// SPA fallback - serve index.html for all non-API routes
app.use((req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send('ERROR: index.html not found in: ' + __dirname);
  }
});

app.listen(PORT, () => console.log(`\n🚀 BeBrave rodando em http://localhost:${PORT}\n   Admin: ADMIN / 05012018\n`));
