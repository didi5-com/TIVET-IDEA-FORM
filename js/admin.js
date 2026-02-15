import { db, storage } from './firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const ADMIN_PASSWORD = 'Didi5566'; // Simple client-side gate as requested

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const gate = document.getElementById('gate');
const adminUI = document.getElementById('admin-ui');
const submissionsSection = document.getElementById('submissions');
const gateForm = document.getElementById('admin-gate-form');
const gateError = document.getElementById('gate-error');

gateForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const pass = /** @type {HTMLInputElement} */(document.getElementById('admin-pass')).value;
  if (pass === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_unlocked', '1');
    unlock();
  } else {
    gateError.textContent = 'Incorrect password';
  }
});

function unlock() {
  gate?.classList.add('hidden');
  adminUI?.classList.remove('hidden');
  submissionsSection?.classList.remove('hidden');
  bootAdmin();
}

if (sessionStorage.getItem('admin_unlocked') === '1') {
  unlock();
}

async function loadConfig() {
  const cfgRef = doc(db, 'config', 'default');
  const snap = await getDoc(cfgRef);
  if (snap.exists()) return snap.data();
  const defaultCfg = {
    theme: {
      primaryColor: '#2b6cb0',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif'
    },
    fields: [
      { name: 'fullName', label: 'Full Name', type: 'text', required: true, order: 1, enabled: true },
      { name: 'email', label: 'Email', type: 'email', required: true, order: 2, enabled: true },
      { name: 'phone', label: 'Phone', type: 'tel', required: false, order: 3, enabled: true },
      { name: 'message', label: 'Message', type: 'textarea', required: false, order: 4, enabled: true },
      { name: 'photo', label: 'Image Upload', type: 'file', accept: 'image/*', required: false, order: 5, enabled: true },
      { name: 'accept', label: 'I have read and accept the Code of Conduct', type: 'checkbox', required: true, order: 6, enabled: true }
    ]
  };
  await setDoc(cfgRef, defaultCfg);
  return defaultCfg;
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme?.primaryColor) root.style.setProperty('--primary-color', theme.primaryColor);
  if (theme?.fontFamily) root.style.setProperty('--font-family', theme.fontFamily);
}

function fillThemeForm(theme) {
  /** @type {HTMLInputElement} */(document.getElementById('input-primary-color')).value = theme?.primaryColor || '#2b6cb0';
  /** @type {HTMLSelectElement} */(document.getElementById('input-font-family')).value = theme?.fontFamily || "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif";
}

function renderFieldsEditor(fields) {
  const editor = document.getElementById('fields-editor');
  editor.innerHTML = '';
  const sorted = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const f of sorted) {
    const row = document.createElement('div');
    row.className = 'field-row';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = f.label || f.name;
    labelInput.dataset.name = f.name;

    const orderInput = document.createElement('input');
    orderInput.type = 'number';
    orderInput.min = '0';
    orderInput.value = String(f.order || 0);
    orderInput.dataset.name = f.name;

    const enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = f.enabled !== false;
    enabledInput.dataset.name = f.name;

    const requiredInput = document.createElement('input');
    requiredInput.type = 'checkbox';
    requiredInput.checked = !!f.required;
    requiredInput.dataset.name = f.name;

    row.appendChild(labelInput);
    row.appendChild(orderInput);
    row.appendChild(enabledInput);
    row.appendChild(requiredInput);

    editor.appendChild(row);
  }
}

function collectFieldsFromEditor(origFields) {
  const editor = document.getElementById('fields-editor');
  const rows = Array.from(editor.querySelectorAll('.field-row'));
  const updated = [];
  for (const row of rows) {
    const [labelInput, orderInput, enabledInput, requiredInput] = row.querySelectorAll('input');
    const name = labelInput.dataset.name;
    const orig = origFields.find(f => f.name === name) || { name };
    updated.push({
      ...orig,
      label: labelInput.value || orig.label || name,
      order: Number(orderInput.value) || 0,
      enabled: enabledInput.checked,
      required: requiredInput.checked
    });
  }
  return updated;
}

async function saveTheme(theme) {
  const cfgRef = doc(db, 'config', 'default');
  await updateDoc(cfgRef, { theme });
}

async function saveFields(fields) {
  const cfgRef = doc(db, 'config', 'default');
  await updateDoc(cfgRef, { fields });
}

async function loadSubmissions() {
  const tbody = document.getElementById('subs-tbody');
  tbody.innerHTML = '';
  const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    const d = docSnap.data();
    const tr = document.createElement('tr');
    const created = d.createdAt?.toDate ? d.createdAt.toDate() : null;
    const dt = created ? created.toISOString() : '';
    const imgCell = document.createElement('td');

    if (d.imageURL) {
      const a = document.createElement('a');
      a.href = d.imageURL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'View Image';
      imgCell.appendChild(a);
    } else if (d.imagePath) {
      // Try to resolve a download URL if only the path is saved
      const r = ref(storage, d.imagePath);
      getDownloadURL(r).then(url => {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'View Image';
        imgCell.appendChild(a);
      }).catch(() => { imgCell.textContent = '—'; });
    } else {
      imgCell.textContent = '—';
    }

    tr.innerHTML = `
      <td>${dt}</td>
      <td>${(d.fullName || '').toString()}</td>
      <td>${(d.email || '').toString()}</td>
      <td>${(d.phone || '').toString()}</td>
      <td>${(d.message || '').toString()}</td>
    `;
    tr.appendChild(imgCell);
    tbody.appendChild(tr);
  });
}

function exportCSV(rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    if (/[",\n]/.test(s)) return `"${s}"`;
    return s;
  };
  const csv = [headers.join(',')]
    .concat(rows.map(r => headers.map(h => escape(r[h])).join(',')))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `submissions_${new Date().toISOString().slice(0,19)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function gatherSubmissionsForCSV() {
  const qy = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(qy);
  const out = [];
  snap.forEach(s => {
    const d = s.data();
    const created = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : '';
    out.push({
      id: s.id,
      createdAt: created,
      fullName: d.fullName || '',
      email: d.email || '',
      phone: d.phone || '',
      message: d.message || '',
      imageURL: d.imageURL || '',
      imagePath: d.imagePath || ''
    });
  });
  return out;
}

async function bootAdmin() {
  const cfg = await loadConfig();
  applyTheme(cfg?.theme);
  fillThemeForm(cfg?.theme || {});
  renderFieldsEditor(cfg?.fields || []);

  document.getElementById('theme-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const primaryColor = /** @type {HTMLInputElement} */(document.getElementById('input-primary-color')).value || '#2b6cb0';
    const fontFamily = /** @type {HTMLSelectElement} */(document.getElementById('input-font-family')).value;
    const theme = { primaryColor, fontFamily };
    await saveTheme(theme);
    applyTheme(theme);
  });

  document.getElementById('fields-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updated = collectFieldsFromEditor(cfg.fields || []);
    await saveFields(updated);
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => loadSubmissions());
  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    const rows = await gatherSubmissionsForCSV();
    exportCSV(rows);
  });

  await loadSubmissions();
}