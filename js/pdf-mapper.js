(() => {
  function onReady(fn) {
    if (window.supabaseClient) return fn();
    document.addEventListener('supabase:ready', fn, { once: true });
  }

  async function ensureAuth() {
    const { data } = await window.supabaseClient.auth.getUser();
    if (!data || !data.user) {
      window.location.href = 'admin-login.html';
      return false;
    }
    return true;
  }

  async function ensurePdfJs() {
    if (window.pdfjsLib) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.10.111/pdf.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load PDF.js'));
      document.head.appendChild(s);
    });
    // worker
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.10.111/pdf.worker.min.js';
  }

  let pdfDoc = null;
  let totalPages = 0;
  let currentPageIdx = 0; // zero-based

  async function renderPdf(pageIdx = 0) {
    await ensurePdfJs();
    const url = 'IDEAS-TVET%20GBV%20Code%20of%20Conduct.pdf';
    if (!pdfDoc) {
      pdfDoc = await window.pdfjsLib.getDocument(url).promise;
      totalPages = pdfDoc.numPages || 1;
      const controls = document.getElementById('page-controls');
      if (controls) controls.style.display = 'inline-flex';
    }
    currentPageIdx = Math.max(0, Math.min(pageIdx, (totalPages - 1)));
    const page = await pdfDoc.getPage(currentPageIdx + 1); // pdf.js is 1-based
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');
    // Set intrinsic size for crisp rendering
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const renderContext = { canvasContext: ctx, viewport };
    await page.render(renderContext).promise;
    // Resize drop layer to match canvas
    const layer = document.getElementById('drop-layer');
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = document.getElementById('canvas').getBoundingClientRect();
    layer.style.left = (canvasRect.left - containerRect.left) + 'px';
    layer.style.top = (canvasRect.top - containerRect.top) + 'px';
    layer.style.width = canvasRect.width + 'px';
    layer.style.height = canvasRect.height + 'px';
    // Update pager indicator
    const indicator = document.getElementById('page-indicator');
    if (indicator) indicator.textContent = `${currentPageIdx + 1} / ${totalPages}`;
    // Re-render labels for this page
    renderLabels();
    wireLabelDrag();
  }

  const supportedFields = [
    'full_name',
    'organization',
    'gender',
    'role',
    'signature_date',
    'signature_url' // image placement
  ];

  let labels = []; // { name, x, y, fontSize, type, w, h, page }

  function renderPalette() {
    const list = document.getElementById('field-list');
    list.innerHTML = '';
    supportedFields.forEach(name => {
      const div = document.createElement('div');
      div.className = 'field';
      div.draggable = true;
      div.textContent = name;
      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', name);
      });
      list.appendChild(div);
    });
  }

  function renderLabels() {
    const layer = document.getElementById('drop-layer');
    layer.innerHTML = '';
    labels.forEach((lab, idx) => {
      if (typeof lab.page === 'number' && lab.page !== currentPageIdx) return;
      const node = document.createElement('div');
      node.className = 'label';
      node.style.left = lab.x + 'px';
      node.style.top = lab.y + 'px';
      node.textContent = lab.name;
      node.setAttribute('data-idx', String(idx));
      layer.appendChild(node);
    });
  }

  function wireCanvas() {
    const layer = document.getElementById('drop-layer');
    const canvas = document.getElementById('canvas');
    layer.addEventListener('dragover', (e) => { e.preventDefault(); });
    layer.addEventListener('drop', (e) => {
      e.preventDefault();
      const name = e.dataTransfer.getData('text/plain');
      const rect = layer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lab = { name, x, y, fontSize: 12, type: name==='signature_url'?'image':'text', w: 120, h: 48, page: currentPageIdx };
      labels.push(lab);
      renderLabels();
      wireLabelDrag();
    });
  }

  function wireLabelDrag() {
    const nodes = document.querySelectorAll('.label');
    nodes.forEach(node => {
      let dragging = false;
      let startX = 0, startY = 0;
      node.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const idx = Number(node.getAttribute('data-idx'));
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        labels[idx].x += dx;
        labels[idx].y += dy;
        startX = e.clientX;
        startY = e.clientY;
        node.style.left = labels[idx].x + 'px';
        node.style.top = labels[idx].y + 'px';
      });
      document.addEventListener('mouseup', () => { dragging = false; });
    });
  }

  async function saveMapping() {
    const name = document.getElementById('mapping-name').value.trim() || 'Default Mapping';
    const pdfCanvas = document.getElementById('pdf-canvas');
    const rect = pdfCanvas.getBoundingClientRect();
    const payload = { name, mapping: { fields: labels, uiW: Math.round(rect.width), uiH: Math.round(rect.height) }, updated_at: new Date().toISOString() };
    const { error } = await window.supabaseClient
      .from('pdf_mappings')
      .upsert(payload, { onConflict: 'name' });
    if (error) {
      alert('Save failed: ' + (error.message || 'unknown error'));
      return;
    }
    alert('Mapping saved');
  }

  async function loadLatest() {
    const { data, error } = await window.supabaseClient
      .from('pdf_mappings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) {
      alert('Load failed: ' + (error.message || 'unknown error'));
      return;
    }
    if (data && data[0] && data[0].mapping && data[0].mapping.fields) {
      labels = data[0].mapping.fields;
      document.getElementById('mapping-name').value = data[0].name || '';
      renderLabels();
      wireLabelDrag();
    } else {
      alert('No mapping found');
    }
  }

  function wireToolbar() {
    document.getElementById('save-btn').addEventListener('click', saveMapping);
    document.getElementById('load-latest-btn').addEventListener('click', loadLatest);
    const prev = document.getElementById('prev-page');
    const next = document.getElementById('next-page');
    if (prev) prev.addEventListener('click', () => { if (currentPageIdx > 0) renderPdf(currentPageIdx - 1); });
    if (next) next.addEventListener('click', () => { if (currentPageIdx < totalPages - 1) renderPdf(currentPageIdx + 1); });
  }

  onReady(() => {
    (async () => {
      const ok = await ensureAuth();
      if (!ok) return;
      renderPalette();
      await renderPdf(0);
      wireCanvas();
      wireToolbar();
    })();
  });
})();