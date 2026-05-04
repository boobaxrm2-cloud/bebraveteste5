/* ============================================================
   BeBrave — Frontend App
   ============================================================ */

// ── State ────────────────────────────────────────────────────
let ME = null;
let calMonthT = new Date(); calMonthT.setDate(1);
let calMonthS = new Date(); calMonthS.setDate(1);
let pendingLessonStudent = null; // pre-fill lesson modal

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ── Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const r = await api('GET', '/api/auth/me');
    ME = r;
    bootRole(ME.role);
  } catch {
    showPage('page-login');
  }
});

function bootRole(role) {
  if (role === 'admin')   { showPage('page-admin');   loadAdmin(); }
  if (role === 'teacher') { showPage('page-teacher'); loadTeacher(); }
  if (role === 'student') { showPage('page-student'); loadStudent(); }
}

// ── Auth ─────────────────────────────────────────────────────
async function doLogin() {
  const login    = document.getElementById('li-login').value.trim();
  const password = document.getElementById('li-pass').value;
  const err      = document.getElementById('login-err');
  err.classList.add('hidden');
  if (!login || !password) { err.textContent = 'Preencha todos os campos.'; err.classList.remove('hidden'); return; }
  try {
    ME = await api('POST', '/api/auth/login', { login: login.toUpperCase(), password });
    bootRole(ME.role);
  } catch(e) {
    err.textContent = e.message || 'Login ou senha incorretos.';
    err.classList.remove('hidden');
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('page-login').classList.contains('active')) doLogin();
});

async function doLogout() {
  await api('POST', '/api/auth/logout');
  ME = null;
  showPage('page-login');
  document.getElementById('li-login').value = '';
  document.getElementById('li-pass').value = '';
}

// ══════════════════════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════════════════════
async function loadAdmin() {
  showPage('page-admin');
  loadAdminOverview();
  loadAdminTeachers();
  loadAdminStudents('');
}

async function loadAdminOverview() {
  const [teachers, students] = await Promise.all([
    api('GET','/api/admin/teachers'),
    api('GET','/api/admin/students')
  ]);
  const lessons = await api('GET','/api/lessons').catch(()=>[]);
  renderStats('adm-stats', [
    { icon:'👨‍🏫', val: teachers.length, lbl:'Professores', cls:'bc-amber' },
    { icon:'🎓', val: students.length, lbl:'Alunos', cls:'bc-blue' },
    { icon:'📅', val: lessons.length, lbl:'Aulas cadastradas', cls:'bc-green' },
    { icon:'✅', val: lessons.filter(l=>l.status==='done').length, lbl:'Aulas realizadas', cls:'bc-purple' },
  ]);
  // Teacher cards
  document.getElementById('adm-teacher-cards').innerHTML = teachers.length
    ? teachers.map(t => `<div class="person-card" onclick="showAdmin('adm-teachers',document.querySelector('#admin-sidebar .nav-item:nth-child(2)'))">
        <div class="pc-av" style="background:${t.bg||'#e8eeff'};color:${t.color||'#3b6ef5'}">${t.initials}</div>
        <div><div class="pc-name">${t.name}</div><div class="pc-sub">Login: ${t.login}</div><div class="pc-cnt">${t.studentCount} aluno${t.studentCount!==1?'s':''}</div></div>
      </div>`).join('')
    : '<p class="empty">Nenhum professor cadastrado ainda.</p>';
}

