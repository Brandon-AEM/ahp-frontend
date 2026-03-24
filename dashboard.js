// script for dashboard interactions
// --- PARCHE MAESTRO PARA ENVIAR EL PASE AL SERVIDOR ---
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  options.credentials = 'include';
  options.headers = options.headers || {};
  const token = localStorage.getItem('token');
  if (token && token !== 'undefined') {
    options.headers['Authorization'] = 'Bearer ' + token;
  }
  return originalFetch(url, options);
};
// ------------------------------------------------------
let selectedVacante = null;
let selectedCandidate = null;
let areasEspecialidad = [];

function toggleMenu() {
  const menu = document.getElementById('menu');
  menu.classList.toggle('show');
}

function closeMenu() {
  const menu = document.getElementById('menu');
  menu.classList.remove('show');
}

async function loadVacantes() {
  const search = document.getElementById('searchInput').value;
  try {
    const res = await fetch('https://ahp-proyecto.onrender.com/api/vacantes?search=' + encodeURIComponent(search));
    const vacantes = await res.json();
    renderVacantes(vacantes);
  } catch (err) {
    console.error(err);
    alert('Error loading vacancies');
  }
}

function renderVacantes(vacantes) {
  const container = document.getElementById('vacantes');
  container.innerHTML = '';
  vacantes.forEach(v => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${v.titulo}</h3>
      <p>${v.area || ''}</p>
      <button onclick="selectVacante(${v.id})">Seleccionar</button>
    `;
    container.appendChild(card);
  });
}

async function selectVacante(id) {
  selectedVacante = id;
  await loadCandidatos(id);
}

async function loadCandidatos(vacanteId, status = '') {
  try {
    let url = `https://ahp-proyecto.onrender.com/api/vacantes/${vacanteId}/candidatos`;
    if (status) url += '?status=' + status;
    const res = await fetch(url);
    const candidatos = await res.json();

    if (!res.ok) {
      throw new Error(candidatos.error || 'No se pudieron cargar candidatos');
    }

    if (!Array.isArray(candidatos)) {
      throw new Error('Respuesta inválida al cargar candidatos');
    }

    if (candidatos.length === 0) {
      renderEmptyCandidatesState();
      return;
    }

    renderCandidatos(candidatos);
  } catch (err) {
    console.error(err);
    showInfoModal(
      'No fue posible cargar candidatos',
      'Ocurrió un problema del sistema al consultar candidatos. Intenta nuevamente en unos segundos.'
    );
    loadVacantes();
  }
}

function renderCandidatos(candidates) {
  const container = document.getElementById('vacantes');
  container.innerHTML = '';
  candidates.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="avatar"></div>
      <h3>${c.nombre}</h3>
      <button onclick="openCandidateModal(${c.postulacion_id})">Ver</button>
    `;
    container.appendChild(card);
  });
}

function renderEmptyCandidatesState() {
  const container = document.getElementById('vacantes');
  container.innerHTML = `
    <div class="empty-candidates-state">
      <h3>Aún no hay candidatos para esta vacante</h3>
      <p>Cuando lleguen postulaciones aparecerán aquí.</p>
      <button class="submit-btn" onclick="loadVacantes()">Volver a vacantes</button>
    </div>
  `;
}

async function openCandidateModal(postulacionId) {
  try {
    // fetch postulacion detail list? we already have minimal
    // The server query earlier returned enough info; maybe store in global map
    // but for simplicity we'll request postulacion list and then find by id
    const vacId = selectedVacante;
    const res = await fetch(`https://ahp-proyecto.onrender.com/api/vacantes/${vacId}/candidatos`);
    const arr = await res.json();
    const rec = arr.find(r => r.postulacion_id === postulacionId);
    if (!rec) return;
    selectedCandidate = rec;
    // fill modal
    document.getElementById('cvName').innerText = rec.nombre;
    document.getElementById('cvCorreo').innerText = rec.correo;
    document.getElementById('cvTelefono').innerText = 'Teléfono: ' + (rec.telefono || '--');
    document.getElementById('cvArea').innerText = 'Área: ' + (rec.area_especialidad || '--');
    document.getElementById('cvExperiencia').innerText = 'Experiencia: ' + (rec.experiencia_anos || 0) + ' años';
    // photo
    const photoDiv = document.querySelector('.cv-photo');
    if (rec.photo_path) {
      photoDiv.style.backgroundImage = `url(${rec.photo_path})`;
      photoDiv.style.backgroundSize = 'cover';
      photoDiv.style.backgroundPosition = 'center';
    } else {
      photoDiv.style.backgroundImage = "url('stockuserphoto.png')";
      photoDiv.style.backgroundSize = 'cover';
      photoDiv.style.backgroundPosition = 'center';
    }
    // interview input preset
    const iv = document.getElementById('interviewInput');
    iv.value = rec.interview_at ? rec.interview_at.replace(' ', 'T') : '';
    // compute "ya pasó"
    const passedEl = document.getElementById('cvPassed');
    if (rec.interview_at) {
      const dt = new Date(rec.interview_at);
      passedEl.innerText = dt < new Date() ? 'La entrevista ya pasó' : '';
    } else {
      passedEl.innerText = '';
    }
    document.getElementById('cvModal').classList.add('show-modal');
  } catch (err) {
    console.error(err);
  }
}

