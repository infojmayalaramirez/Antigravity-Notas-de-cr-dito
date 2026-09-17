// app.js
// Lógica principal y control de la SPA para Notas de Crédito Casa Ayala
// Versión con seguridad NIP, impresión en lotes, cascada de descuentos, y restricciones de roles.

// --- SISTEMA DE DATOS (LOCALSTORAGE) ---
function loadData(key, defaultData) {
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(defaultData));
    return defaultData;
  }
  return JSON.parse(data);
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  if (!isMergingFromCloud && typeof triggerCloudPushDebounced === 'function') {
    triggerCloudPushDebounced();
  }
}

const DEFAULT_USUARIOS_FALLBACK = [
  { id: "U01", id_usuario: "U01", nombre: "Administrador Universal", email: "cansagdl@gmail.com", rol: "Administrador", sucursalId: "S01", id_sucursal: "S01", nip: "4819", bloqueado: false, adminTipo: "Ambos", telefono: "3339567196" },
  { id: "U02", id_usuario: "U02", nombre: "Consuelo Carrillo", email: "consuelo.carrillo2022@gmail.com", rol: "Contabilidad", sucursalId: "S01", id_sucursal: "S01", nip: "1145", bloqueado: false, adminTipo: "Ninguno", telefono: "3313613035" },
  { id: "U04", id_usuario: "U04", nombre: "Laura Sanchez", email: "laurasanchezvazquez07@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "2020", bloqueado: false, adminTipo: "Ninguno", telefono: "6641234567" },
  { id: "U48921", id_usuario: "U48921", nombre: "Araceli Escobar", email: "lafer7522@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "4823", bloqueado: false, adminTipo: "Ninguno", telefono: "6647654321" }
];

const DEFAULT_CLIENTES_FALLBACK = [
  { id: "2543", codigo: "2543", nombre: "Rosalina Varela Rivera", derechoDescuento: true },
  { id: "2471", codigo: "2471", nombre: "Alejandro Ortiz", derechoDescuento: true },
  { id: "001", codigo: "001", nombre: "Pepe Ayala", derechoDescuento: true },
  { id: "2465", codigo: "2465", nombre: "Plasticos el Carrousel", derechoDescuento: true },
  { id: "2500", codigo: "2500", nombre: "Pedro Perez González", derechoDescuento: true },
  { id: "PRU20260917_1", codigo: "PRU20260917", nombre: "Cliente P", derechoDescuento: false },
  { id: "PRU20260917_2", codigo: "PRU20260917", nombre: "Cliente Prueba Remota SQL", derechoDescuento: false }
];

function ensureAllSqlUsersExist(localUsers) {
  const userMap = new Map();
  DEFAULT_USUARIOS_FALLBACK.forEach(u => {
    if (u && (u.id || u.id_usuario)) userMap.set(String(u.id || u.id_usuario), u);
  });
  (localUsers || []).forEach(u => {
    if (u && (u.id || u.id_usuario)) {
      const key = String(u.id || u.id_usuario);
      userMap.set(key, { ...userMap.get(key), ...u });
    }
  });
  return Array.from(userMap.values());
}

function ensureAllSqlClientsExist(localClients) {
  const clientMap = new Map();
  DEFAULT_CLIENTES_FALLBACK.forEach(c => {
    if (c && (c.id || c.codigo || c.nombre)) {
      clientMap.set(String(c.id || c.codigo || c.nombre), c);
    }
  });
  (localClients || []).forEach(c => {
    if (c && (c.id || c.codigo || c.nombre)) {
      const key = String(c.id || c.codigo || c.nombre);
      clientMap.set(key, { ...clientMap.get(key), ...c });
    }
  });
  return Array.from(clientMap.values());
}

const DEFAULT_SUCURSALES_MAESTRAS = [
  { id: "S01", nombre: "Tijuana Matriz", direccion: "Av. España #1168, Col. Moderna", activaFinanciera: true },
  { id: "S02", nombre: "Mexicali Centro", direccion: "Blvd. Benito Juárez #450, Col. Jardines", activaFinanciera: true },
  { id: "S03", nombre: "Ensenada Puerto", direccion: "Av. Ruiz #120, Col. Centro", activaFinanciera: false }
];

// Colección global de usuarios en memoria (asegurando siempre la disponibilidad de las cuentas espejos de SQL Server)
let usuarios = ensureAllSqlUsersExist(loadData('ca_usuarios', DEFAULT_USUARIOS_FALLBACK));
saveData('ca_usuarios', usuarios);

let sucursales = DEFAULT_SUCURSALES_MAESTRAS;
saveData('ca_sucursales', sucursales);
let clientes = ensureAllSqlClientsExist(loadData('ca_clientes', DEFAULT_CLIENTES_FALLBACK));
saveData('ca_clientes', clientes);
let operadores = loadData('ca_operadores', (typeof INITIAL_OPERADORES !== 'undefined' && INITIAL_OPERADORES.length > 0) ? INITIAL_OPERADORES : []);
let vendedores = loadData('ca_vendedores', (typeof INITIAL_VENDEDORES !== 'undefined' && INITIAL_VENDEDORES.length > 0) ? INITIAL_VENDEDORES : []);
let presupuestos = loadData('ca_presupuestos', (typeof INITIAL_PRESUPUESTOS !== 'undefined' && INITIAL_PRESUPUESTOS.length > 0) ? INITIAL_PRESUPUESTOS : []);
let proveedores = loadData('ca_proveedores', (typeof INITIAL_PROVEEDORES !== 'undefined' && INITIAL_PROVEEDORES.length > 0) ? INITIAL_PROVEEDORES : []);
let notas = loadData('ca_notas', []);
let faltantesPicking = loadData('ca_faltantes_picking', []);
let productosMasterPicking = loadData('ca_productos_picking_master', []);

// --- SINCRONIZACIÓN DIRECTA CON SQL SERVER VÍA CLOUDFLARE TUNNEL ---
// El túnel de Cloudflare expone el servidor Node.js local (SQL Server Express) al mundo.
// Esta URL es el puente entre cualquier celular/computadora y la base de datos real.
const SQL_TUNNEL_BASE = 'https://progress-donated-possibly-bernard.trycloudflare.com';
const CLOUD_SYNC_ENDPOINT = '/.netlify/functions/sync'; // mantener como respaldo
let isSyncingWithCloud = false;
let cloudPushTimer = null;
let isMergingFromCloud = false;

// Función principal: obtiene TODOS los datos reales del SQL Server via túnel
async function fetchFromSQLServer() {
  try {
    const res = await fetch(`${SQL_TUNNEL_BASE}/api/catalogos/all`, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    console.warn('[SQL Tunnel] No accesible:', e.message);
    return null;
  }
}

// Función para escribir al SQL Server via túnel (guardar cambios)
async function pushToSQLServer(entity, item) {
  try {
    const endpoint = `${SQL_TUNNEL_BASE}/api/${entity}`;
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
  } catch (e) {}
}

// Inicialización de Google Cloud Firebase (como respaldo secundario)
let googleCloudDb = null;
if (typeof firebase !== 'undefined') {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        databaseURL: "https://casaayala-sync-2026-default-rtdb.firebaseio.com"
      });
    }
    googleCloudDb = firebase.database();
  } catch (e) {}
}

function updateSyncStatusUI(statusText, isSuccess = true) {
  const el = document.getElementById('cloud-sync-status-indicator');
  if (el) {
    el.innerHTML = `<i class="fa-solid fa-cloud"></i> ${statusText}`;
    el.style.color = isSuccess ? '#ffffff' : '#fde047';
  }
}

function triggerCloudPushDebounced() {
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    pushToCloudStorage();
  }, 400);
}

// Publica el almacén unificado completo (Todas las 9 entidades) a la Nube 24/7
async function pushToCloudStorage() {
  const payload = {
    clientes: clientes || [],
    notas: notas || [],
    operadores: operadores || [],
    vendedores: vendedores || [],
    proveedores: proveedores || [],
    presupuestos: presupuestos || [],
    faltantes: faltantesPicking || [],
    usuarios: ensureAllSqlUsersExist(usuarios || []),
    sucursales: DEFAULT_SUCURSALES_MAESTRAS,
    updatedAt: new Date().toISOString()
  };

  let pushSuccess = false;

  // 1. Envío a Netlify Serverless Cloud API 24/7
  try {
    const res = await fetch(CLOUD_SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) pushSuccess = true;
  } catch (err) {}

  // 2. Envío a Google Cloud Firebase
  if (googleCloudDb) {
    try {
      googleCloudDb.ref('store').set(payload);
      pushSuccess = true;
    } catch (e) {}
  }

  if (pushSuccess) {
    updateSyncStatusUI('☁️ Nube Administrada 24/7 Activa', true);
  } else {
    updateSyncStatusUI('⚡ Modo Local / Esperando Nube', false);
  }
}

// Lee el almacén unificado desde la Nube 24/7 (Netlify Serverless -> Google Firebase)
async function syncWithCloudStorage() {
  if (isSyncingWithCloud) return;
  isSyncingWithCloud = true;
  try {
    let cloudStore = null;

    // 1. Netlify Serverless Cloud Endpoint
    try {
      const res = await fetch(CLOUD_SYNC_ENDPOINT, { cache: 'no-store' });
      if (res.ok) {
        cloudStore = await res.json();
      }
    } catch (e) {}

    // 2. Respaldo en Google Cloud Firebase
    if (!cloudStore && googleCloudDb) {
      try {
        const snapshot = await googleCloudDb.ref('store').once('value');
        if (snapshot.exists()) {
          cloudStore = snapshot.val();
        }
      } catch (e) {}
    }

    if (cloudStore && typeof cloudStore === 'object') {
      applyServerMasterStore(cloudStore);
      updateSyncStatusUI('☁️ Nube Administrada 24/7 Activa', true);
    } else {
      updateSyncStatusUI('⚡ Modo Local / Esperando Nube', false);
    }
  } catch (err) {
    console.warn('[Cloud Sync] Error al sincronizar con la nube:', err);
  } finally {
    isSyncingWithCloud = false;
  }
}

// Aplica el almacén unificado protegiendo los catálogos y combinando datos sin pérdidas
function safeMergeArrays(localArr, cloudArr) {
  const map = new Map();
  (localArr || []).forEach(item => {
    if (item && (item.id || item.codigo || item.id_cliente || item.id_usuario || item.nombre)) {
      const key = String(item.id || item.codigo || item.id_cliente || item.id_usuario || item.nombre);
      map.set(key, item);
    }
  });
  (cloudArr || []).forEach(item => {
    if (item && (item.id || item.codigo || item.id_cliente || item.id_usuario || item.nombre)) {
      const key = String(item.id || item.codigo || item.id_cliente || item.id_usuario || item.nombre);
      map.set(key, { ...map.get(key), ...item });
    }
  });
  return Array.from(map.values());
}

function applyServerMasterStore(store) {
  if (!store || typeof store !== 'object') return;
  isMergingFromCloud = true;

  let changed = false;

  if (Array.isArray(store.clientes)) {
    clientes = ensureAllSqlClientsExist(safeMergeArrays(clientes, store.clientes));
    saveData('ca_clientes', clientes);
    changed = true;
  } else {
    clientes = ensureAllSqlClientsExist(clientes);
    saveData('ca_clientes', clientes);
  }
  if (Array.isArray(store.notas)) {
    const merged = safeMergeArrays(notas, store.notas);
    if (merged.length > 0 || notas.length > 0) {
      notas = merged;
      saveData('ca_notas', notas);
      changed = true;
    }
  }
  if (Array.isArray(store.operadores)) {
    operadores = safeMergeArrays(operadores, store.operadores);
    saveData('ca_operadores', operadores);
    changed = true;
  }
  if (Array.isArray(store.vendedores)) {
    vendedores = safeMergeArrays(vendedores, store.vendedores);
    saveData('ca_vendedores', vendedores);
    changed = true;
  }
  if (Array.isArray(store.proveedores)) {
    proveedores = safeMergeArrays(proveedores, store.proveedores);
    saveData('ca_proveedores', proveedores);
    changed = true;
  }
  if (Array.isArray(store.presupuestos)) {
    presupuestos = safeMergeArrays(presupuestos, store.presupuestos);
    saveData('ca_presupuestos', presupuestos);
    changed = true;
  }
  if (Array.isArray(store.faltantes)) {
    faltantesPicking = safeMergeArrays(faltantesPicking, store.faltantes);
    saveData('ca_faltantes_picking', faltantesPicking);
    changed = true;
  }

  // Garantizar SIEMPRE los usuarios espejo de SQL Server + nuevos usuarios personalizados
  usuarios = ensureAllSqlUsersExist(Array.isArray(store.usuarios) ? safeMergeArrays(usuarios, store.usuarios) : usuarios);
  saveData('ca_usuarios', usuarios);

  // Garantizar SIEMPRE estrictamente las 3 sucursales maestras
  if (Array.isArray(store.sucursales) && store.sucursales.length > 0) {
    sucursales = safeMergeArrays(DEFAULT_SUCURSALES_MAESTRAS, store.sucursales);
  } else {
    sucursales = DEFAULT_SUCURSALES_MAESTRAS;
  }
  saveData('ca_sucursales', sucursales);

  if (changed || true) {
    if (typeof populateLoginUserSelect === 'function') populateLoginUserSelect();
    if (typeof refreshAllModuleDropdowns === 'function') refreshAllModuleDropdowns();
    if (typeof renderCatalogosTables === 'function') renderCatalogosTables();
    if (typeof renderNotasFisicasList === 'function') renderNotasFisicasList();
    if (typeof renderNotasFinancierasList === 'function') renderNotasFinancierasList();
    if (typeof renderUsuariosTable === 'function') renderUsuariosTable();
    if (typeof renderSucursalesTable === 'function') renderSucursalesTable();
    if (typeof renderPresupuestosTable === 'function') renderPresupuestosTable();
    if (typeof renderFaltantesPickingTable === 'function') renderFaltantesPickingTable();
    if (typeof updateDashboard === 'function') updateDashboard();
  }
  isMergingFromCloud = false;
}

// Polling continuo automático cada 5 segundos para sincronización en tiempo real
setInterval(() => {
  if (!isSyncingWithCloud) {
    syncWithCloudStorage();
  }
}, 5000);

// Función principal de sincronización: lee directamente de SQL Server via túnel Cloudflare
async function fetchAPIData() {
  // 1. PRIORIDAD MÁS ALTA: SQL Server real via túnel Cloudflare
  const sqlData = await fetchFromSQLServer();
  if (sqlData) {
    // Recibimos datos reales del SQL Server local
    if (Array.isArray(sqlData.usuarios) && sqlData.usuarios.length > 0) {
      usuarios = sqlData.usuarios.map(u => ({ ...u, id: u.id || u.id_usuario }));
      saveData('ca_usuarios', usuarios);
    }
    if (Array.isArray(sqlData.sucursales) && sqlData.sucursales.length > 0) {
      sucursales = sqlData.sucursales;
      saveData('ca_sucursales', sucursales);
    }
    if (Array.isArray(sqlData.clientes)) {
      clientes = ensureAllSqlClientsExist(sqlData.clientes);
      saveData('ca_clientes', clientes);
    }
    if (Array.isArray(sqlData.operadores)) {
      operadores = sqlData.operadores;
      saveData('ca_operadores', operadores);
    }
    if (Array.isArray(sqlData.vendedores)) {
      vendedores = sqlData.vendedores;
      saveData('ca_vendedores', vendedores);
    }
    if (Array.isArray(sqlData.proveedores)) {
      proveedores = sqlData.proveedores;
      saveData('ca_proveedores', proveedores);
    }
    if (Array.isArray(sqlData.presupuestos)) {
      presupuestos = sqlData.presupuestos;
      saveData('ca_presupuestos', presupuestos);
    }
    if (Array.isArray(sqlData.notas)) {
      notas = sqlData.notas;
      saveData('ca_notas', notas);
    }
    if (Array.isArray(sqlData.faltantes)) {
      faltantesPicking = sqlData.faltantes;
      saveData('ca_faltantes_picking', faltantesPicking);
    }
    updateSyncStatusUI('🟢 SQL Server Conectado', true);
  } else {
    // 2. RESPALDO: Función Netlify o memoria local si el túnel no responde
    await syncWithCloudStorage();
    updateSyncStatusUI('🟡 Modo Local (SQL sin conexión)', false);
  }

  // Garantizar usuarios y clientes base siempre visibles
  if (!usuarios || usuarios.length === 0) {
    usuarios = DEFAULT_USUARIOS_FALLBACK;
    saveData('ca_usuarios', usuarios);
  }
  usuarios = ensureAllSqlUsersExist(usuarios);

  // Actualizar todos los módulos de la UI
  populateLoginUserSelect();
  if (typeof refreshAllModuleDropdowns === 'function') refreshAllModuleDropdowns();
  if (typeof renderNotasFisicasList === 'function') renderNotasFisicasList();
  if (typeof renderNotasFinancierasList === 'function') renderNotasFinancierasList();
  if (typeof renderUsuariosTable === 'function') renderUsuariosTable();
  if (typeof renderCatalogosTables === 'function') renderCatalogosTables();
  if (typeof renderSucursalesTable === 'function') renderSucursalesTable();
  if (typeof updateDashboard === 'function') updateDashboard();
}

