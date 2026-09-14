// netlify/functions/sync.js
// Cloud Database Sync Endpoint for Casa Ayala Notas de Crédito
// Serves as the central persistent cloud store across all mobile and desktop devices.

let globalStore = {
  clientes: [],
  notas: [],
  operadores: [],
  vendedores: [],
  proveedores: [],
  presupuestos: [],
  faltantes: [],
  usuarios: [
    { id: "U01", id_usuario: "U01", nombre: "Administrador Universal", email: "cansagdl@gmail.com", rol: "Administrador", sucursalId: "S01", id_sucursal: "S01", nip: "4819", bloqueado: false, adminTipo: "Ambos", telefono: "3339567196" },
    { id: "U02", id_usuario: "U02", nombre: "Consuelo Carrillo", email: "consuelo.carrillo2022@gmail.com", rol: "Contabilidad", sucursalId: "S01", id_sucursal: "S01", nip: "1145", bloqueado: false, adminTipo: "Ninguno", telefono: "3313613035" },
    { id: "U04", id_usuario: "U04", nombre: "Laura Sanchez", email: "laurasanchezvazquez07@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "2020", bloqueado: false, adminTipo: "Ninguno", telefono: "6641234567" },
    { id: "U48921", id_usuario: "U48921", nombre: "Araceli Escobar", email: "lafer7522@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "4823", bloqueado: false, adminTipo: "Ninguno", telefono: "6647654321" }
  ],
  sucursales: [
    { id: "S01", nombre: "Tijuana Matriz", direccion: "Av. España #1168, Col. Moderna", activaFinanciera: true },
    { id: "S02", nombre: "Mexicali Centro", direccion: "Blvd. Benito Juárez #450, Col. Jardines", activaFinanciera: true },
    { id: "S03", nombre: "Ensenada Puerto", direccion: "Av. Ruiz #120, Col. Centro", activaFinanciera: false }
  ],
  updatedAt: new Date().toISOString()
};

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(globalStore)
    };
  }

  if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
    try {
      const body = JSON.parse(event.body || '{}');
      if (body) {
        if (Array.isArray(body.clientes)) globalStore.clientes = body.clientes;
        if (Array.isArray(body.notas)) globalStore.notas = body.notas;
        if (Array.isArray(body.operadores)) globalStore.operadores = body.operadores;
        if (Array.isArray(body.vendedores)) globalStore.vendedores = body.vendedores;
        if (Array.isArray(body.proveedores)) globalStore.proveedores = body.proveedores;
        if (Array.isArray(body.presupuestos)) globalStore.presupuestos = body.presupuestos;
        if (Array.isArray(body.faltantes)) globalStore.faltantes = body.faltantes;
        if (Array.isArray(body.usuarios) && body.usuarios.length > 0) globalStore.usuarios = body.usuarios;
        globalStore.updatedAt = new Date().toISOString();
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, updatedAt: globalStore.updatedAt, store: globalStore })
      };
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON payload' })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method Not Allowed' })
  };
};