function closeModal() {
  document.getElementById('cvModal').classList.remove('show-modal');
}

async function updateStatus(status) {
  if (!selectedCandidate) return;
  try {
    await fetch(`https://ahp-proyecto.onrender.com/api/postulaciones/${selectedCandidate.postulacion_id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    closeModal();
    if (selectedVacante) loadCandidatos(selectedVacante);
  } catch (err) {
    console.error(err);
  }
}

async function saveInterview() {
  if (!selectedCandidate) return;
  const iv = document.getElementById('interviewInput').value;
  if (!iv) {
    showInfoModal('Fecha requerida', 'Selecciona una fecha y hora para guardar la entrevista.');
    return;
  }

  try {
    const res = await fetch(`https://ahp-proyecto.onrender.com/api/postulaciones/${selectedCandidate.postulacion_id}/interview`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interview_at: iv || null })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo guardar la entrevista');
    }

    closeModal();
    const when = new Date(iv);
    const prettyDate = Number.isNaN(when.getTime())
      ? iv
      : when.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    showInfoModal('Entrevista agendada', `La entrevista quedó agendada para ${prettyDate}.`);
    if (selectedVacante) loadCandidatos(selectedVacante);
  } catch (err) {
    console.error(err);
    showInfoModal('No se pudo agendar', err.message || 'Intenta nuevamente.');
  }
}

// pendientes view
async function openPendientes() {
  try {
    const res = await fetch('https://ahp-proyecto.onrender.com/api/postulaciones/pending');
    const list = await res.json();
    const container = document.getElementById('pendientesList');
    container.innerHTML = '';
    list.forEach(item => {
      const div = document.createElement('div');
      div.className = 'pending-item';
      div.innerHTML = `
        <strong>${item.candidato_nombre}</strong> para <em>${item.vacante_titulo}</em>
        <div>
          <button onclick="updateStatusFromList(${item.id}, 'ACEPTADO')">Aceptar</button>
          <button onclick="updateStatusFromList(${item.id}, 'RECHAZADO')">Rechazar</button>
        </div>
      `;
      container.appendChild(div);
    });
    document.getElementById('pendientesModal').classList.add('show-modal');
  } catch (err) {
    console.error(err);
  }
}

function closePendientes() {
  document.getElementById('pendientesModal').classList.remove('show-modal');
}

async function openEntrevistasPendientes() {
  try {
    const res = await fetch('https://ahp-proyecto.onrender.com/api/postulaciones/interviews-pending');
    const text = await res.text();
    let list;
    try {
      list = text ? JSON.parse(text) : [];
    } catch {
      list = [];
    }

    if (res.status === 401) {
      showInfoModal('Sesion expirada', 'Tu sesión expiró. Inicia sesión nuevamente.');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 900);
      return;
    }

    if (!res.ok) {
      throw new Error((list && list.error) || 'No se pudieron cargar entrevistas');
    }

    if (!Array.isArray(list)) {
      throw new Error('Respuesta inválida al cargar entrevistas');
    }

    const container = document.getElementById('entrevistasList');
    container.innerHTML = '';

    if (!list.length) {
      container.innerHTML = '<div class="pending-item">No hay entrevistas pendientes por ahora.</div>';
    } else {
      list.forEach(item => {
        const interviewDate = item.interview_at
          ? new Date(item.interview_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
          : 'Sin fecha';

        const div = document.createElement('div');
        div.className = 'pending-item';
        div.innerHTML = `
          <strong>${item.candidato_nombre}</strong> para <em>${item.vacante_titulo}</em>
          <div style="margin-top:6px;">Fecha: ${interviewDate}</div>
        `;
        container.appendChild(div);
      });
    }

    closeMenu();
    document.getElementById('entrevistasModal').classList.add('show-modal');
  } catch (err) {
    console.error(err);
    showInfoModal('No fue posible cargar entrevistas', err.message || 'Intenta nuevamente.');
  }
}