async function loadAdminTeachers() {
  const teachers = await api('GET','/api/admin/teachers');
  const el = document.getElementById('adm-teachers-list');
  if (!teachers.length) { el.innerHTML = '<p class="empty">Nenhum professor cadastrado ainda.</p>'; return; }
  el.innerHTML = `<table class="list-table"><thead><tr><th>Professor</th><th>Login</th><th>Alunos</th><th>Cadastrado em</th><th>Ações</th></tr></thead><tbody>
    ${teachers.map(t=>`<tr>
      <td><div style="display:flex;align-items:center;gap:10px"><div class="lt-av" style="background:${t.bg||'#e8eeff'};color:${t.color||'#3b6ef5'}">${t.initials}</div>${t.name}</div></td>
      <td><span class="mat-badge" style="background:var(--navy2)">${t.login}</span></td>
      <td>${t.studentCount} aluno${t.studentCount!==1?'s':''}</td>
      <td>${fmtDate(t.createdAt)}</td>
      <td><div class="lt-actions">
        <button class="btn-icon" title="Redefinir senha" onclick="openResetPw('${t.login}','${t.name}')">🔑</button>
        <button class="btn-icon danger" title="Excluir" onclick="confirmDelete('teacher','${t.login}','${escJs(t.name)}')">🗑</button>
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

let _adminStudentFilter = '';
let _adminShowDeleted = false;

async function loadAdminStudents(teacherFilter) {
  if (teacherFilter !== undefined) _adminStudentFilter = teacherFilter;
  const [students, deleted, teachers] = await Promise.all([
    api('GET', '/api/admin/students'),
    api('GET', '/api/admin/students/deleted').catch(()=>[]),
    api('GET', '/api/admin/teachers'),
  ]);
  const el = document.getElementById('adm-students-list');

  // Build filter bar
  const filterBar = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <select id="adm-teacher-filter" onchange="loadAdminStudents(this.value)" style="font-size:13px;padding:8px 14px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif">
      <option value="">Todos os professores</option>
      ${teachers.map(t=>`<option value="${t.login}"${t.login===_adminStudentFilter?' selected':''}>${t.name}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:var(--g600)">
      <input type="checkbox" ${_adminShowDeleted?'checked':''} onchange="_adminShowDeleted=this.checked;loadAdminStudents()" style="accent-color:var(--red)">
      Mostrar alunos excluídos
    </label>
    <span style="font-size:13px;color:var(--g400)">${students.length} aluno${students.length!==1?'s':''} ativos${deleted.length?' • '+deleted.length+' excluído'+(deleted.length!==1?'s':''):''}</span>
  </div>`;

  // Filter active students
  let filtered = _adminStudentFilter
    ? students.filter(s=>s.teacherLogin===_adminStudentFilter)
    : students;

  const activeRows = filtered.map(s=>`<tr>
    <td><div style="display:flex;align-items:center;gap:10px"><div class="lt-av" style="background:${s.bg||'#e8eeff'};color:${s.color||'#3b6ef5'}">${s.initials}</div>${s.name}</div></td>
    <td><span class="mat-badge">${s.matricula}</span></td>
    <td><span class="badge b-sched">${s.level}</span></td>
    <td>${s.teacherName||'—'}</td>
    <td>${s.lessonCount}</td>
    <td>${fmtDate(s.createdAt)}</td>
    <td><div class="lt-actions">
      <button class="btn-icon" title="Redefinir senha" onclick="openResetPw('${s.matricula}','${escJs(s.name)}')">🔑</button>
      <button class="btn-icon danger" title="Excluir" onclick="confirmDelete('student','${s.matricula}','${escJs(s.name)}')">🗑</button>
    </div></td>
  </tr>`).join('');

  // Deleted students rows
  let deletedRows = '';
  if (_adminShowDeleted && deleted.length) {
    const delFiltered = _adminStudentFilter
      ? deleted.filter(s=>s.teacherLogin===_adminStudentFilter)
      : deleted;
    deletedRows = delFiltered.map(s=>`<tr style="background:#fef2f2;opacity:.85">
      <td><div style="display:flex;align-items:center;gap:10px"><div class="lt-av" style="background:#fee2e2;color:#dc2626">${s.initials||'?'}</div><span style="text-decoration:line-through;color:var(--g400)">${s.name}</span> <span class="badge" style="background:#fee2e2;color:#dc2626;font-size:10px">Excluído</span></div></td>
      <td><span class="mat-badge" style="background:#dc2626">${s.matricula}</span></td>
      <td>${s.level||'—'}</td>
      <td>${s.teacherName||'—'}</td>
      <td>${s.lessonCount||0}</td>
      <td>${fmtDate(s.deletedAt)}</td>
      <td><button class="btn-sm" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7" onclick="reactivateStudent('${s.matricula}','${escJs(s.name)}')">♻️ Reativar</button></td>
    </tr>`).join('');
  }

  if (!filtered.length && !deletedRows) {
    el.innerHTML = filterBar + '<p class="empty">Nenhum aluno encontrado.</p>';
    return;
  }

  el.innerHTML = filterBar + `<table class="list-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Nível</th><th>Professor</th><th>Aulas</th><th>Data</th><th>Ações</th></tr></thead><tbody>
    ${activeRows}${deletedRows}
  </tbody></table>`;
}

async function reactivateStudent(matricula, name) {
  if (!confirm('Reativar o aluno ' + name + '? Ele voltará a ter acesso ao sistema com a matrícula e senha originais.')) return;
  try {
    await api('POST', '/api/admin/students/reactivate', { matricula });
    showToast('✅ Aluno ' + name + ' reativado!');
    loadAdminStudents();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function adminAddTeacher() {
  const name  = document.getElementById('at-name').value.trim();
  const email = document.getElementById('at-email').value.trim();
  if (!name) return showToast('⚠️ Nome é obrigatório');
  try {
    const r = await api('POST','/api/admin/teachers',{name,email});
    document.getElementById('tcred-name').textContent  = r.name;
    document.getElementById('tcred-login').textContent = r.login;
    document.getElementById('tcred-pw').textContent    = r.defaultPassword;
    closeModal('modal-add-teacher');
    document.getElementById('at-name').value = '';
    document.getElementById('at-email').value = '';
    openModal('modal-teacher-cred');
    loadAdminOverview(); loadAdminTeachers();
    showToast('✅ Professor cadastrado!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function adminResetPw() {
  const login = document.getElementById('adm-reset-login').value.trim();
  const pw    = document.getElementById('adm-reset-pw').value.trim();
  if (!login||!pw) return showToast('⚠️ Preencha todos os campos');
  try {
    await api('PUT','/api/admin/reset-password',{login,newPassword:pw});
    showToast('✅ Senha alterada!');
    document.getElementById('adm-reset-login').value='';
    document.getElementById('adm-reset-pw').value='';
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Delete confirm ────────────────────────────────────────────
let pendingDelete = null;
function confirmDelete(type, id, name) {
  const msg = type==='teacher'
    ? `Tem certeza que deseja excluir o professor <strong>${name}</strong>? Todos os alunos, aulas e arquivos vinculados serão removidos.`
    : `Tem certeza que deseja excluir o aluno <strong>${name}</strong>? Todas as aulas, notas e arquivos serão removidos.`;
  document.getElementById('confirm-msg').innerHTML = msg;
  pendingDelete = { type, id };
  document.getElementById('confirm-btn').onclick = executeDelete;
  openModal('modal-confirm');
}
async function executeDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  try {
    if (type==='teacher') await api('DELETE',`/api/admin/teachers/${encodeURIComponent(id)}`);
    else await api('DELETE',`/api/admin/students/${id}`);
    closeModal('modal-confirm');
    showToast('✅ Excluído com sucesso!');
    loadAdminOverview(); loadAdminTeachers(); loadAdminStudents();
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Reset PW modal ────────────────────────────────────────────
function openResetPw(login, name) {
  document.getElementById('rp-login').value = login;
  document.getElementById('rp-user-label').textContent = `Usuário: ${name} (${login})`;
  document.getElementById('rp-pw').value = '';
  openModal('modal-reset-pw');
}
async function submitResetPw() {
  const login = document.getElementById('rp-login').value;
  const pw    = document.getElementById('rp-pw').value.trim();
  if (!pw || pw.length<4) return showToast('⚠️ Senha deve ter ao menos 4 caracteres');
  try {
    await api('PUT','/api/admin/reset-password',{login,newPassword:pw});
    closeModal('modal-reset-pw');
    showToast('✅ Senha alterada com sucesso!');
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Admin nav ─────────────────────────────────────────────────
function showAdmin(sec, el) {
  document.querySelectorAll('#page-admin .cs').forEach(s=>s.classList.remove('active'));
  document.getElementById(sec).classList.add('active');
  document.querySelectorAll('#admin-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
//  TEACHER
// ══════════════════════════════════════════════════════════════
async function loadTeacher() {
  document.getElementById('t-avatar').textContent = ME.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  document.getElementById('t-name').textContent   = ME.name;
  await refreshTeacherAll();
}

async function refreshTeacherAll() {
  const [students, lessons, files] = await Promise.all([
    api('GET','/api/students'),
    api('GET','/api/lessons'),
    api('GET','/api/files')
  ]);
  renderTeacherOverview(students, lessons);
  renderTeacherStudents(students, lessons);
  renderTeacherCalendar(lessons);
  renderTeacherFiles(files, students);
  populateStudentSelects(students);
}

function renderTeacherOverview(students, lessons) {
  const done = lessons.filter(l=>l.status==='done').length;
  const upcoming = lessons.filter(l=>l.status==='scheduled').length;
  renderStats('t-stats', [
    { icon:'🎓', val:students.length, lbl:'Meus Alunos', cls:'bc-blue' },
    { icon:'📅', val:upcoming, lbl:'Aulas agendadas', cls:'bc-green' },
    { icon:'✅', val:done, lbl:'Aulas realizadas', cls:'bc-amber' },
    { icon:'📁', val:students.length, lbl:'Alunos ativos', cls:'bc-purple' },
  ]);
  // student cards
  document.getElementById('t-student-cards').innerHTML = students.length
    ? students.map(s=>`<div class="person-card" onclick="showTeacher('t-students',document.querySelector('#teacher-sidebar .nav-item:nth-child(2)'))">
        <div class="pc-av" style="background:${s.bg};color:${s.color}">${s.initials}</div>
        <div><div class="pc-name">${s.name}</div><div class="pc-sub">Nível ${s.level}</div><div class="pc-cnt">${s.lessonsDone||0} aulas realizadas</div></div>
      </div>`).join('')
    : '<p class="empty">Nenhum aluno cadastrado ainda. Clique em "Cadastrar Aluno".</p>';
  // upcoming lessons
  const now = todayStr();
  const upcoming3 = lessons.filter(l=>l.date>=now&&l.status==='scheduled').slice(0,5);
  document.getElementById('t-upcoming').innerHTML = upcoming3.length
    ? upcoming3.map(l=>lessonItemHTML(l,true)).join('')
    : '<p class="empty">Nenhuma aula agendada.</p>';
}

function renderTeacherStudents(students, lessons) {
  const el = document.getElementById('t-student-detail-list');
  if (!students.length) { el.innerHTML = '<div class="card"><p class="empty">Nenhum aluno cadastrado ainda.</p></div>'; return; }
  el.innerHTML = students.map(s=>{
    const done = lessons.filter(l=>l.studentMatricula===s.matricula&&l.status==='done').length;
    const sched = lessons.filter(l=>l.studentMatricula===s.matricula&&l.status==='scheduled').length;
    return `<div class="sdc">
      <div class="sdc-hd">
        <div class="sdc-hd-av">${s.initials}</div>
        <div>
          <div class="sdc-n">${s.name}</div>
          <div class="sdc-sub">Matrícula: ${s.matricula} &nbsp;|&nbsp; Nível: ${s.level}</div>
        </div>
        <div class="sdc-hd-actions">
          <button class="btn-icon" style="background:rgba(255,255,255,.1);color:white;border-color:rgba(255,255,255,.2)" title="Redefinir senha" onclick="openResetPw('${s.matricula}','${escJs(s.name)}')">🔑</button>
          <button class="btn-icon danger" style="background:rgba(255,255,255,.1);color:white;border-color:rgba(255,255,255,.2)" title="Excluir aluno" onclick="confirmDeleteStudent('${s.matricula}','${escJs(s.name)}')">🗑</button>
        </div>
      </div>
      <div class="sdc-body">
        <div class="sdc-mini-grid">
          <div class="sdc-mini"><div class="sdc-mini-val">${done}</div><div class="sdc-mini-lbl">Aulas realizadas</div></div>
          <div class="sdc-mini"><div class="sdc-mini-val">${sched}</div><div class="sdc-mini-lbl">Próximas aulas</div></div>
          <div class="sdc-mini"><div class="sdc-mini-val">${s.level}</div><div class="sdc-mini-lbl">Nível atual</div></div>
        </div>
        <div class="sdc-actions">
          <button class="btn-primary" onclick="openLessonFor('${s.matricula}')">+ Agendar Aula</button>
          <button class="btn-secondary" onclick="openNoteFor('${s.matricula}')">📝 Anotação</button>
          <select onchange="updateStudentLevel('${s.matricula}',this.value)" style="font-size:13px;padding:8px 12px;border:1.5px solid var(--g200);border-radius:var(--r-sm);cursor:pointer;font-family:'DM Sans',sans-serif">
            ${['A1','A2','B1','B2','C1','C2'].map(l=>`<option value="${l}"${l===s.level?' selected':''}>${l}</option>`).join('')}
          </select>
          <button class="btn-danger" style="font-size:13px;padding:8px 16px" onclick="confirmDeleteStudentTeacher('${s.matricula}','${escJs(s.name)}')">🗑 Excluir Aluno</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

let _calLessonsT = [];
function renderTeacherCalendar(lessons) {
  _calLessonsT = lessons;
  renderCal(calMonthT,'cal-t','cal-lbl-t', day=>{
    showCalDayT(day);
  }, lessons, null);
}
function showCalDayT(day) {
  document.getElementById('cal-day-lbl-t').textContent = formatDayLabel(day);
  const dayLessons = _calLessonsT.filter(l=>l.date===day);
  const el = document.getElementById('cal-events-t');
  el.innerHTML = dayLessons.length
    ? dayLessons.map(l=>dayEventHTML(l,true)).join('')
    : '<p class="empty">Nenhuma aula neste dia.</p>';
}

function renderTeacherFiles(files, students) {
  const sent     = files.filter(f=>f.from==='teacher');
  const received = files.filter(f=>f.from==='student');
  renderFileList('t-files-sent',     sent,     true);
  renderFileList('t-files-from-students', received, true);
  // populate student select for upload
  const sel = document.getElementById('t-file-student');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' + students.map(s=>`<option value="${s.matricula}"${s.matricula===cur?' selected':''}>${s.name}</option>`).join('');
}

function renderFileList(id, files, canDelete) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = files.length
    ? files.map(f=>`<div class="file-item">
        <div class="f-icon">${fileIcon(f.type)}</div>
        <div class="f-info"><div class="f-name">${f.name}</div><div class="f-meta">${f.from==='teacher'?'Para: '+f.studentName:'De: '+f.studentName} &nbsp;•&nbsp; ${f.date} &nbsp;•&nbsp; ${f.size}</div></div>
        <div class="f-actions">
          ${f.filename?`<a href="/uploads/${f.filename}" download="${f.name}" class="btn-sm">⬇ Baixar</a>`:'<span class="btn-sm" style="opacity:.5">Demo</span>'}
          ${canDelete?`<button class="btn-icon danger" onclick="deleteFile(${f.$loki})">🗑</button>`:''}
        </div>
      </div>`).join('')
    : '<p class="empty">Nenhum arquivo ainda.</p>';
}

function populateStudentSelects(students) {
  ['al-student','modal-lesson-student'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">Selecione o aluno...</option>'+students.map(s=>`<option value="${s.matricula}"${s.matricula===cur?' selected':''}>${s.name}</option>`).join('');
  });
  const al = document.getElementById('al-student');
  if(al && pendingLessonStudent) { al.value = pendingLessonStudent; pendingLessonStudent=null; }
}

// Teacher actions
async function teacherAddStudent() {
  const name  = document.getElementById('as-name').value.trim();
  const level = document.getElementById('as-level').value;
  if (!name) return showToast('⚠️ Nome é obrigatório');
  try {
    const r = await api('POST','/api/students',{name,level});
    document.getElementById('cred-name').textContent  = r.name;
    document.getElementById('cred-login').textContent = r.matricula;
    document.getElementById('cred-pw').textContent    = r.defaultPassword;
    closeModal('modal-add-student');
    document.getElementById('as-name').value='';
    openModal('modal-credential');
    refreshTeacherAll();
    showToast('✅ Aluno cadastrado!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function teacherAddLesson() {
  const studentMatricula = document.getElementById('al-student').value;
  const date     = document.getElementById('al-date').value;
  const time     = document.getElementById('al-time').value;
  const subject  = document.getElementById('al-subject').value.trim();
  const topic    = document.getElementById('al-topic').value.trim();
  const duration = document.getElementById('al-duration').value;
  const meetLink = document.getElementById('al-meet').value.trim();
  if (!studentMatricula||!date||!time||!subject) return showToast('⚠️ Preencha os campos obrigatórios (*)');
  try {
    await api('POST','/api/lessons',{studentMatricula,date,time,subject,topic:topic||subject,duration,meetLink});
    closeModal('modal-add-lesson');
    ['al-student','al-date','al-time','al-subject','al-topic','al-meet'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('al-duration').value='60';
    refreshTeacherAll();
    showToast('✅ Aula agendada!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function markLessonDone(id) {
  try { await api('PUT',`/api/lessons/${id}`,{status:'done'}); refreshTeacherAll(); showToast('✅ Aula marcada como realizada!'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function deleteLesson(id) {
  try { await api('DELETE',`/api/lessons/${id}`); refreshTeacherAll(); showToast('🗑 Aula removida'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function deleteFile(id) {
  try { await api('DELETE',`/api/files/${id}`); refreshTeacherAll(); showToast('🗑 Arquivo removido'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function teacherAddNote() {
  const mat  = document.getElementById('an-mat').value;
  const text = document.getElementById('an-text').value.trim();
  if(!text) return showToast('⚠️ Digite a anotação');
  try {
    await api('POST','/api/notes',{studentMatricula:mat,text});
    closeModal('modal-add-note');
    document.getElementById('an-text').value='';
    refreshTeacherAll();
    showToast('✅ Anotação salva!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function updateStudentLevel(mat, level) {
  try { await api('PUT',`/api/students/${mat}`,{level}); showToast('✅ Nível atualizado!'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function uploadTeacherFile(ev) {
  const file = ev.target.files[0]; if(!file) return;
  const mat = document.getElementById('t-file-student').value;
  if(!mat) { showToast('⚠️ Selecione um aluno primeiro'); ev.target.value=''; return; }
  const fd = new FormData(); fd.append('file',file); fd.append('studentMatricula',mat);
  try {
    await fetch('/api/files',{method:'POST',body:fd});
    ev.target.value=''; refreshTeacherAll(); showToast('✅ Arquivo enviado!');
  } catch { showToast('❌ Erro ao enviar arquivo'); }
}

function openLessonFor(mat) { pendingLessonStudent = mat; openModal('modal-add-lesson'); setTimeout(()=>{ const el=document.getElementById('al-student'); if(el) el.value=mat; },50); }
function openNoteFor(mat)  { document.getElementById('an-mat').value=mat; document.getElementById('an-text').value=''; openModal('modal-add-note'); }
function confirmDeleteStudent(mat,name) { confirmDelete('student',mat,name); }
function confirmDeleteStudentTeacher(mat, name) {
  document.getElementById('confirm-msg').innerHTML = `Tem certeza que deseja excluir o aluno <strong>${name}</strong>?<br><br>Todas as aulas, notas, arquivos e certificados serão removidos permanentemente.`;
  pendingDelete = { type: 'student', id: mat };
  document.getElementById('confirm-btn').onclick = async () => {
    try {
      await api('DELETE', `/api/students/${mat}`);
      closeModal('modal-confirm');
      showToast('✅ Aluno excluído!');
      refreshTeacherAll();
    } catch(e) { showToast('❌ ' + e.message); }
  };
  openModal('modal-confirm');
}

async function changeMonthT(dir) { calMonthT=addMonth(calMonthT,dir); const lessons=await api('GET','/api/lessons'); renderTeacherCalendar(lessons); }

function showTeacher(sec, el) {
  document.querySelectorAll('#page-teacher .cs').forEach(s=>s.classList.remove('active'));
  document.getElementById(sec).classList.add('active');
  document.querySelectorAll('#teacher-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
//  STUDENT
// ══════════════════════════════════════════════════════════════
async function loadStudent() {
  document.getElementById('s-avatar').textContent = ME.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  document.getElementById('s-name').textContent   = ME.name;
  document.getElementById('s-greet').textContent  = ME.name.split(' ')[0];
  // Fetch teacher name from lessons if not in session
  let teacherName = ME.teacherName || '';
  if (!teacherName) {
    try {
      const lessons = await api('GET', '/api/lessons');
      if (lessons.length > 0) teacherName = lessons[0].teacherName || '';
    } catch(e) {}
  }
  document.getElementById('s-teacher-name').textContent = teacherName || '—';
  await refreshStudentAll();
}

async function refreshStudentAll() {
  const [lessons, files, notes] = await Promise.all([
    api('GET','/api/lessons'),
    api('GET','/api/files'),
    api('GET','/api/notes')
  ]);
  renderStudentDashboard(lessons, notes);
  renderStudentCalendar(lessons);
  renderStudentFiles(files);
  renderStudentProgress(lessons, notes);
}

function renderStudentDashboard(lessons, notes) {
  const done   = lessons.filter(l=>l.status==='done');
  const sched  = lessons.filter(l=>l.status==='scheduled');
  const subjects = [...new Set(done.map(l=>l.subject||l.topic).filter(Boolean))];

  const absent = lessons.filter(l=>l.status==='absent');
  renderStats('s-stats', [
    { icon:'📚', val:done.length, lbl:'Aulas realizadas', cls:'bc-blue' },
    { icon:'📅', val:sched.length, lbl:'Aulas agendadas', cls:'bc-green' },
    { icon:'❌', val:absent.length, lbl:'Faltas', cls:'bc-red' },
    { icon:'⭐', val:ME.level||'—', lbl:'Nível atual', cls:'bc-purple' },
  ]);

  // upcoming
  const now = todayStr();
  const up3 = sched.filter(l=>l.date>=now).slice(0,4);
  document.getElementById('s-upcoming').innerHTML = up3.length
    ? up3.map(l=>lessonItemHTML(l,false)).join('')
    : '<p class="empty">Nenhuma aula agendada ainda.</p>';

  // topics
  const recentSubjects = [...new Set(done.slice().reverse().map(l=>l.subject||l.topic).filter(Boolean))].slice(0,10);
  document.getElementById('s-topics').innerHTML = recentSubjects.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:4px;padding-top:4px">'+recentSubjects.map(s=>`<span class="topic-tag">${s}</span>`).join('')+'</div>'
    : '<p class="empty">Nenhum assunto registrado ainda.</p>';

  // history table
  document.getElementById('s-history').innerHTML = done.length
    ? `<thead><tr><th>Data</th><th>Assunto</th><th>Feedback do Professor</th><th>Tarefa</th><th>Duração</th></tr></thead><tbody>
        ${done.slice().reverse().map(l=>`<tr>
          <td>${fmtDatePt(l.date)}</td>
          <td>${l.subject||'—'}</td>
          <td style="max-width:200px;font-size:12px">${l.feedback||'—'}</td>
          <td style="max-width:150px;font-size:12px">${l.homework||'—'}</td>
          <td>${l.duration}min</td>
        </tr>`).join('')}
      </tbody>`
    : '<tbody><tr><td colspan="5" style="text-align:center;padding:24px;color:var(--g400)">Nenhuma aula realizada ainda.</td></tr></tbody>';
}

let _calLessonsS = [];
function renderStudentCalendar(lessons) {
  _calLessonsS = lessons;
  renderCal(calMonthS,'cal-s','cal-lbl-s', day=>{
    showCalDayS(day);
  }, lessons, null);
}
function showCalDayS(day) {
  document.getElementById('cal-day-lbl-s').textContent = formatDayLabel(day);
  const dayLessons = _calLessonsS.filter(l=>l.date===day);
  const el = document.getElementById('cal-events-s');
  el.innerHTML = dayLessons.length
    ? dayLessons.map(l=>dayEventHTML(l,false)).join('')
    : '<p class="empty">Nenhuma aula neste dia.</p>';
}

function renderStudentFiles(files) {
  const received = files.filter(f=>f.from==='teacher');
  const sent     = files.filter(f=>f.from==='student');
  renderFileList('s-files-received', received, false);
  renderFileList('s-files-sent',     sent,     true);
}

function renderStudentProgress(lessons, notes) {
  const done = lessons.filter(l=>l.status==='done');
  const level = ME.level || 'A1';
  const levels = ['A1','A2','B1','B2','C1','C2'];
  const curIdx = levels.indexOf(level);

  document.getElementById('s-level-track').innerHTML = `<div class="lvl-row">
    ${levels.map((l,i)=>{
      const cls = i<curIdx?'done':i===curIdx?'curr':'future';
      return (i>0?`<div class="lvl-conn ${i<=curIdx?'done':''}"></div>`:'') + `<div class="lvl ${cls}">${l}</div>`;
    }).join('')}
  </div>
  <p class="lvl-desc">Você está no nível <strong>${level}</strong>. ${curIdx<levels.length-1?'Próximo objetivo: <strong>'+levels[curIdx+1]+'</strong>':' — Nível máximo atingido! 🏆'}</p>`;

  // Monthly chart
  const monthCounts = {};
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl=MONTHS_SHORT[d.getMonth()];
    monthCounts[lbl]=(done.filter(l=>l.date.startsWith(key)).length);
  }
  const maxV = Math.max(...Object.values(monthCounts),1);
  document.getElementById('s-monthly-chart').innerHTML = Object.entries(monthCounts).map(([m,v])=>
    `<div class="bcc"><div class="bcv">${v}</div><div class="bcb" style="height:${Math.round((v/maxV)*100)}px" title="${v} aulas em ${m}"></div><div class="bcl">${m}</div></div>`
  ).join('');

  // Subjects list
  const subjects = done.slice().reverse().map(l=>({s:l.subject||l.topic,d:l.date})).filter(x=>x.s);
  document.getElementById('s-subjects-list').innerHTML = subjects.length
    ? subjects.map(x=>`<div class="subject-item"><div class="si-name">📖 ${x.s}</div><div class="si-date">${fmtDatePt(x.d)}</div></div>`).join('')
    : '<p class="empty">Nenhum assunto registrado ainda.</p>';

  // Notes
  document.getElementById('s-notes').innerHTML = notes.length
    ? notes.slice().reverse().map(n=>`<div class="note-item"><div class="ni-text">${n.text}</div><div class="ni-date">📅 ${fmtDatePt(n.date)}</div></div>`).join('')
    : '<p class="empty">Nenhuma anotação do professor ainda.</p>';
}

async function uploadStudentFile(ev) {
  const file = ev.target.files[0]; if(!file) return;
  const fd = new FormData(); fd.append('file',file);
  try {
    await fetch('/api/files',{method:'POST',body:fd});
    ev.target.value=''; refreshStudentAll(); showToast('✅ Arquivo enviado ao professor!');
  } catch { showToast('❌ Erro ao enviar arquivo'); }
}

async function changeMonthS(dir) { calMonthS=addMonth(calMonthS,dir); const lessons=await api('GET','/api/lessons'); renderStudentCalendar(lessons); }

function showStudent(sec, el) {
  document.querySelectorAll('#page-student .cs').forEach(s=>s.classList.remove('active'));
  document.getElementById(sec).classList.add('active');
  document.querySelectorAll('#student-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
//  CALENDAR RENDERER
// ══════════════════════════════════════════════════════════════
function renderCal(month, gridId, labelId, onDayClick, lessons, studentFilter) {
  document.getElementById(labelId).textContent = `${MONTHS_PT[month.getMonth()]} ${month.getFullYear()}`;
  const grid = document.getElementById(gridId);
  let html = ['D','S','T','Q','Q','S','S'].map(d=>`<div class="cdh">${d}</div>`).join('');
  const first = new Date(month.getFullYear(),month.getMonth(),1).getDay();
  const daysInMonth = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const todayD = new Date(); const todayISO = todayStr();

  const lessonDays = new Set(
    lessons.filter(l=>{
      const d=new Date(l.date+'T12:00');
      return d.getMonth()===month.getMonth() && d.getFullYear()===month.getFullYear() && (!studentFilter||l.studentMatricula===studentFilter);
    }).map(l=>parseInt(l.date.split('-')[2]))
  );

  for(let i=0;i<first;i++) html+=`<div class="cd cd-empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const iso=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=iso===todayISO; const hasL=lessonDays.has(d);
    html+=`<div class="cd${isToday?' cd-today':''}${hasL?' cd-has':''}" onclick="selectCalDay('${gridId}','${iso}')"><span>${d}</span></div>`;
  }
  grid.innerHTML=html;
  // trigger callback if provided
  if(onDayClick) onDayClick(null);
}

function selectCalDay(gridId, iso) {
  document.querySelectorAll(`#${gridId} .cd`).forEach(c=>c.classList.remove('cd-sel'));
  const cells=document.querySelectorAll(`#${gridId} .cd:not(.cd-empty)`);
  const d=parseInt(iso.split('-')[2]);
  cells.forEach(c=>{ if(parseInt(c.querySelector('span').textContent)===d) c.classList.add('cd-sel'); });
  // call the right handler
  if(gridId==='cal-t') showCalDayT(iso);
  else if(gridId==='cal-s') showCalDayS(iso);
}

// ══════════════════════════════════════════════════════════════
//  HTML HELPERS
// ══════════════════════════════════════════════════════════════
function lessonItemHTML(l, isTeacher) {
  const d=new Date(l.date+'T12:00');
  return `<div class="lesson-item">
    <div class="ld"><div class="ld-day">${d.getDate()}</div><div class="ld-mon">${MONTHS_SHORT[d.getMonth()]}</div></div>
    <div class="li-info">
      <div class="li-topic">📖 ${l.subject||l.topic}${l.topic&&l.topic!==l.subject?` <span style="font-weight:400;color:var(--g500);font-size:12px">— ${l.topic}</span>`:''}</div>
      <div class="li-meta">${DAYS_PT[d.getDay()]} • ${l.time} • ${l.duration}min${isTeacher?` • ${l.studentName}`:''}</div>
      ${l.meetLink?`<button class="meet-link" onclick="openMeet('${l.meetLink}')">🎥 Entrar no Google Meet</button>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
      <span class="badge b-sched">Agendada</span>
      ${isTeacher?`<button class="btn-sm" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7" onclick="openFeedbackModal(${l.$loki},'${(l.subject||l.topic||'').replace(/'/g,'')}')" title="Concluir aula e dar feedback">✅ Concluir</button><button class="btn-icon danger" onclick="deleteLesson(${l.$loki})">🗑</button>`:''}
    </div>
  </div>`;
}

function dayEventHTML(l, isTeacher) {
  const statusClass = l.status==='done' ? 'dev-done' : l.status==='absent' ? 'dev-absent' : '';
  const badgeClass  = l.status==='done' ? 'b-done' : l.status==='absent' ? 'b-absent' : 'b-sched';
  const badgeLabel  = l.status==='done' ? 'Realizada' : l.status==='absent' ? '❌ Falta' : 'Agendada';
  return `<div class="dev ${statusClass}">
    <div class="dev-topic">📖 ${l.subject||l.topic}</div>
    <div class="dev-meta">⏰ ${l.time} • ${l.duration}min${isTeacher?` • 👤 ${l.studentName}`:''} • <span class="badge ${badgeClass}">${badgeLabel}</span></div>
    ${l.meetLink&&l.status==='scheduled'?`<button class="meet-link" onclick="openMeet('${l.meetLink}')">🎥 Google Meet</button>`:''}
    ${l.feedback&&l.status!=='scheduled'?`<div style="font-size:12px;color:var(--g600);margin-top:6px;background:var(--g50);padding:6px 10px;border-radius:6px">📝 ${l.feedback}</div>`:''}
    ${l.homework?`<div style="font-size:12px;color:#065f46;margin-top:4px;background:var(--green-pale);padding:5px 10px;border-radius:6px">📚 Tarefa: ${l.homework}</div>`:''}
    ${isTeacher&&l.status==='scheduled'?`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn-sm" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7" onclick="openFeedbackModal(${l.$loki},'${(l.subject||l.topic||'').replace(/'/g,'')}')">✅ Concluir aula</button>
      <button class="btn-sm" style="background:#fef3c7;color:#92400e;border-color:#fcd34d" onclick="markAbsent(${l.$loki})">❌ Aluno faltou</button>
      <button class="btn-icon danger" onclick="deleteLesson(${l.$loki})">🗑</button>
    </div>`:''}
  </div>`;
}

function renderStats(id, items) {
  const cls=['bc-blue','bc-green','bc-amber','bc-purple','bc-red'];
  document.getElementById(id).innerHTML = items.map((it,i)=>`
    <div class="stat-card ${it.cls||cls[i%cls.length]}">
      <div class="stat-icon">${it.icon}</div>
      <div><div class="stat-val">${it.val}</div><div class="stat-lbl">${it.lbl}</div></div>
    </div>`).join('');
}

function fileIcon(type) { return {pdf:'📄',doc:'📝',audio:'🎵',video:'🎬',img:'🖼'}[type]||'📁'; }

// ══════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || 'Erro desconhecido');
  return json;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOv(ev, id) { if(ev.target===ev.currentTarget) closeModal(id); }

let toastT;
function showToast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(toastT); toastT=setTimeout(()=>el.classList.add('hidden'),3200);
}

function togglePw(id,btn) {
  const inp=document.getElementById(id);
  inp.type=inp.type==='password'?'text':'password';
  btn.textContent=inp.type==='password'?'👁':'🙈';
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function addMonth(d,n) { const r=new Date(d); r.setMonth(r.getMonth()+n); return r; }
function fmtDate(iso) { if(!iso) return '—'; return iso.split('T')[0].split('-').reverse().join('/'); }
function fmtDatePt(iso) {
  if(!iso) return '—';
  const [y,m,d]=iso.split('-');
  return `${d} ${MONTHS_SHORT[parseInt(m)-1]} ${y}`;
}
function formatDayLabel(iso) {
  const d=new Date(iso+'T12:00');
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} de ${MONTHS_PT[d.getMonth()]}`;
}
function escJs(s) { return (s||'').replace(/'/g,"\\'"); }

// ══════════════════════════════════════════════════════════════
//  CERTIFICATES
// ══════════════════════════════════════════════════════════════

// ── Signature pad ─────────────────────────────────────────────
const _sigState = {};

function initSigPad(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || _sigState[canvasId]) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#0f1b35';
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  let drawing = false, lastX = 0, lastY = 0;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    if (e.touches) {
      return [(e.touches[0].clientX - r.left) * scaleX,
              (e.touches[0].clientY - r.top)  * scaleY];
    }
    return [(e.clientX - r.left) * scaleX,
            (e.clientY - r.top)  * scaleY];
  }

  function start(e) { e.preventDefault(); drawing = true; [lastX, lastY] = pos(e); }
  function move(e)  {
    if (!drawing) return; e.preventDefault();
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    [lastX, lastY] = [x, y];
  }
  function stop() { drawing = false; }

  canvas.addEventListener('mousedown',  start);
  canvas.addEventListener('mousemove',  move);
  canvas.addEventListener('mouseup',    stop);
  canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove',  move,  { passive: false });
  canvas.addEventListener('touchend',   stop);

  _sigState[canvasId] = true;
}

function clearSig(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function getSigDataURL(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return '';
  // Check if blank
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const blank = !data.some(v => v !== 0);
  if (blank) return '';
  return canvas.toDataURL('image/png');
}

// ── Open cert modal: init pads + populate students ─────────────
function openCertModal() {
  openModal('modal-cert');
  setTimeout(() => {
    initSigPad('sig-teacher');
    // populate student select
    const sel = document.getElementById('cert-student');
    if (sel && sel.options.length <= 1) {
      api('GET', '/api/students').then(students => {
        sel.innerHTML = '<option value="">Selecione...</option>' +
          students.map(s => `<option value="${s.matricula}">${s.name} (${s.level})</option>`).join('');
      });
    }
  }, 80);
}

// Override openModal to auto-init signature pads + populate cert students
const _origOpenModal = openModal;
window.openModal = function(id) {
  _origOpenModal(id);
  if (id === 'modal-cert') {
    setTimeout(() => initSigPad('sig-teacher'), 80);
    // Always refresh student list when opening cert modal
    api('GET', '/api/students').then(students => {
      const sel = document.getElementById('cert-student');
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">Selecione o aluno...</option>' +
        students.map(s => `<option value="${s.matricula}"${s.matricula===cur?' selected':''} >${s.name} — Nível ${s.level}</option>`).join('');
    }).catch(()=>{});
  }
  if (id === 'modal-student-sign') setTimeout(() => initSigPad('sig-student'), 80);
};

// ── Cert form helpers ─────────────────────────────────────────
function getCertFormData() {
  return {
    studentMatricula: document.getElementById('cert-student').value,
    module:   document.getElementById('cert-module').value.trim(),
    level:    document.getElementById('cert-level').value,
    hours:    document.getElementById('cert-hours').value.trim(),
    period:   document.getElementById('cert-period').value.trim(),
    location: document.getElementById('cert-location').value.trim(),
    teacher_signature: getSigDataURL('sig-teacher'),
  };
}

async function previewCert() {
  const d = getCertFormData();
  if (!d.studentMatricula || !d.module) return showToast('⚠️ Preencha aluno e módulo');

  // get student name for preview
  const students = await api('GET', '/api/students');
  const s = students.find(st => st.matricula === d.studentMatricula);

  const previewData = {
    ...d,
    student_name:  s ? s.name : 'Aluno',
    teacher_name:  ME.name,
    issued_date:   new Date().toLocaleDateString('pt-BR'),
    cert_id:       'PREVIEW',
    student_signature: ''
  };

  showToast('⏳ Gerando pré-visualização...');
  try {
    const r = await api('POST', '/api/certificates/preview', previewData);
    const blob = b64toBlob(r.pdf, 'application/pdf');
    const url  = URL.createObjectURL(blob);
    document.getElementById('pdf-preview-frame').src = url;
    openModal('modal-pdf-preview');
  } catch(e) { showToast('❌ ' + e.message); }
}

async function issueCert() {
  const d = getCertFormData();
  if (!d.studentMatricula) return showToast('⚠️ Selecione um aluno');
  if (!d.module)  return showToast('⚠️ Informe o módulo/curso');
  if (!d.hours)   return showToast('⚠️ Informe a carga horária');
  if (!d.period)  return showToast('⚠️ Informe o período');

  showToast('⏳ Emitindo certificado...');
  try {
    await api('POST', '/api/certificates', d);
    closeModal('modal-cert');
    clearSig('sig-teacher');
    ['cert-student','cert-module','cert-hours','cert-period','cert-location'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
    showToast('✅ Certificado emitido! O aluno deve assinar para liberar o download.');
    loadTeacherCerts();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function loadTeacherCerts() {
  const certs = await api('GET', '/api/certificates').catch(() => []);
  const el = document.getElementById('t-certs-list');
  if (!el) return;
  if (!certs.length) { el.innerHTML = '<div class="card"><p class="empty">Nenhum certificado emitido ainda.</p></div>'; return; }

  el.innerHTML = certs.map(c => `
    <div class="cert-card">
      <div class="cert-icon">🎓</div>
      <div class="cert-info">
        <div class="cert-title">${c.module} — ${c.studentName}</div>
        <div class="cert-meta">Nível ${c.level} &nbsp;•&nbsp; ${c.hours}h &nbsp;•&nbsp; ${c.period} &nbsp;•&nbsp; Emitido em ${c.issuedDate}</div>
        <div class="cert-id">ID: ${c.certId}</div>
      </div>
      <div class="cert-actions">
        <span class="badge ${c.status === 'complete' ? 'b-done badge-complete' : 'badge b-sched badge-pending'}">${c.status === 'complete' ? '✅ Completo' : '⏳ Aguard. assinatura'}</span>
        ${c.status === 'complete' ? `<a href="/api/certificates/${c.certId}/download" class="btn-sm">⬇ PDF</a>` : ''}
        <button class="btn-icon danger" onclick="deleteCert(${c.$loki})">🗑</button>
      </div>
    </div>`).join('');
}

async function deleteCert(id) {
  if (!confirm('Excluir este certificado?')) return;
  try { await api('DELETE', `/api/certificates/${id}`); showToast('🗑 Certificado excluído'); loadTeacherCerts(); }
  catch(e) { showToast('❌ ' + e.message); }
}

// ── Student certs ─────────────────────────────────────────────
async function loadStudentCerts() {
  const certs = await api('GET', '/api/certificates').catch(() => []);
  const el = document.getElementById('s-certs-list');
  if (!el) return;
  if (!certs.length) { el.innerHTML = '<div class="card"><p class="empty">Nenhum certificado emitido ainda. Conclua um módulo com seu professor!</p></div>'; return; }

  el.innerHTML = certs.map(c => `
    <div class="cert-card">
      <div class="cert-icon">🎓</div>
      <div class="cert-info">
        <div class="cert-title">${c.module}</div>
        <div class="cert-meta">Nível ${c.level} &nbsp;•&nbsp; ${c.hours}h &nbsp;•&nbsp; ${c.period} &nbsp;•&nbsp; Prof. ${c.teacherName} &nbsp;•&nbsp; ${c.issuedDate}</div>
        <div class="cert-id">ID: ${c.certId}</div>
      </div>
      <div class="cert-actions">
        ${c.status === 'complete'
          ? `<span class="badge b-done badge-complete">✅ Assinado</span>
             <a href="/api/certificates/${c.certId}/download" class="btn-primary" style="font-size:13px;padding:8px 16px;text-decoration:none">⬇ Baixar PDF</a>`
          : `<span class="badge badge-pending">⏳ Aguardando sua assinatura</span>
             <button class="btn-primary" style="font-size:13px;padding:8px 16px" onclick="openStudentSign(${c.$loki})">✍️ Assinar</button>`
        }
      </div>
    </div>`).join('');
}

function openStudentSign(certLoki) {
  document.getElementById('sign-cert-id').value = certLoki;
  clearSig('sig-student');
  openModal('modal-student-sign');
}

async function submitStudentSign() {
  const id  = document.getElementById('sign-cert-id').value;
  const sig = getSigDataURL('sig-student');
  if (!sig) return showToast('⚠️ Por favor, faça sua assinatura');
  showToast('⏳ Salvando assinatura...');
  try {
    await api('PUT', `/api/certificates/${id}/student-sign`, { student_signature: sig });
    closeModal('modal-student-sign');
    showToast('✅ Certificado assinado! Já pode fazer o download.');
    loadStudentCerts();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Utility: base64 → Blob ────────────────────────────────────
function b64toBlob(b64, mime) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ── Hook into existing load functions ─────────────────────────
const _origShowTeacher = showTeacher;
window.showTeacher = function(sec, el) {
  _origShowTeacher(sec, el);
  if (sec === 't-certs') loadTeacherCerts();
};

const _origShowStudent = showStudent;
window.showStudent = function(sec, el) {
  _origShowStudent(sec, el);
  if (sec === 's-certs') loadStudentCerts();
};

// ── Open Meet in new tab (guaranteed) ────────────────────────
function openMeet(url) {
  if (!url) return;
  // Ensure URL has protocol
  if (!url.startsWith('http')) url = 'https://' + url;
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    // Popup blocked fallback
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

// ── Lesson Feedback (teacher marks lesson done + feedback) ────
let pendingFeedbackId = null;

function openFeedbackModal(lessonId, topic) {
  pendingFeedbackId = lessonId;
  document.getElementById('fb-topic').textContent = topic || 'Aula';
  document.getElementById('fb-feedback').value = '';
  document.getElementById('fb-homework').value = '';
  openModal('modal-feedback');
}

async function submitFeedback() {
  const feedback = document.getElementById('fb-feedback').value.trim();
  const homework = document.getElementById('fb-homework').value.trim();
  if (!feedback) return showToast('⚠️ Escreva um breve resumo da aula');
  try {
    await api('PUT', `/api/lessons/${pendingFeedbackId}`, {
      status: 'done',
      feedback,
      homework
    });
    closeModal('modal-feedback');
    pendingFeedbackId = null;
    refreshTeacherAll();
    showToast('✅ Aula concluída com feedback salvo!');
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Mark lesson absent ────────────────────────────────────────
async function markAbsent(id) {
  try {
    await api('PUT', `/api/lessons/${id}`, { status: 'absent', feedback: 'Aluno não compareceu à aula.' });
    refreshTeacherAll();
    showToast('⚠️ Falta registrada para o aluno.');
  } catch(e) { showToast('❌ ' + e.message); }
}

