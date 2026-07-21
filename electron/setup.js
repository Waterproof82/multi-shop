// setup.js — corre en el renderer de setup.html como script clásico de navegador.
// Usa window.electronAPI expuesto por contextBridge (preload.ts). NO usar require().

const domainInput    = document.getElementById('domain');
const emailInput     = document.getElementById('email');
const passwordInput  = document.getElementById('password');
const printerSelect  = document.getElementById('printer');
const saveBtn        = document.getElementById('save');
const errorEl        = document.getElementById('error');
const successBanner  = document.getElementById('success-banner');

function updateSaveBtn() {
  const ok =
    domainInput.value.trim() &&
    emailInput.value.trim() &&
    passwordInput.value.trim() &&
    printerSelect.value;
  saveBtn.disabled = !ok;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  successBanner.style.display = 'none';
}

function hideError() {
  errorEl.style.display = 'none';
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
emailInput.addEventListener('input', updateSaveBtn);
passwordInput.addEventListener('input', updateSaveBtn);
printerSelect.addEventListener('change', updateSaveBtn);

saveBtn.addEventListener('click', async () => {
  const domain = domainInput.value.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const email      = emailInput.value.trim();
  const password   = passwordInput.value;
  const printerName = printerSelect.value;

  if (!domain || !email || !password || !printerName) return;

  saveBtn.disabled = true;
  saveBtn.textContent = 'Verificando…';
  hideError();

  try {
    const res = await fetch(`https://${domain}/api/tpv/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error ?? 'Credenciales inválidas. Revisá el dominio y la contraseña.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Verificar y acceder';
      return;
    }

    if (data.empresa) {
      successBanner.textContent = `✓ Empresa verificada: ${data.empresa}`;
      successBanner.style.display = 'block';
    }

    await window.electronAPI.saveConfig({ domain, printerName });

  } catch {
    showError('No se pudo conectar con el servidor. Revisá el dominio e intentá de nuevo.');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Verificar y acceder';
  }
});