function closeEntrevistasPendientes() {
  document.getElementById('entrevistasModal').classList.remove('show-modal');
}

function clearVacantesView() {
  const searchInput = document.getElementById('searchInput');
  searchInput.value = '';
  selectedVacante = null;
  loadVacantes();
}

async function updateStatusFromList(id, status) {
  try {
    await fetch(`https://ahp-proyecto.onrender.com/api/postulaciones/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    openPendientes();
  } catch (err) {
    console.error(err);
  }
}

function logout() {
  fetch('https://ahp-proyecto.onrender.com/api/auth/logout', { method: 'POST' }).finally(() => {
    window.location.href = 'login.html';
  });
}

async function loadAreasEspecialidad() {
  try {
    const res = await fetch('https://ahp-proyecto.onrender.com/api/vacantes/areas-especialidad');
    const list = await res.json();
    if (!res.ok) {
      throw new Error(list.error || 'No se pudieron cargar las areas');
    }
    areasEspecialidad = Array.isArray(list) ? list : [];
    renderAreaOptions();
  } catch (err) {
    console.error(err);
    const select = document.getElementById('vacanteAreaSelect');
    if (select) {
      select.innerHTML = '<option value="">No se pudieron cargar áreas</option>';
    }
  }
}

function renderAreaOptions() {
  const select = document.getElementById('vacanteAreaSelect');
  if (!select) return;

  select.innerHTML = '<option value="">Selecciona un area</option>';

  // --- INICIO DE CÓDIGO NUEVO (Salvavidas si la BD está vacía) ---
  if (areasEspecialidad.length === 0) {
    areasEspecialidad = [
      { nombre: 'Sistemas y Tecnología' },
      { nombre: 'Recursos Humanos' },
      { nombre: 'Ventas y Marketing' },
      { nombre: 'Administración y Finanzas' }
    ];
  }
  // --- FIN DE CÓDIGO NUEVO ---

  areasEspecialidad.forEach((area) => {
    const option = document.createElement('option');
    option.value = area.nombre;
    option.textContent = area.nombre;
    select.appendChild(option);
  });
}

function createVacante() {
  document.getElementById('vacanteTituloInput').value = '';
  renderAreaOptions();
  document.getElementById('createVacanteModal').classList.add('show-modal');
}

function closeCreateVacanteModal() {
  document.getElementById('createVacanteModal').classList.remove('show-modal');
}

function showInfoModal(title, message) {
  document.getElementById('infoModalTitle').innerText = title || 'Información';
  document.getElementById('infoModalMessage').innerText = message || '';
  document.getElementById('infoModal').classList.add('show-modal');
}

function closeInfoModal() {
  document.getElementById('infoModal').classList.remove('show-modal');
}

async function submitCreateVacante() {
  const titulo = document.getElementById('vacanteTituloInput').value.trim();
  const area = document.getElementById('vacanteAreaSelect').value;

  if (!titulo) {
    alert('El título de la vacante es obligatorio');
    return;
  }

  if (!area) {
    alert('Selecciona un área de especialidad');
    return;
  }

  try {
    const res = await fetch('https://ahp-proyecto.onrender.com/api/vacantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, area })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo crear la vacante');
    }
    closeCreateVacanteModal();
    loadVacantes();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Error al crear vacante');
  }
}

// initial load
loadAreasEspecialidad();
loadVacantes();

// close modals when clicking outside
window.onclick = function(e) {
  const menu = document.getElementById('menu');
  const profile = document.querySelector('.profile');
  const cv = document.getElementById('cvModal');
  const pend = document.getElementById('pendientesModal');
  const entrevistas = document.getElementById('entrevistasModal');
  const createVac = document.getElementById('createVacanteModal');
  const info = document.getElementById('infoModal');

  if (menu && profile && !profile.contains(e.target)) {
    closeMenu();
  }

  if (e.target === cv) closeModal();
  if (e.target === pend) closePendientes();
  if (e.target === entrevistas) closeEntrevistasPendientes();
  if (e.target === createVac) closeCreateVacanteModal();
  if (e.target === info) closeInfoModal();
};
