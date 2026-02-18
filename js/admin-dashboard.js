(function () {
  function onReady(fn) {
    if (window.supabaseClient) return fn();
    document.addEventListener('supabase:ready', fn, { once: true });
  }

  let rows = [];
  let editingId = null;

  async function ensureAuth() {
    const { data } = await window.supabaseClient.auth.getUser();
    if (!data || !data.user) {
      window.location.href = 'admin-login.html';
      return false;
    }
    return true;
  }

  function h(str) {
    return (str ?? '').toString().replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));
  }

  function render() {
    const tbody = document.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach((d) => {
      const tr = document.createElement('tr');
      const dateStr = d.created_at ? new Date(d.created_at).toLocaleDateString() : '';
      const isEditing = editingId === d.id;

      if (!isEditing) {
        tr.innerHTML = `
          <td><input type="checkbox" class="select-row" data-id="${h(d.id)}" /></td>
          <td>${h(d.full_name)}</td>
          <td>${h(d.organization)}</td>
          <td>${h(d.gender)}</td>
          <td>${h(d.role)}</td>
          <td>${d.agreed ? 'Yes' : 'No'}</td>
          <td>${d.image_url ? `<a href="${h(d.image_url)}" target="_blank">View</a>` : '—'}</td>
          <td>${d.signature_url ? `<a href="${h(d.signature_url)}" target="_blank">Signature</a>` : '—'}</td>
          <td>${h(d.signature_date || dateStr)}</td>
          <td>
            <button data-action="edit" data-id="${h(d.id)}">Edit</button>
            <button data-action="delete" data-id="${h(d.id)}" style="margin-left:6px;">Delete</button>
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td></td>
          <td><input type="text" value="${h(d.full_name)}" data-field="full_name" /></td>
          <td><input type="text" value="${h(d.organization || '')}" data-field="organization" /></td>
          <td>
            <select data-field="gender">
              <option value="">--</option>
              <option ${d.gender==='Male'?'selected':''}>Male</option>
              <option ${d.gender==='Female'?'selected':''}>Female</option>
            </select>
          </td>
          <td>
            <select data-field="role">
              ${['NPCU','Consultant','TSP Management','Instructor','Trainee','Contractor','Site Worker','Others'].map(r=>`<option ${d.role===r?'selected':''}>${r}</option>`).join('')}
            </select>
          </td>
          <td><input type="checkbox" data-field="agreed" ${d.agreed?'checked':''} /></td>
          <td>${d.image_url ? `<a href="${h(d.image_url)}" target="_blank">View</a>` : '—'}</td>
          <td>${d.signature_url ? `<a href="${h(d.signature_url)}" target="_blank">Signature</a>` : '—'}</td>
          <td><input type="date" value="${d.signature_date || ''}" data-field="signature_date" /></td>
          <td>
            <button data-action="save" data-id="${h(d.id)}">Save</button>
            <button data-action="cancel" data-id="${h(d.id)}">Cancel</button>
          </td>
        `;
      }
      tbody.appendChild(tr);
    });
  }

  async function loadData() {
    try {
      const { data, error } = await window.supabaseClient
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        return;
      }
      rows = data || [];
      render();
    } catch (e) {
      console.error(e);
    }
  }

  async function saveEdit(id, tr) {
    try {
      const get = (sel) => tr.querySelector(sel);
      const payload = {
        full_name: get('input[data-field="full_name"]').value.trim(),
        organization: get('input[data-field="organization"]').value.trim(),
        gender: get('select[data-field="gender"]').value,
        role: get('select[data-field="role"]').value,
        agreed: get('input[data-field="agreed"]').checked,
        signature_date: get('input[data-field="signature_date"]').value || null,
      };
      const { error } = await window.supabaseClient
        .from('submissions')
        .update(payload)
        .eq('id', id);
      if (error) {
        alert('Update failed: ' + (error.message || 'unknown error'));
        return;
      }
      // Update local cache
      const idx = rows.findIndex(r => r.id === id);
      if (idx !== -1) rows[idx] = { ...rows[idx], ...payload };
      editingId = null;
      render();
    } catch (e) {
      alert('Unexpected error during update');
      console.error(e);
    }
  }

  function getSelectedRows() {
    return Array.from(document.querySelectorAll('.select-row:checked')).map(cb => cb.getAttribute('data-id'));
  }

  function pickRows(ids) {
    if (!ids || ids.length === 0) return rows;
    const set = new Set(ids);
    return rows.filter(r => set.has(r.id));
  }

  function exportSelectedCSV() {
    const ids = getSelectedRows();
    const list = pickRows(ids);
    let csv = 'Name,Organization,Gender,Role,Agreed,Image,Signature,Date\n';
    list.forEach(d => {
      csv += `${q(d.full_name)},${q(d.organization)},${q(d.gender)},${q(d.role)},${d.agreed?'Yes':'No'},${q(d.image_url)},${q(d.signature_url)},${q(d.signature_date || d.created_at)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, 'submissions.csv');
  }

  function q(val){
    const s = (val ?? '').toString();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  }

  function exportSelectedHTML() {
    const ids = getSelectedRows();
    const list = pickRows(ids);
    const rowsHtml = list.map(d => `
      <section style="margin-bottom:16px;">
        <h3>${h(d.full_name)}</h3>
        <p><strong>Organization:</strong> ${h(d.organization)}</p>
        <p><strong>Gender:</strong> ${h(d.gender)} | <strong>Role:</strong> ${h(d.role)} | <strong>Agreed:</strong> ${d.agreed?'Yes':'No'}</p>
        <p><strong>Date:</strong> ${h(d.signature_date || (d.created_at ? new Date(d.created_at).toLocaleString() : ''))}</p>
        <p><strong>Photo:</strong> ${d.image_url ? `<a href="${h(d.image_url)}">View</a>` : '—'}</p>
        <p><strong>Signature:</strong> ${d.signature_url ? `<a href="${h(d.signature_url)}">View</a>` : '—'}</p>
      </section>
    `).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Submissions Export</title></head><body>${rowsHtml}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, 'submissions.html');
  }

  async function exportSelectedDOCX() {
    try {
      const ensureDocx = () => new Promise((resolve, reject) => {
        if (window.docx) return resolve();
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/docx@8.5.0/build/index.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load DOCX library'));
        document.head.appendChild(s);
      });
      await ensureDocx();
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = window.docx;
      const ids = getSelectedRows();
      const list = pickRows(ids);
      const children = [];
      list.forEach(d => {
        children.push(new Paragraph({ text: d.full_name || '', heading: HeadingLevel.HEADING_2 }));
        children.push(new Paragraph(`Organization: ${d.organization || ''}`));
        children.push(new Paragraph(`Gender: ${d.gender || ''}`));
        children.push(new Paragraph(`Role: ${d.role || ''}`));
        children.push(new Paragraph(`Agreed: ${d.agreed ? 'Yes' : 'No'}`));
        children.push(new Paragraph(`Date: ${d.signature_date || (d.created_at ? new Date(d.created_at).toLocaleString() : '')}`));
        if (d.image_url) children.push(new Paragraph(`Photo: ${d.image_url}`));
        if (d.signature_url) children.push(new Paragraph(`Signature: ${d.signature_url}`));
        children.push(new Paragraph(''));
      });
      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, 'submissions.docx');
    } catch (e) {
      alert('DOCX export failed: ' + (e.message || 'unknown error'));
      console.error(e);
    }
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  async function ensurePdfLib() {
    if (window.PDFLib) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load pdf-lib'));
      document.head.appendChild(s);
    });
  }

  async function ensureJSZip() {
    if (window.JSZip) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(s);
    });
  }

  async function getLatestMapping() {
    const { data, error } = await window.supabaseClient
      .from('pdf_mappings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data && data[0]) ? data[0] : null;
  }

  async function loadTemplateArrayBuffer() {
    const res = await fetch('./IDEAS-TVET%20GBV%20Code%20of%20Conduct.pdf');
    if (!res.ok) throw new Error('Failed to load template PDF');
    return await res.arrayBuffer();
  }

  async function fillPdfClientSide(submission, mapping) {
    await ensurePdfLib();
    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    const templateBytes = await loadTemplateArrayBuffer();
    const pdfDoc = await PDFDocument.load(templateBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const map = mapping?.mapping || mapping; // support raw mapping
    const fields = map?.fields || [];
    for (const f of fields) {
      const pageIdx = (typeof f.page === 'number' && f.page >= 0 && f.page < pages.length) ? f.page : 0;
      const page = pages[pageIdx];
      const pageW = page.getWidth();
      const pageH = page.getHeight();
      const uiW = map.uiW || pageW;
      const uiH = map.uiH || pageH;
      const scaleX = pageW / uiW;
      const scaleY = pageH / uiH;
      const val = submission[f.name] ?? '';
      if (f.type === 'image' && f.name === 'signature_url' && submission.signature_url) {
        try {
          const sigRes = await fetch(submission.signature_url);
          const sigBytes = await sigRes.arrayBuffer();
          let img;
          // try png first
          try { img = await pdfDoc.embedPng(sigBytes); } catch (_) { img = await pdfDoc.embedJpg(sigBytes); }
          const xPt = (f.x ?? 0) * scaleX;
          const wPt = (f.w || 120) * scaleX;
          const hPt = (f.h || 48) * scaleY;
          const yPtTop = (f.y ?? 0) * scaleY;
          const yPt = pageH - yPtTop - hPt;
          page.drawImage(img, { x: xPt, y: yPt, width: wPt, height: hPt });
        } catch (e) {
          console.warn('Failed to embed signature image', e);
        }
      } else if (typeof val === 'string' || typeof val === 'number') {
        const size = f.fontSize || 12;
        const xPt = (f.x ?? 0) * scaleX;
        const yPtTop = (f.y ?? 0) * scaleY;
        const yPt = pageH - yPtTop - size;
        page.drawText(String(val), { x: xPt, y: yPt, size, font, color: rgb(0, 0, 0) });
      }
    }

    const out = await pdfDoc.save();
    return new Blob([out], { type: 'application/pdf' });
  }

  async function exportSelectedPDF() {
    const ids = getSelectedRows();
    const list = pickRows(ids);
    if (list.length === 0) {
      alert('Select at least one row');
      return;
    }
    const submission = list[0];
    try {
      // Try Edge Function first
      const mapping = await getLatestMapping();
      const body = {
        mode: 'single',
        submissions: [submission],
        mapping: mapping?.mapping || mapping,
        templateUrl: window.location.origin + '/IDEAS-TVET%20GBV%20Code%20of%20Conduct.pdf'
      };
      const { data, error } = await window.supabaseClient.functions.invoke('pdf-export', {
        body,
        headers: { Accept: 'application/octet-stream' },
        responseType: 'arraybuffer'
      });
      if (error) throw error;
      if (data) {
        const blob = new Blob([data], { type: 'application/pdf' });
        downloadBlob(blob, `${submission.full_name || 'submission'}.pdf`);
        return;
      }
      // If no data, fall back
      throw new Error('No binary returned from function');
    } catch (e) {
      console.warn('Edge Function failed or unavailable, falling back to client-side PDF', e);
      try {
        const mapping = await getLatestMapping();
        const blob = await fillPdfClientSide(submission, mapping);
        downloadBlob(blob, `${submission.full_name || 'submission'}.pdf`);
      } catch (e2) {
        alert('PDF export failed: ' + (e2.message || 'unknown error'));
        console.error(e2);
      }
    }
  }

  async function exportSelectedZIP() {
    const ids = getSelectedRows();
    const list = pickRows(ids);
    if (list.length === 0) {
      alert('Select at least one row');
      return;
    }
    try {
      // Try Edge Function bulk
      const mapping = await getLatestMapping();
      const body = {
        mode: 'bulk',
        submissions: list,
        mapping: mapping?.mapping || mapping,
        templateUrl: window.location.origin + '/IDEAS-TVET%20GBV%20Code%20of%20Conduct.pdf'
      };
      const { data, error } = await window.supabaseClient.functions.invoke('pdf-export', {
        body,
        headers: { Accept: 'application/octet-stream' },
        responseType: 'arraybuffer'
      });
      if (error) throw error;
      if (data) {
        const blob = new Blob([data], { type: 'application/zip' });
        downloadBlob(blob, `submissions.zip`);
        return;
      }
      throw new Error('No binary returned from function');
    } catch (e) {
      console.warn('Edge Function failed or unavailable, zipping client-side', e);
      try {
        await ensureJSZip();
        const mapping = await getLatestMapping();
        const zip = new window.JSZip();
        for (const sub of list) {
          const blob = await fillPdfClientSide(sub, mapping);
          const ab = await blob.arrayBuffer();
          const name = `${(sub.full_name || 'submission').replace(/[^a-z0-9_\-]+/gi,'_')}.pdf`;
          zip.file(name, ab);
        }
        const out = await zip.generateAsync({ type: 'blob' });
        downloadBlob(out, 'submissions.zip');
      } catch (e2) {
        alert('ZIP export failed: ' + (e2.message || 'unknown error'));
        console.error(e2);
      }
    }
  }

  function wireEvents() {
    const table = document.getElementById('table');
    const selectAll = document.getElementById('select-all');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        document.querySelectorAll('.select-row').forEach(cb => { cb.checked = selectAll.checked; });
      });
    }
    if (!table) return;
    table.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.matches('button[data-action="edit"]')) {
        editingId = t.getAttribute('data-id');
        render();
      } else if (t.matches('button[data-action="cancel"]')) {
        editingId = null;
        render();
      } else if (t.matches('button[data-action="save"]')) {
        const id = t.getAttribute('data-id');
        await saveEdit(id, t.closest('tr'));
      } else if (t.matches('button[data-action="delete"]')) {
        const id = t.getAttribute('data-id');
        await deleteSubmission(id);
      }
    });
  }

  async function deleteSubmission(id) {
    if (!confirm('Delete this submission? This cannot be undone.')) return;
    try {
      const { error } = await window.supabaseClient
        .from('submissions')
        .delete()
        .eq('id', id);
      if (error) {
        alert('Delete failed: ' + (error.message || 'unknown error'));
        return;
      }
      rows = rows.filter(r => r.id !== id);
      render();
    } catch (e) {
      alert('Unexpected error during delete');
      console.error(e);
    }
  }

  async function logout() {
    try {
      await window.supabaseClient.auth.signOut();
    } finally {
      window.location.href = 'admin-login.html';
    }
  }

  // Expose functions for inline onclick handlers
  window.exportSelectedCSV = exportSelectedCSV;
  window.exportSelectedHTML = exportSelectedHTML;
  window.exportSelectedDOCX = exportSelectedDOCX;
  window.exportSelectedPDF = exportSelectedPDF;
  window.exportSelectedZIP = exportSelectedZIP;
  window.deleteSubmission = deleteSubmission;
  // Backward-compatible aliases in case HTML calls old names
  window.exportCSV = exportSelectedCSV;
  window.exportHTML = exportSelectedHTML;
  window.exportDOCX = exportSelectedDOCX;
  window.reloadData = loadData;
  window.logout = logout;

  onReady(async () => {
    const ok = await ensureAuth();
    if (!ok) return;
    wireEvents();
    loadData();
  });
})();