// setup.js — corre en el renderer de setup.html como script clásico de navegador.
// Usa window.electronAPI expuesto por contextBridge (preload.ts). NO usar require().

const domainInput = document.getElementById('domain');
const printerSelect = document.getElementById('printer');
const saveBtn = document.getElementById('save');
const errorEl = document.getElementById('error');

function updateSaveBtn() {
  saveBtn.disabled = !domainInput.value.trim() || !printerSelect.value;
}

// Cargar lista de impresoras
window.electronAPI.getPrinters().then((printers) => {
  if (printers.length === 0) {
    printerSelect.innerHTML = '<option value="">Sin impresoras detectadas</option>';
  } else {
    printerSelect.innerHTML = printers
      .map((p) => `<option value="${p}">${p}</option>`)
      .join('');
    updateSaveBtn();
  }
}).catch(() => {
  printerSelect.innerHTML = '<option value="">Error al cargar impresoras</option>';
});

domainInput.addEventListener('input', updateSaveBtn);
printerSelect.addEventListener('change', updateSaveBtn);

saveBtn.addEventListener('click', () => {
  const domain = domainInput.value.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const printerName = printerSelect.value;

  if (!domain || !printerName) return;

  saveBtn.disabled = true;
  errorEl.style.display = 'none';

  window.electronAPI.saveConfig({ domain, printerName }).catch((err) => {
    errorEl.textContent = (err && err.message) ? err.message : 'Error al guardar la configuración';
    errorEl.style.display = 'block';
    saveBtn.disabled = false;
  });
});
