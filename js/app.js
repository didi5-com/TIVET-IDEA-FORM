import { db, storage } from './firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const DEFAULT_CONFIG = {
  theme: {
    primaryColor: '#2b6cb0',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif'
  },
  fields: [
    { name: 'full_name', label: 'Full Name', type: 'text', required: true, order: 1, enabled: true },
    { name: 'gender', label: 'Gender', type: 'radio', options: ['Male', 'Female'], required: true, order: 2, enabled: true },
    { name: 'organization', label: 'Organization', type: 'text', required: false, order: 3, enabled: true },
    { name: 'role', label: 'Roles (select all that apply)', type: 'checkbox-group', options: ['NPCU', 'Trainer', 'Student', 'Staff', 'Other'], required: false, order: 4, enabled: true },
    { name: 'signature_name', label: 'Signature (Type Your Full Name)', type: 'text', required: true, order: 5, enabled: true },
    { name: 'signature_date', label: 'Date', type: 'date', required: true, order: 6, enabled: true },
    { name: 'photo', label: 'Image Upload', type: 'file', accept: 'image/*', required: false, order: 7, enabled: true },
    { name: 'agreed', label: 'I have read and agree to the Code of Conduct', type: 'checkbox', required: true, order: 8, enabled: true }
  ]
};

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme?.primaryColor) root.style.setProperty('--primary-color', theme.primaryColor);
  if (theme?.fontFamily) root.style.setProperty('--font-family', theme.fontFamily);
}

async function loadConfig() {
  try {
    const cfgRef = doc(db, 'config', 'default');
    const snap = await getDoc(cfgRef);
    if (snap.exists()) {
      return snap.data();
    }
    // initialize if not present
    await setDoc(cfgRef, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  } catch (e) {
    console.warn('Failed to load config, using defaults', e);
    return DEFAULT_CONFIG;
  }
}

function renderForm(container, config) {
  const fields = [...(config?.fields || DEFAULT_CONFIG.fields)]
    .filter(f => f.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const form = document.createElement('form');
  form.className = 'form-grid';
  form.id = 'participant-form';

  fields.forEach(field => {
    const wrap = document.createElement('label');
    wrap.dataset.field = field.name;
    if (field.type !== 'checkbox') {
      const span = document.createElement('span');
      span.textContent = field.label || field.name;
      wrap.appendChild(span);
    }

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
    } else if (field.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      const cbLabel = document.createElement('span');
      cbLabel.textContent = field.label || field.name;
      wrap.appendChild(input);
      wrap.appendChild(cbLabel);
    } else if (field.type === 'radio') {
      // Radio group
      const group = document.createElement('div');
      (field.options || []).forEach((opt, idx) => {
        const id = `fld-${field.name}-${idx}`;
        const radioWrap = document.createElement('div');
        radioWrap.style.display = 'flex';
        radioWrap.style.alignItems = 'center';
        radioWrap.style.gap = '0.4rem';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = field.name; // same group name
        r.id = id;
        r.value = opt;
        if (field.required) r.required = true;
        const l = document.createElement('label');
        l.setAttribute('for', id);
        l.textContent = opt;
        radioWrap.appendChild(r);
        radioWrap.appendChild(l);
        group.appendChild(radioWrap);
      });
      wrap.appendChild(group);
      input = null; // handled as group
    } else if (field.type === 'checkbox-group') {
      const group = document.createElement('div');
      group.id = 'fld-' + field.name;
      (field.options || []).forEach((opt, idx) => {
        const id = `fld-${field.name}-${idx}`;
        const cbWrap = document.createElement('div');
        cbWrap.style.display = 'flex';
        cbWrap.style.alignItems = 'center';
        cbWrap.style.gap = '0.4rem';
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.id = id;
        c.value = opt;
        const l = document.createElement('label');
        l.setAttribute('for', id);
        l.textContent = opt;
        cbWrap.appendChild(c);
        cbWrap.appendChild(l);
        group.appendChild(cbWrap);
      });
      wrap.appendChild(group);
      input = null; // handled as group
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      if (field.accept) input.accept = field.accept;
    }

    if (input) {
      if (field.type !== 'checkbox') wrap.appendChild(input);
      input.name = field.name;
      input.id = 'fld-' + field.name;
      if (field.required) input.required = true;
    }
    form.appendChild(wrap);
  });

  const submit = document.createElement('button');
  submit.className = 'btn';
  submit.type = 'submit';
  submit.textContent = 'Submit';
  form.appendChild(submit);

  const status = document.createElement('p');
  status.id = 'form-status';
  container.innerHTML = '';
  container.appendChild(form);
  container.appendChild(status);

  form.addEventListener('submit', (e) => handleSubmit(e, fields));
}

async function handleSubmit(e, fields) {
  e.preventDefault();
  const form = e.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const status = document.getElementById('form-status');
  status.className = '';
  status.textContent = '';

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const data = {};
    let imageFile = null;

    for (const f of fields) {
      if (f.type === 'radio') {
        const checked = form.querySelector(`input[name="${f.name}"]:checked`);
        data[f.name] = checked ? checked.value : '';
        if (f.required && !data[f.name]) throw new Error('Please select an option for ' + (f.label || f.name));
        continue;
      }
      if (f.type === 'checkbox-group') {
        const group = form.querySelectorAll(`#fld-${f.name} input[type="checkbox"]:checked`);
        data[f.name] = Array.from(group).map(el => el.value);
        continue;
      }
      const el = form.querySelector(`#fld-${f.name}`);
      if (!el) continue;
      if (f.type === 'file') {
        imageFile = el.files && el.files[0] ? el.files[0] : null;
      } else if (f.type === 'checkbox') {
        data[f.name] = el.checked;
      } else {
        data[f.name] = el.value?.trim?.() ?? '';
      }
    }

    // Basic required acceptance check (if present)
    if (data.agreed === false) {
      throw new Error('You must accept the Code of Conduct to proceed.');
    }

    const submissionsCol = collection(db, 'submissions');
    const docRef = await addDoc(submissionsCol, {
      ...data,
      createdAt: serverTimestamp(),
      imagePath: null,
      imageURL: null
    });

    if (imageFile) {
      const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `submissions/${docRef.id}/${safeName}`);
      await uploadBytes(storageRef, imageFile);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'submissions', docRef.id), {
        imagePath: `submissions/${docRef.id}/${safeName}`,
        imageURL: url
      });
    }

    status.className = 'success-text';
    status.textContent = 'Submitted successfully. Thank you!';
    form.reset();
  } catch (err) {
    console.error(err);
    status.className = 'error-text';
    status.textContent = err?.message || 'Submission failed. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

// Boot
(async function init() {
  const config = await loadConfig();
  applyTheme(config?.theme);
  const container = document.getElementById('form-root');
  if (container) renderForm(container, config);
})();