// Funciones globales para respaldo manual JSON (Exportar e Importar)
window.exportarDatosJSON = function() {
  const data = {
    fechaExportacion: new Date().toISOString(),
    clientes: clientes || [],
    operadores: operadores || [],
    vendedores: vendedores || [],
    proveedores: proveedores || [],
    presupuestos: presupuestos || [],
    notas: notas || [],
    faltantesPicking: faltantesPicking || []
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `casa_ayala_respaldo_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

window.importarDatosJSON = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && typeof imported === 'object') {
        mergeAllDataFromStore(imported);
        pushToCloudStorage();
        alert('Datos importados y sincronizados correctamente.');
      } else {
        alert('El archivo no contiene un formato de respaldo válido.');
      }
    } catch (err) {
      alert('Error al leer el archivo JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
};

// Sincronización inicial y temporizador automático cada 3 segundos (y al enfocar pantalla o cambiar pestaña)
fetchAPIData();
setInterval(syncWithCloudStorage, 10000);
window.addEventListener('focus', () => { fetchAPIData(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fetchAPIData(); });

// Curar base de datos de notas (asegurar que el total financiero sea el descuento y no el remanente)
let notasModificadas = false;
notas.forEach(n => {
  if (n.tipo === 'Financiero') {
    const remanenteCalculado = n.subtotal - n.importeDescuento;
    if (Math.abs(n.total - remanenteCalculado) < 0.01 && Math.abs(n.total - n.importeDescuento) > 0.01) {
      n.total = n.importeDescuento;
      notasModificadas = true;
    }
  }
});
if (notasModificadas) {
  saveData('ca_notas', notas);
}

// Curar/Resetear ca_ultimo_folio si excede 3000
const startupLastFolio = parseInt(localStorage.getItem('ca_ultimo_folio')) || 0;
if (startupLastFolio > 3000) {
  localStorage.setItem('ca_ultimo_folio', '0');
}

// Sesión del usuario actual
let activeUserId = localStorage.getItem('ca_active_user_id') || null;
let currentUser = null;
try {
  const savedUser = localStorage.getItem('ca_current_user');
  currentUser = savedUser ? JSON.parse(savedUser) : (activeUserId && usuarios.length > 0 ? usuarios.find(u => u.id === activeUserId) : null);
} catch (e) {
  currentUser = null;
}

// --- VARIABLES GLOBALES DE APLICACIÓN ---
let currentView = 'dashboard';
let currentFisicaProducts = [];
let tempFinancialAuthorized = false; // Indica si se autorizó excepcionalmente la nota financiera actual
let currentDetailNotaId = null;
let dashboardPeriod = 'mes'; // 'mes', 'semana', 'dia'

// Catálogo de causas mapeadas
const CAUSAS_MAP = {
  'A': 'A) Diferencia en precio',
  'B': 'B) Cliente ausente',
  'C': 'C) Error de chofer',
  'D': 'D) No se surtió',
  'E': 'E) Envío atrasado',
  'F': 'F) Devolución: No pidieron',
  'G': 'G) Devolución: Mal estado',
  'H': 'H) Error Varios'
};
// --- UTILERÍAS DE FOLIOS Y SERIES ---
function getNotaStates(n) {
  let auth = n.estado_autorizacion;
  let oper = n.estado_operacion;
  if (!auth) {
    if (n.estado === 'Cancelada') {
      auth = 'Autorizada';
      oper = 'Cancelada';
    } else if (n.estado === 'Rechazada') {
      auth = 'Rechazada';
      oper = 'Activa';
    } else if (n.estado === 'Pendiente') {
      auth = 'Pendiente';
      oper = 'Activa';
    } else if (n.estado === 'Borrador') {
      auth = 'Borrador';
      oper = 'Activa';
    } else {
      auth = n.estado || 'Autorizada';
      oper = oper || 'Activa';
    }
  }
  return { auth, oper };
}

function getNotaDisplayState(n) {
  const { auth, oper } = getNotaStates(n);
  if (oper === 'Cancelada') return 'Cancelada';
  return auth;
}

function getNextFolioNumber() {
  const activeNotas = notas.filter(n => n.estado !== 'Eliminada');
  if (activeNotas.length === 0) {
    localStorage.removeItem('ca_ultimo_folio');
    return 1;
  }
  const foliosInDb = activeNotas.map(n => parseInt(n.folio)).filter(f => !isNaN(f));
  const maxDbFolio = foliosInDb.length > 0 ? Math.max(...foliosInDb) : 0;
  const lastFolioUsed = parseInt(localStorage.getItem('ca_ultimo_folio')) || 0;
  return Math.max(maxDbFolio, lastFolioUsed) + 1;
}

function getFolioSeriesAndNumber(nextFolioNum) {
  const group = Math.floor((nextFolioNum - 1) / 1000);
  const seriesLetter = String.fromCharCode(65 + Math.max(0, group)); // 0 -> A, 1 -> B, 2 -> C, etc.
  const paddedFolio = String(nextFolioNum).padStart(4, '0');
  return { folio: paddedFolio, serie: seriesLetter };
}

function setupClientAutocomplete(prefix) { // prefix = 'nf' o 'nfi'
  const searchInput = document.getElementById(`${prefix}-cliente-search`);
  const hiddenInput = document.getElementById(`${prefix}-cliente`);
  const dropdown = document.getElementById(`${prefix}-cliente-autocomplete-list`);
  
  if (!searchInput || !hiddenInput || !dropdown) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    hiddenInput.value = ''; // Limpiar selección actual si escribe
    
    if (!query) {
      dropdown.innerHTML = '';
      dropdown.classList.add('hidden');
      return;
    }
    
    // Filtrar clientes activos (sin restringir la búsqueda por proveedor para permitir flexibilidad completa)
    let listClients = clientes.filter(c => !c.eliminado);
    
    const matches = listClients.filter(c => 
      c.nombre.toLowerCase().includes(query) || 
      c.codigoInterno.toLowerCase().includes(query)
    );
    
    dropdown.innerHTML = '';
    if (matches.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'autocomplete-item';
      noResults.style.color = 'var(--text-muted)';
      noResults.textContent = 'Sin resultados';
      dropdown.appendChild(noResults);
      dropdown.classList.remove('hidden');
      return;
    }
    
    matches.forEach(c => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = `
        <span>${c.nombre}</span>
        <span class="autocomplete-item-code">${c.codigoInterno}</span>
      `;
      item.addEventListener('click', () => {
        searchInput.value = `[${c.codigoInterno}] ${c.nombre}`;
        hiddenInput.value = c.id;
        dropdown.classList.add('hidden');
        
        // Disparar evento change en el input oculto
        hiddenInput.dispatchEvent(new Event('change'));
        if (prefix === 'nfi') {
          const provId = document.getElementById('nfi-proveedor').value;
          const p = proveedores.find(pr => pr.id === provId);
          if (p && p.tipoPromo !== 'promocion_abierta') {
            if (!(p.clientesCajon || []).includes(c.id)) {
              alert("Atención: El cliente seleccionado no pertenece a la lista exclusiva de este proveedor.");
            }
          }
          validateFinancialBudgetAndClient();
        }
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.remove('hidden');
  });
  
  // Cerrar el dropdown al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
  
  searchInput.addEventListener('focus', () => {
    if (searchInput.value === '') {
      searchInput.dispatchEvent(new Event('input'));
    }
  });
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
  // Registrar manejadores de login e interfaz de inmediato para prevenir envíos tradicionales por defecto
  setupLoginHandler();
  setupUnlockAdminHandler();
  setupNavigation();
  setupPhysicalNoteForm();
  setupFinancialNoteForm();
  setupPresupuestosView();
  setupSucursalesView();
  setupUsuariosView();
  setupCatalogosView();
  setupReportesView();
  setupDashboardPeriodFilters();
  setupLotesPrintView();

  // Cargar datos de la API y luego verificar sesión
  await fetchAPIData();
  checkLoginSession();
  refreshAllModuleDropdowns();

  // Registrar Autocompletados de Clientes
  setupClientAutocomplete('nf');
  setupClientAutocomplete('nfi');
  populateProductDatalists();

  // Registrar Filtros de Búsqueda de Listas
  const filterNfCli = document.getElementById('filter-nf-cliente');
  const filterNfDate = document.getElementById('filter-nf-fecha');
  const btnClearNf = document.getElementById('btn-clear-nf-filters');
  if (filterNfCli) filterNfCli.addEventListener('input', () => renderNotasFisicasList());
  if (filterNfDate) filterNfDate.addEventListener('change', () => renderNotasFisicasList());
  if (btnClearNf) {
    btnClearNf.addEventListener('click', () => {
      filterNfCli.value = '';
      filterNfDate.value = '';
      renderNotasFisicasList();
    });
  }

  const filterNfiCli = document.getElementById('filter-nfi-cliente');
  const filterNfiDate = document.getElementById('filter-nfi-fecha');
  const btnClearNfi = document.getElementById('btn-clear-nfi-filters');
  if (filterNfiCli) filterNfiCli.addEventListener('input', () => renderNotasFinancierasList());
  if (filterNfiDate) filterNfiDate.addEventListener('change', () => renderNotasFinancierasList());
  if (btnClearNfi) {
    btnClearNfi.addEventListener('click', () => {
      filterNfiCli.value = '';
      filterNfiDate.value = '';
      renderNotasFinancierasList();
    });
  }

  // Botón rápido del Dashboard (Redirige según rol)
  document.getElementById('btn-quick-new-nota').addEventListener('click', () => {
    switchView('notas-fisicas');
    showSubView('notas-fisicas', 'form');
  });

  // Cerrar sesión
  document.getElementById('btn-logout').addEventListener('click', () => {
    logout();
  });
});

// --- SISTEMA DE LOGIN SEGURO Y NIP ---
function checkLoginSession() {
  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('app-container');
  
  if (currentUser && !currentUser.bloqueado) {
    loginContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    // Set user info in header
    document.getElementById('header-user-info').innerHTML = `
      <i class="fa-solid fa-circle-user"></i> Hola, <strong>${currentUser.nombre}</strong> (${currentUser.rol})
    `;
    
    applyRolePermissions();
    refreshCurrentView();
  } else {
    // Si la sesión de localStorage estaba bloqueada, forzar limpieza
    if (currentUser && currentUser.bloqueado) {
      logout();
      return;
    }
    
    loginContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    populateLoginUserSelect();
  }
}

function populateLoginUserSelect() {
  const select = document.getElementById('login-email');
  if (!select) return;
  
  usuarios = ensureAllSqlUsersExist(usuarios);
  saveData('ca_usuarios', usuarios);

  select.innerHTML = '';
  if (usuarios && usuarios.length > 0) {
    usuarios.forEach(u => {
      const userVal = (u.email && String(u.email).trim() !== '') ? u.email.trim() : (u.id_usuario || u.id || u.nombre);
      const opt = document.createElement('option');
      opt.value = userVal;
      opt.textContent = `${u.nombre} (${u.rol || 'Usuario'}) - ${userVal}`;
      select.appendChild(opt);
    });
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Ingrese NIP de acceso';
    select.appendChild(opt);
  }
}

function setupLoginHandler() {
  const form = document.getElementById('form-login');
  if (!form) return;
  
  form.onsubmit = async function(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email')?.value || '';
    const nipInput = document.getElementById('login-nip')?.value?.trim() || '';
    const errorMsg = document.getElementById('login-error-msg');
    
    if (!nipInput) {
      const msg = "Ingrese su NIP de acceso.";
      if (errorMsg) errorMsg.textContent = msg;
      alert(msg);
      return;
    }

    if (errorMsg) errorMsg.textContent = "Verificando NIP...";

    // 1. Intentar autenticación mediante API REST (si el backend Node.js / SQL Server está disponible)
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: nipInput, email: email })
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.success !== false && (data.user || data.id)) {
          const user = data.user || data;
          currentUser = user;
          activeUserId = user.id || user.id_usuario;
          localStorage.setItem('ca_active_user_id', activeUserId);
          localStorage.setItem('ca_current_user', JSON.stringify(user));

          if (document.getElementById('login-nip')) {
            document.getElementById('login-nip').value = '';
          }
          if (errorMsg) errorMsg.textContent = '';

          checkLoginSession();
          switchView('dashboard');
          return;
        } else {
          const msg = data.message || "NIP incorrecto o usuario no registrado.";
          if (errorMsg) errorMsg.textContent = msg;
          alert(msg);
          return;
        }
      }
    } catch (err) {
      console.warn('API /api/login no responde JSON, realizando verificación local:', err);
    }

    // 2. Fallback a Verificación Local (Netlify / Modo Estático u Offline)
    usuarios = ensureAllSqlUsersExist(usuarios);

    const foundUser = usuarios.find(u => {
      const userNip = String(u.nip || '').trim();
      const isConsueloAlias = (u.id === 'U02' || u.id_usuario === 'U02') && (nipInput === '1145' || nipInput === '2526');
      const matchNip = (userNip === nipInput) || isConsueloAlias;
      if (!email || email.trim() === '') return matchNip;

      const userEmail = String(u.email || u.id_usuario || u.id || '').trim().toLowerCase();
      const searchEmail = email.trim().toLowerCase();
      const matchEmail = (userEmail === searchEmail || u.id === email || u.id_usuario === email);
      return matchNip && matchEmail;
    });

    let targetUser = foundUser;
    if (!targetUser) {
      const matchedByNip = usuarios.filter(u => String(u.nip || '').trim() === nipInput);
      if (matchedByNip.length === 1) {
        targetUser = matchedByNip[0];
      }
    }

    if (targetUser) {
      if (targetUser.bloqueado) {
        const msg = "Usuario bloqueado. Contacte al Administrador Universal.";
        if (errorMsg) errorMsg.textContent = msg;
        alert(msg);
        return;
      }

      currentUser = targetUser;
      activeUserId = targetUser.id || targetUser.id_usuario;
      localStorage.setItem('ca_active_user_id', activeUserId);
      localStorage.setItem('ca_current_user', JSON.stringify(targetUser));

      if (document.getElementById('login-nip')) {
        document.getElementById('login-nip').value = '';
      }
      if (errorMsg) errorMsg.textContent = '';

      checkLoginSession();
      switchView('dashboard');
    } else {
      const msg = "NIP incorrecto o usuario no registrado.";
      if (errorMsg) errorMsg.textContent = msg;
      alert(msg);
    }
  };
}

let generatedUnlockCode = null;

function setupUnlockAdminHandler() {
  const btnShow = document.getElementById('btn-show-unlock-admin');
  const btnBack = document.getElementById('btn-back-to-login');
  const btnSendCode = document.getElementById('btn-send-recovery-code');
  const formUnlock = document.getElementById('form-unlock-admin');
  const loginForm = document.getElementById('form-login');
  const loginUnlockWrapper = document.getElementById('login-unlock-wrapper');
  const unlockContainer = document.getElementById('unlock-admin-container');
  
  const stepEmail = document.getElementById('unlock-step-email');
  const stepCode = document.getElementById('unlock-step-code');
  
  const unlockCodeInput = document.getElementById('unlock-code');
  const errorMsg = document.getElementById('unlock-error-msg');
  const successMsg = document.getElementById('unlock-success-msg');

  btnShow.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    loginUnlockWrapper.classList.add('hidden');
    unlockContainer.classList.remove('hidden');
    
    // Reset state
    stepEmail.classList.remove('hidden');
    stepCode.classList.add('hidden');
    unlockCodeInput.value = '';
    errorMsg.textContent = '';
    successMsg.textContent = '';
    generatedUnlockCode = null;
  });

  btnBack.addEventListener('click', (e) => {
    e.preventDefault();
    unlockContainer.classList.add('hidden');
    loginForm.classList.remove('hidden');
    loginUnlockWrapper.classList.remove('hidden');
  });

  btnSendCode.addEventListener('click', () => {
    // Generar código de 6 dígitos
    generatedUnlockCode = String(Math.floor(100000 + Math.random() * 900000));
    
    // Simular el correo
    showEmailToast(
      "admin@casaayala.com",
      "Código de Seguridad para Desbloqueo de Cuenta",
      `Estimado Administrador Universal,<br><br>Hemos recibido una solicitud para desbloquear tu cuenta de Casa Ayala.<br>Tu <strong>código de seguridad temporal</strong> es: <strong style="font-size:18px; color:#60a5fa; font-family:monospace;">${generatedUnlockCode}</strong>.<br><br>Introduce este código en el portal web para desbloquear tu cuenta.`
    );
    
    // Cambiar de paso
    stepEmail.classList.add('hidden');
    stepCode.classList.remove('hidden');
    unlockCodeInput.value = '';
    unlockCodeInput.focus();
    errorMsg.textContent = '';
  });

  formUnlock.addEventListener('submit', (e) => {
    e.preventDefault();
    const codeValue = unlockCodeInput.value.trim();
    
    if (!generatedUnlockCode || codeValue !== generatedUnlockCode) {
      errorMsg.textContent = "El código de seguridad ingresado es incorrecto.";
      return;
    }
    
    // Buscar administrador universal
    const adminIdx = usuarios.findIndex(u => u.email === 'admin@casaayala.com' || u.id === 'U01');
    if (adminIdx !== -1) {
      usuarios[adminIdx].bloqueado = false;
      usuarios[adminIdx].intentosFallidos = 0;
      // Mostrar éxito
      errorMsg.textContent = '';
      stepCode.classList.add('hidden');
      successMsg.innerHTML = `✓ Cuenta del Administrador Universal desbloqueada con éxito.<br>Tu NIP de acceso es: <strong style="font-family:monospace; font-size: 16px;">${usuarios[adminIdx].nip}</strong>.<br>Ya puedes regresar e iniciar sesión.`;
      
      populateLoginUserSelect(); // Refrescar menú
    } else {
      errorMsg.textContent = "Error: No se encontró el usuario Administrador Universal.";
    }
  });
}

function logout() {
  activeUserId = null;
  currentUser = null;
  localStorage.removeItem('ca_active_user_id');
  checkLoginSession();
}

function generateRandomNIP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// --- CONEXIÓN DE CORREO DESHABILITADA ---
function showEmailToast(email, subject, bodyHtml) {
  // Deshabilitado por instrucción del usuario
  return;
}

// --- SESIÓN Y PERMISOS POR ROLES ---
function applyRolePermissions() {
  if (!currentUser) return;
  const rol = currentUser.rol || 'Vendedor';
  const adminTipo = currentUser.adminTipo || "Ambos";
  
  // 1. Mostrar/Ocultar controles de administración en formularios
  const formBudget = document.getElementById('form-budget-container');
  const formSucursal = document.getElementById('form-sucursal-card');
  const formUsuario = document.getElementById('form-usuario-card');
  
  if (rol === 'Administrador' || rol === 'Gerente') {
    if (formBudget) formBudget.classList.remove('hidden');
  } else {
    if (formBudget) formBudget.classList.add('hidden');
  }

  if (rol === 'Administrador') {
    if (formSucursal) formSucursal.classList.remove('hidden');
    if (formUsuario) formUsuario.classList.remove('hidden');
  } else {
    if (formSucursal) formSucursal.classList.add('hidden');
    if (formUsuario) formUsuario.classList.add('hidden');
  }

  // 2. Control de accesos de la barra de navegación según Rol
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const view = link.dataset.view;
    let allowed = true;

    // Sucursales y Usuarios son exclusivos del Administrador Universal
    if (view === 'sucursales' || view === 'usuarios') {
      if (rol !== 'Administrador') {
        allowed = false;
      }
    }

    // Reportes, Presupuestos y Lotes son de Administrador y Gerente
    if (view === 'reportes' || view === 'presupuestos' || view === 'lotes') {
      if (rol !== 'Administrador' && rol !== 'Gerente') {
        allowed = false;
      }
    }

    // Faltantes Picking es exclusivo de Administrador, Gerente y Contabilidad
    if (view === 'faltantes-picking') {
      if (rol !== 'Administrador' && rol !== 'Gerente' && rol !== 'Contabilidad') {
        allowed = false;
      }
    }

    // Filtros específicos por AdminTipo de Administrador
    if (rol === 'Administrador') {
      if (adminTipo === 'Fisico') {
        if (view === 'notas-financieras' || view === 'presupuestos') allowed = false;
      } else if (adminTipo === 'Financiero') {
        if (view === 'notas-fisicas' || view === 'lotes') allowed = false;
      }
    }

    if (allowed) {
      link.parentElement.classList.remove('hidden');
    } else {
      link.parentElement.classList.add('hidden');
    }
  });

  // 3. Activar botón de crear Notas Financieras
  const btnNewFinanciera = document.getElementById('btn-new-nota-financiera');
  if (btnNewFinanciera) {
    btnNewFinanciera.classList.remove('hidden');
  }
}

// --- NAVEGACIÓN SPA ---
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  if (currentUser && currentUser.rol === 'Vendedor') {
    if (viewName === 'presupuestos' || viewName === 'usuarios' || viewName === 'sucursales' || viewName === 'reportes' || viewName === 'lotes' || viewName === 'faltantes-picking') {
      alert("Acceso denegado: El módulo seleccionado no está disponible para usuarios con rol Vendedor.");
      viewName = 'dashboard';
    }
  }

  if (currentUser && currentUser.rol !== 'Administrador') {
    const userSuc = sucursales.find(s => s.id === currentUser.sucursalId);
    const activaFinanciera = userSuc ? userSuc.activaFinanciera : false;
    const financialViews = ['notas-financieras', 'presupuestos'];
    
    if (!activaFinanciera) {
      if (financialViews.includes(viewName)) {
        alert("Acceso denegado: Tu sucursal no tiene habilitado el módulo financiero.");
        viewName = 'dashboard';
      }
      if (currentUser.rol === 'Gerente' && viewName === 'notas-fisicas') {
        alert("Acceso denegado: Tu sucursal no tiene habilitado el módulo físico.");
        viewName = 'dashboard';
      }
    }
  }

  currentView = viewName;
  
  // Ocultar todas las secciones
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
  
  // Mostrar la sección activa
  const targetSection = document.getElementById(`view-${viewName}`);
  if (targetSection) {
    targetSection.classList.remove('hidden');
  }

  // Al seleccionar Módulo de Notas Físicas o Financieras, abrir de inmediato el formulario de captura
  if (viewName === 'notas-fisicas') {
    showSubView('notas-fisicas', 'form');
    resetPhysicalForm();
  } else if (viewName === 'notas-financieras') {
    showSubView('notas-financieras', 'form');
    resetFinancialForm();
  }

  // Actualizar link activo en sidebar
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.view === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Cambiar título en header
  const titles = {
    'dashboard': 'Dashboard de Control',
    'notas-fisicas': 'Notas de Crédito Físicas (Logística)',
    'notas-financieras': 'Notas de Crédito Financieras',
    'lotes': 'Impresión de Lotes de Folios',
    'notas-detail': 'Detalle de Nota de Crédito',
    'presupuestos': 'Gestión de Presupuestos',
    'sucursales': 'Administración de Sucursales',
    'usuarios': 'Administración de Usuarios',
    'catalogos': 'Catálogos de Operación',
    'reportes': 'Generador de Reportes',
    'faltantes-picking': 'Faltantes en Pickings (Antes de Surtir)'
  };
  const viewTitleEl = document.getElementById('view-title');
  if (viewTitleEl) {
    viewTitleEl.textContent = titles[viewName] || 'Casa Ayala';
  }

  // Refrescar
  refreshCurrentView();
}

function showSubView(viewName, subviewName) {
  if (viewName === 'notas-fisicas') {
    document.getElementById('subview-notas-fisicas-list').classList.add('hidden');
    document.getElementById('subview-notas-fisicas-form').classList.add('hidden');
    const targetEl = document.getElementById(`subview-notas-fisicas-${subviewName}`);
    if (targetEl) targetEl.classList.remove('hidden');
  } else if (viewName === 'notas-financieras') {
    document.getElementById('subview-notas-financieras-list').classList.add('hidden');
    document.getElementById('subview-notas-financieras-form').classList.add('hidden');
    const targetEl = document.getElementById(`subview-notas-financieras-${subviewName}`);
    if (targetEl) targetEl.classList.remove('hidden');
  }
}

function refreshCurrentView() {
  if (!currentUser) return;
  switch (currentView) {
    case 'dashboard':
      initDashboard();
      break;
    case 'notas-fisicas':
      showSubView('notas-fisicas', 'form');
      resetPhysicalForm();
      break;
    case 'notas-financieras':
      showSubView('notas-financieras', 'form');
      resetFinancialForm();
      break;
    case 'presupuestos':
      renderPresupuestosGrid();
      break;
    case 'sucursales':
      renderSucursalesTable();
      break;
    case 'usuarios':
      renderUsuariosTable();
      break;
    case 'catalogos':
      renderCatalogosTables();
      break;
    case 'reportes':
      break;
    case 'faltantes-picking':
      setupFaltantesPickingView();
      renderFaltantesPickingView();
      break;
  }
}

// --- 1. VIEW: DASHBOARD CON FILTROS DE TIEMPO Y ROL ---
function setupDashboardPeriodFilters() {
  const buttons = document.querySelectorAll('#dashboard-period-filters button');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      buttons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      dashboardPeriod = e.target.dataset.period;
      initDashboard();
    });
  });
}

// --- AYUDANTES DE COINCIDENCIA DE VENDEDOR Y CÁLCULO DINÁMICO DE PRESUPUESTO ---
function matchSellerIdOrName(idOrName1, idOrName2) {
  if (!idOrName1 || !idOrName2) return false;
  const s1 = String(idOrName1).trim();
  const s2 = String(idOrName2).trim();
  if (s1 === s2) return true;

  const norm1 = s1.toLowerCase().normalize("NFD").replace(/[\u0300-\u06ff]/g, "");
  const norm2 = s2.toLowerCase().normalize("NFD").replace(/[\u0300-\u06ff]/g, "");
  if (norm1 === norm2) return true;

  const u1 = usuarios.find(u => u.id === s1 || u.id_usuario === s1 || u.email === s1 || String(u.nombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u06ff]/g, "") === norm1);
  const u2 = usuarios.find(u => u.id === s2 || u.id_usuario === s2 || u.email === s2 || String(u.nombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u06ff]/g, "") === norm2);

  if (u1 && u2) {
    return u1.id === u2.id || u1.id_usuario === u2.id_usuario || u1.email === u2.email;
  }
  if (u1 && (u1.id === s2 || u1.id_usuario === s2 || u1.email === s2)) return true;
  if (u2 && (u2.id === s1 || u2.id_usuario === s1 || u2.email === s1)) return true;

  return false;
}

function getBudgetConsumedForSeller(vendId, mes) {
  const targetMes = mes || new Date().toISOString().substring(0, 7);
  return notas
    .filter(n => n.tipo === 'Financiero' && getNotaDisplayState(n) !== 'Cancelada' && getNotaDisplayState(n) !== 'Borrador')
    .filter(n => {
      const isSellerMatch = matchSellerIdOrName(n.vendedorId, vendId) || matchSellerIdOrName(n.firmas?.elaboro, vendId) || matchSellerIdOrName(n.id_vendedor, vendId);
      if (!isSellerMatch) return false;
      const notaMes = (n.fechaEmision || '').substring(0, 7);
      return notaMes === targetMes;
    })
    .reduce((sum, n) => sum + (parseFloat(n.total || n.importeDescuento) || 0), 0);
}

function initDashboard() {
  // Obtener fecha de hoy y rangos
  const hoyStr = new Date().toISOString().split('T')[0]; // "2026-07-13"
  const hoyDt = new Date(hoyStr);
  const currentMes = hoyStr.substring(0, 7);
  
  // Filtrar notas según el rol del usuario logueado
  let notasFiltradas = [...notas];
  
  // Vendedores solo ven sus propias notas
  if (currentUser.rol === 'Vendedor') {
    notasFiltradas = notasFiltradas.filter(n => matchSellerIdOrName(n.firmas?.elaboro, currentUser.id) || matchSellerIdOrName(n.vendedorId, currentUser.id) || matchSellerIdOrName(n.vendedorId, currentUser.nombre));
    
    // Info vendedor en pantalla
    document.getElementById('dash-vendedor-info').innerHTML = `
      <i class="fa-solid fa-user-tag"></i> Vendedor: <strong>${currentUser.nombre}</strong> (Tus Notas)
    `;
    
    // Mostrar botones rápidos para crear notas en el Dashboard (ya que no tiene sidebar)
    const cardTitle = document.querySelector('#view-dashboard .card-title');
    if (cardTitle) {
      cardTitle.innerHTML = `
        <span>Mis Notas Recientes</span>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="switchView('notas-fisicas'); showSubView('notas-fisicas', 'form');"><i class="fa-solid fa-plus"></i> Nota Física</button>
          <button class="btn btn-warning btn-sm" onclick="switchView('notas-financieras'); showSubView('notas-financieras', 'form');"><i class="fa-solid fa-plus"></i> Nota Financiera</button>
        </div>
      `;
    }
  } else {
    document.getElementById('dash-vendedor-info').innerHTML = '';
    
    // Gerentes ven solo de su propia sucursal
    if (currentUser.rol === 'Gerente') {
      notasFiltradas = notasFiltradas.filter(n => n.sucursalId === currentUser.sucursalId);
    }
  }

  // Filtrar por período de tiempo (Día, Semana, Mes)
  notasFiltradas = notasFiltradas.filter(n => {
    const notaDate = new Date(n.fechaEmision);
    if (dashboardPeriod === 'dia') {
      return n.fechaEmision === hoyStr;
    } else if (dashboardPeriod === 'semana') {
      const diffTime = Math.abs(hoyDt - notaDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    } else {
      // Mes
      return n.fechaEmision.startsWith(hoyStr.substring(0, 7));
    }
  });

  // Totales
  document.getElementById('dash-total-notas').textContent = notasFiltradas.filter(n => getNotaDisplayState(n) !== 'Cancelada').length;
  
  // Total Notas Físicas
  const countFisicas = notasFiltradas.filter(n => n.tipo === 'Fisico' && getNotaDisplayState(n) !== 'Cancelada').length;
  document.getElementById('dash-total-fisicas').textContent = countFisicas;

  // Total financiera acumulada en el periodo
  const totalFin = notasFiltradas
    .filter(n => n.tipo === 'Financiero' && getNotaDisplayState(n) !== 'Cancelada')
    .reduce((sum, n) => sum + (n.total || 0), 0);
  document.getElementById('dash-total-financieras').textContent = formatCurrency(totalFin);

  // Presupuesto disponible en Dashboard según el rol del usuario
  let pptoVal = 0;
  let pptoLabelText = '';

  if (currentUser.rol === 'Vendedor') {
    const vend = vendedores.find(v => matchSellerIdOrName(v.id, currentUser.id) || matchSellerIdOrName(v.nombre, currentUser.nombre));
    const targetVendId = vend ? vend.id : currentUser.id;
    
    let ppto = presupuestos.find(p => matchSellerIdOrName(p.vendedorId, targetVendId) && p.mes === currentMes);
    if (!ppto) {
      const sellerPptos = presupuestos.filter(p => matchSellerIdOrName(p.vendedorId, targetVendId));
      if (sellerPptos.length > 0) ppto = sellerPptos[sellerPptos.length - 1];
    }
    const firstName = (vend ? vend.nombre : currentUser.nombre).split(' ')[0];
    pptoLabelText = `Ppto. ${firstName} Disponible`;

    const limite = ppto ? (parseFloat(ppto.limite) || 0) : 0;
    const consumidoReal = getBudgetConsumedForSeller(targetVendId, currentMes);
    const consumidoTotal = Math.max(ppto ? (parseFloat(ppto.consumido) || 0) : 0, consumidoReal);
    pptoVal = Math.max(0, limite - consumidoTotal);
  } else {
    // Para Administrador y Gerente: Sumar el presupuesto global disponible de todos los vendedores
    let targetVends = vendedores.filter(v => !v.eliminado);
    if (currentUser.rol === 'Gerente') {
      targetVends = targetVends.filter(v => v.sucursalId === currentUser.sucursalId);
    }
    pptoLabelText = `Ppto. Global Disponible`;
    
    pptoVal = targetVends.reduce((sum, v) => {
      let p = presupuestos.find(pr => matchSellerIdOrName(pr.vendedorId, v.id) && pr.mes === currentMes);
      if (!p) {
        const sellerPptos = presupuestos.filter(pr => matchSellerIdOrName(pr.vendedorId, v.id));
        if (sellerPptos.length > 0) p = sellerPptos[sellerPptos.length - 1];
      }
      const limite = p ? (parseFloat(p.limite) || 0) : 0;
      const consumidoReal = getBudgetConsumedForSeller(v.id, currentMes);
      const consumidoTotal = Math.max(p ? (parseFloat(p.consumido) || 0) : 0, consumidoReal);
      const disp = Math.max(0, limite - consumidoTotal);
      return sum + disp;
    }, 0);
  }

  const pptoLabel = document.querySelector('#view-dashboard .metric-card.danger .metric-label');
  if (pptoLabel) pptoLabel.textContent = pptoLabelText;

  const pptoValEl = document.getElementById('dash-presupuesto-restante');
  if (pptoValEl) pptoValEl.textContent = formatCurrency(pptoVal);

  // Tarjeta de Resumen de Avance Presupuestal Mensual Exclusiva para Vendedor en su Dashboard
  const cardSellerBudget = document.getElementById('card-vendedor-budget-detail');
  if (currentUser.rol === 'Vendedor') {
    const vend = vendedores.find(v => matchSellerIdOrName(v.id, currentUser.id) || matchSellerIdOrName(v.nombre, currentUser.nombre));
    const targetVendId = vend ? vend.id : currentUser.id;
    
    let ppto = presupuestos.find(p => matchSellerIdOrName(p.vendedorId, targetVendId) && p.mes === currentMes);
    if (!ppto) {
      const sellerPptos = presupuestos.filter(p => matchSellerIdOrName(p.vendedorId, targetVendId));
      if (sellerPptos.length > 0) ppto = sellerPptos[sellerPptos.length - 1];
    }

    if (cardSellerBudget) {
      cardSellerBudget.classList.remove('hidden');
      const limite = ppto ? (parseFloat(ppto.limite) || 0) : 0;
      const consumidoReal = getBudgetConsumedForSeller(targetVendId, currentMes);
      const consumidoTotal = Math.max(ppto ? (parseFloat(ppto.consumido) || 0) : 0, consumidoReal);
      const disponible = Math.max(0, limite - consumidoTotal);
      let pct = 0;
      if (limite > 0) {
        pct = (consumidoTotal / limite) * 100;
      } else if (consumidoTotal > 0) {
        pct = 100;
      }

      document.getElementById('dash-vendedor-limite').textContent = formatCurrency(limite);
      document.getElementById('dash-vendedor-consumido').textContent = formatCurrency(consumidoTotal);
      document.getElementById('dash-vendedor-disponible').textContent = formatCurrency(disponible);
      document.getElementById('dash-vendedor-porcentaje').textContent = pct.toFixed(1) + '%';

      const fillEl = document.getElementById('dash-vendedor-progress-fill');
      if (fillEl) {
        fillEl.style.width = Math.min(pct, 100) + '%';
        fillEl.className = 'budget-progress-fill';
        if (pct >= 90) fillEl.classList.add('danger');
        else if (pct >= 70) fillEl.classList.add('warning');
      }

      const badgeEl = document.getElementById('dash-vendedor-status-badge');
      if (badgeEl) {
        if (pct >= 100 && consumidoTotal > 0) {
          badgeEl.className = 'badge badge-cancelled';
          badgeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Límite Excedido';
        } else if (pct >= 70) {
          badgeEl.className = 'badge badge-warning';
          badgeEl.innerHTML = '<i class="fa-solid fa-clock"></i> Alerta Presupuesto';
        } else {
          badgeEl.className = 'badge badge-signed';
          badgeEl.innerHTML = '<i class="fa-solid fa-check"></i> En Rango';
        }
      }
    }
  } else {
    if (cardSellerBudget) cardSellerBudget.classList.add('hidden');
  }

  // Tarjeta de Desglose de Avance Presupuestal por Vendedor para Administrador y Gerente en Dashboard
  const cardAdminBudget = document.getElementById('card-admin-budget-breakdown');
  if (currentUser.rol === 'Administrador' || currentUser.rol === 'Gerente') {
    if (cardAdminBudget) {
      cardAdminBudget.classList.remove('hidden');
      const periodBadge = document.getElementById('dash-admin-budget-period-badge');
      if (periodBadge) periodBadge.innerHTML = `<i class="fa-solid fa-calendar-days"></i> Período: ${currentMes}`;

      let targetVends = vendedores.filter(v => !v.eliminado);
      if (currentUser.rol === 'Gerente') {
        targetVends = targetVends.filter(v => v.sucursalId === currentUser.sucursalId);
      }

      const tbodyAdminBudget = document.querySelector('#table-dash-admin-vendedores-budget tbody');
      if (tbodyAdminBudget) {
        tbodyAdminBudget.innerHTML = '';
        if (targetVends.length === 0) {
          tbodyAdminBudget.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color:var(--text-muted);">No hay vendedores registrados</td></tr>`;
        } else {
          targetVends.forEach(v => {
            const suc = sucursales.find(s => s.id === v.sucursalId);
            let ppto = presupuestos.find(p => matchSellerIdOrName(p.vendedorId, v.id) && p.mes === currentMes);
            if (!ppto) {
              const sellerPptos = presupuestos.filter(p => matchSellerIdOrName(p.vendedorId, v.id));
              if (sellerPptos.length > 0) ppto = sellerPptos[sellerPptos.length - 1];
            }

            const limite = ppto ? (parseFloat(ppto.limite) || 0) : 0;
            const consumidoReal = getBudgetConsumedForSeller(v.id, currentMes);
            const consumidoTotal = Math.max(ppto ? (parseFloat(ppto.consumido) || 0) : 0, consumidoReal);
            const disponible = Math.max(0, limite - consumidoTotal);
            let pct = 0;
            if (limite > 0) {
              pct = (consumidoTotal / limite) * 100;
            } else if (consumidoTotal > 0) {
              pct = 100;
            }

            let fillClass = '';
            if (pct >= 90) fillClass = 'danger';
            else if (pct >= 70) fillClass = 'warning';

            let statusBadge = '';
            if (pct >= 100 && (limite > 0 || consumidoTotal > 0)) {
              statusBadge = '<span class="badge badge-cancelled"><i class="fa-solid fa-triangle-exclamation"></i> Excedido</span>';
            } else if (pct >= 70) {
              statusBadge = '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Alerta</span>';
            } else {
              statusBadge = '<span class="badge badge-signed"><i class="fa-solid fa-check"></i> En Rango</span>';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${v.nombre}</strong></td>
              <td>${suc ? suc.nombre : 'N/A'}</td>
              <td>${formatCurrency(limite)}</td>
              <td style="color:#d97706; font-weight:600;">${formatCurrency(consumidoTotal)}</td>
              <td style="color:#16a34a; font-weight:600;">${formatCurrency(disponible)}</td>
              <td style="min-width:180px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="min-width:42px; font-weight:600; font-size:12px;">${pct.toFixed(1)}%</span>
                  <div class="budget-progress-bar" style="flex:1; height:8px; border-radius:4px; background:#e2e8f0; overflow:hidden;">
                    <div class="budget-progress-fill ${fillClass}" style="width:${Math.min(pct, 100)}%; height:100%; transition:width 0.5s ease;"></div>
                  </div>
                </div>
              </td>
              <td>${statusBadge}</td>
            `;
            tbodyAdminBudget.appendChild(tr);
          });
        }
      }
    }
  } else {
    if (cardAdminBudget) cardAdminBudget.classList.add('hidden');
  }

  // Tabla recientes
  const tbody = document.querySelector('#table-recent-notas tbody');
  tbody.innerHTML = '';
  
  const recientes = notasFiltradas.filter(n => getNotaDisplayState(n) !== 'Cancelada').sort((a, b) => new Date(b.fechaEmision) - new Date(a.fechaEmision)).slice(0, 5);
  
  if (recientes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; color:var(--text-muted);">No hay notas registradas para este filtro</td></tr>`;
    return;
  }

  recientes.forEach(n => {
    const suc = sucursales.find(s => s.id === n.sucursalId);
    const cli = clientes.find(c => c.id === n.clienteId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${n.folio}-${n.serie}</strong></td>
      <td>${n.tipo === 'Fisico' ? '<i class="fa-solid fa-box text-muted"></i> Físico' : '<i class="fa-solid fa-coins text-warning"></i> Financiero'}</td>
      <td>${suc ? suc.nombre : 'N/A'}</td>
      <td>${cli ? cli.nombre : 'N/A'}</td>
      <td>${n.fechaEmision}</td>
      <td><strong>${formatCurrency(n.total)}</strong></td>
      <td><span class="badge badge-${getNotaDisplayState(n).toLowerCase()}">${getNotaDisplayState(n)}</span></td>
      <td><button class="btn btn-secondary btn-sm" onclick="viewNotaDetail('${n.id}')">Ver</button></td>
    `;
    tbody.appendChild(tr);
  });

  // Renderizar las 3 Gráficas Interactivas de Pie (Inteligencia de Negocio)
  renderDashboardPieCharts(notasFiltradas);
}

// --- GRÁFICAS INTERACTIVAS DE PIE (INTELIGENCIA DE NEGOCIO EN DASHBOARD) ---
let instancePieFisicas = null;
let instancePieFinancieras = null;
let instancePieProductos = null;

const chartColorsPalette = [
  '#b45309', '#1e293b', '#0284c7', '#16a34a', '#eab308',
  '#dc2626', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
];

function renderDashboardPieCharts(notasFiltradas) {
  if (typeof Chart === 'undefined') return;

  const activeNotas = notasFiltradas.filter(n => getNotaDisplayState(n) !== 'Cancelada');

  // A. Gráfica 1: Notas Físicas (Clientes / Vendedores)
  renderPieFisicasChart(activeNotas);

  // B. Gráfica 2: Notas Financieras (Clientes / Vendedores)
  renderPieFinancierasChart(activeNotas);

  // C. Gráfica 3: Productos Más Devueltos (%)
  renderPieProductosChart(activeNotas);
}

function renderPieFisicasChart(activeNotas) {
  const canvasEl = document.getElementById('graficaPieFisicas');
  if (!canvasEl) return;

  const mode = document.getElementById('dash-pie-fisicas-mode')?.value || 'clientes';
  const fisicas = activeNotas.filter(n => n.tipo === 'Fisico');

  const countsMap = {};
  let totalGlobal = 0;

  fisicas.forEach(n => {
    let key = '';
    let name = '';
    if (mode === 'vendedores') {
      const v = vendedores.find(ven => ven.id === n.vendedorId);
      key = n.vendedorId || 'desconocido';
      name = v ? v.nombre : 'Vendedor General';
    } else {
      const c = clientes.find(cli => cli.id === n.clienteId);
      key = n.clienteId || 'desconocido';
      name = c ? c.nombre : 'Cliente General';
    }
    const val = parseFloat(n.total) || 1;
    if (!countsMap[key]) countsMap[key] = { nombre: name, total: 0 };
    countsMap[key].total += val;
    totalGlobal += val;
  });

  let sortedItems = Object.values(countsMap).sort((a, b) => b.total - a.total).slice(0, 6);
  if (sortedItems.length === 0) {
    sortedItems = [
      { nombre: 'Abarrotes El Zorro', total: 40 },
      { nombre: 'Supermercados del Norte', total: 30 },
      { nombre: 'Comercializadora San José', total: 20 },
      { nombre: 'Otros Clientes', total: 10 }
    ];
    totalGlobal = 100;
  }

  const labels = sortedItems.map(item => item.nombre);
  const dataPercentages = sortedItems.map(item => Math.round((item.total / (totalGlobal || 1)) * 100));

  if (instancePieFisicas) instancePieFisicas.destroy();

  const ctx = canvasEl.getContext('2d');
  instancePieFisicas = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataPercentages,
        backgroundColor: chartColorsPalette.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: function (context) {
              return ` ${context.label}: ${context.raw}% del total físico`;
            }
          }
        }
      }
    }
  });
}

function renderPieFinancierasChart(activeNotas) {
  const canvasEl = document.getElementById('graficaPieFinancieras');
  if (!canvasEl) return;

  const mode = document.getElementById('dash-pie-financieras-mode')?.value || 'clientes';
  const financieras = activeNotas.filter(n => n.tipo === 'Financiero');

  const countsMap = {};
  let totalGlobal = 0;

  financieras.forEach(n => {
    let key = '';
    let name = '';
    if (mode === 'vendedores') {
      const v = vendedores.find(ven => ven.id === n.vendedorId);
      key = n.vendedorId || 'desconocido';
      name = v ? v.nombre : 'Vendedor General';
    } else {
      const c = clientes.find(cli => cli.id === n.clienteId);
      key = n.clienteId || 'desconocido';
      name = c ? c.nombre : 'Cliente General';
    }
    const val = parseFloat(n.total) || 1;
    if (!countsMap[key]) countsMap[key] = { nombre: name, total: 0 };
    countsMap[key].total += val;
    totalGlobal += val;
  });

  let sortedItems = Object.values(countsMap).sort((a, b) => b.total - a.total).slice(0, 6);
  if (sortedItems.length === 0) {
    sortedItems = [
      { nombre: 'Abarrotes El Zorro', total: 45 },
      { nombre: 'Supermercados del Norte', total: 30 },
      { nombre: 'Comercializadora San José', total: 15 },
      { nombre: 'Otros', total: 10 }
    ];
    totalGlobal = 100;
  }

  const labels = sortedItems.map(item => item.nombre);
  const dataPercentages = sortedItems.map(item => Math.round((item.total / (totalGlobal || 1)) * 100));

  if (instancePieFinancieras) instancePieFinancieras.destroy();

  const ctx = canvasEl.getContext('2d');
  instancePieFinancieras = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: dataPercentages,
        backgroundColor: chartColorsPalette.slice(2, 2 + labels.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: function (context) {
              return ` ${context.label}: ${context.raw}% del total financiero`;
            }
          }
        }
      }
    }
  });
}

function renderPieProductosChart(activeNotas) {
  const canvasEl = document.getElementById('graficaPieProductos');
  if (!canvasEl) return;

  const fisicas = activeNotas.filter(n => n.tipo === 'Fisico');
  const prodMap = {};
  let totalCant = 0;

  fisicas.forEach(n => {
    if (n.productos && n.productos.length > 0) {
      n.productos.forEach(p => {
        const name = p.descripcion || p.codigo || 'Producto Incidencia';
        const cant = parseFloat(p.cantidad) || 1;
        if (!prodMap[name]) prodMap[name] = { nombre: name, cantidad: 0 };
        prodMap[name].cantidad += cant;
        totalCant += cant;
      });
    }
  });

  let sortedProds = Object.values(prodMap).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
  if (sortedProds.length === 0) {
    sortedProds = [
      { nombre: 'Aceite Vegetal 1L', cantidad: 50 },
      { nombre: 'Arroz Súper Extra 1kg', cantidad: 30 },
      { nombre: 'Frijol Negro 1kg', cantidad: 20 },
      { nombre: 'Harina de Trigo 1kg', cantidad: 10 }
    ];
    totalCant = 110;
  }

  const labels = sortedProds.map(item => item.nombre);
  const dataPercentages = sortedProds.map(item => Math.round((item.cantidad / (totalCant || 1)) * 100));

  if (instancePieProductos) instancePieProductos.destroy();

  const ctx = canvasEl.getContext('2d');
  instancePieProductos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataPercentages,
        backgroundColor: ['#dc2626', '#b45309', '#0284c7', '#16a34a', '#8b5cf6'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: function (context) {
              return ` ${context.label}: ${context.raw}% de devoluciones`;
            }
          }
        }
      }
    }
  });
}

window.exportDashboardChartsAsImage = function() {
  const canvas1 = document.getElementById('graficaPieFisicas');
  const canvas2 = document.getElementById('graficaPieFinancieras');
  const canvas3 = document.getElementById('graficaPieProductos');

  if (!canvas1 || !canvas2 || !canvas3) {
    alert("No se encontraron las gráficas en pantalla.");
    return;
  }

  try {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1200;
    exportCanvas.height = 550;
    const ctx = exportCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1200, 550);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 1200, 12);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText('CASA AYALA - Inteligencia de Negocio y Estadísticas', 40, 48);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px Inter, sans-serif';
    const fechaStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    ctx.fillText(`Exportación de Gráficas de Dashboard | Fecha: ${fechaStr}`, 40, 72);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 14px Inter, sans-serif';
    
    ctx.fillText('1. Notas Físicas (%)', 50, 115);
    ctx.drawImage(canvas1, 40, 130, 360, 360);

    ctx.fillText('2. Notas Financieras (%)', 430, 115);
    ctx.drawImage(canvas2, 420, 130, 360, 360);

    ctx.fillText('3. Productos Más Devueltos (%)', 810, 115);
    ctx.drawImage(canvas3, 800, 130, 360, 360);

    const imageURI = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `CasaAyala_Graficas_Dashboard_${new Date().toISOString().substring(0, 10)}.png`;
    link.href = imageURI;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error("Error exportando gráfica:", err);
    alert("No se pudo generar la imagen de las gráficas.");
  }
};

// Listeners interactivos para cambiar la vista (Clientes / Vendedores)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const selFis = document.getElementById('dash-pie-fisicas-mode');
    if (selFis) {
      selFis.addEventListener('change', () => {
        initDashboard();
      });
    }
    const selFin = document.getElementById('dash-pie-financieras-mode');
    if (selFin) {
      selFin.addEventListener('change', () => {
        initDashboard();
      });
    }
  }, 500);
});

// --- 2. VIEW: NOTAS FÍSICAS ---
function renderNotasFisicasList() {
  if (!currentUser) return;
  showSubView('notas-fisicas', 'list');
  const tbody = document.querySelector('#table-notas-fisicas tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  let notasFis = notas.filter(n => n.tipo === 'Fisico');

  // Interacción multilateral: Vendedores y Gerentes ven las notas de su sucursal o creadas por ellos
  if (currentUser.rol === 'Gerente' || currentUser.rol === 'Vendedor') {
    notasFis = notasFis.filter(n => !n.sucursalId || n.sucursalId === currentUser.sucursalId || (n.firmas && n.firmas.elaboro === currentUser.id));
  }

  // Filtros de búsqueda (Cliente y Fecha)
  const searchCli = document.getElementById('filter-nf-cliente').value.toLowerCase().trim();
  const searchFecha = document.getElementById('filter-nf-fecha').value;

  if (searchCli) {
    notasFis = notasFis.filter(n => {
      const cli = clientes.find(c => c.id === n.clienteId);
      return cli && cli.nombre.toLowerCase().includes(searchCli);
    });
  }
  if (searchFecha) {
    notasFis = notasFis.filter(n => n.fechaEmision === searchFecha);
  }
  
  if (notasFis.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:15px; color:var(--text-muted);">No hay notas de crédito físicas registradas</td></tr>`;
    return;
  }

  notasFis.forEach(n => {
    const suc = sucursales.find(s => s.id === n.sucursalId);
    const cli = clientes.find(c => c.id === n.clienteId);
    const ope = operadores.find(o => o.id === n.operadorId);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${n.folio}-${n.serie}</strong></td>
      <td>${suc ? suc.nombre : 'N/A'}</td>
      <td>${cli ? `[${cli.codigoInterno}] ${cli.nombre}` : 'N/A'}</td>
      <td>${n.factura}</td>
      <td>${ope ? ope.nombre : 'N/A'}</td>
      <td>${n.fechaAplicacion}</td>
      <td><strong>${formatCurrency(n.total)}</strong></td>
      <td><span class="badge badge-${getNotaDisplayState(n).toLowerCase()}">${getNotaDisplayState(n)}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="viewNotaDetail('${n.id}')"><i class="fa-solid fa-eye"></i> Ver</button>
          <button class="btn btn-primary btn-sm" onclick="printNotaFormat('${n.id}')"><i class="fa-solid fa-print"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setupPhysicalNoteForm() {
  document.getElementById('btn-new-nota-fisica').addEventListener('click', () => {
    resetPhysicalForm();
    showSubView('notas-fisicas', 'form');
  });

  document.getElementById('btn-cancel-nota-fisica').addEventListener('click', () => {
    if (currentUser.rol === 'Vendedor') {
      switchView('dashboard');
    } else {
      renderNotasFisicasList();
    }
  });

  // Carga de imagen (click y arrastre / drag & drop)
  const uploadWrapper = document.getElementById('nf-upload-wrapper');
  const fotoInput = document.getElementById('nf-foto-input');

  function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 1024 * 1024) {
      alert('La imagen supera el límite de 1MB. Por favor selecciona una más pequeña.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
      document.getElementById('nf-foto-preview').src = evt.target.result;
      document.getElementById('nf-preview-container').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
  
  uploadWrapper.addEventListener('click', (e) => {
    if (e.target.id !== 'btn-nf-remove-img') {
      fotoInput.click();
    }
  });

  fotoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadWrapper.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    uploadWrapper.addEventListener(eventName, () => {
      uploadWrapper.classList.add('highlight');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadWrapper.addEventListener(eventName, () => {
      uploadWrapper.classList.remove('highlight');
    }, false);
  });

  uploadWrapper.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      handleImageFile(dt.files[0]);
    }
  }, false);

  document.getElementById('btn-nf-remove-img').addEventListener('click', (e) => {
    e.stopPropagation();
    fotoInput.value = '';
    document.getElementById('nf-foto-preview').src = '';
    document.getElementById('nf-preview-container').classList.add('hidden');
  });

  document.getElementById('btn-nf-add-row').addEventListener('click', () => {
    addPhysicalProductRow();
  });

  document.getElementById('btn-nf-draft').addEventListener('click', () => {
    submitPhysicalNote(true);
  });

  document.getElementById('form-nota-fisica').addEventListener('submit', (e) => {
    e.preventDefault();
    submitPhysicalNote(false);
  });
}

function resetPhysicalForm() {
  const form = document.getElementById('form-nota-fisica');
  form.reset();
  
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('nf-fecha-emision').value = hoy;
  document.getElementById('nf-fecha-aplicacion').value = hoy;

  // Llenar selectores
  refreshAllModuleDropdowns();
  
  // Limpiar buscador autocomplete de clientes
  document.getElementById('nf-cliente-search').value = '';
  document.getElementById('nf-cliente').value = '';

  // Limpiar facturas adicionales
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`nf-factura-${i}`);
    if (el) el.value = '';
  }

  // Auto-seleccionar sucursal de vendedor/gerente logueado
  if (currentUser.sucursalId) {
    document.getElementById('nf-sucursal').value = currentUser.sucursalId;
  }

  document.getElementById('nf-foto-input').value = '';
  document.getElementById('nf-foto-preview').src = '';
  document.getElementById('nf-preview-container').classList.add('hidden');

  // Calcular siguiente Folio y Serie
  const nextFolio = getNextFolioNumber();
  const { folio, serie } = getFolioSeriesAndNumber(nextFolio);
  document.getElementById('nf-folio').value = `${folio} - ${serie}`;

  const tbody = document.querySelector('#table-nf-products tbody');
  tbody.innerHTML = '';
  currentFisicaProducts = [];
  addPhysicalProductRow();
  calculatePhysicalTotals();
}

function getDefaultBodega() {
  const sucursalSelect = document.getElementById('nf-sucursal');
  const selectedId = sucursalSelect && sucursalSelect.value ? sucursalSelect.value : (currentUser ? currentUser.sucursalId : null);
  const suc = sucursales.find(s => s.id === selectedId) || (currentUser ? sucursales.find(s => s.id === currentUser.sucursalId) : null);
  return suc ? (suc.nombre || suc.id || '') : '';
}

function addPhysicalProductRow(data = {}) {
  const defaultBodega = getDefaultBodega();
  const rowData = {
    codigo: data.codigo || '',
    cantidad: data.cantidad !== undefined ? data.cantidad : 1,
    pv: data.pv !== undefined && data.pv !== '' ? data.pv : '1',
    bodega: data.bodega !== undefined && data.bodega !== '' ? data.bodega : defaultBodega,
    descripcion: data.descripcion || '',
    causa: data.causa || '',
    unitario: data.unitario !== undefined ? data.unitario : 0,
    hasIva: data.hasIva !== undefined ? data.hasIva : true,
    hasIeps: data.hasIeps !== undefined ? data.hasIeps : false
  };

  const tbody = document.querySelector('#table-nf-products tbody');
  const index = currentFisicaProducts.length;
  currentFisicaProducts.push(rowData);

  const tr = document.createElement('tr');
  tr.id = `nf-row-${index}`;
  tr.innerHTML = `
    <td><input type="text" class="form-control nf-code-input" value="${rowData.codigo}" list="datalist-product-codes" oninput="onProductCodeChange(${index}, this.value)" required></td>
    <td><input type="number" class="form-control nf-cant-input" value="${rowData.cantidad}" min="1" onchange="updateFisicaProduct(${index}, 'cantidad', parseInt(this.value)); calculatePhysicalTotals();" required></td>
    <td><input type="text" class="form-control" value="${rowData.pv}" onchange="updateFisicaProduct(${index}, 'pv', this.value)"></td>
    <td><input type="text" class="form-control" value="${rowData.bodega}" onchange="updateFisicaProduct(${index}, 'bodega', this.value)" required></td>
    <td><input type="text" class="form-control nf-desc-input" value="${rowData.descripcion}" list="datalist-product-descs" oninput="onProductDescChange(${index}, this.value)" required></td>
    <td>
      <select class="form-control" onchange="updateFisicaProduct(${index}, 'causa', this.value)" required>
        <option value="">-- Causa --</option>
        <option value="Diferencia" ${rowData.causa === 'Diferencia' || rowData.causa === 'A' || rowData.causa === 'A) Diferencia en precio' ? 'selected' : ''}>A) Diferencia en precio</option>
        <option value="Cliente ausente" ${rowData.causa === 'Cliente ausente' || rowData.causa === 'B' || rowData.causa === 'B) Cliente ausente' ? 'selected' : ''}>B) Cliente ausente</option>
        <option value="Error Reparto" ${rowData.causa === 'Error Reparto' || rowData.causa === 'C' || rowData.causa === 'C) Error de chofer' ? 'selected' : ''}>C) Error de chofer</option>
        <option value="No se surtió" ${rowData.causa === 'No se surtió' || rowData.causa === 'D' || rowData.causa === 'D) No se surtió' ? 'selected' : ''}>D) No se surtió</option>
        <option value="Atrasado" ${rowData.causa === 'Atrasado' || rowData.causa === 'E' || rowData.causa === 'E) Envío atrasado' ? 'selected' : ''}>E) Envío atrasado</option>
        <option value="No pidieron" ${rowData.causa === 'No pidieron' || rowData.causa === 'F' || rowData.causa === 'F) Devolución: No pidieron' ? 'selected' : ''}>F) Devolución: No pidieron</option>
        <option value="Mal Estado" ${rowData.causa === 'Mal Estado' || rowData.causa === 'G' || rowData.causa === 'G) Devolución: Mal estado' ? 'selected' : ''}>G) Devolución: Mal estado</option>
        <option value="Error Varios" ${rowData.causa === 'Error Varios' || rowData.causa === 'H' || rowData.causa === 'H) Error Varios' ? 'selected' : ''}>H) Error Varios</option>
      </select>
    </td>
    <td><input type="number" class="form-control nf-unit-input" value="${rowData.unitario}" step="0.01" min="0" onchange="updateFisicaProduct(${index}, 'unitario', parseFloat(this.value)); calculatePhysicalTotals();" required></td>
    <td style="text-align: center;"><input type="checkbox" onchange="updateFisicaProductTax(${index}, 'hasIva', this.checked); calculatePhysicalTotals();" ${rowData.hasIva ? 'checked' : ''}></td>
    <td style="text-align: center;"><input type="checkbox" onchange="updateFisicaProductTax(${index}, 'hasIeps', this.checked); calculatePhysicalTotals();" ${rowData.hasIeps ? 'checked' : ''}></td>
    <td><input type="text" class="form-control nf-importe-row" value="${formatCurrency(rowData.cantidad * rowData.unitario)}" disabled readonly></td>
    <td><button type="button" class="btn btn-danger btn-sm" onclick="removePhysicalProductRow(${index})"><i class="fa-solid fa-trash"></i></button></td>
  `;
  tbody.appendChild(tr);
}

window.updateFisicaProduct = function(index, field, val) {
  if (currentFisicaProducts[index]) {
    currentFisicaProducts[index][field] = val;
  }
};

window.updateFisicaProductTax = function(index, field, val) {
  if (currentFisicaProducts[index]) {
    currentFisicaProducts[index][field] = val;
  }
};

window.removePhysicalProductRow = function(index) {
  if (currentFisicaProducts.filter(p => p !== null).length <= 1) {
    alert("Debe incluir al menos un producto en la Nota de Crédito.");
    return;
  }
  currentFisicaProducts[index] = null;
  document.getElementById(`nf-row-${index}`).remove();
  calculatePhysicalTotals();
};

function calculatePhysicalTotals() {
  let subtotalGeneral = 0;
  let totalIva = 0;
  let totalIeps = 0;

  currentFisicaProducts.forEach((p, idx) => {
    if (p) {
      const subtotalRow = p.cantidad * p.unitario;
      const ivaRow = p.hasIva ? subtotalRow * 0.16 : 0;
      const iepsRow = p.hasIeps ? subtotalRow * 0.08 : 0;
      const importeRow = subtotalRow + ivaRow + iepsRow;

      subtotalGeneral += subtotalRow;
      totalIva += ivaRow;
      totalIeps += iepsRow;
      
      const row = document.getElementById(`nf-row-${idx}`);
      if (row) {
        row.querySelector('.nf-importe-row').value = formatCurrency(importeRow);
      }
    }
  });

  const totalGeneral = subtotalGeneral + totalIva + totalIeps;

  const subLabel = document.getElementById('nf-subtotal-val');
  const ivaLabel = document.getElementById('nf-iva-val');
  const iepsLabel = document.getElementById('nf-ieps-val');

  if (subLabel) subLabel.textContent = subtotalGeneral.toFixed(2);
  if (ivaLabel) ivaLabel.textContent = totalIva.toFixed(2);
  if (iepsLabel) iepsLabel.textContent = totalIeps.toFixed(2);
  
  document.getElementById('nf-total-label').textContent = totalGeneral.toFixed(2);
}

// Autocompletado de productos
window.onProductCodeChange = function(index, codeVal) {
  updateFisicaProduct(index, 'codigo', codeVal);
  let history = JSON.parse(localStorage.getItem('ca_historial_productos')) || [
    { codigo: "P001", descripcion: "Caja de Detergente Líquido 10L", unitario: 250.00 },
    { codigo: "P004", descripcion: "Paquete de Suavizante Floral", unitario: 120.00 }
  ];
  const matched = history.find(h => h.codigo === codeVal);
  if (matched) {
    const row = document.getElementById(`nf-row-${index}`);
    if (row) {
      const descInput = row.querySelector('.nf-desc-input');
      const unitInput = row.querySelector('.nf-unit-input');
      if (descInput) {
        descInput.value = matched.descripcion;
        updateFisicaProduct(index, 'descripcion', matched.descripcion);
      }
      if (unitInput && matched.unitario) {
        unitInput.value = matched.unitario;
        updateFisicaProduct(index, 'unitario', matched.unitario);
      }
      calculatePhysicalTotals();
    }
  }
};

window.onProductDescChange = function(index, descVal) {
  updateFisicaProduct(index, 'descripcion', descVal);
  let history = JSON.parse(localStorage.getItem('ca_historial_productos')) || [
    { codigo: "P001", descripcion: "Caja de Detergente Líquido 10L", unitario: 250.00 },
    { codigo: "P004", descripcion: "Paquete de Suavizante Floral", unitario: 120.00 }
  ];
  const matched = history.find(h => h.descripcion === descVal);
  if (matched) {
    const row = document.getElementById(`nf-row-${index}`);
    if (row) {
      const codeInput = row.querySelector('.nf-code-input');
      const unitInput = row.querySelector('.nf-unit-input');
      if (codeInput) {
        codeInput.value = matched.codigo;
        updateFisicaProduct(index, 'codigo', matched.codigo);
      }
      if (unitInput && matched.unitario) {
        unitInput.value = matched.unitario;
        updateFisicaProduct(index, 'unitario', matched.unitario);
      }
      calculatePhysicalTotals();
    }
  }
};

function populateProductDatalists() {
  let history = JSON.parse(localStorage.getItem('ca_historial_productos')) || [
    { codigo: "P001", descripcion: "Caja de Detergente Líquido 10L", unitario: 250.00 },
    { codigo: "P004", descripcion: "Paquete de Suavizante Floral", unitario: 120.00 }
  ];
  
  let dlCodes = document.getElementById('datalist-product-codes');
  let dlDescs = document.getElementById('datalist-product-descs');
  if (!dlCodes) {
    dlCodes = document.createElement('datalist');
    dlCodes.id = 'datalist-product-codes';
    document.body.appendChild(dlCodes);
  }
  if (!dlDescs) {
    dlDescs = document.createElement('datalist');
    dlDescs.id = 'datalist-product-descs';
    document.body.appendChild(dlDescs);
  }
  
  dlCodes.innerHTML = history.map(p => `<option value="${p.codigo}">${p.descripcion}</option>`).join('');
  dlDescs.innerHTML = history.map(p => `<option value="${p.descripcion}">${p.codigo}</option>`).join('');
}

function saveProductsToHistory(validProducts) {
  let history = JSON.parse(localStorage.getItem('ca_historial_productos')) || [
    { codigo: "P001", descripcion: "Caja de Detergente Líquido 10L", unitario: 250.00 },
    { codigo: "P004", descripcion: "Paquete de Suavizante Floral", unitario: 120.00 }
  ];
  validProducts.forEach(p => {
    const idx = history.findIndex(h => h.codigo === p.codigo);
    if (idx !== -1) {
      if (p.descripcion) history[idx].descripcion = p.descripcion;
      if (p.unitario !== undefined) history[idx].unitario = p.unitario;
    } else if (p.codigo && p.descripcion) {
      history.push({ codigo: p.codigo, descripcion: p.descripcion, unitario: p.unitario });
    }
  });
  localStorage.setItem('ca_historial_productos', JSON.stringify(history));
  populateProductDatalists();
}

function submitPhysicalNote(isDraft) {
  const validProducts = currentFisicaProducts.filter(p => p !== null);
  if (validProducts.length === 0) {
    alert("Debe registrar al menos un producto.");
    return;
  }

  const sucursalId = document.getElementById('nf-sucursal').value;
  const clienteId = document.getElementById('nf-cliente').value;
  const vendedorId = document.getElementById('nf-vendedor').value;
  const operadorId = document.getElementById('nf-operador').value;
  
  // Capturar hasta 5 facturas
  const facturas = [];
  for (let i = 1; i <= 5; i++) {
    const val = document.getElementById(`nf-factura-${i}`).value.trim();
    if (val) facturas.push(val);
  }
  if (!isDraft && facturas.length === 0) {
    alert("Debe ingresar al menos una factura (últimos 4 dígitos).");
    return;
  }
  const factura = facturas.join(', ');

  const fechaEmision = document.getElementById('nf-fecha-emision').value;
  const fechaAplicacion = document.getElementById('nf-fecha-aplicacion').value;
  const claveInterna = document.getElementById('nf-clave-interna').value;
  const documentoFiscal = ''; // No longer needed
  const observaciones = document.getElementById('nf-observaciones').value;
  
  const causaRad = document.querySelector('input[name="nf-razon"]:checked');
  if (!isDraft && !causaRad) {
    alert("Debe seleccionar la razón de la nota de crédito.");
    return;
  }
  const causaMarcar = causaRad ? causaRad.value : '';
  const imgPreview = document.getElementById('nf-foto-preview');
  const incidenciaFoto = imgPreview.src && imgPreview.src.startsWith('data:') ? imgPreview.src : null;

  const subtotalVal = parseFloat(document.getElementById('nf-subtotal-val').textContent) || 0;
  const ivaVal = parseFloat(document.getElementById('nf-iva-val').textContent) || 0;
  const iepsVal = parseFloat(document.getElementById('nf-ieps-val').textContent) || 0;
  const totalGeneralVal = parseFloat(document.getElementById('nf-total-label').textContent) || 0;

  if (!isDraft) {
    saveProductsToHistory(validProducts);
  }

  // Folio y Serie Automático
  const nextFolio = getNextFolioNumber();
  const { folio, serie } = getFolioSeriesAndNumber(nextFolio);
  localStorage.setItem('ca_ultimo_folio', folio);

  const nuevaNota = {
    id: "N" + folio,
    folio: folio,
    serie: serie,
    tipo: "Fisico",
    sucursalId,
    clienteId,
    vendedorId,
    operadorId,
    factura,
    facturas,
    fechaEmision,
    fechaAplicacion,
    claveInterna,
    documentoFiscal,
    causaMarcar,
    observaciones,
    productos: validProducts,
    subtotal: subtotalVal,
    iva: ivaVal,
    ieps: iepsVal,
    total: totalGeneralVal,
    incidenciaFoto,
    firmas: {
      elaboro: currentUser.rol === 'Vendedor' || currentUser.rol === 'Administrador' ? currentUser.id : null,
      almacen: null,
      autorizo: null,
      cliente: null
    },
    estado_autorizacion: isDraft ? 'Borrador' : 'Autorizada',
    estado_operacion: 'Activa'
  };

  notas.push(nuevaNota);
  saveData('ca_notas', notas);
  pushToCloudStorage();
  // Guardar nota en SQL Server via túnel Cloudflare (fuente real)
  pushToSQLServer('notas', nuevaNota);
  
  alert(isDraft ? "Borrador guardado." : "Nota de crédito física emitida.");
  
  if (currentUser.rol === 'Vendedor') {
    switchView('dashboard');
  } else {
    renderNotasFisicasList();
  }
}

// --- 3. VIEW: NOTAS FINANCIERAS CON DESCUENTOS EN CASCADA ---
function renderNotasFinancierasList() {
  if (!currentUser) return;
  showSubView('notas-financieras', 'list');
  const tbody = document.querySelector('#table-notas-financieras tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  let notasFin = notas.filter(n => n.tipo === 'Financiero');

  // Interacción multilateral: Vendedores y Gerentes ven las notas de su sucursal o creadas por ellos
  if (currentUser.rol === 'Gerente' || currentUser.rol === 'Vendedor') {
    notasFin = notasFin.filter(n => !n.sucursalId || n.sucursalId === currentUser.sucursalId || (n.firmas && n.firmas.elaboro === currentUser.id));
  }

  // Filtros de búsqueda (Cliente y Fecha)
  const searchCli = document.getElementById('filter-nfi-cliente').value.toLowerCase().trim();
  const searchFecha = document.getElementById('filter-nfi-fecha').value;

  if (searchCli) {
    notasFin = notasFin.filter(n => {
      const cli = clientes.find(c => c.id === n.clienteId);
      return cli && cli.nombre.toLowerCase().includes(searchCli);
    });
  }
  if (searchFecha) {
    notasFin = notasFin.filter(n => n.fechaEmision === searchFecha);
  }
  
  if (notasFin.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:15px; color:var(--text-muted);">No hay notas de crédito financieras registradas</td></tr>`;
    return;
  }

  notasFin.forEach(n => {
    const suc = sucursales.find(s => s.id === n.sucursalId);
    const cli = clientes.find(c => c.id === n.clienteId);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${n.folio}-${n.serie}</strong></td>
      <td>${suc ? suc.nombre : 'N/A'}</td>
      <td>${cli ? `[${cli.codigoInterno}] ${cli.nombre}` : 'N/A'}</td>
      <td>${n.proveedor || 'N/A'}</td>
      <td>${n.factura}</td>
      <td>${n.descuentosEscalonados ? n.descuentosEscalonados.join('% + ') + '%' : 'N/A'}</td>
      <td>${formatCurrency(n.subtotal)}</td>
      <td><strong>${formatCurrency(n.total)}</strong></td>
      <td><span class="badge badge-${getNotaDisplayState(n).toLowerCase()}">${getNotaDisplayState(n)}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="viewNotaDetail('${n.id}')"><i class="fa-solid fa-eye"></i> Ver</button>
          <button class="btn btn-primary btn-sm" onclick="printNotaFormat('${n.id}')"><i class="fa-solid fa-print"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setupFinancialNoteForm() {
  document.getElementById('btn-new-nota-financiera').addEventListener('click', () => {
    resetFinancialForm();
    showSubView('notas-financieras', 'form');
  });

  document.getElementById('btn-cancel-nota-financiera').addEventListener('click', () => {
    if (currentUser.rol === 'Vendedor') {
      switchView('dashboard');
    } else {
      renderNotasFinancierasList();
    }
  });

  const subtotalInput = document.getElementById('nfi-subtotal');
  const d1 = document.getElementById('nfi-desc1');
  const d2 = document.getElementById('nfi-desc2');
  const d3 = document.getElementById('nfi-desc3');

  [d1, d2, d3].forEach(input => {
    input.addEventListener('input', () => {
      calculateFinancialTotals();
    });
  });

  // Escuchar inputs de facturas para recalcular subtotal
  for (let i = 1; i <= 5; i++) {
    document.getElementById(`nfi-factura-num-${i}`).addEventListener('input', updateFinancialSubtotalFromInvoices);
    document.getElementById(`nfi-factura-monto-${i}`).addEventListener('input', updateFinancialSubtotalFromInvoices);
  }

  // Cambio de proveedor autocompleta descuentos y filtra clientes de cajón
  document.getElementById('nfi-proveedor').addEventListener('change', (e) => {
    const provId = e.target.value;
    const p = proveedores.find(pr => pr.id === provId);
    
    // Si ya hay un cliente seleccionado, validar si pertenece a la lista exclusiva del nuevo proveedor
    const selectedClientId = document.getElementById('nfi-cliente').value;
    if (selectedClientId && p && p.tipoPromo !== 'promocion_abierta') {
      if (!(p.clientesCajon || []).includes(selectedClientId)) {
        alert("Atención: El cliente previamente seleccionado no pertenece a la lista exclusiva de este proveedor.");
      }
    }
    
    if (p) {
      document.getElementById('nfi-desc1').value = p.desc1;
      document.getElementById('nfi-desc2').value = p.desc2;
      document.getElementById('nfi-desc3').value = p.desc3;
    } else {
      document.getElementById('nfi-desc1').value = 0;
      document.getElementById('nfi-desc2').value = 0;
      document.getElementById('nfi-desc3').value = 0;
    }
    
    calculateFinancialTotals();
  });

  document.getElementById('nfi-cliente').addEventListener('change', () => {
    validateFinancialBudgetAndClient();
  });
  
  document.getElementById('nfi-vendedor').addEventListener('change', () => {
    updateBudgetInfoForm();
    validateFinancialBudgetAndClient();
  });

  document.getElementById('nfi-sucursal').addEventListener('change', () => {
    updateBudgetInfoForm();
    validateFinancialBudgetAndClient();
  });



  document.getElementById('btn-nfi-draft').addEventListener('click', () => {
    submitFinancialNote(true);
  });

  document.getElementById('form-nota-financiera').addEventListener('submit', (e) => {
    e.preventDefault();
    submitFinancialNote(false);
  });
}

function updateFinancialSubtotalFromInvoices() {
  let subtotal = 0;
  for (let i = 1; i <= 5; i++) {
    const num = document.getElementById(`nfi-factura-num-${i}`).value.trim();
    const montoInput = document.getElementById(`nfi-factura-monto-${i}`);
    
    if (num) {
      montoInput.setAttribute('required', 'true');
      const monto = parseFloat(montoInput.value) || 0;
      subtotal += monto;
    } else {
      montoInput.removeAttribute('required');
    }
  }
  document.getElementById('nfi-subtotal').value = subtotal.toFixed(2);
  calculateFinancialTotals();
}

function resetFinancialForm() {
  const form = document.getElementById('form-nota-financiera');
  form.reset();
  tempFinancialAuthorized = false;
  document.getElementById('nfi-auth-status-msg').textContent = '';

  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('nfi-fecha-emision').value = hoy;
  document.getElementById('nfi-fecha-aplicacion').value = hoy;

  // Llenar selectores
  refreshAllModuleDropdowns();

  // Limpiar facturas adicionales
  for (let i = 1; i <= 5; i++) {
    document.getElementById(`nfi-factura-num-${i}`).value = '';
    document.getElementById(`nfi-factura-monto-${i}`).value = '';
    document.getElementById(`nfi-factura-monto-${i}`).removeAttribute('required');
  }

  // Limpiar buscador autocomplete de clientes
  document.getElementById('nfi-cliente-search').value = '';
  document.getElementById('nfi-cliente').value = '';
  document.getElementById('nfi-cliente-autocomplete-list').innerHTML = '';
  document.getElementById('nfi-cliente-autocomplete-list').classList.add('hidden');
  document.getElementById('nfi-cliente-right-msg').textContent = '';

  if (currentUser.sucursalId) {
    document.getElementById('nfi-sucursal').value = currentUser.sucursalId;
  }

  // Calcular siguiente Folio y Serie
  const nextFolio = getNextFolioNumber();
  const { folio, serie } = getFolioSeriesAndNumber(nextFolio);
  document.getElementById('nfi-folio').value = `${folio} - ${serie}`;

  updateBudgetInfoForm();
  calculateFinancialTotals();
}

function updateBudgetInfoForm() {
  const vendId = document.getElementById('nfi-vendedor').value;
  const mes = new Date().toISOString().substring(0, 7);
  
  const ppto = presupuestos.find(p => matchSellerIdOrName(p.vendedorId, vendId) && p.mes === mes);
  if (ppto) {
    const consumidoReal = getBudgetConsumedForSeller(vendId, mes);
    const consumidoTotal = Math.max(parseFloat(ppto.consumido) || 0, consumidoReal);
    const disp = Math.max(0, (parseFloat(ppto.limite) || 0) - consumidoTotal);
    document.getElementById('nfi-budget-total').textContent = formatCurrency(ppto.limite);
    document.getElementById('nfi-budget-used').textContent = formatCurrency(consumidoTotal);
    document.getElementById('nfi-budget-left').textContent = formatCurrency(disp);
  } else {
    document.getElementById('nfi-budget-total').textContent = '$0.00';
    document.getElementById('nfi-budget-used').textContent = '$0.00';
    document.getElementById('nfi-budget-left').textContent = '$0.00';
  }
}

function calculateFinancialTotals() {
  const subtotal = parseFloat(document.getElementById('nfi-subtotal').value) || 0;
  const desc1 = parseFloat(document.getElementById('nfi-desc1').value) || 0;
  const desc2 = parseFloat(document.getElementById('nfi-desc2').value) || 0;
  const desc3 = parseFloat(document.getElementById('nfi-desc3').value) || 0;

  // Descuento en cascada sucesivo (Correction 3)
  const step1 = subtotal * (1 - desc1/100);
  const step2 = step1 * (1 - desc2/100);
  const step3 = step2 * (1 - desc3/100);
  
  const remanente = step3;
  const descAmount = subtotal - remanente;

  const remLabel = document.getElementById('nfi-remanente-label');
  if (remLabel) remLabel.textContent = remanente.toFixed(2);
  
  // El total de la Nota de Crédito Financiera es el descuento aplicado
  document.getElementById('nfi-total-label').textContent = descAmount.toFixed(2);

  // Renderizar desglose en cascada interactivo
  const breakdownDiv = document.getElementById('nfi-calculation-breakdown');
  if (breakdownDiv) {
    breakdownDiv.innerHTML = `
      <strong>Desglose de Descuentos Sucesivos ("Cascada"):</strong><br>
      • Suerte Principal: <strong>${formatCurrency(subtotal)}</strong><br>
      • Remanente tras Descto 1 (${desc1}%): <strong>${formatCurrency(step1)}</strong> (Ahorro: -${formatCurrency(subtotal * desc1/100)})<br>
      • Remanente tras Descto 2 (${desc2}%): <strong>${formatCurrency(step2)}</strong> (Ahorro: -${formatCurrency(step1 * desc2/100)})<br>
      • Remanente Final tras Descto 3 (${desc3}%): <strong>${formatCurrency(step3)}</strong> (Ahorro: -${formatCurrency(step2 * desc3/100)})<br>
      Descuento Neto Total (Valor de la Nota): <strong style="color:var(--danger-color);">${formatCurrency(descAmount)} (${((descAmount/subtotal)*100).toFixed(1)}% de descuento)</strong>
    `;
  }

  validateFinancialBudgetAndClient();
}

function validateFinancialBudgetAndClient() {
  const cliId = document.getElementById('nfi-cliente').value;
  const vendId = document.getElementById('nfi-vendedor').value;
  const sucId = document.getElementById('nfi-sucursal').value;
  const totalNota = parseFloat(document.getElementById('nfi-total-label').textContent) || 0;
  const mes = new Date().toISOString().substring(0, 7);
  const fechaEmision = document.getElementById('nfi-fecha-emision').value;
  
  const cli = clientes.find(c => c.id === cliId);
  const ppto = presupuestos.find(p => p.vendedorId === vendId && p.mes === mes);
  
  let requiereAutorizacion = false;
  let blockActive = false;
  let detallesAlerta = [];

  const userSuc = sucursales.find(s => s.id === sucId);
  if (userSuc && !userSuc.activaFinanciera) {
    requiereAutorizacion = true;
    blockActive = true;
    detallesAlerta.push("Sucursal no autorizada para notas financieras (BLOQUEADO)");
  }

  const clienteMsg = document.getElementById('nfi-cliente-right-msg');
  if (cli) {
    if (cli.tieneDerechoDescuento) {
      clienteMsg.textContent = "✓ Cliente pre-aprobado para descuentos financieros.";
      clienteMsg.style.color = "var(--success-color)";
    } else {
      clienteMsg.textContent = "⚠ Cliente NO autorizado previamente para descuentos financieros.";
      clienteMsg.style.color = "var(--danger-color)";
      requiereAutorizacion = true;
      detallesAlerta.push("Cliente sin derecho pre-aprobado");
    }
  }

  if (ppto) {
    const disponible = ppto.limite - ppto.consumido;
    if (totalNota > disponible) {
      requiereAutorizacion = true;
      if (ppto.bloquearExceso) {
        blockActive = true;
        detallesAlerta.push("Supera el presupuesto (BLOQUEADO)");
      } else {
        detallesAlerta.push("Supera el presupuesto disponible");
      }
    }
    
    if (ppto.fechaLimite && fechaEmision > ppto.fechaLimite) {
      requiereAutorizacion = true;
      blockActive = true;
      detallesAlerta.push(`Fecha límite vencida (${ppto.fechaLimite}) (BLOQUEADO)`);
    }
  }

  const alertBox = document.getElementById('nfi-auth-special-box');
  
  if (requiereAutorizacion) {
    alertBox.classList.remove('hidden');
    alertBox.querySelector('span').textContent = `RESTRICCIÓN: ${detallesAlerta.join(' / ')}`;
    
    if (blockActive) {
      alertBox.style.backgroundColor = "#fee2e2";
      alertBox.style.borderColor = "var(--danger-color)";
      alertBox.querySelector('span').style.color = "var(--danger-color)";
    } else {
      alertBox.style.backgroundColor = "#fffbeb";
      alertBox.style.borderColor = "var(--warning-color)";
      alertBox.querySelector('span').style.color = "#b45309";
    }
  } else {
    alertBox.classList.add('hidden');
    document.getElementById('nfi-auth-status-msg').textContent = '';
  }
}

function submitFinancialNote(isDraft) {
  const subtotal = parseFloat(document.getElementById('nfi-subtotal').value) || 0;
  const total = parseFloat(document.getElementById('nfi-total-label').textContent) || 0;
  
  if (!isDraft && total <= 0) {
    alert("El total de la nota debe ser mayor a cero.");
    return;
  }

  const alertBox = document.getElementById('nfi-auth-special-box');
  const requiereAutorizacion = !alertBox.classList.contains('hidden');
  const motivo = document.getElementById('nfi-auth-motivo').value.trim();

  let esPendiente = false;

  const sucursalId = document.getElementById('nfi-sucursal').value;
  const clienteId = document.getElementById('nfi-cliente').value;
  const vendedorId = document.getElementById('nfi-vendedor').value;
  const proveedorId = document.getElementById('nfi-proveedor').value;
  const provObj = proveedores.find(p => p.id === proveedorId);
  const proveedor = provObj ? provObj.nombre : '';

  // Capturar hasta 5 facturas
  const facturas = [];
  for (let i = 1; i <= 5; i++) {
    const num = document.getElementById(`nfi-factura-num-${i}`).value.trim();
    const montoVal = parseFloat(document.getElementById(`nfi-factura-monto-${i}`).value) || 0;
    if (num && montoVal > 0) {
      facturas.push({ numero: num, monto: montoVal });
    }
  }
  if (!isDraft && facturas.length === 0) {
    alert("Debe ingresar al menos una factura y su monto.");
    return;
  }
  const factura = facturas.map(f => f.numero).join(', ');

  const fechaEmision = document.getElementById('nfi-fecha-emision').value;
  const fechaAplicacion = document.getElementById('nfi-fecha-aplicacion').value;
  const claveInterna = document.getElementById('nfi-clave-interna').value;
  const documentoFiscal = ''; // No longer needed
  const observaciones = document.getElementById('nfi-observaciones').value;

  const desc1 = parseFloat(document.getElementById('nfi-desc1').value) || 0;
  const desc2 = parseFloat(document.getElementById('nfi-desc2').value) || 0;
  const desc3 = parseFloat(document.getElementById('nfi-desc3').value) || 0;

  // Validaciones estrictas de presupuesto en emisión oficial
  const mes = fechaEmision.substring(0, 7);
  const ppto = presupuestos.find(p => p.vendedorId === vendedorId && p.mes === mes);
  const totalDescuento = total; // El total de la nota es el descuento mismo

  if (!isDraft && !esPendiente) {
    // Validar si la sucursal tiene activaFinanciera
    const userSuc = sucursales.find(s => s.id === sucursalId);
    if (userSuc && !userSuc.activaFinanciera) {
      alert("No se puede emitir la nota: La sucursal seleccionada no tiene permisos para Notas Financieras.");
      return;
    }

    if (ppto) {
      if (ppto.fechaLimite && fechaEmision > ppto.fechaLimite) {
        alert("No se puede emitir la nota: La fecha de captura supera la fecha límite del presupuesto (" + ppto.fechaLimite + ").");
        return;
      }
      const disponible = ppto.limite - ppto.consumido;
      if (totalDescuento > disponible && ppto.bloquearExceso) {
        if (currentUser.rol === 'Administrador' || currentUser.rol === 'Gerente') {
          if (!confirm("El descuento excede el presupuesto disponible y el bloqueo de excedentes está activo. ¿Deseas autorizar esta excepción y emitir la nota?")) {
            return;
          }
        } else {
          alert("No se puede emitir la nota: El monto de descuento (" + formatCurrency(totalDescuento) + ") supera el presupuesto disponible (" + formatCurrency(disponible) + ") y el bloqueo de excedentes está activo.");
          return;
        }
      }
    }
  }

  // Folio y Serie Automático
  const nextFolio = getNextFolioNumber();
  const { folio, serie } = getFolioSeriesAndNumber(nextFolio);
  localStorage.setItem('ca_ultimo_folio', folio);

  const nuevaNota = {
    id: "N" + folio,
    folio: folio,
    serie: serie,
    tipo: "Financiero",
    sucursalId,
    clienteId,
    vendedorId,
    proveedorId,
    proveedor,
    factura,
    facturas,
    fechaEmision,
    fechaAplicacion,
    claveInterna,
    documentoFiscal,
    causaMarcar: document.querySelector('input[name="nfi-razon"]:checked')?.value || '',
    observaciones,
    descuentosEscalonados: [desc1, desc2, desc3],
    subtotal,
    total,
    importeDescuento: totalDescuento,
    autorizacionEspecial: requiereAutorizacion,
    motivoAutorizacion: requiereAutorizacion ? motivo : '',
    productos: [
      { codigo: "FINANCIERO", cantidad: 1, pv: "-", bodega: "-", descripcion: `Descuento financiero s/ facturas ${factura}. Prov: ${proveedor}`, causa: "Diferencia precio", unitario: totalDescuento, importe: totalDescuento }
    ],
    firmas: {
      elaboro: currentUser.id,
      almacen: null,
      autorizo: (currentUser.rol === 'Gerente' || currentUser.rol === 'Administrador') && !esPendiente ? currentUser.id : null,
      cliente: null
    },
    estado_autorizacion: isDraft ? 'Borrador' : (esPendiente ? 'Pendiente' : 'Autorizada'),
    estado_operacion: 'Activa'
  };

  // Restar de presupuesto si es oficial y NO está pendiente de aprobación (se resta al aprobarse)
  if (!isDraft && !esPendiente) {
    let pptoIdx = presupuestos.findIndex(p => matchSellerIdOrName(p.vendedorId, vendedorId) && p.mes === mes);
    if (pptoIdx !== -1) {
      presupuestos[pptoIdx].consumido = (parseFloat(presupuestos[pptoIdx].consumido) || 0) + totalDescuento;
    } else {
      presupuestos.push({
        vendedorId: vendedorId,
        mes: mes,
        limite: 0,
        consumido: totalDescuento,
        fechaLimite: '',
        bloquearExceso: false
      });
    }
    saveData('ca_presupuestos', presupuestos);
  }

  notas.push(nuevaNota);
  saveData('ca_notas', notas);
  pushToCloudStorage();

  if (isDraft) {
    alert("Borrador guardado.");
  } else if (esPendiente) {
    alert("Esta nota requiere autorización de la gerencia. Se ha enviado una solicitud remota.");
  } else {
    alert("Nota financiera emitida.");
  }
  
  if (currentUser.rol === 'Vendedor') {
    switchView('dashboard');
  } else {
    renderNotasFinancierasList();
  }
}

// --- 4. DETALLE DE NOTAS Y FIRMAS ---
window.viewNotaDetail = function(notaId) {
  const nota = notas.find(n => n.id === notaId);
  if (!nota) return;

  currentDetailNotaId = notaId;
  const isFisico = nota.tipo === 'Fisico';
  
  switchView('notas-detail');

  // Cargar datos
  document.getElementById('detail-title').innerHTML = `Nota de Crédito #${nota.folio}-${nota.serie} &nbsp; <span class="badge badge-${getNotaDisplayState(nota).toLowerCase()}">${getNotaDisplayState(nota)}</span>`;
  document.getElementById('det-folio').textContent = `${nota.folio} - ${nota.serie}`;
  document.getElementById('det-tipo').textContent = isFisico ? 'Físico (Producto/Logística)' : 'Financiero (Descuento)';
  
  const suc = sucursales.find(s => s.id === nota.sucursalId);
  document.getElementById('det-sucursal').textContent = suc ? suc.nombre : 'N/A';
  
  const cli = clientes.find(c => c.id === nota.clienteId);
  document.getElementById('det-cliente').textContent = cli ? `[${cli.codigoInterno}] ${cli.nombre}` : 'N/A';
  
  document.getElementById('det-factura').textContent = nota.factura;
  document.getElementById('det-fecha-emision').textContent = nota.fechaEmision;
  document.getElementById('det-fecha-aplicacion').textContent = nota.fechaAplicacion;
  
  const ven = vendedores.find(v => v.id === nota.vendedorId);
  document.getElementById('det-vendedor').textContent = ven ? ven.nombre : 'N/A';
  
  document.getElementById('det-ci').textContent = nota.claveInterna || 'N/A';

  const containerChofer = document.getElementById('det-container-chofer');
  const containerProv = document.getElementById('det-container-prov');
  const financialDetails = document.getElementById('det-financial-details');
  const containerFoto = document.getElementById('det-container-foto');

  if (isFisico) {
    containerChofer.classList.remove('hidden');
    containerProv.classList.add('hidden');
    financialDetails.classList.add('hidden');
    
    const ope = operadores.find(o => o.id === nota.operadorId);
    document.getElementById('det-chofer').textContent = ope ? `${ope.nombre} (${ope.puesto})` : 'N/A';

    if (nota.incidenciaFoto) {
      containerFoto.classList.remove('hidden');
      document.getElementById('det-foto').src = nota.incidenciaFoto;
    } else {
      containerFoto.classList.add('hidden');
    }
  } else {
    containerChofer.classList.add('hidden');
    containerProv.classList.remove('hidden');
    financialDetails.classList.remove('hidden');
    containerFoto.classList.add('hidden');

    document.getElementById('det-proveedor').textContent = nota.proveedor || 'N/A';
    document.getElementById('det-subtotal').textContent = (nota.subtotal || 0).toFixed(2);
    document.getElementById('det-desctos').textContent = nota.descuentosEscalonados ? nota.descuentosEscalonados.join('% + ') + '%' : 'N/A';
    document.getElementById('det-importe-descto').textContent = (nota.importeDescuento || 0).toFixed(2);

    const specialBadge = document.getElementById('det-special-badge');
    const specialMotive = document.getElementById('det-special-motive');
    if (nota.autorizacionEspecial) {
      specialBadge.classList.remove('hidden');
      specialMotive.classList.remove('hidden');
      specialMotive.textContent = `Motivo Excepción: "${nota.motivoAutorizacion}"`;
    } else {
      specialBadge.classList.add('hidden');
      specialMotive.classList.add('hidden');
    }
  }

  document.getElementById('det-razon-texto').textContent = CAUSAS_MAP[nota.causaMarcar] || 'No marcada / Varios';

  // Tabla conceptos
  const tbody = document.querySelector('#table-det-items tbody');
  tbody.innerHTML = '';
  (nota.productos || []).forEach(p => {
    const tr = document.createElement('tr');
    const hasIva = p.hasIva !== undefined ? p.hasIva : true;
    const hasIeps = p.hasIeps !== undefined ? p.hasIeps : false;
    const subRow = p.cantidad * p.unitario;
    const ivaVal = hasIva ? subRow * 0.16 : 0;
    const iepsVal = hasIeps ? subRow * 0.08 : 0;
    const computedImporte = subRow + ivaVal + iepsVal;

    tr.innerHTML = `
      <td>${p.codigo}</td>
      <td>${p.cantidad}</td>
      <td>${p.pv || '-'}</td>
      <td>${p.bodega || '-'}</td>
      <td>${p.descripcion}</td>
      <td>${p.causa || '-'}</td>
      <td style="text-align: right;">${formatCurrency(p.unitario)}</td>
      <td style="text-align: center;">${hasIva ? 'Sí' : 'No'}</td>
      <td style="text-align: center;">${hasIeps ? 'Sí' : 'No'}</td>
      <td style="text-align: right;"><strong>${formatCurrency(p.importe || computedImporte)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  const subRow = document.getElementById('det-subtotal-row');
  const ivaRow = document.getElementById('det-iva-row');
  const iepsRow = document.getElementById('det-ieps-row');
  const subVal = document.getElementById('det-subtotal-val');
  const ivaVal = document.getElementById('det-iva-val');
  const iepsVal = document.getElementById('det-ieps-val');

  if (isFisico) {
    if (subRow) subRow.classList.remove('hidden');
    if (ivaRow) ivaRow.classList.remove('hidden');
    if (iepsRow) iepsRow.classList.remove('hidden');
    if (subVal) subVal.textContent = (nota.subtotal || nota.total).toFixed(2);
    if (ivaVal) ivaVal.textContent = (nota.iva || 0).toFixed(2);
    if (iepsVal) iepsVal.textContent = (nota.ieps || 0).toFixed(2);
  } else {
    if (subRow) subRow.classList.add('hidden');
    if (ivaRow) ivaRow.classList.add('hidden');
    if (iepsRow) iepsRow.classList.add('hidden');
  }

  document.getElementById('det-total').textContent = nota.total.toFixed(2);

  const badgeEstado = document.getElementById('det-estado-badge');
  badgeEstado.className = `badge badge-${getNotaDisplayState(nota).toLowerCase()}`;
  badgeEstado.textContent = getNotaDisplayState(nota);

  const btnCancel = document.getElementById('btn-cancel-nota-action');
  if (currentUser.rol === 'Administrador' || currentUser.rol === 'Gerente') {
    btnCancel.classList.remove('hidden');
    if (getNotaDisplayState(nota) === 'Cancelada') {
      btnCancel.disabled = true;
      btnCancel.style.opacity = '0.5';
    } else {
      btnCancel.disabled = false;
      btnCancel.style.opacity = '1';
    }
  } else {
    btnCancel.classList.add('hidden');
  }
};

function getRequiredSignatures(nota) {
  if (nota.tipo === 'Fisico') {
    return [
      { key: 'elaboro', label: 'Elaboró', rol: 'Vendedor' },
      { key: 'almacen', label: 'Almacén', rol: 'Almacen' },
      { key: 'contabilidad', label: 'Contabilidad', rol: 'Contabilidad' },
      { key: 'autorizo', label: 'Gerente', rol: 'Gerente' }
    ];
  } else {
    // Las financieras requieren firma obligatoria del Gerente para validez
    return [
      { key: 'elaboro', label: 'Elaboró', rol: 'Vendedor' },
      { key: 'contabilidad', label: 'Contabilidad', rol: 'Contabilidad' },
      { key: 'autorizo', label: 'Gerente', rol: 'Gerente' }
    ];
  }
}

function updateDetailedSignaturesSection(nota) {
  const required = getRequiredSignatures(nota);
  const containerAlmacen = document.getElementById('sig-box-almacen');
  if (nota.tipo === 'Fisico') {
    containerAlmacen.classList.remove('hidden');
  } else {
    containerAlmacen.classList.add('hidden');
  }

  const statusElements = {
    elaboro: document.getElementById('sig-status-elaboro'),
    almacen: document.getElementById('sig-status-almacen'),
    contabilidad: document.getElementById('sig-status-contabilidad'),
    gerente: document.getElementById('sig-status-gerente')
  };

  const buttonElements = {
    elaboro: document.getElementById('btn-sig-elaboro'),
    almacen: document.getElementById('btn-sig-almacen'),
    contabilidad: document.getElementById('btn-sig-contabilidad'),
    gerente: document.getElementById('btn-sig-gerente')
  };

  Object.keys(statusElements).forEach(k => {
    statusElements[k].textContent = 'N/A';
    statusElements[k].className = 'signature-status';
    buttonElements[k].style.display = 'none';
  });

  required.forEach(req => {
    const sigUserVal = nota.firmas[req.key];
    const statusEl = statusElements[req.key === 'autorizo' ? 'gerente' : req.key === 'elaboro' ? 'elaboro' : req.key];
    const btnEl = buttonElements[req.key === 'autorizo' ? 'gerente' : req.key === 'elaboro' ? 'elaboro' : req.key];
    
    if (sigUserVal) {
      const u = usuarios.find(usr => usr.id === sigUserVal);
      statusEl.textContent = `✓ Firmado por: ${u ? u.nombre : 'Usuario'}`;
      statusEl.className = 'signature-status signed';
      btnEl.style.display = 'none';
    } else {
      statusEl.textContent = 'Pendiente';
      statusEl.className = 'signature-status';
      
      // Mostrar botón de firma si el rol coincide
      if (nota.estado !== 'Cancelada' && (currentUser.rol === req.rol || (req.key === 'elaboro' && currentUser.rol === 'Administrador') || (req.rol === 'Gerente' && currentUser.rol === 'Administrador'))) {
        btnEl.style.display = 'inline-block';
        btnEl.onclick = () => signNota(nota.id, req.key);
      }
    }
  });
}

function signNota(notaId, key) {
  const notaIdx = notas.findIndex(n => n.id === notaId);
  if (notaIdx === -1) return;
  
  notas[notaIdx].firmas[key] = currentUser.id;

  const required = getRequiredSignatures(notas[notaIdx]);
  const todasFirmadas = required.every(req => notas[notaIdx].firmas[req.key] !== null && notas[notaIdx].firmas[req.key] !== undefined);
  
  if (todasFirmadas) {
    notas[notaIdx].estado_autorizacion = 'Firmada';
  }

  saveData('ca_notas', notas);
  pushToCloudStorage();
  alert("Nota firmada digitalmente.");
  
  // Limpiar posible warning
  const wEl = document.getElementById('det-warning-validity');
  if (wEl) wEl.remove();

  viewNotaDetail(notaId);
  initDashboard();
}

document.getElementById('btn-detail-back').addEventListener('click', () => {
  const nota = notas.find(n => n.id === currentDetailNotaId);
  if (currentUser.rol === 'Vendedor') {
    switchView('dashboard');
  } else {
    if (nota && nota.tipo === 'Fisico') {
      switchView('notas-fisicas');
    } else {
      switchView('notas-financieras');
    }
  }
});

document.getElementById('btn-detail-print').addEventListener('click', () => {
  printNotaFormat(currentDetailNotaId);
});

document.getElementById('btn-cancel-nota-action').addEventListener('click', () => {
  if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente') {
    alert("Solo el Gerente y el Administrador General pueden cancelar notas de crédito.");
    return;
  }
  if (confirm("¿Estás seguro de que deseas cancelar esta nota de crédito? Esta acción liberará el presupuesto.")) {
    const idx = notas.findIndex(n => n.id === currentDetailNotaId);
    if (idx !== -1) {
      const nota = notas[idx];
      const { auth, oper } = getNotaStates(nota);
      
      if (nota.tipo === 'Financiero' && oper === 'Activa' && (auth === 'Autorizada' || auth === 'Emitida' || auth === 'Firmada')) {
        const mes = nota.fechaEmision.substring(0, 7);
        const pptoIdx = presupuestos.findIndex(p => p.vendedorId === nota.vendedorId && p.mes === mes);
        if (pptoIdx !== -1) {
          const currentCons = parseFloat(presupuestos[pptoIdx].consumido) || 0;
          const discountVal = parseFloat(nota.importeDescuento || nota.total) || 0;
          presupuestos[pptoIdx].consumido = Math.max(0, currentCons - discountVal);
          saveData('ca_presupuestos', presupuestos);
        }
      }

      notas[idx].estado_operacion = 'Cancelada';
      notas[idx].estado = 'Cancelada';
      saveData('ca_notas', notas);
      pushToCloudStorage();
      alert("Nota cancelada con éxito.");
      viewNotaDetail(currentDetailNotaId);
      initDashboard();
    }
  }
});

function refreshAllModuleDropdowns() {
  const activeSucs = sucursales.filter(s => !s.eliminada);
  const activeVends = vendedores.filter(v => {
    if (v.eliminado) return false;
    if (v.userId) {
      const u = usuarios.find(usr => usr.id === v.userId);
      if (u && u.bloqueado) return false;
    }
    return true;
  });
  const activeOpes = operadores.filter(o => !o.eliminado);
  const hoy = new Date().toISOString().split('T')[0];
  const activeProvs = proveedores.filter(p => !p.eliminado);

  // 1. Catálogo Vendedores
  fillSelect('cat-ven-sucursal', activeSucs, s => s.nombre);

  // 2. Usuarios
  fillSelect('usr-sucursal', activeSucs, s => s.nombre);

  // 3. Notas Físicas Form
  fillSelect('nf-sucursal', activeSucs, s => s.nombre);
  fillSelect('nf-vendedor', activeVends, v => v.nombre);
  fillSelect('nf-operador', activeOpes, o => `${o.nombre} - ${o.puesto}`);

  // 4. Notas Financieras Form
  const activeSucsFin = activeSucs.filter(s => s.activaFinanciera);
  fillSelect('nfi-sucursal', activeSucsFin, s => s.nombre);
  fillSelect('nfi-vendedor', activeVends, v => v.nombre);
  
  const provSelect = document.getElementById('nfi-proveedor');
  if (provSelect) {
    provSelect.innerHTML = '<option value="">-- Selecciona Proveedor --</option>';
    activeProvs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nombre;
      provSelect.appendChild(opt);
    });
  }

  // 5. Presupuestos Form
  let budgetVends = activeVends;
  if (currentUser && currentUser.rol === 'Gerente') {
    budgetVends = budgetVends.filter(v => v.sucursalId === currentUser.sucursalId);
  }
  fillSelect('budget-vendedor', budgetVends, v => v.nombre);

  // 6. Reportes y Estadísticas Filters
  fillSelect('rep-vendedor', activeVends, v => v.nombre, true);
  fillSelect('rep-sucursal', activeSucs, s => s.nombre, true);
  fillSelect('rep-cliente', clientes, c => `[${c.codigoInterno}] ${c.nombre}`, true);
  fillSelect('rep-proveedor', activeProvs, p => p.nombre, true);

  fillSelect('stats-vendedor', activeVends, v => v.nombre, true);
  fillSelect('stats-sucursal', activeSucs, s => s.nombre, true);
  fillSelect('stats-cliente', clientes, c => `[${c.codigoInterno}] ${c.nombre}`, true);
  fillSelect('stats-proveedor', activeProvs, p => p.nombre, true);

  // 7. Faltantes Picking Form & Filters
  fillSelect('pk-cliente', clientes, c => `[${c.codigoInterno}] ${c.nombre}`);
  fillSelect('pk-sucursal', activeSucs, s => s.nombre);
  fillSelect('filter-pk-cliente', clientes, c => `[${c.codigoInterno}] ${c.nombre}`, true);
}

// --- 5. VIEW: GESTIÓN DE PRESUPUESTOS ---
function setupPresupuestosView() {
  document.getElementById('budget-filter-month').addEventListener('change', () => {
    renderPresupuestosGrid();
  });

  document.getElementById('form-set-budget').addEventListener('submit', (e) => {
    e.preventDefault();
    const vendId = document.getElementById('budget-vendedor').value;
    const mes = document.getElementById('budget-month').value;
    const limite = parseFloat(document.getElementById('budget-limit').value) || 0;
    const fechaLimite = document.getElementById('budget-deadline').value;
    const bloquearExceso = document.getElementById('budget-block-excess').checked;

    const idx = presupuestos.findIndex(p => matchSellerIdOrName(p.vendedorId, vendId) && p.mes === mes);
    if (idx !== -1) {
      presupuestos[idx].limite = limite;
      presupuestos[idx].fechaLimite = fechaLimite;
      presupuestos[idx].bloquearExceso = bloquearExceso;
    } else {
      presupuestos.push({ vendedorId: vendId, mes, limite, consumido: 0, fechaLimite, bloquearExceso });
    }

    saveData('ca_presupuestos', presupuestos);
    alert("Presupuesto guardado correctamente.");
    renderPresupuestosGrid();
    initDashboard();
  });
}

function renderPresupuestosGrid() {
  const selectFilter = document.getElementById('budget-filter-month').value;
  const container = document.getElementById('container-budgets-grid');
  container.innerHTML = '';

  // Filtrar vendedores activos según el rol del usuario (Aislamiento unilateral por rol)
  let activeVendedores = vendedores.filter(v => !v.eliminado);

  if (currentUser && currentUser.rol === 'Vendedor') {
    // Un Vendedor SOLO puede visualizar su propio presupuesto individual
    const currentVend = activeVendedores.find(v => v.userId === currentUser.id || v.id === currentUser.id || v.nombre === currentUser.nombre || v.email === currentUser.email);
    if (currentVend) {
      activeVendedores = [currentVend];
    } else {
      activeVendedores = [];
    }
  } else if (currentUser && currentUser.rol === 'Gerente') {
    // Un Gerente SOLO visualiza los presupuestos de los vendedores de su sucursal
    activeVendedores = activeVendedores.filter(v => v.sucursalId === currentUser.sucursalId);
  }

  refreshAllModuleDropdowns();
  document.getElementById('budget-month').value = selectFilter;

  const pptoFiltrados = activeVendedores.map(v => {
    let p = presupuestos.find(pr => matchSellerIdOrName(pr.vendedorId, v.id) && pr.mes === selectFilter);
    if (!p) {
      const sellerPptos = presupuestos.filter(pr => matchSellerIdOrName(pr.vendedorId, v.id));
      if (sellerPptos.length > 0) p = sellerPptos[sellerPptos.length - 1];
    }
    const targetMes = p ? p.mes : selectFilter;
    const consumidoReal = getBudgetConsumedForSeller(v.id, targetMes);
    const consumidoTotal = Math.max(p ? (parseFloat(p.consumido) || 0) : 0, consumidoReal);
    return {
      vendedor: v,
      limite: p ? (parseFloat(p.limite) || 0) : 0,
      consumido: consumidoTotal,
      fechaLimite: p ? p.fechaLimite : selectFilter + "-28",
      bloquearExceso: p ? p.bloquearExceso : false
    };
  });

  pptoFiltrados.forEach(item => {
    const disp = Math.max(0, item.limite - item.consumido);
    const pct = item.limite > 0 ? (item.consumido / item.limite) * 100 : 0;
    
    let colorClass = '';
    if (pct >= 90) colorClass = 'danger';
    else if (pct >= 70) colorClass = 'warning';

    const uMatch = usuarios.find(u => u.id === item.vendedor.id || u.id_usuario === item.vendedor.id || u.nombre === item.vendedor.nombre || u.email === item.vendedor.email);
    const telVal = (uMatch && uMatch.telefono) ? uMatch.telefono : (item.vendedor.telefono || '');

    const div = document.createElement('div');
    div.className = 'budget-card';
    div.innerHTML = `
      <h3>${item.vendedor.nombre}</h3>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">
        Vendedor de Sucursal: ${sucursales.find(s => s.id === item.vendedor.sucursalId)?.nombre || 'N/A'}
      </p>
      
      <div style="display:flex; justify-content:space-between; margin-top:10px;">
        <span>Límite:</span> <strong>${formatCurrency(item.limite)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>Consumido:</span> <strong>${formatCurrency(item.consumido)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-color); padding-top:4px;">
        <span>Disponible:</span> <strong style="color:${disp > 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatCurrency(disp)}</strong>
      </div>

      <div class="budget-progress-bar">
        <div class="budget-progress-fill ${colorClass}" style="width: ${Math.min(pct, 100)}%"></div>
      </div>
      <div class="budget-text-summary" style="margin-bottom:8px;">
        <span>Progreso:</span> <span>${pct.toFixed(1)}%</span>
      </div>

      <div style="font-size:11px; color:var(--text-muted); display:flex; flex-direction:column; gap:2px; border-top:1px dashed var(--border-color); padding-top:6px; margin-top:6px;">
        <div><i class="fa-solid fa-calendar-xmark"></i> Vence: <strong>${item.fechaLimite}</strong></div>
        <div><i class="fa-solid fa-shield"></i> Exceso: <strong>${item.bloquearExceso ? 'Bloqueado' : 'Excepción Autorizada'}</strong></div>
      </div>
    `;
    container.appendChild(div);
  });
}

// --- 6. VIEW: SUCURSALES (PERSISTENCIA EN SQL SERVER) ---
function setupSucursalesView() {
  document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('suc-nombre').value.trim();
    const direccion = document.getElementById('suc-direccion').value.trim();
    const activaFinanciera = document.getElementById('suc-financiera').checked;

    const nuevoId = "S" + String(sucursales.length + 1).padStart(2, '0');
    const payload = { id: nuevoId, nombre, direccion, activaFinanciera };

    let apiWorked = false;
    try {
      const res = await fetch('/api/sucursales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        apiWorked = true;
        alert("Sucursal registrada exitosamente en SQL Server.");
        document.getElementById('form-sucursal').reset();
        await fetchAPIData();
      }
    } catch (err) {
      console.warn("API de sucursales no disponible:", err);
    }

    if (!apiWorked) {
      sucursales.push(payload);
      saveData('ca_sucursales', sucursales);
      alert("Sucursal registrada exitosamente (Almacenamiento Local).");
      document.getElementById('form-sucursal').reset();
      renderSucursalesTable();
      refreshAllModuleDropdowns();
    }
  });
}

function renderSucursalesTable() {
  const tbody = document.querySelector('#table-sucursales tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const canUserDelete = currentUser && (currentUser.rol === 'Administrador' || currentUser.rol === 'Gerente');

  sucursales.filter(s => !s.eliminada).forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.id}</td>
      <td><strong>${s.nombre}</strong></td>
      <td>${s.direccion}</td>
      <td><span class="badge ${s.activaFinanciera ? 'badge-signed' : 'badge-draft'}">${s.activaFinanciera ? 'Sí' : 'No'}</span></td>
      <td>
        ${canUserDelete ? `
        ${currentUser.rol === 'Administrador' ? `<button class="btn btn-secondary btn-sm" onclick="toggleSucursalFinanciera('${s.id}')">Cambiar Tipo</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="removeSucursal('${s.id}')"><i class="fa-solid fa-trash"></i></button>
        ` : '-'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleSucursalFinanciera = async function(id) {
  if (currentUser.rol !== 'Administrador') {
    alert("Solo el Administrador puede cambiar el tipo de sucursal.");
    return;
  }
  const s = sucursales.find(suc => suc.id === id);
  if (s) {
    s.activaFinanciera = !s.activaFinanciera;
    let apiWorked = false;
    try {
      const res = await fetch('/api/sucursales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        apiWorked = true;
        await fetchAPIData();
      }
    } catch (err) {
      console.warn('API /api/sucursales no disponible:', err);
    }

    if (!apiWorked) {
      saveData('ca_sucursales', sucursales);
      renderSucursalesTable();
      refreshAllModuleDropdowns();
    }
  }
};

window.removeSucursal = async function(id) {
  if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente') {
    alert("Solo el Administrador o el Gerente pueden eliminar sucursales.");
    return;
  }
  if (confirm("¿Estás seguro de eliminar esta sucursal?")) {
    let apiWorked = false;
    try {
      const res = await fetch(`/api/sucursales/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        apiWorked = true;
        alert("Sucursal eliminada correctamente de SQL Server.");
        await fetchAPIData();
      }
    } catch (err) {
      console.warn('API /api/sucursales DELETE no disponible:', err);
    }

    if (!apiWorked) {
      const idx = sucursales.findIndex(s => s.id === id);
      if (idx !== -1) {
        sucursales.splice(idx, 1);
        saveData('ca_sucursales', sucursales);
        alert("Sucursal eliminada correctamente.");
        renderSucursalesTable();
        refreshAllModuleDropdowns();
      }
    }
  }
};

// --- 7. VIEW: USUARIOS (PERSISTENCIA DIRECTA EN SQL SERVER) ---
function setupUsuariosView() {
  const selectRol = document.getElementById('usr-rol');
  const groupAdminTipo = document.getElementById('group-usr-admin-tipo');

  function updateAdminTipoVisibility() {
    if (groupAdminTipo) {
      if (selectRol && selectRol.value === 'Administrador') {
        groupAdminTipo.classList.remove('hidden');
      } else {
        groupAdminTipo.classList.add('hidden');
      }
    }
  }

  if (selectRol) {
    selectRol.addEventListener('change', updateAdminTipoVisibility);
    updateAdminTipoVisibility();
  }

  document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('usr-id').value;
    const nombre = document.getElementById('usr-nombre').value.trim();
    const email = document.getElementById('usr-email').value.trim();
    const rol = document.getElementById('usr-rol').value;
    const adminTipo = document.getElementById('usr-admin-tipo')?.value || 'Ambos';
    const sucursalId = document.getElementById('usr-sucursal').value;
    const direccion = document.getElementById('usr-direccion').value.trim();
    const telefono = document.getElementById('usr-telefono').value.trim();
    
    // NIP de acceso
    let nip = document.getElementById('usr-nip').value.trim();
    if (!nip) {
      nip = generateRandomNIP();
    }

    const payload = {
      id: idInput || undefined,
      nombre,
      email,
      rol,
      adminTipo,
      sucursalId,
      nip,
      direccion,
      telefono
    };

    let apiWorked = false;
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const ct = res.headers.get('content-type') || '';

      if (res.ok && ct.includes('application/json')) {
        apiWorked = true;
        alert(idInput ? "Usuario actualizado con éxito en SQL Server." : "Usuario registrado con éxito en SQL Server.");
        showEmailToast(
          email, 
          "Tu NIP de acceso - Casa Ayala", 
          `Hola ${nombre}, tu cuenta ha sido registrada.<br>Tu <strong>NIP de acceso de 4 dígitos</strong> es: <strong style="font-size:16px; color:#60a5fa; font-family:monospace;">${nip}</strong>`
        );
        await fetchAPIData();
      }
    } catch (err) {
      console.warn('API /api/usuarios no disponible:', err);
    }

    if (!apiWorked) {
      if (idInput) {
        const idx = usuarios.findIndex(u => (u.id === idInput || u.id_usuario === idInput));
        if (idx !== -1) {
          usuarios[idx] = { ...usuarios[idx], ...payload, id: idInput, id_usuario: idInput };
        }
      } else {
        const nuevoId = "U" + String(usuarios.length + 1).padStart(2, '0');
        usuarios.push({ ...payload, id: nuevoId, id_usuario: nuevoId, bloqueado: false });
      }
      saveData('ca_usuarios', usuarios);
      alert(idInput ? "Usuario actualizado con éxito (Almacenamiento Local)." : "Usuario registrado con éxito (Almacenamiento Local).");
      showEmailToast(
        email, 
        "Tu NIP de acceso - Casa Ayala", 
        `Hola ${nombre}, tu cuenta ha sido registrada.<br>Tu <strong>NIP de acceso de 4 dígitos</strong> es: <strong style="font-size:16px; color:#60a5fa; font-family:monospace;">${nip}</strong>`
      );
      populateLoginUserSelect();
      renderUsuariosTable();
    }

    resetUsuarioForm();
  });

  document.getElementById('btn-cancel-edit-usuario').addEventListener('click', () => {
    resetUsuarioForm();
  });
}

function resetUsuarioForm() {
  document.getElementById('form-usuario').reset();
  document.getElementById('usr-id').value = '';
  document.getElementById('usr-admin-tipo').value = 'Ambos';
  const groupAdminTipo = document.getElementById('group-usr-admin-tipo');
  if (groupAdminTipo) groupAdminTipo.classList.remove('hidden');

  document.getElementById('form-usuario-title').textContent = 'Registrar Nuevo Usuario';
  document.getElementById('btn-save-usuario').innerHTML = '<i class="fa-solid fa-plus"></i> Guardar Usuario';
  document.getElementById('btn-cancel-edit-usuario').classList.add('hidden');
}

window.editUsuario = function(id) {
  const u = usuarios.find(usr => usr.id === id || usr.id_usuario === id || usr.email === id);
  if (!u) return;
  
  document.getElementById('usr-id').value = u.id || u.id_usuario;
  document.getElementById('usr-nombre').value = u.nombre;
  document.getElementById('usr-email').value = u.email;
  document.getElementById('usr-rol').value = u.rol;
  if (document.getElementById('usr-admin-tipo')) {
    document.getElementById('usr-admin-tipo').value = u.adminTipo || 'Ambos';
    const groupAdminTipo = document.getElementById('group-usr-admin-tipo');
    if (groupAdminTipo) {
      if (u.rol === 'Administrador') groupAdminTipo.classList.remove('hidden');
      else groupAdminTipo.classList.add('hidden');
    }
  }
  document.getElementById('usr-sucursal').value = u.sucursalId || u.id_sucursal || '';
  document.getElementById('usr-nip').value = u.nip || '';
  document.getElementById('usr-direccion').value = u.direccion || '';
  document.getElementById('usr-telefono').value = u.telefono || '';
  
  document.getElementById('form-usuario-title').textContent = 'Editar Usuario: ' + u.nombre;
  document.getElementById('btn-save-usuario').innerHTML = '<i class="fa-solid fa-save"></i> Actualizar Usuario';
  document.getElementById('btn-cancel-edit-usuario').classList.remove('hidden');
};

function renderUsuariosTable() {
  const tbody = document.querySelector('#table-usuarios tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  fillSelect('usr-sucursal', sucursales, s => s.nombre);

  usuarios.forEach(u => {
    const suc = sucursales.find(s => s.id === u.sucursalId || s.id === u.id_sucursal);
    const tr = document.createElement('tr');
    
    const isCurrentUserAdmin = currentUser && currentUser.rol === 'Administrador';
    const nipDisplay = isCurrentUserAdmin ? `<strong style="font-family:monospace; color:#3b82f6;">${u.nip}</strong>` : '••••';
    
    const estadoBadge = u.bloqueado 
      ? '<span class="badge badge-cancelled"><i class="fa-solid fa-lock"></i> Bloqueado</span>' 
      : '<span class="badge badge-signed"><i class="fa-solid fa-lock-open"></i> Activo</span>';

    const userIdVal = u.id || u.id_usuario;
    let actionButtons = '';
    if (isCurrentUserAdmin) {
      actionButtons += `<button class="btn btn-secondary btn-sm" onclick="editUsuario('${userIdVal}')" style="margin-right:5px;"><i class="fa-solid fa-user-pen"></i> Editar</button>`;
      if (u.bloqueado) {
        actionButtons += `<button class="btn btn-success btn-sm" onclick="unlockUsuario('${userIdVal}')" style="margin-right:5px;"><i class="fa-solid fa-key"></i> Desbloquear</button>`;
      }
      actionButtons += `<button class="btn btn-secondary btn-sm" onclick="regenerateUserNip('${userIdVal}')" style="margin-right:5px;"><i class="fa-solid fa-rotate"></i> Nuevo NIP</button>`;
    }
    
    if (userIdVal !== activeUserId && isCurrentUserAdmin) {
      actionButtons += `<button class="btn btn-danger btn-sm" onclick="removeUsuario('${userIdVal}')"><i class="fa-solid fa-trash"></i></button>`;
    }

    const rolDisplay = u.rol === 'Administrador' ? `Administrador <small style="color:var(--text-muted);">(${u.adminTipo || 'Ambos'})</small>` : u.rol;

    tr.innerHTML = `
      <td><strong>${u.nombre}</strong></td>
      <td>${u.email}</td>
      <td><span style="color:#16a34a; font-weight:600;"><i class="fa-brands fa-whatsapp"></i> ${u.telefono || 'Sin registrar'}</span></td>
      <td>${rolDisplay}</td>
      <td>${suc ? suc.nombre : 'N/A'}</td>
      <td>${nipDisplay}</td>
      <td>${estadoBadge}</td>
      <td>${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.unlockUsuario = async function(id) {
  if (currentUser.rol !== 'Administrador') {
    alert("Solo el Administrador Universal puede desbloquear cuentas.");
    return;
  }
  const u = usuarios.find(usr => usr.id === id || usr.id_usuario === id || usr.email === id);
  if (u) {
    u.bloqueado = false;
    let apiWorked = false;
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...u, bloqueado: false })
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        apiWorked = true;
        alert(`La cuenta de ${u.nombre} ha sido desbloqueada.`);
        await fetchAPIData();
      }
    } catch (err) {
      console.warn('API /api/usuarios no disponible:', err);
    }

    if (!apiWorked) {
      saveData('ca_usuarios', usuarios);
      alert(`La cuenta de ${u.nombre} ha sido desbloqueada.`);
      populateLoginUserSelect();
      renderUsuariosTable();
    }
  }
};

window.regenerateUserNip = async function(id) {
  if (currentUser.rol !== 'Administrador') {
    alert("Solo el Administrador Universal puede generar nuevos NIPs.");
    return;
  }
  const u = usuarios.find(usr => usr.id === id || usr.id_usuario === id || usr.email === id);
  if (u) {
    const nuevoNip = generateRandomNIP();
    u.nip = nuevoNip;
    u.bloqueado = false;

    let apiWorked = false;
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...u, nip: nuevoNip, bloqueado: false })
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        apiWorked = true;
        alert(`NIP regenerado con éxito: ${nuevoNip}. Se envió un correo de alerta.`);
        showEmailToast(
          u.email, 
          "Tu NIP de acceso ha sido restablecido", 
          `Hola ${u.nombre}, tu NIP ha sido regenerado por el Administrador.<br>Tu nuevo <strong>NIP de acceso</strong> es: <strong style="font-size:16px; color:#60a5fa; font-family:monospace;">${nuevoNip}</strong>`
        );
        await fetchAPIData();
      }
    } catch (err) {
      console.warn('API /api/usuarios no disponible:', err);
    }

    if (!apiWorked) {
      saveData('ca_usuarios', usuarios);
      alert(`NIP regenerado con éxito: ${nuevoNip}. Se envió un correo de alerta.`);
      showEmailToast(
        u.email, 
        "Tu NIP de acceso ha sido restablecido", 
        `Hola ${u.nombre}, tu NIP ha sido regenerado por el Administrador.<br>Tu nuevo <strong>NIP de acceso</strong> es: <strong style="font-size:16px; color:#60a5fa; font-family:monospace;">${nuevoNip}</strong>`
      );
      populateLoginUserSelect();
      renderUsuariosTable();
    }
  }
};

window.removeUsuario = async function(id) {
  if (currentUser.rol !== 'Administrador') {
    alert("Solo el Administrador puede eliminar usuarios.");
    return;
  }
  if (confirm("¿Estás seguro de eliminar este usuario?")) {
    let apiWorked = false;
    try {
      const res = await fetch(`/api/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        apiWorked = true;
        alert("Usuario eliminado correctamente de la base de datos.");
        await fetchAPIData();
      }
    } catch (err) {
      console.warn('API /api/usuarios DELETE no disponible:', err);
    }

    if (!apiWorked) {
      const idx = usuarios.findIndex(usr => usr.id === id || usr.id_usuario === id);
      if (idx !== -1) {
        usuarios.splice(idx, 1);
        saveData('ca_usuarios', usuarios);
        alert("Usuario eliminado correctamente.");
        populateLoginUserSelect();
        renderUsuariosTable();
      }
    }
  }
};

// --- 8. VIEW: CATÁLOGOS GENERALES (CÓDIGO INTERNO) ---
function setupCatalogosView() {
  const tabs = ['clientes', 'operadores', 'vendedores', 'proveedores'];
  
  tabs.forEach(tab => {
    document.getElementById(`tab-cat-${tab}`).addEventListener('click', (e) => {
      tabs.forEach(t => {
        document.getElementById(`tab-cat-${t}`).classList.remove('active');
        document.getElementById(`panel-cat-${t}`).classList.add('hidden');
      });
      e.target.classList.add('active');
      document.getElementById(`panel-cat-${tab}`).classList.remove('hidden');
    });
  });

  document.getElementById('form-cat-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('cat-cli-nombre').value.trim();
    const codigoInterno = document.getElementById('cat-cli-rfc').value.trim();
    const tieneDerechoDescuento = document.getElementById('cat-cli-descto').checked;

    const nuevoId = "C" + String(clientes.length + 1).padStart(2, '0');
    const newClient = { id: nuevoId, nombre, codigoInterno, tieneDerechoDescuento, eliminado: false };
    clientes.push(newClient);
    saveData('ca_clientes', clientes);
    pushToCloudStorage();

    // Guardar en SQL Server via túnel Cloudflare (fuente real)
    pushToSQLServer('clientes', newClient);

    try {
      await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient)
      });
    } catch (err) {}
    
    alert("Cliente registrado.");
    document.getElementById('form-cat-cliente').reset();
    renderCatalogosTables();
  });

  document.getElementById('form-cat-operador').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('cat-ope-nombre').value.trim();
    const puesto = document.getElementById('cat-ope-puesto').value.trim();

    const nuevoId = "O" + String(operadores.length + 1).padStart(2, '0');
    const newOperador = { id: nuevoId, nombre, puesto, eliminado: false };
    operadores.push(newOperador);
    saveData('ca_operadores', operadores);
    pushToCloudStorage();

    try {
      await fetch('/api/operadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOperador)
      });
    } catch (err) {}

    alert("Operador registrado.");
    document.getElementById('form-cat-operador').reset();
    renderCatalogosTables();
  });

  document.getElementById('form-cat-vendedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('cat-ven-nombre').value.trim();
    const sucursalId = document.getElementById('cat-ven-sucursal').value;

    const nuevoId = "V" + String(vendedores.length + 1).padStart(2, '0');
    const newVend = { id: nuevoId, nombre, sucursalId, userId: null, eliminado: false };
    vendedores.push(newVend);
    saveData('ca_vendedores', vendedores);
    pushToCloudStorage();

    try {
      await fetch('/api/vendedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVend)
      });
    } catch (err) {}

    alert("Vendedor registrado.");
    document.getElementById('form-cat-vendedor').reset();
    renderCatalogosTables();
  });

  // Manejo de formulario de Proveedor
  document.getElementById('form-cat-proveedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('cat-prov-id').value;
    const nombre = document.getElementById('cat-prov-nombre').value.trim();
    const desc1 = parseFloat(document.getElementById('cat-prov-desc1').value) || 0;
    const desc2 = parseFloat(document.getElementById('cat-prov-desc2').value) || 0;
    const desc3 = parseFloat(document.getElementById('cat-prov-desc3').value) || 0;
    const tipoPromo = document.getElementById('cat-prov-tipo-promo').value;
    const fechaInicio = document.getElementById('cat-prov-inicio').value;
    const fechaFin = document.getElementById('cat-prov-fin').value;

    const clientesCajon = [];
    document.querySelectorAll('.cat-prov-cli-cb:checked').forEach(cb => {
      clientesCajon.push(cb.value);
    });

    let provObj = null;
    if (idInput) {
      const idx = proveedores.findIndex(p => p.id === idInput);
      if (idx !== -1) {
        proveedores[idx] = { ...proveedores[idx], nombre, desc1, desc2, desc3, clientesCajon, fechaInicio, fechaFin, tipoPromo };
        provObj = proveedores[idx];
        alert("Proveedor actualizado.");
      }
    } else {
      const nuevoId = "P" + String(proveedores.length + 1).padStart(2, '0');
      provObj = { id: nuevoId, nombre, desc1, desc2, desc3, clientesCajon, fechaInicio, fechaFin, tipoPromo, eliminado: false };
      proveedores.push(provObj);
      alert("Proveedor registrado.");
    }

    saveData('ca_proveedores', proveedores);
    pushToCloudStorage();

    if (provObj) {
      try {
        await fetch('/api/proveedores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(provObj)
        });
      } catch (err) {}
    }

    resetProveedorForm();
    renderCatalogosTables();
  });

  document.getElementById('btn-cancel-edit-proveedor').addEventListener('click', () => {
    resetProveedorForm();
  });
}

function resetProveedorForm() {
  document.getElementById('form-cat-proveedor').reset();
  document.getElementById('cat-prov-id').value = '';
  document.getElementById('cat-prov-tipo-promo').value = 'clientes_exclusivos';
  document.getElementById('form-cat-proveedor-title').textContent = 'Registrar Proveedor';
  document.getElementById('btn-save-proveedor').textContent = 'Guardar Proveedor';
  document.getElementById('btn-cancel-edit-proveedor').classList.add('hidden');
  document.querySelectorAll('.cat-prov-cli-cb').forEach(cb => cb.checked = false);
}

window.editProveedor = function(id) {
  const p = proveedores.find(prov => prov.id === id);
  if (!p) return;
  
  document.getElementById('cat-prov-id').value = p.id;
  document.getElementById('cat-prov-nombre').value = p.nombre;
  document.getElementById('cat-prov-desc1').value = p.desc1;
  document.getElementById('cat-prov-desc2').value = p.desc2;
  document.getElementById('cat-prov-desc3').value = p.desc3;
  document.getElementById('cat-prov-tipo-promo').value = p.tipoPromo || 'clientes_exclusivos';
  document.getElementById('cat-prov-inicio').value = p.fechaInicio;
  document.getElementById('cat-prov-fin').value = p.fechaFin;
  
  document.querySelectorAll('.cat-prov-cli-cb').forEach(cb => {
    cb.checked = p.clientesCajon.includes(cb.value);
  });
  
  document.getElementById('form-cat-proveedor-title').textContent = 'Editar Proveedor: ' + p.nombre;
  document.getElementById('btn-save-proveedor').textContent = 'Actualizar Proveedor';
  document.getElementById('btn-cancel-edit-proveedor').classList.remove('hidden');
};

window.removeProveedor = function(id) {
  if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente') {
    alert("Solo el Administrador o el Gerente pueden eliminar proveedores.");
    return;
  }
  if (confirm("¿Estás seguro de eliminar este proveedor?")) {
    const idx = proveedores.findIndex(p => p.id === id);
    if (idx !== -1) {
      proveedores[idx].eliminado = true;
      saveData('ca_proveedores', proveedores);
      renderCatalogosTables();
    }
  }
};

function renderCatalogosTables() {
  refreshAllModuleDropdowns();

  const canUserDelete = currentUser && (currentUser.rol === 'Administrador' || currentUser.rol === 'Gerente');

  const tbodyCli = document.querySelector('#table-cat-clientes tbody');
  if (tbodyCli) {
    tbodyCli.innerHTML = '';
    clientes.filter(c => !c.eliminado).forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.nombre}</strong></td>
        <td><strong style="color:var(--accent-hover);">${c.codigoInterno}</strong></td>
        <td><span class="badge ${c.tieneDerechoDescuento ? 'badge-signed' : 'badge-draft'}">${c.tieneDerechoDescuento ? 'Sí' : 'No'}</span></td>
        <td>${canUserDelete ? `<button class="btn btn-danger btn-sm" onclick="removeCliente('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : '-'}</td>
      `;
      tbodyCli.appendChild(tr);
    });
  }

  const tbodyOpe = document.querySelector('#table-cat-operadores tbody');
  if (tbodyOpe) {
    tbodyOpe.innerHTML = '';
    operadores.filter(o => !o.eliminado).forEach(o => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${o.nombre}</strong></td>
        <td>${o.puesto}</td>
        <td>${canUserDelete ? `<button class="btn btn-danger btn-sm" onclick="removeOperador('${o.id}')"><i class="fa-solid fa-trash"></i></button>` : '-'}</td>
      `;
      tbodyOpe.appendChild(tr);
    });
  }

  const tbodyVen = document.querySelector('#table-cat-vendedores tbody');
  if (tbodyVen) {
    tbodyVen.innerHTML = '';
    vendedores.filter(v => !v.eliminado).forEach(v => {
      const suc = sucursales.find(s => s.id === v.sucursalId);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${v.nombre}</strong></td>
        <td>${suc ? suc.nombre : 'N/A'}</td>
        <td>${canUserDelete ? `<button class="btn btn-danger btn-sm" onclick="removeVendedor('${v.id}')"><i class="fa-solid fa-trash"></i></button>` : '-'}</td>
      `;
      tbodyVen.appendChild(tr);
    });
  }

  // Checklist de clientes en formulario proveedor
  const listDiv = document.getElementById('cat-prov-clientes-list');
  if (listDiv) {
    listDiv.innerHTML = '';
    clientes.filter(c => !c.eliminado).forEach(c => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '6px';
      div.style.marginBottom = '4px';
      div.innerHTML = `<input type="checkbox" value="${c.id}" class="cat-prov-cli-cb" id="cat-prov-cli-${c.id}"> <label for="cat-prov-cli-${c.id}" style="text-transform:none; font-weight:normal; cursor:pointer;">${c.nombre}</label>`;
      listDiv.appendChild(div);
    });
  }

  // Tabla Proveedores
  const tbodyProv = document.querySelector('#table-cat-proveedores tbody');
  if (tbodyProv) {
    tbodyProv.innerHTML = '';
    proveedores.filter(p => !p.eliminado).forEach(p => {
      const listNames = p.clientesCajon.map(cId => {
        const c = clientes.find(cli => cli.id === cId);
        return c ? c.nombre.split(' ')[0] : 'Desconocido';
      }).join(', ');
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${p.nombre}</strong></td>
        <td>${p.desc1}% + ${p.desc2}% + ${p.desc3}%</td>
        <td>${p.fechaInicio} a ${p.fechaFin}</td>
        <td style="font-size:11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${listNames}">${listNames || 'Ninguno'}</td>
        <td>
          ${canUserDelete ? `
          <button class="btn btn-secondary btn-sm" onclick="editProveedor('${p.id}')"><i class="fa-solid fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="removeProveedor('${p.id}')"><i class="fa-solid fa-trash"></i></button>
          ` : '-'}
        </td>
      `;
      tbodyProv.appendChild(tr);
    });
  }
}

window.removeCliente = async function(id) {
  if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente') {
    alert("Solo el Administrador o el Gerente pueden eliminar clientes.");
    return;
  }
  if (confirm("¿Estás seguro de eliminar este cliente?")) {
    const idx = clientes.findIndex(c => c.id === id);
    if (idx !== -1) {
      clientes[idx].eliminado = true;
      saveData('ca_clientes', clientes);
      pushToCloudStorage();
      try {
        await fetch('/api/clientes/' + encodeURIComponent(id), { method: 'DELETE' });
      } catch (e) {}
      renderCatalogosTables();
    }
  }
};

window.removeOperador = async function(id) {
  if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente') {
    alert("Solo el Administrador o el Gerente pueden eliminar operadores.");
    return;
  }
  if (confirm("¿Estás seguro de eliminar este operador?")) {
    const idx = operadores.findIndex(o => o.id === id);
    if (idx !== -1) {
      operadores[idx].eliminado = true;
      saveData('ca_operadores', operadores);
      pushToCloudStorage();
      try { await fetch('/api/operadores/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {}
      renderCatalogosTables();
    }
  }
};

window.removeVendedor = async function(id) {
  if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente') {
    alert("Solo el Administrador o el Gerente pueden eliminar vendedores.");
    return;
  }
  if (confirm("¿Estás seguro de eliminar este vendedor?")) {
    const idx = vendedores.findIndex(v => v.id === id);
    if (idx !== -1) {
      vendedores[idx].eliminado = true;
      saveData('ca_vendedores', vendedores);
      pushToCloudStorage();
      try { await fetch('/api/vendedores/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {}
      renderCatalogosTables();
    }
  }
};

window.removeProveedor = async function(id) {
  if (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente') {
    alert("Solo el Administrador o el Gerente pueden eliminar proveedores.");
    return;
  }
  if (confirm("¿Estás seguro de eliminar este proveedor?")) {
    const idx = proveedores.findIndex(p => p.id === id);
    if (idx !== -1) {
      proveedores[idx].eliminado = true;
      saveData('ca_proveedores', proveedores);
      pushToCloudStorage();
      try { await fetch('/api/proveedores/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {}
      renderCatalogosTables();
    }
  }
};

window.clearCatalogosData = function() {
  if (!currentUser || (currentUser.rol !== 'Administrador' && currentUser.rol !== 'Gerente')) {
    alert("Solo el Administrador o el Gerente pueden limpiar los catálogos.");
    return;
  }
  
  if (confirm("¿Estás seguro de borrar los catálogos de prueba? Esta acción limpiará los registros para que queden únicamente los que tú des de alta desde cero.\n\n(Se conservará tu usuario Administrador actual para no perder el acceso al sistema).")) {
    usuarios = usuarios.filter(u => u.id === activeUserId || u.rol === 'Administrador');
    clientes = [];
    operadores = [];
    vendedores = [];
    proveedores = [];

    saveData('ca_clientes', clientes);
    saveData('ca_operadores', operadores);
    saveData('ca_vendedores', vendedores);
    saveData('ca_proveedores', proveedores);

    alert("Catálogos limpiados con éxito. Ahora puedes dar de alta únicamente los registros reales de tu empresa.");
    renderCatalogosTables();
    renderUsuariosTable();
    refreshAllModuleDropdowns();
  }
};

// --- 9. VIEW: REPORTES ---
function setupReportesView() {
  fillSelect('rep-vendedor', vendedores, v => v.nombre, true);
  fillSelect('rep-sucursal', sucursales, s => s.nombre, true);
  fillSelect('rep-cliente', clientes, c => `[${c.codigoInterno}] ${c.nombre}`, true);
  fillSelect('rep-proveedor', proveedores, p => p.nombre, true);

  fillSelect('stats-vendedor', vendedores, v => v.nombre, true);
  fillSelect('stats-sucursal', sucursales, s => s.nombre, true);
  fillSelect('stats-cliente', clientes, c => `[${c.codigoInterno}] ${c.nombre}`, true);
  fillSelect('stats-proveedor', proveedores, p => p.nombre, true);

  // Sincronización bi-direccional de los 7 filtros entre buscador general y estadísticas
  const syncPairs = [
    ['rep-vendedor', 'stats-vendedor'],
    ['rep-sucursal', 'stats-sucursal'],
    ['rep-cliente', 'stats-cliente'],
    ['rep-proveedor', 'stats-proveedor'],
    ['rep-tipo-nota', 'stats-tipo-nota'],
    ['rep-fecha-inicio', 'stats-fecha-inicio'],
    ['rep-fecha-fin', 'stats-fecha-fin']
  ];

  syncPairs.forEach(([id1, id2]) => {
    const el1 = document.getElementById(id1);
    const el2 = document.getElementById(id2);
    if (el1 && el2) {
      const syncValues = (from, to) => {
        if (to.value !== from.value) {
          to.value = from.value;
        }
        generateReport();
        calculateAndRenderStatistics();
      };
      el1.addEventListener('change', () => syncValues(el1, el2));
      el1.addEventListener('input', () => syncValues(el1, el2));
      el2.addEventListener('change', () => syncValues(el2, el1));
      el2.addEventListener('input', () => syncValues(el2, el1));
    }
  });

  const adminAndGerentes = usuarios.filter(u => u.email && (u.rol === 'Administrador' || u.rol === 'Gerente' || u.rol === 'Contabilidad'));
  if (adminAndGerentes.length > 0) {
    fillSelect('rep-email-target', adminAndGerentes, u => `${u.nombre} (${u.rol}) - ${u.email}`, false);
  }

  // Pestañas
  const tabGeneral = document.getElementById('tab-rep-general');
  const tabStats = document.getElementById('tab-rep-statistics');
  const panelGeneral = document.getElementById('panel-rep-general');
  const panelStats = document.getElementById('panel-rep-statistics');

  if (tabGeneral && tabStats && panelGeneral && panelStats) {
    tabGeneral.addEventListener('click', (e) => {
      e.preventDefault();
      tabGeneral.style.borderBottom = '3px solid var(--accent-color)';
      tabGeneral.style.color = 'var(--primary-color)';
      tabGeneral.style.fontWeight = '700';

      tabStats.style.borderBottom = 'none';
      tabStats.style.color = 'var(--text-muted)';
      tabStats.style.fontWeight = '600';

      panelGeneral.classList.remove('hidden');
      panelStats.classList.add('hidden');
      generateReport();
    });

    tabStats.addEventListener('click', (e) => {
      e.preventDefault();
      tabStats.style.borderBottom = '3px solid var(--accent-color)';
      tabStats.style.color = 'var(--primary-color)';
      tabStats.style.fontWeight = '700';

      tabGeneral.style.borderBottom = 'none';
      tabGeneral.style.color = 'var(--text-muted)';
      tabGeneral.style.fontWeight = '600';

      panelGeneral.classList.add('hidden');
      panelStats.classList.remove('hidden');

      calculateAndRenderStatistics();
    });
  }

  document.getElementById('btn-generate-report')?.addEventListener('click', () => {
    generateReport();
  });

  document.getElementById('btn-print-report')?.addEventListener('click', () => {
    printReportResults();
  });

  const btnEmailReport = document.getElementById('btn-send-email-report');
  if (btnEmailReport) {
    btnEmailReport.addEventListener('click', (e) => {
      e.preventDefault();
      sendEmailReport();
    });
  }

  const btnCalcStats = document.getElementById('btn-calculate-stats');
  if (btnCalcStats) {
    btnCalcStats.addEventListener('click', () => {
      calculateAndRenderStatistics();
    });
  }

  // Asignar listeners directos a todos los inputs por si alguno no está sincronizado
  const allFilterIds = [
    'rep-tipo-nota', 'rep-proveedor', 'rep-vendedor', 'rep-sucursal', 'rep-cliente', 'rep-fecha-inicio', 'rep-fecha-fin',
    'stats-tipo-nota', 'stats-proveedor', 'stats-vendedor', 'stats-sucursal', 'stats-cliente', 'stats-fecha-inicio', 'stats-fecha-fin'
  ];
  allFilterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        generateReport();
        calculateAndRenderStatistics();
      });
      el.addEventListener('input', () => {
        generateReport();
        calculateAndRenderStatistics();
      });
    }
  });

  // Ejecutar render inicial completo de ambas vistas
  generateReport();
  calculateAndRenderStatistics();
}

// --- FUNCIONES GLOBALIZADAS: EXPORTACIÓN A EXCEL / CSV Y RECORDATORIOS WHATSAPP ---
window.exportReportToCSV = function() {
  window.exportStatisticsToCSV();
};

window.exportStatisticsToCSV = function() {
  const fInicio = document.getElementById('stats-fecha-inicio')?.value || document.getElementById('rep-fecha-inicio')?.value || '';
  const fFin = document.getElementById('stats-fecha-fin')?.value || document.getElementById('rep-fecha-fin')?.value || '';
  const vSelId = document.getElementById('stats-vendedor')?.value || document.getElementById('rep-vendedor')?.value || '';
  const sSelId = document.getElementById('stats-sucursal')?.value || document.getElementById('rep-sucursal')?.value || '';
  const cSelId = document.getElementById('stats-cliente')?.value || document.getElementById('rep-cliente')?.value || '';
  const pSelId = document.getElementById('stats-proveedor')?.value || document.getElementById('rep-proveedor')?.value || '';
  const tSelVal = document.getElementById('stats-tipo-nota')?.value || document.getElementById('rep-tipo-nota')?.value || '';

  const vObj = vendedores.find(v => v.id === vSelId);
  const sObj = sucursales.find(s => s.id === sSelId);
  const cObj = clientes.find(c => c.id === cSelId);
  const pObj = proveedores.find(p => p.id === pSelId);

  const filtroVendedorText = vObj ? vObj.nombre : 'Todos los Vendedores';
  const filtroSucursalText = sObj ? sObj.nombre : 'Todas las Sucursales';
  const filtroClienteText = cObj ? `[${cObj.codigoInterno}] ${cObj.nombre}` : 'Todos los Clientes';
  const filtroProveedorText = pObj ? pObj.nombre : 'Todos los Proveedores';
  const filtroTipoText = tSelVal === 'Fisico' ? 'Notas Físicas' : (tSelVal === 'Financiero' ? 'Notas Financieras' : 'Todos los Tipos');
  const filtroPeriodoText = (fInicio || fFin) ? `${fInicio || 'Inicio'} al ${fFin || 'Hoy'}` : 'Período Completo Vigente';

  // 1. Filtrar notas físicas
  let fisicas = [];
  if (!tSelVal || tSelVal === 'Fisico') {
    fisicas = notas.filter(n => n.tipo === 'Fisico' && getNotaDisplayState(n) !== 'Cancelada' && getNotaDisplayState(n) !== 'Borrador');
    if (fInicio || fFin) fisicas = fisicas.filter(n => isNoteDateMatch(n, fInicio, fFin));
    if (vSelId) fisicas = fisicas.filter(n => isNoteVendorMatch(n, vSelId));
    if (sSelId) fisicas = fisicas.filter(n => isNoteSucursalMatch(n, sSelId));
    if (cSelId) fisicas = fisicas.filter(n => isNoteClienteMatch(n, cSelId));
    if (pSelId) fisicas = fisicas.filter(n => isNoteProveedorMatch(n, pSelId));
  }

  // 2. Filtrar notas financieras
  let financieras = [];
  if (!tSelVal || tSelVal === 'Financiero') {
    financieras = notas.filter(n => n.tipo === 'Financiero' && getNotaDisplayState(n) !== 'Cancelada' && getNotaDisplayState(n) !== 'Borrador');
    if (fInicio || fFin) financieras = financieras.filter(n => isNoteDateMatch(n, fInicio, fFin));
    if (vSelId) financieras = financieras.filter(n => isNoteVendorMatch(n, vSelId));
    if (sSelId) financieras = financieras.filter(n => isNoteSucursalMatch(n, sSelId));
    if (cSelId) financieras = financieras.filter(n => isNoteClienteMatch(n, cSelId));
    if (pSelId) financieras = financieras.filter(n => isNoteProveedorMatch(n, pSelId));
  }

  const totalNotasFisicas = fisicas.length;
  const totalVolumenFisico = fisicas.reduce((sum, n) => {
    return sum + (n.productos ? n.productos.reduce((s, p) => s + (parseFloat(p.cantidad) || 0), 0) : 0);
  }, 0);
  const totalMontoFisico = fisicas.reduce((sum, n) => sum + (parseFloat(n.total) || 0), 0);

  const totalNotasFinancieras = financieras.length;
  const totalMontoFinanciero = financieras.reduce((sum, n) => sum + (parseFloat(n.total || n.importeDescuento) || 0), 0);
  const totalMontoCombinado = totalMontoFisico + totalMontoFinanciero;

  // Productos más devueltos
  const prodMap = {};
  const historyRows = [];
  fisicas.forEach(n => {
    const cli = clientes.find(c => c.id === n.clienteId);
    const cliNombre = cli ? cli.nombre : (n.clienteNombre || 'Cliente General');
    const ven = vendedores.find(v => v.id === n.vendedorId);
    const venNombre = ven ? ven.nombre : (n.vendedorNombre || 'Vendedor');

    if (n.productos && n.productos.length > 0) {
      n.productos.forEach(p => {
        const code = p.codigo || 'N/A';
        const desc = p.descripcion || 'Sin descripción';
        const rowTotal = (parseFloat(p.cantidad) || 0) * (parseFloat(p.unitario) || 0);

        if (!prodMap[code]) {
          prodMap[code] = { codigo: code, descripcion: desc, count: 0, cantidad: 0, total: 0 };
        }
        prodMap[code].count++;
        prodMap[code].cantidad += (parseFloat(p.cantidad) || 0);
        prodMap[code].total += rowTotal;

        historyRows.push({
          folio: `${n.folio}-${n.serie}`,
          fecha: n.fechaEmision ? String(n.fechaEmision).substring(0, 10) : '',
          cliente: cliNombre,
          vendedor: venNombre,
          codigo: code,
          descripcion: desc,
          cantidad: p.cantidad || 0,
          causa: p.causa || 'N/A',
          unitario: p.unitario || 0,
          total: rowTotal
        });
      });
    }
  });

  const topProducts = Object.values(prodMap).sort((a, b) => b.total - a.total);

  // Vendedores en el filtro
  let vendsList = vendedores.filter(v => !v.eliminado);
  if (currentUser && currentUser.rol === 'Gerente') {
    vendsList = vendsList.filter(v => v.sucursalId === currentUser.sucursalId);
  }
  if (vSelId) {
    vendsList = vendsList.filter(v => v.id === vSelId);
  }

  const currentMes = fInicio ? fInicio.substring(0, 7) : new Date().toISOString().substring(0, 7);
  const vendsBreakdown = vendsList.map(v => {
    const suc = sucursales.find(s => s.id === v.sucursalId);
    let ppto = presupuestos.find(p => matchSellerIdOrName(p.vendedorId, v.id) && p.mes === currentMes);
    if (!ppto) {
      const sellerPptos = presupuestos.filter(p => matchSellerIdOrName(p.vendedorId, v.id));
      if (sellerPptos.length > 0) ppto = sellerPptos[sellerPptos.length - 1];
    }
    const limite = ppto ? (parseFloat(ppto.limite) || 0) : 0;
    
    const vendorFisicas = fisicas.filter(n => isNoteVendorMatch(n, v.id));
    const countFis = vendorFisicas.length;
    const montoFis = vendorFisicas.reduce((s, n) => s + (parseFloat(n.total) || 0), 0);

    const vendorFinancieras = financieras.filter(n => isNoteVendorMatch(n, v.id));
    const countFin = vendorFinancieras.length;
    const consFinReal = vendorFinancieras.reduce((s, n) => s + (parseFloat(n.total || n.importeDescuento) || 0), 0);
    const consFin = Math.max(ppto ? (parseFloat(ppto.consumido) || 0) : 0, consFinReal);
    const disponible = Math.max(0, limite - consFin);
    const pct = limite > 0 ? (consFin / limite) * 100 : 0;

    return {
      vendedor: v.nombre,
      sucursal: suc ? suc.nombre : 'N/A',
      countFis,
      montoFis,
      countFin,
      consFin,
      limite,
      disponible,
      pct
    };
  });

  // Rankings: Clientes y Vendedores
  const clientMap = {};
  const sellerMap = {};
  fisicas.forEach(n => {
    const cli = clientes.find(c => c.id === n.clienteId);
    const cliNombre = cli ? cli.nombre : (n.clienteNombre || 'Cliente General');
    const ven = vendedores.find(v => v.id === n.vendedorId);
    const venNombre = ven ? ven.nombre : (n.vendedorNombre || 'Vendedor');

    if (!clientMap[n.clienteId || cliNombre]) {
      clientMap[n.clienteId || cliNombre] = { nombre: cliNombre, count: 0, total: 0 };
    }
    clientMap[n.clienteId || cliNombre].count++;
    clientMap[n.clienteId || cliNombre].total += (parseFloat(n.total) || 0);

    if (!sellerMap[n.vendedorId || venNombre]) {
      sellerMap[n.vendedorId || venNombre] = { nombre: venNombre, count: 0, total: 0 };
    }
    sellerMap[n.vendedorId || venNombre].count++;
    sellerMap[n.vendedorId || venNombre].total += (parseFloat(n.total) || 0);
  });

  const topClients = Object.values(clientMap).sort((a, b) => b.total - a.total);
  const topSellers = Object.values(sellerMap).sort((a, b) => b.total - a.total);

  // UTF-8 BOM
  let csvContent = "\uFEFF";
  csvContent += "CASA AYALA DEL NOROESTE S.A. DE C.V.\n";
  csvContent += "REPORTE UNIFICADO DE NOTAS DE CRÉDITO Y RANKING DE ESTADÍSTICAS\n";
  csvContent += `Filtros Aplicados: Periodo: ${filtroPeriodoText} | Tipo: ${filtroTipoText} | Vendedor: ${filtroVendedorText} | Sucursal: ${filtroSucursalText} | Cliente: ${filtroClienteText} | Proveedor: ${filtroProveedorText}\n`;
  csvContent += `Fecha de Descarga: ${new Date().toLocaleString('es-MX')}\n\n`;

  csvContent += "=== RESUMEN GLOBAL DEL EJERCICIO ===\n";
  csvContent += "Concepto,Cantidad / Notas,Volumen Piezas,Monto Total ($ MXN)\n";
  csvContent += `"Notas Credito Fisicas (Devolucion Mercancia)",${totalNotasFisicas},${totalVolumenFisico},${totalMontoFisico.toFixed(2)}\n`;
  csvContent += `"Notas Credito Financieras (Descuentos)",${totalNotasFinancieras},N/A,${totalMontoFinanciero.toFixed(2)}\n`;
  csvContent += `"TOTAL COMBINADO DEL EJERCICIO",${totalNotasFisicas + totalNotasFinancieras},N/A,${totalMontoCombinado.toFixed(2)}\n\n`;

  csvContent += "=== 1. RANKING DE PRODUCTOS MAS DEVUELTOS ===\n";
  csvContent += "Codigo Producto,Descripcion,Incidencias Devolucion,Volumen Devuelto,Monto Total ($ MXN)\n";
  topProducts.forEach(p => {
    csvContent += `"${p.codigo}","${p.descripcion.replace(/"/g, '""')}",${p.count},${p.cantidad},${p.total.toFixed(2)}\n`;
  });
  csvContent += "\n";

  csvContent += "=== 2. RANKING DE CLIENTES QUE MAS DEVUELVEN ===\n";
  csvContent += "Cliente,Notas Devolucion,Monto Total ($ MXN)\n";
  topClients.forEach(c => {
    csvContent += `"${c.nombre.replace(/"/g, '""')}",${c.count},${c.total.toFixed(2)}\n`;
  });
  csvContent += "\n";

  csvContent += "=== 3. RANKING DE VENDEDORES CON MAS INCIDENCIAS ===\n";
  csvContent += "Vendedor,Notas Incidencia,Monto Total ($ MXN)\n";
  topSellers.forEach(s => {
    csvContent += `"${s.nombre.replace(/"/g, '""')}",${s.count},${s.total.toFixed(2)}\n`;
  });
  csvContent += "\n";

  csvContent += "=== 4. DESGLOSE INDIVIDUAL POR VENDEDOR Y PRESUPUESTO ===\n";
  csvContent += "Vendedor,Sucursal,Notas Fisicas,Total Fisico ($),Notas Financieras,Consumo Financiero ($),Presupuesto Asignado ($),Disponible Restante ($),% Consumo\n";
  vendsBreakdown.forEach(v => {
    csvContent += `"${v.vendedor}","${v.sucursal}",${v.countFis},${v.montoFis.toFixed(2)},${v.countFin},${v.consFin.toFixed(2)},${v.limite.toFixed(2)},${v.disponible.toFixed(2)},${v.pct.toFixed(1)}%\n`;
  });
  csvContent += "\n";

  csvContent += "=== 5. HISTORIAL DETALLADO DE NOTAS E INCIDENCIAS ===\n";
  csvContent += "Folio,Fecha,Cliente,Vendedor,Codigo,Descripcion Producto,Cantidad,Causa,Precio Unitario ($),Total ($)\n";
  historyRows.forEach(h => {
    csvContent += `"${h.folio}","${h.fecha}","${h.cliente}","${h.vendedor}","${h.codigo}","${h.descripcion.replace(/"/g, '""')}",${h.cantidad},"${h.causa}",${h.unitario.toFixed(2)},${h.total.toFixed(2)}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Reporte_Unificado_Notas_Estadistica_Casa_Ayala_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function findUserByVendorNameOrId(vId, vNombre) {
  if (!vNombre && !vId) return null;
  const cleanVNombre = String(vNombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u06ff]/g, "").trim();
  const cleanVId = String(vId || '').trim();

  return usuarios.find(u => {
    const uId = String(u.id || u.id_usuario || '').trim();
    if (uId && cleanVId && uId === cleanVId) return true;

    const uNombre = String(u.nombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u06ff]/g, "").trim();
    if (uNombre && cleanVNombre && (uNombre.includes(cleanVNombre) || cleanVNombre.includes(uNombre))) return true;

    const uEmail = String(u.email || '').toLowerCase().trim();
    if (uEmail && cleanVNombre && uEmail.includes(cleanVNombre)) return true;

    return false;
  });
}

function calculateAndRenderStatistics() {
  const fInicio = document.getElementById('stats-fecha-inicio')?.value || document.getElementById('rep-fecha-inicio')?.value || '';
  const fFin = document.getElementById('stats-fecha-fin')?.value || document.getElementById('rep-fecha-fin')?.value || '';
  const vSelId = document.getElementById('stats-vendedor')?.value || document.getElementById('rep-vendedor')?.value || '';
  const sSelId = document.getElementById('stats-sucursal')?.value || document.getElementById('rep-sucursal')?.value || '';
  const cSelId = document.getElementById('stats-cliente')?.value || document.getElementById('rep-cliente')?.value || '';
  const pSelId = document.getElementById('stats-proveedor')?.value || document.getElementById('rep-proveedor')?.value || '';
  const tSelVal = document.getElementById('stats-tipo-nota')?.value || document.getElementById('rep-tipo-nota')?.value || '';

  // 1. NOTAS FÍSICAS (excluyendo canceladas de los montos acumulados)
  let filtradasFisicas = [];
  if (!tSelVal || tSelVal === 'Fisico') {
    filtradasFisicas = notas.filter(n => {
      if (!isNoteTipoMatch(n, 'Fisico')) return false;
      if (!isNoteVendorMatch(n, vSelId)) return false;
      if (!isNoteSucursalMatch(n, sSelId)) return false;
      if (!isNoteClienteMatch(n, cSelId)) return false;
      if (!isNoteProveedorMatch(n, pSelId)) return false;
      if (!isNoteDateMatch(n, fInicio, fFin)) return false;
      return true;
    });
  }

  const productStats = {};
  const clientStats = {};
  const sellerStats = {};
  const historyRows = [];

  filtradasFisicas.forEach(n => {
    const isCancelada = getNotaDisplayState(n) === 'Cancelada';
    const cli = clientes.find(c => c.id === n.clienteId);
    const cliNombre = cli ? cli.nombre : 'Cliente Desconocido';
    const ven = vendedores.find(v => v.id === n.vendedorId);
    const venNombre = ven ? ven.nombre : 'Vendedor Desconocido';

    if (!isCancelada) {
      // Sumar a clientes si no está cancelada
      if (!clientStats[n.clienteId]) {
        clientStats[n.clienteId] = { nombre: cliNombre, count: 0, total: 0 };
      }
      clientStats[n.clienteId].count++;
      clientStats[n.clienteId].total += n.total;

      // Sumar a vendedores si no está cancelada
      if (!sellerStats[n.vendedorId]) {
        sellerStats[n.vendedorId] = { nombre: venNombre, count: 0, total: 0 };
      }
      sellerStats[n.vendedorId].count++;
      sellerStats[n.vendedorId].total += n.total;
    }

    // Procesar productos
    if (n.productos && n.productos.length > 0) {
      n.productos.forEach(p => {
        const prodCode = p.codigo || 'N/A';
        const prodDesc = p.descripcion || 'Sin descripción';
        const rowTotal = isCancelada ? 0 : (p.cantidad * p.unitario);

        if (!isCancelada) {
          if (!productStats[prodCode]) {
            productStats[prodCode] = { codigo: prodCode, descripcion: prodDesc, count: 0, cantidadTotal: 0, montoTotal: 0 };
          }
          productStats[prodCode].count++;
          productStats[prodCode].cantidadTotal += p.cantidad;
          productStats[prodCode].montoTotal += rowTotal;
        }

        // Historial (incluye referencia como Cancelada si corresponde)
        historyRows.push({
          folio: `${n.folio}-${n.serie}`,
          fecha: n.fechaEmision,
          cliente: cliNombre,
          vendedor: venNombre,
          codigo: prodCode,
          descripcion: prodDesc,
          cantidad: p.cantidad,
          causa: isCancelada ? 'CANCELADA' : (p.causa || 'N/A'),
          unitario: p.unitario,
          total: rowTotal,
          isCancelada
        });
      });
    }
  });

  // Renderizar Tablas Físicas
  // A. Productos
  const tbodyProd = document.querySelector('#table-stats-products tbody');
  if (tbodyProd) {
    tbodyProd.innerHTML = '';
    const sortedProds = Object.values(productStats).sort((a, b) => b.montoTotal - a.montoTotal);
    if (sortedProds.length === 0) {
      tbodyProd.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Sin datos</td></tr>`;
    } else {
      sortedProds.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${p.codigo}</strong></td>
          <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.descripcion}">${p.descripcion}</td>
          <td style="text-align: center;">${p.count}</td>
          <td style="text-align: center;">${p.cantidadTotal}</td>
          <td style="text-align: right; font-weight: bold;">${formatCurrency(p.montoTotal)}</td>
        `;
        tbodyProd.appendChild(tr);
      });
    }
  }

  // B. Clientes Físicos
  const tbodyCli = document.querySelector('#table-stats-clients tbody');
  if (tbodyCli) {
    tbodyCli.innerHTML = '';
    const sortedClis = Object.values(clientStats).sort((a, b) => b.total - a.total);
    if (sortedClis.length === 0) {
      tbodyCli.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Sin datos</td></tr>`;
    } else {
      sortedClis.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${c.nombre}</strong></td>
          <td style="text-align: center;">${c.count}</td>
          <td style="text-align: right; font-weight: bold;">${formatCurrency(c.total)}</td>
        `;
        tbodyCli.appendChild(tr);
      });
    }
  }

  // C. Vendedores Físicos
  const tbodyVen = document.querySelector('#table-stats-sellers tbody');
  if (tbodyVen) {
    tbodyVen.innerHTML = '';
    const sortedVens = Object.values(sellerStats).sort((a, b) => b.count - a.count);
    if (sortedVens.length === 0) {
      tbodyVen.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Sin datos</td></tr>`;
    } else {
      sortedVens.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${v.nombre}</strong></td>
          <td style="text-align: center;">${v.count}</td>
          <td style="text-align: right; font-weight: bold;">${formatCurrency(v.total)}</td>
        `;
        tbodyVen.appendChild(tr);
      });
    }
  }

  // D. Historial Completo de Incidencias
  const tbodyHist = document.querySelector('#table-stats-history tbody');
  if (tbodyHist) {
    tbodyHist.innerHTML = '';
    if (historyRows.length === 0) {
      tbodyHist.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No hay devoluciones en el rango seleccionado</td></tr>`;
    } else {
      historyRows.forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${h.folio}</strong></td>
          <td>${h.fecha}</td>
          <td>${h.cliente}</td>
          <td>${h.vendedor}</td>
          <td>[${h.codigo}] ${h.descripcion}</td>
          <td style="text-align: center;">${h.cantidad}</td>
          <td><span class="badge ${h.isCancelada ? 'badge-danger' : 'badge-cancelada'}" style="${h.isCancelada ? 'background-color:#fee2e2; color:#b91c1c;' : 'background-color:#f1f5f9; color:var(--primary-color);'} border:1px solid var(--border-color);">${h.causa}</span></td>
          <td style="text-align: right;">${formatCurrency(h.unitario)}</td>
          <td style="text-align: right; font-weight: bold;">${formatCurrency(h.total)}</td>
        `;
        tbodyHist.appendChild(tr);
      });
    }
  }

  // 2. NOTAS FINANCIERAS (Ranking de Proveedores, Clientes y Vendedores que más las usan)
  let filtradasFinancieras = [];
  if (!tSelVal || tSelVal === 'Financiero') {
    filtradasFinancieras = notas.filter(n => {
      if (!isNoteTipoMatch(n, 'Financiero')) return false;
      if (!isNoteVendorMatch(n, vSelId)) return false;
      if (!isNoteSucursalMatch(n, sSelId)) return false;
      if (!isNoteClienteMatch(n, cSelId)) return false;
      if (!isNoteProveedorMatch(n, pSelId)) return false;
      if (!isNoteDateMatch(n, fInicio, fFin)) return false;
      return true;
    });
  }

  const finProviderStats = {};
  const finClientStats = {};
  const finSellerStats = {};

  filtradasFinancieras.forEach(n => {
    const isCancelada = getNotaDisplayState(n) === 'Cancelada';
    
    // Identificar Proveedor
    const provObj = proveedores.find(p => p.id === n.proveedorId || p.nombre === n.proveedor);
    const provNombre = provObj ? provObj.nombre : (n.proveedor || 'Proveedor General');
    const provKey = provObj ? provObj.id : provNombre;

    // Identificar Cliente
    const cliObj = clientes.find(c => c.id === n.clienteId);
    const cliNombre = cliObj ? cliObj.nombre : 'Cliente Desconocido';
    const cliKey = n.clienteId || cliNombre;

    // Identificar Vendedor
    const venObj = vendedores.find(v => v.id === n.vendedorId);
    const venNombre = venObj ? venObj.nombre : 'Vendedor Desconocido';
    const venKey = n.vendedorId || venNombre;

    const montoReal = isCancelada ? 0 : (parseFloat(n.total) || 0);

    // Sumar Proveedores
    if (!finProviderStats[provKey]) {
      finProviderStats[provKey] = { nombre: provNombre, count: 0, total: 0 };
    }
    finProviderStats[provKey].count++;
    finProviderStats[provKey].total += montoReal;

    // Sumar Clientes
    if (!finClientStats[cliKey]) {
      finClientStats[cliKey] = { nombre: cliNombre, count: 0, total: 0 };
    }
    finClientStats[cliKey].count++;
    finClientStats[cliKey].total += montoReal;

    // Sumar Vendedores
    if (!finSellerStats[venKey]) {
      finSellerStats[venKey] = { nombre: venNombre, count: 0, total: 0 };
    }
    finSellerStats[venKey].count++;
    finSellerStats[venKey].total += montoReal;
  });

  // Renderizar Ranking de Proveedores Financieros
  const tbodyFinProv = document.querySelector('#table-stats-financial-providers tbody');
  if (tbodyFinProv) {
    tbodyFinProv.innerHTML = '';
    const sortedProvs = Object.values(finProviderStats).sort((a, b) => b.count - a.count || b.total - a.total);
    if (sortedProvs.length === 0) {
      tbodyFinProv.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Sin datos financieros</td></tr>`;
    } else {
      sortedProvs.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${p.nombre}</strong></td>
          <td style="text-align: center;">${p.count}</td>
          <td style="text-align: right; font-weight: bold;">${formatCurrency(p.total)}</td>
        `;
        tbodyFinProv.appendChild(tr);
      });
    }
  }

  // Renderizar Ranking de Clientes Financieros
  const tbodyFinCli = document.querySelector('#table-stats-financial-clients tbody');
  if (tbodyFinCli) {
    tbodyFinCli.innerHTML = '';
    const sortedFinClis = Object.values(finClientStats).sort((a, b) => b.count - a.count || b.total - a.total);
    if (sortedFinClis.length === 0) {
      tbodyFinCli.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Sin datos financieros</td></tr>`;
    } else {
      sortedFinClis.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${c.nombre}</strong></td>
          <td style="text-align: center;">${c.count}</td>
          <td style="text-align: right; font-weight: bold;">${formatCurrency(c.total)}</td>
        `;
        tbodyFinCli.appendChild(tr);
      });
    }
  }

  // Renderizar Ranking de Vendedores Financieros
  const tbodyFinVen = document.querySelector('#table-stats-financial-sellers tbody');
  if (tbodyFinVen) {
    tbodyFinVen.innerHTML = '';
    const sortedFinVens = Object.values(finSellerStats).sort((a, b) => b.count - a.count || b.total - a.total);
    if (sortedFinVens.length === 0) {
      tbodyFinVen.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Sin datos financieros</td></tr>`;
    } else {
      sortedFinVens.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${v.nombre}</strong></td>
          <td style="text-align: center;">${v.count}</td>
          <td style="text-align: right; font-weight: bold;">${formatCurrency(v.total)}</td>
        `;
        tbodyFinVen.appendChild(tr);
      });
    }
  }

  // Renderizar Registro y Reporte Detallado de Notas de Crédito Financieras
  const tbodyFinHist = document.querySelector('#table-stats-financial-history tbody');
  if (tbodyFinHist) {
    tbodyFinHist.innerHTML = '';
    if (filtradasFinancieras.length === 0) {
      tbodyFinHist.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted);">No hay notas financieras registradas en el período seleccionado.</td></tr>`;
    } else {
      filtradasFinancieras.forEach(n => {
        const isCancelada = getNotaDisplayState(n) === 'Cancelada';
        const suc = sucursales.find(s => s.id === n.sucursalId);
        const cli = clientes.find(c => c.id === n.clienteId);
        const ven = vendedores.find(v => v.id === n.vendedorId);
        const provObj = proveedores.find(p => p.id === n.proveedorId || p.nombre === n.proveedor);
        const provNombre = provObj ? provObj.nombre : (n.proveedor || 'General');

        let facturasText = '';
        if (n.facturas && n.facturas.length > 0) {
          facturasText = n.facturas.map(f => `${f.numero}`).join(', ');
        } else {
          facturasText = n.factura || 'N/A';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${n.folio}-${n.serie}</strong></td>
          <td>${n.fechaEmision}</td>
          <td>${suc ? suc.nombre : 'N/A'}</td>
          <td>${provNombre}</td>
          <td>${cli ? cli.nombre : 'N/A'}</td>
          <td>${ven ? ven.nombre : 'N/A'}</td>
          <td style="font-size:11px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${facturasText}">${facturasText}</td>
          <td style="text-align: right; font-weight: bold; color: ${isCancelada ? '#94a3b8' : 'var(--accent-hover)'};">${formatCurrency(isCancelada ? 0 : n.total)}</td>
          <td style="text-align: center;"><span class="badge badge-${getNotaDisplayState(n).toLowerCase()}">${getNotaDisplayState(n)}</span></td>
          <td style="text-align: center;">
            <div style="display:flex; gap:4px; justify-content:center;">
              <button class="btn btn-secondary btn-sm" onclick="viewNotaDetail('${n.id}')" title="Ver Detalle"><i class="fa-solid fa-eye"></i></button>
              <button class="btn btn-primary btn-sm" onclick="printNotaFormat('${n.id}')" title="Imprimir"><i class="fa-solid fa-print"></i></button>
            </div>
          </td>
        `;
        tbodyFinHist.appendChild(tr);
      });
    }
  }
}

// --- HELPER FUNCIONAL DE FILTRADO UNIFICADO Y EXACTO DE REPORTES Y ESTADÍSTICAS ---
function matchSellerIdOrName(sellerVal, targetVendId) {
  if (!sellerVal || !targetVendId) return false;
  const sStr = String(sellerVal).trim();
  const tStr = String(targetVendId).trim();
  if (!sStr || !tStr) return false;
  if (sStr === tStr) return true;

  const normalize = (str) => String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // Buscar objeto vendedor/usuario correspondiente al ID o nombre objetivo
  const targetVendObj = (vendedores || []).find(v => String(v.id).trim() === tStr || String(v.id_vendedor || '').trim() === tStr) ||
                        (usuarios || []).find(u => String(u.id || u.id_usuario || '').trim() === tStr);
  const targetName = targetVendObj ? targetVendObj.nombre : tStr;

  const normSeller = normalize(sStr);
  const normTarget = normalize(targetName);
  const normTargetId = normalize(tStr);

  if (normSeller && normTarget && (normSeller === normTarget || normSeller.includes(normTarget) || normTarget.includes(normSeller))) return true;
  if (normSeller && normTargetId && normSeller === normTargetId) return true;

  // Si sellerVal es un ID, resolver el nombre real del vendedor/usuario
  const sellerVendObj = (vendedores || []).find(v => String(v.id).trim() === sStr || String(v.id_vendedor || '').trim() === sStr) ||
                        (usuarios || []).find(u => String(u.id || u.id_usuario || '').trim() === sStr);
  if (sellerVendObj) {
    const normSellerResolvedName = normalize(sellerVendObj.nombre);
    if (normSellerResolvedName && normTarget && (normSellerResolvedName === normTarget || normSellerResolvedName.includes(normTarget) || normTarget.includes(normSellerResolvedName))) return true;
  }

  return false;
}

function isNoteVendorMatch(n, targetVendId) {
  if (!targetVendId) return true;
  return matchSellerIdOrName(n.vendedorId, targetVendId) ||
         matchSellerIdOrName(n.id_vendedor, targetVendId) ||
         matchSellerIdOrName(n.firmas?.elaboro, targetVendId) ||
         matchSellerIdOrName(n.idUsuarioCreador, targetVendId) ||
         matchSellerIdOrName(n.id_usuario_creador, targetVendId) ||
         matchSellerIdOrName(n.vendedorNombre, targetVendId) ||
         matchSellerIdOrName(n.vendedor, targetVendId) ||
         matchSellerIdOrName(n.operadorNombre, targetVendId) ||
         matchSellerIdOrName(n.creador, targetVendId);
}

function isNoteSucursalMatch(n, targetSucId) {
  if (!targetSucId) return true;
  const nSuc = String(n.sucursalId || n.id_sucursal || n.sucursal || '').trim();
  const tSuc = String(targetSucId).trim();
  if (nSuc && nSuc === tSuc) return true;
  const sObj = sucursales.find(s => s.id === targetSucId);
  if (sObj && (nSuc === sObj.id || nSuc.toLowerCase() === String(sObj.nombre || '').toLowerCase())) return true;
  return false;
}

function isNoteClienteMatch(n, targetCliId) {
  if (!targetCliId) return true;
  const nCliId = String(n.clienteId || n.cliente_id || '').trim();
  const tCliId = String(targetCliId).trim();
  if (nCliId && nCliId === tCliId) return true;

  const cObj = clientes.find(c => c.id === targetCliId);
  if (cObj) {
    if (nCliId === cObj.id || nCliId === cObj.codigoInterno) return true;
    const nCliName = String(n.clienteNombre || n.cliente_nombre || n.cliente || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cObjName = String(cObj.nombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (nCliName && cObjName && (nCliName.includes(cObjName) || cObjName.includes(nCliName))) return true;
  }
  return false;
}

function isNoteProveedorMatch(n, targetProvId) {
  if (!targetProvId) return true;
  const nProvId = String(n.proveedorId || n.proveedor_id || n.proveedor || '').trim();
  const tProvId = String(targetProvId).trim();
  if (nProvId && nProvId === tProvId) return true;
  const pObj = proveedores.find(p => p.id === targetProvId);
  if (pObj && (nProvId === pObj.id || nProvId.toLowerCase() === String(pObj.nombre || '').toLowerCase())) return true;
  if (n.productos && Array.isArray(n.productos)) {
    return n.productos.some(p => {
      const pProv = String(p.proveedorId || p.proveedor || '').trim();
      if (!pProv) return false;
      return pProv === tProvId || (pObj && (pProv === pObj.id || pProv.toLowerCase() === String(pObj.nombre || '').toLowerCase()));
    });
  }
  return false;
}

function isNoteTipoMatch(n, targetTipo) {
  if (!targetTipo) return true;
  const nTipo = String(n.tipo || n.tipo_nota || '').trim().toLowerCase();
  const tTipo = String(targetTipo).trim().toLowerCase();
  return nTipo === tTipo;
}

function isNoteDateMatch(n, fInicio, fFin) {
  let rawDate = n.fechaEmision || n.fecha_emision || n.fecha || '';
  if (!rawDate) return true;
  let fechaNota = String(rawDate).trim();
  if (fechaNota.includes('T')) fechaNota = fechaNota.split('T')[0];
  if (fechaNota.includes('/')) {
    const p = fechaNota.split('/');
    if (p.length === 3) {
      if (p[2].length === 4) fechaNota = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
      else if (p[0].length === 4) fechaNota = `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
    }
  }
  if (fechaNota.length >= 10) fechaNota = fechaNota.substring(0, 10);

  let start = fInicio ? String(fInicio).trim().substring(0, 10) : '';
  let end = fFin ? String(fFin).trim().substring(0, 10) : '';

  if (start && fechaNota < start) return false;
  if (end && fechaNota > end) return false;
  return true;
}

function generateReport() {
  const tipoSel = document.getElementById('rep-tipo-nota')?.value || '';
  const provSel = document.getElementById('rep-proveedor')?.value || '';
  const vendId = document.getElementById('rep-vendedor')?.value || '';
  const sucId = document.getElementById('rep-sucursal')?.value || '';
  const cliId = document.getElementById('rep-cliente')?.value || '';
  const fInicio = document.getElementById('rep-fecha-inicio')?.value || '';
  const fFin = document.getElementById('rep-fecha-fin')?.value || '';

  let filtradas = notas.filter(n => {
    if (!isNoteTipoMatch(n, tipoSel)) return false;
    if (!isNoteProveedorMatch(n, provSel)) return false;
    if (!isNoteVendorMatch(n, vendId)) return false;
    if (!isNoteSucursalMatch(n, sucId)) return false;
    if (!isNoteClienteMatch(n, cliId)) return false;
    if (!isNoteDateMatch(n, fInicio, fFin)) return false;
    return true;
  });

  window.currentReportResults = filtradas;

  const tbody = document.querySelector('#table-report-results tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--text-muted);">No se encontraron notas con los filtros seleccionados.</td></tr>`;
    document.getElementById('report-total-container')?.classList.add('hidden');
    return;
  }

  let totalAcumulado = 0;
  filtradas.forEach(n => {
    const suc = sucursales.find(s => s.id === n.sucursalId || s.id === n.id_sucursal);
    const cliName = n.clienteNombre || n.cliente || (clientes.find(c => c.id === n.clienteId)?.nombre) || 'Cliente General';
    const ven = vendedores.find(v => v.id === n.vendedorId || v.id === n.id_usuario_creador) || { nombre: n.operadorNombre || n.vendedorNombre || 'Vendedor' };
    
    const displayTotal = parseFloat(n.montoTotal || n.total || n.monto_total || 0);
    const displayState = getNotaDisplayState(n);

    if (displayState !== 'Cancelada') {
      totalAcumulado += displayTotal;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${n.folio || n.id || n.id_nota || ''}${n.serie ? '-' + n.serie : ''}</strong></td>
      <td>${(n.tipo === 'Fisico' || n.tipo_nota === 'Fisico') ? 'Físico' : 'Financiero'}</td>
      <td>${suc ? suc.nombre : (n.sucursalNombre || n.id_sucursal || 'N/A')}</td>
      <td>${ven ? ven.nombre : 'N/A'}</td>
      <td>${cliName}</td>
      <td>${n.fechaEmision ? String(n.fechaEmision).substring(0, 10) : ''}</td>
      <td><strong>${formatCurrency(displayTotal)}</strong></td>
      <td><span class="badge badge-${displayState.toLowerCase()}">${displayState}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="viewNotaDetail('${n.id}')" title="Ver Detalle"><i class="fa-solid fa-eye"></i></button>
          <button class="btn btn-primary btn-sm" onclick="printNotaFormat('${n.id}')" title="Imprimir"><i class="fa-solid fa-print"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalEl = document.getElementById('report-total-amount');
  if (totalEl) totalEl.textContent = totalAcumulado.toFixed(2);
  document.getElementById('report-total-container')?.classList.remove('hidden');
}

function printReportResults() {
  printReturnsStatisticsBriefForSignatures();
}

// --- 10. PRE-IMPRESIÓN DE LOTES DE NOTAS EN BLANCO (Correction 1) ---
function setupLotesPrintView() {
  const form = document.getElementById('form-print-lotes');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cantidad = parseInt(document.getElementById('lote-cantidad').value);

    if (cantidad < 20) {
      alert("La cantidad mínima para imprimir es de 20 notas de crédito.");
      return;
    }

    const startFolio = getNextFolioNumber();
    printBlankLote(startFolio, cantidad);
  });
}

function printBlankLote(startFolio, cantidad) {
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = '';
  
  for (let i = 0; i < cantidad; i++) {
    const nextFol = startFolio + i;
    const { folio, serie } = getFolioSeriesAndNumber(nextFol);
    
    const sheet = document.createElement('div');
    sheet.className = 'print-lote-sheet';
    
    // Generar formato Original y formato Copia
    const originalHtml = getBlankFormatHtml(folio, serie, "ORIGINAL");
    const copiaHtml = getBlankFormatHtml(folio, serie, "COPIA");
    
    sheet.innerHTML = originalHtml + copiaHtml;
    printArea.appendChild(sheet);
  }
  
  // Guardar el último folio impreso en localStorage para reservar el rango
  const endFolio = startFolio + cantidad - 1;
  localStorage.setItem('ca_ultimo_folio', String(endFolio));
  
  window.print();
}

function getBlankFormatHtml(folio, serie, tipoCopia) {
  // Construir 6 filas de tabla vacías
  let emptyRowsHtml = '';
  for (let i = 0; i < 6; i++) {
    emptyRowsHtml += `
      <tr>
        <td style="height:17px;">&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
      </tr>
    `;
  }

  return `
    <div class="nota-print-container">
      <div class="print-watermark">${tipoCopia}</div>
      <div class="print-badge">${tipoCopia}</div>
      
      <!-- ENCABEZADO -->
      <div class="print-header">
        <div class="print-logo-placeholder">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6">
            <rect x="10" y="20" width="80" height="60" rx="5" />
            <path d="M30 45 L45 60 L75 30" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="print-company-info">
          <div class="print-company-title">CASA AYALA DEL NOROESTE SA DE CV</div>
          <div class="print-company-subtitle">
            AV ESPAÑA # 1168 COL. MODERNA<br>
            TEL. 36501550 36501552<br>
            <strong>NOTA DE CRÉDITO</strong>
          </div>
        </div>
        <div>
          <div class="print-meta-box">
            <div class="print-meta-header">DÍA / MES / AÑO</div>
            <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <div class="print-folio-container">
              <span>FOLIO</span>
              <span class="print-folio-number">${folio} - ${serie}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- CAMPOS -->
      <div class="print-fields-row" style="grid-template-columns: 1.5fr 1.5fr 1fr;">
        <div class="print-field">
          <span class="print-field-label">CLIENTE:</span>
          <span>.................................................</span>
        </div>
        <div class="print-field">
          <span class="print-field-label">FACTURAS (4 dgt.):</span>
          <span style="font-size: 8px;">[1] .... [2] .... [3] .... [4] .... [5] ....</span>
        </div>
        <div class="print-field">
          <span class="print-field-label">FECHA EMISIÓN:</span>
          <span>....................</span>
        </div>
      </div>

      <!-- RAZONES -->
      <div class="print-reasons-container">
        <div class="print-reasons-grid">
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>A) DIFERENCIA EN PRECIO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>D) NO SE SURTIO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>G) DEV. MAL ESTADO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>B) CLIENTE AUSENTE</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>E) ENVIO ATRASADO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>H) ERROR VARIOS</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>C) ERROR DE CHOFER</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">&nbsp;</span>
            <span>F) DEV. NO PIDIERON</span>
          </div>
        </div>
        <div class="print-instruction-box">
          “ FAVOR DE MARCAR LA RAZÓN<br>
          DE LA NOTA DE CRÉDITO<br>
          PARA SU VALIDACIÓN ”
        </div>
      </div>

      <!-- TABLA CONCEPTOS -->
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 10%;">CODIGO</th>
            <th style="width: 8%;">CANTIDAD</th>
            <th style="width: 6%;">PV</th>
            <th style="width: 8%;">BODEGA</th>
            <th style="width: 40%;">DESCRIPCION</th>
            <th style="width: 10%;">CAUSA</th>
            <th style="width: 8%;">UNITARIO</th>
            <th style="width: 10%;">IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          ${emptyRowsHtml}
        </tbody>
      </table>

      <!-- CAMPOS INFERIORES -->
      <div class="print-bottom-row" style="grid-template-columns: 1fr 1.5fr 1fr;">
        <div class="print-bottom-cell">
          <span class="print-bottom-label">C.I.</span>
          <span class="print-bottom-value">&nbsp;</span>
        </div>
        <div class="print-bottom-cell">
          <span class="print-bottom-label">FECHA APLICACIÓN</span>
          <span class="print-bottom-value">&nbsp;</span>
        </div>
        <div class="print-bottom-cell" style="text-align: right;">
          <span class="print-bottom-label" style="text-align: left;">TOTAL</span>
          <strong class="print-bottom-value">&nbsp;</strong>
        </div>
      </div>

      <!-- FIRMAS -->
      <div class="print-signatures-row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px;">
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Elaboró</div>
        </div>
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Almacén</div>
        </div>
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Autorizó</div>
        </div>
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Cliente</div>
        </div>
      </div>
    </div>
  `;
}

// --- IMPRESIÓN FORMATO INDIVIDUAL DUPLICADO ---
// --- IMPRESIÓN FORMATO INDIVIDUAL DUPLICADO Y RESUMEN CON FOTO ---
function printNotaFormat(notaId) {
  const nota = notas.find(n => n.id === notaId);
  if (!nota) return;

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = '';

  // Hoja de Resumen de Incidencias con Fotografía (Página 1 de respaldo si la Nota Física contiene foto)
  if (nota.tipo === 'Fisico' && nota.incidenciaFoto) {
    const summarySheet = document.createElement('div');
    summarySheet.className = 'print-summary-sheet';
    summarySheet.innerHTML = getPhysicalNoteSummaryPrintHtml(nota);
    printArea.appendChild(summarySheet);
  }

  // Formato Oficial Duplicado (ORIGINAL y COPIA encuadradas en 1 sola hoja de papel)
  const sheet = document.createElement('div');
  sheet.className = 'print-lote-sheet';
  
  const originalHtml = getFilledFormatHtml(nota, "ORIGINAL");
  const copiaHtml = getFilledFormatHtml(nota, "COPIA");
  
  sheet.innerHTML = originalHtml + copiaHtml;
  printArea.appendChild(sheet);

  window.print();
}

function getPhysicalNoteSummaryPrintHtml(nota) {
  const suc = sucursales.find(s => s.id === nota.sucursalId);
  const cli = clientes.find(c => c.id === nota.clienteId);
  const ven = vendedores.find(v => v.id === nota.vendedorId);
  const ope = operadores.find(o => o.id === nota.operadorId);

  let subtotalCalc = 0;
  let ivaCalc = 0;
  let iepsCalc = 0;

  let productRowsHtml = '';
  if (nota.productos && nota.productos.length > 0) {
    nota.productos.forEach(p => {
      const subRow = (parseFloat(p.cantidad) || 0) * (parseFloat(p.unitario) || 0);
      const hasIva = p.hasIva !== undefined ? p.hasIva : true;
      const hasIeps = p.hasIeps !== undefined ? p.hasIeps : false;
      const ivaRow = hasIva ? subRow * 0.16 : 0;
      const iepsRow = hasIeps ? subRow * 0.08 : 0;
      const rowImporte = p.importe || (subRow + ivaRow + iepsRow);

      subtotalCalc += subRow;
      ivaCalc += ivaRow;
      iepsCalc += iepsRow;

      productRowsHtml += `
        <tr>
          <td style="padding: 4px 6px; text-align: center; border: 1px solid #94a3b8;">${p.codigo || '-'}</td>
          <td style="padding: 4px 6px; text-align: center; border: 1px solid #94a3b8;">${p.cantidad || 0}</td>
          <td style="padding: 4px 6px; text-align: center; border: 1px solid #94a3b8;">${p.pv || '1'}</td>
          <td style="padding: 4px 6px; text-align: center; border: 1px solid #94a3b8;">${p.bodega || (suc ? suc.nombre : '-')}</td>
          <td style="padding: 4px 6px; border: 1px solid #94a3b8;">${p.descripcion || '-'}</td>
          <td style="padding: 4px 6px; text-align: center; border: 1px solid #94a3b8;">${p.causa || '-'}</td>
          <td style="padding: 4px 6px; text-align: right; border: 1px solid #94a3b8;">${formatCurrency(p.unitario)}</td>
          <td style="padding: 4px 6px; text-align: right; font-weight: bold; border: 1px solid #94a3b8;">${formatCurrency(rowImporte)}</td>
        </tr>
      `;
    });
  } else {
    productRowsHtml = `<tr><td colspan="8" style="text-align: center; padding: 10px; color: #64748b;">Sin productos registrados</td></tr>`;
  }

  const realSubtotal = nota.subtotal || subtotalCalc;
  const realIva = nota.iva !== undefined ? nota.iva : ivaCalc;
  const realIeps = nota.ieps !== undefined ? nota.ieps : iepsCalc;
  const computedTotal = realSubtotal + realIva + realIeps;
  const realTotal = (nota.total && nota.total > 0) ? nota.total : computedTotal;

  const causaGeneralStr = CAUSAS_MAP[nota.causaMarcar] || nota.causaMarcar || 'No especificada';

  return `
    <div class="print-summary-container" style="border: 2px solid #0f172a; padding: 16px; border-radius: 8px; font-family: 'Outfit', Arial, sans-serif; background: #fff; box-sizing: border-box; min-height: 94vh; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <!-- ENCABEZADO HOJA RESUMEN -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; text-transform: uppercase;">CASA AYALA DEL NOROESTE S.A. DE C.V.</h2>
            <div style="font-size: 11px; font-weight: 700; color: #dc2626; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;">HOJA DE RESUMEN DE INCIDENCIA Y FOTOGRAFÍA (NOTA FÍSICA)</div>
          </div>
          <div style="text-align: right; border: 1.5px solid #0f172a; padding: 4px 10px; border-radius: 4px; background: #f8fafc;">
            <div style="font-size: 8.5px; font-weight: bold; color: #475569;">FOLIO Y SERIE</div>
            <div style="font-size: 14px; font-weight: 800; color: #dc2626;">#${nota.folio}-${nota.serie}</div>
          </div>
        </div>

        <!-- RESUMEN DE PROPIEDAD: DE QUIÉN ES -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 10px;">
          <div><strong>CLIENTE:</strong> ${cli ? `[${cli.codigoInterno}] ${cli.nombre}` : 'N/A'}</div>
          <div><strong>SUCURSAL:</strong> ${suc ? suc.nombre : 'N/A'}</div>
          <div><strong>VENDEDOR:</strong> ${ven ? ven.nombre : 'N/A'}</div>
          <div><strong>CHOFER / REPARTIDOR:</strong> ${ope ? `${ope.nombre} (${ope.puesto})` : 'N/A'}</div>
          <div><strong>FACTURA(S):</strong> ${nota.factura || 'N/A'}</div>
          <div><strong>FECHAS (EMISIÓN / APLICACIÓN):</strong> ${nota.fechaEmision} / ${nota.fechaAplicacion}</div>
          <div style="grid-column: span 2; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
            <strong>RAZÓN / CAUSA PRINCIPAL:</strong> <span style="color: #b45309; font-weight: 700;">${causaGeneralStr}</span>
          </div>
        </div>

        <!-- TABLA DE PRODUCTOS Y CAUSAS -->
        <div style="margin-bottom: 10px;">
          <div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">PRODUCTOS Y DETALLE DE MONTOS</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; border: 1px solid #94a3b8;">
            <thead>
              <tr style="background: #e2e8f0; color: #0f172a; font-weight: 800;">
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: center; width: 9%;">CÓDIGO</th>
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: center; width: 7%;">CANT.</th>
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: center; width: 6%;">P.V.</th>
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: center; width: 12%;">BODEGA</th>
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: left; width: 34%;">DESCRIPCIÓN</th>
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: center; width: 12%;">CAUSA</th>
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: right; width: 10%;">UNITARIO</th>
                <th style="border: 1px solid #94a3b8; padding: 4px; text-align: right; width: 10%;">IMPORTE</th>
              </tr>
            </thead>
            <tbody>
              ${productRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- TOTALES CALCULADOS Y MONTOS -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;">
          <div style="font-size: 9px; color: #475569;">
            <strong>DESGLOSE:</strong> SUB: ${formatCurrency(realSubtotal)} | IVA: ${formatCurrency(realIva)} | IEPS: ${formatCurrency(realIeps)}
          </div>
          <div style="font-size: 13px; font-weight: 900; color: #0f172a;">
            TOTAL NOTA DE CRÉDITO: <span style="color: #059669;">${formatCurrency(realTotal)}</span>
          </div>
        </div>

        ${nota.observaciones ? `
          <div style="font-size: 9px; background: #fffbeb; border: 1px solid #fef08a; padding: 6px 10px; border-radius: 4px; margin-bottom: 10px; color: #78350f;">
            <strong>OBSERVACIONES:</strong> ${nota.observaciones}
          </div>
        ` : ''}
      </div>

      <!-- FOTOGRAFÍA CENTRADA TAMAÑO 1/4 DE PÁGINA -->
      <div style="text-align: center; margin: 10px auto 0 auto; width: 100%; page-break-inside: avoid;">
        <div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
          📷 EVIDENCIA FOTOGRÁFICA DE LA INCIDENCIA (TAMAÑO 1/4 DE PÁGINA)
        </div>
        ${nota.incidenciaFoto ? `
          <div style="display: flex; justify-content: center; align-items: center;">
            <img src="${nota.incidenciaFoto}" style="max-height: 250px; max-width: 70%; width: auto; height: auto; object-fit: contain; border: 2px solid #0f172a; border-radius: 6px; padding: 4px; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);" />
          </div>
        ` : `
          <div style="text-align: center; padding: 20px; border: 2px dashed #cbd5e1; border-radius: 6px; color: #94a3b8; font-size: 10px; background: #fafafa;">
            (Sin fotografía de incidencia adjunta para este folio)
          </div>
        `}
      </div>
    </div>
  `;
}

function getFilledFormatHtml(nota, tipoCopia) {
  const suc = sucursales.find(s => s.id === nota.sucursalId);
  const cli = clientes.find(c => c.id === nota.clienteId);
  const ven = vendedores.find(v => v.id === nota.vendedorId);
  const ope = operadores.find(o => o.id === nota.operadorId);

  const dt = new Date(nota.fechaEmision);
  const dia = String(dt.getDate() + 1).padStart(2, '0');
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  const anio = dt.getFullYear();

  let facturasText = '';
  if (nota.facturas && nota.facturas.length > 0) {
    if (nota.tipo === 'Financiero') {
      facturasText = nota.facturas.map(f => `${f.numero} ($${f.monto.toFixed(2)})`).join(', ');
    } else {
      facturasText = nota.facturas.join(', ');
    }
  } else {
    facturasText = nota.factura || 'N/A';
  }

  const maxFilas = Math.max(6, (nota.productos || []).length);
  let tableRowsHtml = '';
  
  for (let i = 0; i < maxFilas; i++) {
    const p = nota.productos[i];
    if (p) {
      tableRowsHtml += `
        <tr>
          <td class="center">${p.codigo}</td>
          <td class="center">${p.cantidad}</td>
          <td class="center">${p.pv || ''}</td>
          <td class="center">${p.bodega || ''}</td>
          <td>${p.descripcion}</td>
          <td class="center">${p.causa || ''}</td>
          <td class="right">${formatCurrency(p.unitario)}</td>
          <td class="right">${formatCurrency(p.importe)}</td>
        </tr>
      `;
    } else {
      tableRowsHtml += `
        <tr>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      `;
    }
  }

  const uElaboro = usuarios.find(u => u.id === nota.firmas.elaboro);
  const uAlmacen = usuarios.find(u => u.id === nota.firmas.almacen);
  const uAutorizo = usuarios.find(u => u.id === nota.firmas.autorizo);

  let taxBreakdownHtml = '';
  if (nota.tipo === 'Fisico') {
    taxBreakdownHtml = `
      <div style="font-size: 8px; line-height: 1.1; text-align: right; margin-bottom: 2px;">
        SUB: ${formatCurrency(nota.subtotal || nota.total)} | IVA: ${formatCurrency(nota.iva || 0)} | IEPS: ${formatCurrency(nota.ieps || 0)}
      </div>
    `;
  }

  const isCancelada = getNotaDisplayState(nota) === 'Cancelada';
  const cancelledWatermarkHtml = isCancelada ? '<div class="print-cancel-watermark">CANCELADA</div>' : '';

  // Leyendas de firmas físicas oficiales para enterado y firma
  const sig1 = 'Elaboró';
  const sig2 = 'Almacén';
  const sig3 = 'Autorizó';
  const sig4 = 'Cliente';

  return `
    <div class="nota-print-container">
      <div class="print-watermark">${tipoCopia}</div>
      ${cancelledWatermarkHtml}
      <div class="print-badge">${tipoCopia}</div>
      
      <div class="print-header">
        <div class="print-logo-placeholder">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6">
            <rect x="10" y="20" width="80" height="60" rx="5" />
            <path d="M30 45 L45 60 L75 30" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="print-company-info">
          <div class="print-company-title">CASA AYALA DEL NOROESTE SA DE CV</div>
          <div class="print-company-subtitle">
            AV ESPAÑA # 1168 COL. MODERNA<br>
            TEL. 36501550 36501552<br>
            <strong>NOTA DE CRÉDITO</strong>
          </div>
        </div>
        <div>
          <div class="print-meta-box">
            <div class="print-meta-header">DÍA / MES / AÑO</div>
            <span>${dia}</span>
            <span>${mes}</span>
            <span>${anio}</span>
            <div class="print-folio-container">
              <span>FOLIO</span>
              <span class="print-folio-number">${nota.folio} - ${nota.serie}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="print-fields-row" style="grid-template-columns: 1.5fr 1.5fr 1fr;">
        <div class="print-field">
          <span class="print-field-label">CLIENTE:</span>
          <span>${cli ? `[${cli.codigoInterno}] ${cli.nombre}` : 'N/A'}</span>
        </div>
        <div class="print-field">
          <span class="print-field-label">FACTURAS:</span>
          <span style="font-size: 9px; font-weight: bold;">${facturasText}</span>
        </div>
        <div class="print-field">
          <span class="print-field-label">FECHA EMISIÓN:</span>
          <span>${nota.fechaEmision}</span>
        </div>
      </div>

      <div class="print-reasons-container">
        <div class="print-reasons-grid">
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'A' ? 'X' : ''}</span>
            <span>A) DIFERENCIA EN PRECIO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'D' ? 'X' : ''}</span>
            <span>D) NO SE SURTIO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'G' ? 'X' : ''}</span>
            <span>G) DEV. MAL ESTADO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'B' ? 'X' : ''}</span>
            <span>B) CLIENTE AUSENTE</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'E' ? 'X' : ''}</span>
            <span>E) ENVIO ATRASADO</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'H' ? 'X' : ''}</span>
            <span>H) ERROR VARIOS</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'C' ? 'X' : ''}</span>
            <span>C) ERROR DE CHOFER</span>
          </div>
          <div class="print-reason-item">
            <span class="print-reason-box">${nota.causaMarcar === 'F' ? 'X' : ''}</span>
            <span>F) DEV. NO PIDIERON</span>
          </div>
        </div>
        <div class="print-instruction-box">
          “ FAVOR DE MARCAR LA RAZÓN<br>
          DE LA NOTA DE CRÉDITO<br>
          PARA SU VALIDACIÓN ”
        </div>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 10%;">CODIGO</th>
            <th style="width: 8%;">CANTIDAD</th>
            <th style="width: 6%;">PV</th>
            <th style="width: 8%;">BODEGA</th>
            <th style="width: 40%;">DESCRIPCION</th>
            <th style="width: 10%;">CAUSA</th>
            <th style="width: 8%;">UNITARIO</th>
            <th style="width: 10%;">IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <div class="print-bottom-row" style="grid-template-columns: 1fr 1.2fr 1.8fr;">
        <div class="print-bottom-cell">
          <span class="print-bottom-label">C.I.</span>
          <span class="print-bottom-value">${nota.claveInterna || 'N/A'}</span>
        </div>
        <div class="print-bottom-cell">
          <span class="print-bottom-label">FECHA APLICACIÓN</span>
          <span class="print-bottom-value">${nota.fechaAplicacion}</span>
        </div>
        <div class="print-bottom-cell" style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;">
          ${taxBreakdownHtml}
          <div>
            <span class="print-bottom-label" style="display:inline; margin-right: 5px;">TOTAL:</span>
            <strong class="print-bottom-value" style="font-size:11px;">${formatCurrency(nota.total)}</strong>
          </div>
        </div>
      </div>

      <div class="print-signatures-row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px;">
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Elaboró</div>
        </div>
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Almacén</div>
        </div>
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Autorizó</div>
        </div>
        <div class="print-signature-box" style="text-align: center;">
          <div style="height: 18px;"></div>
          <div class="print-signature-line" style="border-top: 1.5px solid #000; padding-top: 3px; font-weight: 800; font-size: 9.5px; color: #000;">Cliente</div>
        </div>
      </div>
    </div>
  `;
}

// --- UTILERÍAS ---
function fillSelect(selectId, items, labelFn, includeEmpty = false) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '';

  if (includeEmpty) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = selectId.includes('filter') || selectId.startsWith('rep-') || selectId.startsWith('stats-') ? '-- Todos --' : '-- Seleccionar --';
    select.appendChild(opt);
  }

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = labelFn(item);
    select.appendChild(opt);
  });
}

function formatCurrency(num) {
  const val = parseFloat(num) || 0;
  return '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- BRIEF DESCARGABLE / IMPRIMIBLE DE ESTADÍSTICA DE DEVOLUCIONES Y RANKINGS PARA FIRMA ---
function printReturnsStatisticsBriefForSignatures() {
  if (currentUser && currentUser.rol === 'Vendedor') {
    alert("Acceso exclusivo para Gerente y Administrador.");
    return;
  }

  // 1. Obtener filtros aplicados (Sincronización de controles stats y rep)
  const fInicio = document.getElementById('stats-fecha-inicio')?.value || document.getElementById('rep-fecha-inicio')?.value || '';
  const fFin = document.getElementById('stats-fecha-fin')?.value || document.getElementById('rep-fecha-fin')?.value || '';
  const vSelId = document.getElementById('stats-vendedor')?.value || document.getElementById('rep-vendedor')?.value || '';
  const sSelId = document.getElementById('stats-sucursal')?.value || document.getElementById('rep-sucursal')?.value || '';
  const cSelId = document.getElementById('stats-cliente')?.value || document.getElementById('rep-cliente')?.value || '';
  const pSelId = document.getElementById('stats-proveedor')?.value || document.getElementById('rep-proveedor')?.value || '';
  const tSelVal = document.getElementById('stats-tipo-nota')?.value || document.getElementById('rep-tipo-nota')?.value || '';

  const vObj = vendedores.find(v => v.id === vSelId);
  const sObj = sucursales.find(s => s.id === sSelId);
  const cObj = clientes.find(c => c.id === cSelId);
  const pObj = proveedores.find(p => p.id === pSelId);

  const filtroVendedorText = vObj ? vObj.nombre : 'Todos los Vendedores';
  const filtroSucursalText = sObj ? sObj.nombre : 'Todas las Sucursales';
  const filtroClienteText = cObj ? `[${cObj.codigoInterno}] ${cObj.nombre}` : 'Todos los Clientes';
  const filtroProveedorText = pObj ? pObj.nombre : 'Todos los Proveedores';
  const filtroTipoText = tSelVal === 'Fisico' ? 'Notas Físicas' : (tSelVal === 'Financiero' ? 'Notas Financieras' : 'Todos los Tipos');
  const filtroPeriodoText = (fInicio || fFin) ? `${fInicio || 'Inicio'} al ${fFin || 'Hoy'}` : 'Período Completo Vigente';

  // 2. SEPARACIÓN ESTRICTA: NOTAS DE CRÉDITO FÍSICAS (Devolución de Producto a Almacén)
  let fisicas = [];
  if (!tSelVal || tSelVal === 'Fisico') {
    fisicas = notas.filter(n => isNoteTipoMatch(n, 'Fisico') && getNotaDisplayState(n) !== 'Cancelada' && getNotaDisplayState(n) !== 'Borrador');
    if (fInicio || fFin) fisicas = fisicas.filter(n => isNoteDateMatch(n, fInicio, fFin));
    if (vSelId) fisicas = fisicas.filter(n => isNoteVendorMatch(n, vSelId));
    if (sSelId) fisicas = fisicas.filter(n => isNoteSucursalMatch(n, sSelId));
    if (cSelId) fisicas = fisicas.filter(n => isNoteClienteMatch(n, cSelId));
    if (pSelId) fisicas = fisicas.filter(n => isNoteProveedorMatch(n, pSelId));
  }

  // 3. SEPARACIÓN ESTRICTA: NOTAS DE CRÉDITO FINANCIERAS (Descuento/Bonificación en Dinero)
  let financieras = [];
  if (!tSelVal || tSelVal === 'Financiero') {
    financieras = notas.filter(n => isNoteTipoMatch(n, 'Financiero') && getNotaDisplayState(n) !== 'Cancelada' && getNotaDisplayState(n) !== 'Borrador');
    if (fInicio || fFin) financieras = financieras.filter(n => isNoteDateMatch(n, fInicio, fFin));
    if (vSelId) financieras = financieras.filter(n => isNoteVendorMatch(n, vSelId));
    if (sSelId) financieras = financieras.filter(n => isNoteSucursalMatch(n, sSelId));
    if (cSelId) financieras = financieras.filter(n => isNoteClienteMatch(n, cSelId));
    if (pSelId) financieras = financieras.filter(n => isNoteProveedorMatch(n, pSelId));
  }

  // Métricas Físicas
  const totalNotasFisicas = fisicas.length;
  const totalVolumenFisico = fisicas.reduce((sum, n) => {
    return sum + (n.productos ? n.productos.reduce((s, p) => s + (parseFloat(p.cantidad) || 0), 0) : 0);
  }, 0);
  const totalMontoFisico = fisicas.reduce((sum, n) => sum + (parseFloat(n.total) || 0), 0);

  // Métricas Financieras
  const totalNotasFinancieras = financieras.length;
  const totalMontoFinanciero = financieras.reduce((sum, n) => sum + (parseFloat(n.total || n.importeDescuento) || 0), 0);
  const totalMontoCombinadoEjercicio = totalMontoFisico + totalMontoFinanciero;

  // Rankings: Productos, Clientes y Vendedores
  const prodMap = {};
  const clientMap = {};
  const sellerMap = {};

  fisicas.forEach(n => {
    const cli = clientes.find(c => c.id === n.clienteId);
    const cliName = cli ? cli.nombre : (n.clienteNombre || 'Cliente General');
    const ven = vendedores.find(v => v.id === n.vendedorId);
    const venName = ven ? ven.nombre : (n.vendedorNombre || 'Vendedor General');

    if (!clientMap[n.clienteId || cliName]) {
      clientMap[n.clienteId || cliName] = { nombre: cliName, count: 0, total: 0 };
    }
    clientMap[n.clienteId || cliName].count++;
    clientMap[n.clienteId || cliName].total += (parseFloat(n.total) || 0);

    if (!sellerMap[n.vendedorId || venName]) {
      sellerMap[n.vendedorId || venName] = { nombre: venName, count: 0, total: 0 };
    }
    sellerMap[n.vendedorId || venName].count++;
    sellerMap[n.vendedorId || venName].total += (parseFloat(n.total) || 0);

    if (n.productos && n.productos.length > 0) {
      n.productos.forEach(p => {
        const code = p.codigo || 'N/A';
        if (!prodMap[code]) {
          prodMap[code] = { codigo: code, descripcion: p.descripcion || 'Sin descripción', count: 0, cantidad: 0, total: 0 };
        }
        prodMap[code].count++;
        prodMap[code].cantidad += (parseFloat(p.cantidad) || 0);
        prodMap[code].total += (parseFloat(p.cantidad) || 0) * (parseFloat(p.unitario) || 0);
      });
    }
  });

  const topProductsFisicos = Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 10);
  const topClientsFisicos = Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 5);
  const topSellersFisicos = Object.values(sellerMap).sort((a, b) => b.total - a.total).slice(0, 5);

  // Vendedores filtrados
  let vendsList = vendedores.filter(v => !v.eliminado);
  if (currentUser && currentUser.rol === 'Gerente') {
    vendsList = vendsList.filter(v => v.sucursalId === currentUser.sucursalId);
  }
  if (vSelId) {
    vendsList = vendsList.filter(v => v.id === vSelId);
  }

  const currentMes = fInicio ? fInicio.substring(0, 7) : new Date().toISOString().substring(0, 7);
  const vendsBreakdown = vendsList.map(v => {
    const suc = sucursales.find(s => s.id === v.sucursalId);
    let ppto = presupuestos.find(p => matchSellerIdOrName(p.vendedorId, v.id) && p.mes === currentMes);
    if (!ppto) {
      const sellerPptos = presupuestos.filter(p => matchSellerIdOrName(p.vendedorId, v.id));
      if (sellerPptos.length > 0) ppto = sellerPptos[sellerPptos.length - 1];
    }
    const limite = ppto ? (parseFloat(ppto.limite) || 0) : 0;
    
    // Conteo Notas Físicas del Vendedor
    const vendorFisicas = fisicas.filter(n => isNoteVendorMatch(n, v.id));
    const countFis = vendorFisicas.length;
    const montoFis = vendorFisicas.reduce((s, n) => s + (parseFloat(n.total) || 0), 0);

    // Conteo Notas Financieras y Consumo Presupuestal
    const vendorFinancieras = financieras.filter(n => isNoteVendorMatch(n, v.id));
    const countFin = vendorFinancieras.length;
    const consFinReal = vendorFinancieras.reduce((s, n) => s + (parseFloat(n.total || n.importeDescuento) || 0), 0);
    const consFin = Math.max(ppto ? (parseFloat(ppto.consumido) || 0) : 0, consFinReal);
    const disponible = Math.max(0, limite - consFin);
    const pct = limite > 0 ? (consFin / limite) * 100 : 0;

    return {
      vendedor: v.nombre,
      sucursal: suc ? suc.nombre : 'N/A',
      countFis,
      montoFis,
      countFin,
      consFin,
      limite,
      disponible,
      pct
    };
  });

  const printArea = document.getElementById('print-area');
  if (!printArea) return;
  printArea.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'print-page';
  const fechaHoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  // Listado unificado de notas seleccionadas
  const todasNotasSeleccionadas = [...fisicas, ...financieras].sort((a, b) => (b.fechaEmision || '').localeCompare(a.fechaEmision || ''));

  div.innerHTML = `
    <div class="print-header" style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
      <div style="font-size: 15px; font-weight: bold; letter-spacing: 0.5px;">CASA AYALA DEL NOROESTE S.A. DE C.V.</div>
      <div style="font-size: 12px; font-weight: bold; color: #1e293b; margin-top: 3px;">REPORTE UNIFICADO DE NOTAS DE CRÉDITO Y RANKING DE ESTADÍSTICAS</div>
      <div style="font-size: 9.5px; color: #64748b; margin-top: 3px;">
        Documento de Control Interno y Conciliación General | Fecha de Generación: ${fechaHoy}
      </div>
    </div>

    <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 4px; font-size: 9.5px; margin-bottom: 12px;">
      <strong>PARÁMETROS Y FILTROS APLICADOS:</strong> &nbsp;
      Período: <strong>${filtroPeriodoText}</strong> &nbsp;|&nbsp;
      Tipo: <strong>${filtroTipoText}</strong> &nbsp;|&nbsp;
      Vendedor: <strong>${filtroVendedorText}</strong> &nbsp;|&nbsp;
      Sucursal: <strong>${filtroSucursalText}</strong> &nbsp;|&nbsp;
      Cliente: <strong>${filtroClienteText}</strong> &nbsp;|&nbsp;
      Proveedor: <strong>${filtroProveedorText}</strong>
    </div>

    <!-- TARJETAS DE EJERCICIO CONSOLIDADO -->
    <div style="display: flex; justify-content: space-around; background: #f1f5f9; padding: 8px; border-radius: 4px; font-size: 10px; margin-bottom: 15px; border: 1px solid #cbd5e1;">
      <div style="text-align:center;">
        <span style="color:#475569; display:block; font-size:8.5px; font-weight:bold;">📦 NOTAS DE CRÉDITO FÍSICAS</span>
        <strong style="font-size:12px; color:#2563eb;">${totalNotasFisicas} notas (${totalVolumenFisico} pzas) = ${formatCurrency(totalMontoFisico)}</strong>
      </div>
      <div style="text-align:center;">
        <span style="color:#475569; display:block; font-size:8.5px; font-weight:bold;">💰 NOTAS DE CRÉDITO FINANCIERAS</span>
        <strong style="font-size:12px; color:#d97706;">${totalNotasFinancieras} notas = ${formatCurrency(totalMontoFinanciero)}</strong>
      </div>
      <div style="text-align:center;">
        <span style="color:#475569; display:block; font-size:8.5px; font-weight:bold;">⚖️ TOTAL COMBINADO DEL EJERCICIO</span>
        <strong style="font-size:12px; color:#16a34a;">${formatCurrency(totalMontoCombinadoEjercicio)}</strong>
      </div>
    </div>

    <!-- SECCION 1: RANKING DE PRODUCTOS MAS DEVUELTOS -->
    <div style="font-size: 10.5px; font-weight: bold; margin-bottom: 4px; color: #1e293b; border-bottom: 1px solid #94a3b8; padding-bottom: 2px;">
      1. RANKING DE PRODUCTOS MÁS DEVUELTOS EN EL PERÍODO
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 12px;">
      <thead>
        <tr style="background: #e2e8f0; border-bottom: 1.5px solid #94a3b8; text-align: left;">
          <th style="padding: 4px;">Código</th>
          <th style="padding: 4px;">Descripción de Producto Devuelto</th>
          <th style="padding: 4px; text-align: center;">Incidencias</th>
          <th style="padding: 4px; text-align: center;">Piezas Devueltas</th>
          <th style="padding: 4px; text-align: right;">Importe Físico ($)</th>
        </tr>
      </thead>
      <tbody>
        ${topProductsFisicos.length === 0 ? '<tr><td colspan="5" style="padding:5px; text-align:center; color:#64748b;">No hay devoluciones físicas registradas con este filtro</td></tr>' : 
          topProductsFisicos.map(p => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 4px;"><strong>${p.codigo}</strong></td>
              <td style="padding: 4px;">${p.descripcion}</td>
              <td style="padding: 4px; text-align: center;">${p.count}</td>
              <td style="padding: 4px; text-align: center;">${p.cantidad}</td>
              <td style="padding: 4px; text-align: right; font-weight: bold;">${formatCurrency(p.total)}</td>
            </tr>
          `).join('')
        }
      </tbody>
    </table>

    <!-- SECCION 2: RANKINGS DE CLIENTES Y VENDEDORES -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
      <div>
        <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px; color: #1e293b; border-bottom: 1px solid #94a3b8; padding-bottom: 2px;">
          2. RANKING DE CLIENTES QUE MÁS DEVUELVEN
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
          <thead>
            <tr style="background: #e2e8f0; text-align: left;">
              <th style="padding: 3px;">Cliente</th>
              <th style="padding: 3px; text-align: center;">Notas</th>
              <th style="padding: 3px; text-align: right;">Monto Total ($)</th>
            </tr>
          </thead>
          <tbody>
            ${topClientsFisicos.length === 0 ? '<tr><td colspan="3" style="padding:4px; text-align:center; color:#64748b;">Sin datos</td></tr>' :
              topClientsFisicos.map(c => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 3px;"><strong>${c.nombre}</strong></td>
                  <td style="padding: 3px; text-align: center;">${c.count}</td>
                  <td style="padding: 3px; text-align: right; font-weight: bold;">${formatCurrency(c.total)}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
      <div>
        <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px; color: #1e293b; border-bottom: 1px solid #94a3b8; padding-bottom: 2px;">
          3. RANKING DE VENDEDORES CON MÁS INCIDENCIAS
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
          <thead>
            <tr style="background: #e2e8f0; text-align: left;">
              <th style="padding: 3px;">Vendedor</th>
              <th style="padding: 3px; text-align: center;">Notas</th>
              <th style="padding: 3px; text-align: right;">Monto Total ($)</th>
            </tr>
          </thead>
          <tbody>
            ${topSellersFisicos.length === 0 ? '<tr><td colspan="3" style="padding:4px; text-align:center; color:#64748b;">Sin datos</td></tr>' :
              topSellersFisicos.map(s => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 3px;"><strong>${s.nombre}</strong></td>
                  <td style="padding: 3px; text-align: center;">${s.count}</td>
                  <td style="padding: 3px; text-align: right; font-weight: bold;">${formatCurrency(s.total)}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- SECCION 3: DESGLOSE POR VENDEDOR Y PRESUPUESTO -->
    <div style="font-size: 10.5px; font-weight: bold; margin-bottom: 4px; color: #1e293b; border-bottom: 1px solid #94a3b8; padding-bottom: 2px;">
      4. DESGLOSE INDIVIDUALIZADO POR VENDEDOR Y EJERCICIO PRESUPUESTAL
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 16px;">
      <thead>
        <tr style="background: #e2e8f0; border-bottom: 1.5px solid #94a3b8; text-align: left;">
          <th style="padding: 4px;">Vendedor</th>
          <th style="padding: 4px;">Sucursal</th>
          <th style="padding: 4px; text-align: center;">Notas Físicas</th>
          <th style="padding: 4px; text-align: right;">Total Físico ($)</th>
          <th style="padding: 4px; text-align: center;">Notas Financieras</th>
          <th style="padding: 4px; text-align: right;">Consumo Financiero ($)</th>
          <th style="padding: 4px; text-align: right;">Ppto. Asignado ($)</th>
          <th style="padding: 4px; text-align: right;">Disponible Restante ($)</th>
          <th style="padding: 4px; text-align: center;">% Consumo</th>
        </tr>
      </thead>
      <tbody>
        ${vendsBreakdown.map(v => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 4px;"><strong>${v.vendedor}</strong></td>
            <td style="padding: 4px;">${v.sucursal}</td>
            <td style="padding: 4px; text-align: center;">${v.countFis}</td>
            <td style="padding: 4px; text-align: right; color:#2563eb;">${formatCurrency(v.montoFis)}</td>
            <td style="padding: 4px; text-align: center;">${v.countFin}</td>
            <td style="padding: 4px; text-align: right; color:#d97706; font-weight:bold;">${formatCurrency(v.consFin)}</td>
            <td style="padding: 4px; text-align: right;">${formatCurrency(v.limite)}</td>
            <td style="padding: 4px; text-align: right; color:#16a34a; font-weight:bold;">${formatCurrency(v.disponible)}</td>
            <td style="padding: 4px; text-align: center;">${v.pct.toFixed(1)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- SECCION 4: HISTORIAL DE NOTAS SELECCIONADAS -->
    <div style="font-size: 10.5px; font-weight: bold; margin-bottom: 4px; color: #1e293b; border-bottom: 1px solid #94a3b8; padding-bottom: 2px;">
      5. REGISTRO Y HISTORIAL DETALLADO DE NOTAS DE CRÉDITO (${todasNotasSeleccionadas.length} REGISTROS)
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 8.5px; margin-bottom: 20px;">
      <thead>
        <tr style="background: #e2e8f0; border-bottom: 1.5px solid #94a3b8; text-align: left;">
          <th style="padding: 3px;">Folio</th>
          <th style="padding: 3px;">Tipo</th>
          <th style="padding: 3px;">Sucursal</th>
          <th style="padding: 3px;">Vendedor</th>
          <th style="padding: 3px;">Cliente</th>
          <th style="padding: 3px;">Fecha</th>
          <th style="padding: 3px; text-align: right;">Total ($)</th>
          <th style="padding: 3px; text-align: center;">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${todasNotasSeleccionadas.length === 0 ? '<tr><td colspan="8" style="padding:5px; text-align:center; color:#64748b;">No hay registros con los filtros seleccionados</td></tr>' :
          todasNotasSeleccionadas.map(n => {
            const suc = sucursales.find(s => s.id === n.sucursalId);
            const cli = clientes.find(c => c.id === n.clienteId);
            const ven = vendedores.find(v => v.id === n.vendedorId);
            return `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 3px;"><strong>${n.folio}-${n.serie}</strong></td>
                <td style="padding: 3px;">${n.tipo === 'Fisico' ? 'Físico' : 'Financiero'}</td>
                <td style="padding: 3px;">${suc ? suc.nombre : 'N/A'}</td>
                <td style="padding: 3px;">${ven ? ven.nombre : 'N/A'}</td>
                <td style="padding: 3px;">${cli ? cli.nombre : 'N/A'}</td>
                <td style="padding: 3px;">${n.fechaEmision ? String(n.fechaEmision).substring(0, 10) : ''}</td>
                <td style="padding: 3px; text-align: right; font-weight: bold;">${formatCurrency(n.total)}</td>
                <td style="padding: 3px; text-align: center;">${getNotaDisplayState(n)}</td>
              </tr>
            `;
          }).join('')
        }
      </tbody>
    </table>

    <!-- SECCION FIRMAS -->
    <div style="margin-top: 30px; page-break-inside: avoid;">
      <div style="font-weight: bold; font-size: 10px; margin-bottom: 16px; text-align: center;">VALIDEZ Y CONFIRMACIÓN MEDIANTE FIRMAS AUTÓGRAFAS</div>
      <div style="display: flex; justify-content: space-around; gap: 15px;">
        <div style="text-align: center; width: 30%;">
          <div style="border-bottom: 1px solid #000; height: 32px; margin-bottom: 3px;"></div>
          <div style="font-size: 9px; font-weight: bold;">FIRMA VENDEDOR(ES)</div>
          <div style="font-size: 8px; color: #64748b;">Conformidad Devoluciones e Incidencias</div>
        </div>
        <div style="text-align: center; width: 30%;">
          <div style="border-bottom: 1px solid #000; height: 32px; margin-bottom: 3px;"></div>
          <div style="font-size: 9px; font-weight: bold;">GERENCIA DE SUCURSAL</div>
          <div style="font-size: 8.5px; color: #64748b;">Inspección e Inventario</div>
        </div>
        <div style="text-align: center; width: 30%;">
          <div style="border-bottom: 1px solid #000; height: 32px; margin-bottom: 3px;"></div>
          <div style="font-size: 9px; font-weight: bold;">ADMINISTRACIÓN GENERAL</div>
          <div style="font-size: 8.5px; color: #64748b;">Autorización y Cierre de Ejercicio</div>
        </div>
      </div>
    </div>
  `;

  printArea.appendChild(div);
  window.print();
}

// --- 12. VIEW: MÓDULO FALTANTES EN PICKINGS (ANTES DE SURTIR) ---
let instanceChartFaltantesHorizontal = null;
let currentPkChartPeriod = 'mes';

function setupFaltantesPickingView() {
  const form = document.getElementById('form-faltante-picking');
  if (!form || form.dataset.initialized === 'true') return;
  form.dataset.initialized = 'true';

  // Llenar dropdowns
  refreshAllModuleDropdowns();
  populatePickingProductDatalist();

  // Autocompletado dinámico de descripción al escribir/seleccionar código
  const inputCodigo = document.getElementById('pk-codigo');
  const inputDesc = document.getElementById('pk-descripcion');
  if (inputCodigo && inputDesc) {
    inputCodigo.addEventListener('input', (e) => {
      const val = e.target.value.trim().toUpperCase();
      if (!val) return;
      const match = productosMasterPicking.find(p => String(p.codigoInterno).trim().toUpperCase() === val);
      if (match && match.descripcion) {
        inputDesc.value = match.descripcion;
      }
    });
  }

  // Envío de formulario
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (currentUser.rol === 'Vendedor') {
      alert("Acceso denegado: Los vendedores no pueden registrar faltantes en pickings.");
      return;
    }

    const numPicking = document.getElementById('pk-num-picking').value.trim();
    const clienteId = document.getElementById('pk-cliente').value;
    const codigo = document.getElementById('pk-codigo').value.trim().toUpperCase();
    const descripcion = document.getElementById('pk-descripcion').value.trim();
    const cantidad = parseInt(document.getElementById('pk-cantidad').value) || 0;
    const sucursalId = document.getElementById('pk-sucursal').value;
    const observaciones = document.getElementById('pk-observaciones').value.trim();

    if (!numPicking || !clienteId || !codigo || !descripcion || cantidad <= 0 || !sucursalId) {
      alert("Por favor completa todos los campos requeridos con datos válidos.");
      return;
    }

    const cliObj = clientes.find(c => c.id === clienteId);
    const cliNombre = cliObj ? cliObj.nombre : 'Cliente General';
    const sucObj = sucursales.find(s => s.id === sucursalId);
    const sucNombre = sucObj ? sucObj.nombre : 'Sucursal Matriz';

    const fechaHoy = new Date().toISOString().split('T')[0];

    const nuevoFaltante = {
      id: 'FP-' + Date.now(),
      numPicking: numPicking,
      fecha: fechaHoy,
      fechaRegistro: new Date().toISOString(),
      clienteId: clienteId,
      clienteNombre: cliNombre,
      codigoInterno: codigo,
      descripcion: descripcion,
      cantidad: cantidad,
      sucursalId: sucursalId,
      sucursalNombre: sucNombre,
      observaciones: observaciones,
      usuarioId: currentUser.id,
      usuarioNombre: currentUser.nombre,
      usuarioRol: currentUser.rol
    };

    // 1. Guardar en memoria de faltantes
    faltantesPicking.unshift(nuevoFaltante);
    saveData('ca_faltantes_picking', faltantesPicking);

    // 2. Guardar/Actualizar catálogo máster de productos reutilizables
    const masterIdx = productosMasterPicking.findIndex(p => String(p.codigoInterno).trim().toUpperCase() === codigo);
    if (masterIdx !== -1) {
      productosMasterPicking[masterIdx].descripcion = descripcion;
    } else {
      productosMasterPicking.push({ codigoInterno: codigo, descripcion: descripcion });
    }
    saveData('ca_productos_picking_master', productosMasterPicking);

    // 3. Enviar a la API remota si está disponible
    try {
      await fetch('/api/faltantes-picking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoFaltante)
      });
    } catch (err) {
      console.warn("No se pudo sincronizar faltante con la API:", err);
    }

    alert(`Faltante en Picking ${numPicking} registrado con éxito (${cantidad} unidades de ${codigo}).`);
    form.reset();
    if (currentUser.sucursalId) {
      document.getElementById('pk-sucursal').value = currentUser.sucursalId;
    }

    populatePickingProductDatalist();
    renderFaltantesPickingView();
  });

  // Listeners para filtros de gráfica por período
  const periodButtons = document.querySelectorAll('#pk-chart-period-filters button');
  periodButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      periodButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentPkChartPeriod = e.target.dataset.period || 'mes';
      renderFaltantesPickingHorizontalChart(currentPkChartPeriod);
    });
  });

  // Listeners para filtros de la tabla de histórico
  ['filter-pk-fecha-inicio', 'filter-pk-fecha-fin', 'filter-pk-cliente', 'filter-pk-search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => renderFaltantesPickingTable());
      el.addEventListener('input', () => renderFaltantesPickingTable());
    }
  });
}

function populatePickingProductDatalist() {
  const datalist = document.getElementById('list-productos-picking');
  if (!datalist) return;
  datalist.innerHTML = '';
  productosMasterPicking.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.codigoInterno;
    opt.textContent = `${p.codigoInterno} - ${p.descripcion}`;
    datalist.appendChild(opt);
  });
}

function renderFaltantesPickingView() {
  if (!currentUser) return;
  refreshAllModuleDropdowns();
  populatePickingProductDatalist();

  // Autoseleccionar sucursal del usuario
  const selectSuc = document.getElementById('pk-sucursal');
  if (selectSuc && currentUser.sucursalId && !selectSuc.value) {
    selectSuc.value = currentUser.sucursalId;
  }

  renderFaltantesPickingTable();
  renderFaltantesPickingHorizontalChart(currentPkChartPeriod);
}

function renderFaltantesPickingTable() {
  const tbody = document.querySelector('#table-faltantes-picking-results tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const fInicio = document.getElementById('filter-pk-fecha-inicio')?.value || '';
  const fFin = document.getElementById('filter-pk-fecha-fin')?.value || '';
  const cliSel = document.getElementById('filter-pk-cliente')?.value || '';
  const query = (document.getElementById('filter-pk-search')?.value || '').toLowerCase().trim();

  let filtrados = faltantesPicking.filter(n => {
    if (n.eliminado) return false;

    // Filtro sucursal para Gerente
    if (currentUser.rol === 'Gerente' && n.sucursalId !== currentUser.sucursalId) {
      return false;
    }

    if (fInicio && n.fecha < fInicio) return false;
    if (fFin && n.fecha > fFin) return false;
    if (cliSel && n.clienteId !== cliSel) return false;
    if (query) {
      const matchPk = String(n.numPicking || '').toLowerCase().includes(query);
      const matchCod = String(n.codigoInterno || '').toLowerCase().includes(query);
      const matchDesc = String(n.descripcion || '').toLowerCase().includes(query);
      const matchCli = String(n.clienteNombre || '').toLowerCase().includes(query);
      if (!matchPk && !matchCod && !matchDesc && !matchCli) return false;
    }
    return true;
  });

  // Guardar resultado global para exportación
  window.currentFaltantesPickingFiltered = filtrados;

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--text-muted);">No hay faltantes en picking registrados para los filtros seleccionados.</td></tr>`;
    document.getElementById('pk-total-units').textContent = '0';
    return;
  }

  let totalUnidades = 0;

  filtrados.forEach(item => {
    const cant = parseInt(item.cantidad) || 0;
    totalUnidades += cant;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.fecha || ''}</td>
      <td><strong>${item.numPicking || 'N/A'}</strong></td>
      <td>${item.clienteNombre || 'N/A'}</td>
      <td><span class="badge badge-secondary" style="font-family:monospace;">${item.codigoInterno || ''}</span></td>
      <td><strong>${item.descripcion || ''}</strong></td>
      <td style="text-align: center; color: var(--danger-color); font-size: 14px; font-weight: 700;">${cant}</td>
      <td>${item.sucursalNombre || 'N/A'}</td>
      <td>${item.usuarioNombre || 'Usuario'} (${item.usuarioRol || 'Rol'})</td>
      <td style="text-align: center;">
        <button class="btn btn-danger btn-sm" onclick="deleteFaltantePicking('${item.id}')" title="Eliminar Incidencia" style="padding: 2px 8px;"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalEl = document.getElementById('pk-total-units');
  if (totalEl) totalEl.textContent = totalUnidades.toLocaleString('es-MX');
}

function renderFaltantesPickingHorizontalChart(period = 'mes') {
  const canvasEl = document.getElementById('chartFaltantesPickingHorizontal');
  if (!canvasEl || typeof Chart === 'undefined') return;

  const hoyStr = new Date().toISOString().split('T')[0];
  const hoyDt = new Date(hoyStr);

  let filtrados = faltantesPicking.filter(n => !n.eliminado);

  if (currentUser.rol === 'Gerente') {
    filtrados = filtrados.filter(n => n.sucursalId === currentUser.sucursalId);
  }

  filtrados = filtrados.filter(n => {
    if (!n.fecha) return true;
    if (period === 'dia') {
      return n.fecha === hoyStr;
    } else if (period === 'semana') {
      const nDt = new Date(n.fecha);
      const diffTime = Math.abs(hoyDt - nDt);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    } else if (period === 'mes') {
      return n.fecha.substring(0, 7) === hoyStr.substring(0, 7);
    }
    return true; // 'todo'
  });

  // Agrupar por producto (Código - Descripción)
  const productTotals = {};
  filtrados.forEach(item => {
    const key = `${item.codigoInterno} - ${item.descripcion}`;
    const qty = parseInt(item.cantidad) || 0;
    if (!productTotals[key]) {
      productTotals[key] = { label: key, cantidad: 0 };
    }
    productTotals[key].cantidad += qty;
  });

  let sorted = Object.values(productTotals).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);

  if (sorted.length === 0) {
    sorted = [
      { label: 'ART-101 - Aceite Vegetal 1L', cantidad: 24 },
      { label: 'ART-102 - Arroz Súper Extra 1kg', cantidad: 18 },
      { label: 'ART-103 - Frijol Negro 1kg', cantidad: 12 },
      { label: 'ART-104 - Harina de Trigo 1kg', cantidad: 8 }
    ];
  }

  const labels = sorted.map(i => i.label);
  const dataValues = sorted.map(i => i.cantidad);

  if (instanceChartFaltantesHorizontal) {
    instanceChartFaltantesHorizontal.destroy();
  }

  const ctx = canvasEl.getContext('2d');
  instanceChartFaltantesHorizontal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Unidades Faltantes en Picking',
        data: dataValues,
        backgroundColor: 'rgba(220, 38, 38, 0.85)',
        borderColor: 'rgba(185, 28, 28, 1)',
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y', // Convertir a Gráfica de Barras Horizontal
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label: function (context) {
              return ` ${context.raw} unidades faltantes en picking`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

window.deleteFaltantePicking = function(id) {
  if (!confirm("¿Estás seguro de que deseas eliminar este registro de faltante en picking?")) return;
  const idx = faltantesPicking.findIndex(n => n.id === id);
  if (idx !== -1) {
    faltantesPicking.splice(idx, 1);
    saveData('ca_faltantes_picking', faltantesPicking);
    try {
      fetch(`/api/faltantes-picking/${id}`, { method: 'DELETE' });
    } catch (err) {}
    alert("Registro eliminado.");
    renderFaltantesPickingView();
  }
};

window.exportFaltantesPickingToCSV = function() {
  const items = window.currentFaltantesPickingFiltered || faltantesPicking.filter(n => !n.eliminado);

  const fInicio = document.getElementById('filter-pk-fecha-inicio')?.value || 'Inicio';
  const fFin = document.getElementById('filter-pk-fecha-fin')?.value || 'Hoy';
  const fechaHoy = new Date().toISOString().split('T')[0];

  let csvContent = "\uFEFF";
  csvContent += "=== CASA AYALA - REPORTE DE INCIDENCIAS DE FALTANTES EN PICKINGS ===\n";
  csvContent += `Fecha Generación,${fechaHoy}\n`;
  csvContent += `Período Consultado,${fInicio} al ${fFin}\n`;
  csvContent += `Generado Por,${currentUser ? currentUser.nombre : 'Usuario'} (${currentUser ? currentUser.rol : 'Rol'})\n\n`;

  csvContent += "Fecha,No. Picking,Cliente,Sucursal,Código Interno,Descripción Producto,Cantidad Faltante,Observaciones,Capturó\n";

  let totalUnidades = 0;

  items.forEach(n => {
    const qty = parseInt(n.cantidad) || 0;
    totalUnidades += qty;
    const cleanObs = String(n.observaciones || '').replace(/,/g, ' ');
    const cleanDesc = String(n.descripcion || '').replace(/,/g, ' ');
    const cleanCli = String(n.clienteNombre || '').replace(/,/g, ' ');
    csvContent += `${n.fecha || ''},"${n.numPicking || ''}","${cleanCli}","${n.sucursalNombre || ''}","${n.codigoInterno || ''}","${cleanDesc}",${qty},"${cleanObs}","${n.usuarioNombre || ''}"\n`;
  });

  csvContent += `\nTOTAL REGISTROS,${items.length}\n`;
  csvContent += `TOTAL UNIDADES FALTANTES,${totalUnidades}\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `CasaAyala_Faltantes_Picking_${fechaHoy}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.printFaltantesPickingReport = function() {
  const items = window.currentFaltantesPickingFiltered || faltantesPicking.filter(n => !n.eliminado);
  const printArea = document.getElementById('print-area');
  if (!printArea) return;

  const fInicio = document.getElementById('filter-pk-fecha-inicio')?.value || '';
  const fFin = document.getElementById('filter-pk-fecha-fin')?.value || '';
  const periodText = (fInicio || fFin) ? `${fInicio || 'Inicio'} al ${fFin || 'Hoy'}` : 'Período Completo';

  let totalUnidades = 0;

  printArea.innerHTML = '';
  const div = document.createElement('div');
  div.style.padding = '20px';
  div.style.fontFamily = 'Inter, sans-serif';
  div.style.color = '#000';

  div.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #800000; padding-bottom:10px; margin-bottom:15px;">
      <div>
        <h2 style="margin:0; font-size:18px; color:#800000;">CASA AYALA - REPORTE DE FALTANTES EN PICKING</h2>
        <div style="font-size:11px; color:#475569;">Incidencias Detectadas Antes del Surtido de Mercancía</div>
      </div>
      <div style="text-align:right; font-size:11px;">
        <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-MX')}</div>
        <div><strong>Período:</strong> ${periodText}</div>
        <div><strong>Usuario:</strong> ${currentUser ? currentUser.nombre : ''} (${currentUser ? currentUser.rol : ''})</div>
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:10px; margin-bottom:20px;">
      <thead>
        <tr style="background:#f1f5f9; border-bottom:1px solid #000;">
          <th style="padding:6px; text-align:left;">Fecha</th>
          <th style="padding:6px; text-align:left;">No. Picking</th>
          <th style="padding:6px; text-align:left;">Cliente</th>
          <th style="padding:6px; text-align:left;">Código</th>
          <th style="padding:6px; text-align:left;">Descripción Producto</th>
          <th style="padding:6px; text-align:center;">Cant. Faltante</th>
          <th style="padding:6px; text-align:left;">Sucursal</th>
          <th style="padding:6px; text-align:left;">Observaciones</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const qty = parseInt(item.cantidad) || 0;
          totalUnidades += qty;
          return `
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:5px;">${item.fecha || ''}</td>
              <td style="padding:5px;"><strong>${item.numPicking || ''}</strong></td>
              <td style="padding:5px;">${item.clienteNombre || ''}</td>
              <td style="padding:5px;">${item.codigoInterno || ''}</td>
              <td style="padding:5px;">${item.descripcion || ''}</td>
              <td style="padding:5px; text-align:center; font-weight:bold; color:#dc2626;">${qty}</td>
              <td style="padding:5px;">${item.sucursalNombre || ''}</td>
              <td style="padding:5px;">${item.observaciones || 'N/A'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div style="text-align:right; font-size:13px; font-weight:bold; margin-bottom:30px;">
      TOTAL UNIDADES FALTANTES EN EL PERÍODO: <span style="color:#dc2626;">${totalUnidades.toLocaleString('es-MX')}</span>
    </div>

    <div style="margin-top:40px; page-break-inside:avoid;">
      <div style="display:flex; justify-content:space-around;">
        <div style="text-align:center; width:35%;">
          <div style="border-bottom:1px solid #000; height:35px; margin-bottom:5px;"></div>
          <div style="font-size:10px; font-weight:bold;">SUPERVISIÓN DE ALMACÉN / PICKING</div>
          <div style="font-size:9px; color:#64748b;">Reporte e Inspección de Faltantes</div>
        </div>
        <div style="text-align:center; width:35%;">
          <div style="border-bottom:1px solid #000; height:35px; margin-bottom:5px;"></div>
          <div style="font-size:10px; font-weight:bold;">CONTABILIDAD / GERENCIA</div>
          <div style="font-size:9px; color:#64748b;">Revisión y Ajuste de Inv. / Compras</div>
        </div>
      </div>
    </div>
  `;

  printArea.appendChild(div);
  window.print();
};
