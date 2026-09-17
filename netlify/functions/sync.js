// netlify/functions/sync.js
// Cloud Database Sync Endpoint for Casa Ayala Notas de Crédito
// Serves as the central persistent cloud store across all mobile and desktop devices 24/7.

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

let globalStore = {
  clientes: [
    { id: "2543", codigo: "2543", nombre: "Rosalina Varela Rivera", derechoDescuento: true },
    { id: "2471", codigo: "2471", nombre: "Alejandro Ortiz", derechoDescuento: true },
    { id: "001", codigo: "001", nombre: "Pepe Ayala", derechoDescuento: true },
    { id: "2465", codigo: "2465", nombre: "Plasticos el Carrousel", derechoDescuento: true },
    { id: "2500", codigo: "2500", nombre: "Pedro Perez González", derechoDescuento: true },
    { id: "PRU20260917_1", codigo: "PRU20260917", nombre: "Cliente P", derechoDescuento: false },
    { id: "PRU20260917_2", codigo: "PRU20260917", nombre: "Cliente Prueba Remota SQL", derechoDescuento: false }
  ],
  notas: [],
  operadores: [],
  vendedores: [],
  proveedores: [],
  presupuestos: [],
  faltantes: [],
  usuarios: [
    { id: "U01", id_usuario: "U01", nombre: "Administrador Universal", email: "cansagdl@gmail.com", rol: "Administrador", sucursalId: "S01", id_sucursal: "S01", nip: "4819", bloqueado: false, adminTipo: "Ambos", telefono: "3339567196", direccion: "" },
    { id: "U02", id_usuario: "U02", nombre: "Consuelo Carrillo", email: "consuelo.carrillo2022@gmail.com", rol: "Contabilidad", sucursalId: "S01", id_sucursal: "S01", nip: "1145", bloqueado: false, adminTipo: "Ninguno", telefono: "3313613035", direccion: "" },
    { id: "U04", id_usuario: "U04", nombre: "Laura Sanchez", email: "laurasanchezvazquez07@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "2020", bloqueado: false, adminTipo: "Ninguno", telefono: "6641234567", direccion: "" },
    { id: "U48921", id_usuario: "U48921", nombre: "Araceli Escobar", email: "lafer7522@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "4823", bloqueado: false, adminTipo: "Ninguno", telefono: "6647654321", direccion: "" }
  ],
  sucursales: [
    { id: "S01", id_sucursal: "S01", nombre: "Tijuana Matriz", direccion: "Av. España #1168, Col. Moderna", activaFinanciera: true },
    { id: "S02", id_sucursal: "S02", nombre: "Mexicali Centro", direccion: "Blvd. Benito Juárez #450, Col. Jardines", activaFinanciera: true },
    { id: "S03", id_sucursal: "S03", nombre: "Ensenada Puerto", direccion: "Av. Ruiz #120, Col. Centro", activaFinanciera: false }
  ],
  updatedAt: new Date().toISOString()
};

const fs = require('fs');
const path = require('path');

function getDiskStore() {
  try {
    const diskPath = path.join(__dirname, '../../catalog_store.json');
    if (fs.existsSync(diskPath)) {
      return JSON.parse(fs.readFileSync(diskPath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  const diskData = getDiskStore();
  if (diskData) {
    if (Array.isArray(diskData.clientes)) globalStore.clientes = safeMergeArrays(globalStore.clientes, diskData.clientes);
    if (Array.isArray(diskData.usuarios)) globalStore.usuarios = safeMergeArrays(globalStore.usuarios, diskData.usuarios);
    if (Array.isArray(diskData.sucursales)) globalStore.sucursales = safeMergeArrays(globalStore.sucursales, diskData.sucursales);
    if (Array.isArray(diskData.notas)) globalStore.notas = safeMergeArrays(globalStore.notas, diskData.notas);
    if (Array.isArray(diskData.operadores)) globalStore.operadores = safeMergeArrays(globalStore.operadores, diskData.operadores);
    if (Array.isArray(diskData.vendedores)) globalStore.vendedores = safeMergeArrays(globalStore.vendedores, diskData.vendedores);
    if (Array.isArray(diskData.proveedores)) globalStore.proveedores = safeMergeArrays(globalStore.proveedores, diskData.proveedores);
    if (Array.isArray(diskData.presupuestos)) globalStore.presupuestos = safeMergeArrays(globalStore.presupuestos, diskData.presupuestos);
    if (Array.isArray(diskData.faltantes)) globalStore.faltantes = safeMergeArrays(globalStore.faltantes, diskData.faltantes);
  }

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
        if (Array.isArray(body.clientes)) globalStore.clientes = safeMergeArrays(globalStore.clientes, body.clientes);
        if (Array.isArray(body.notas)) globalStore.notas = safeMergeArrays(globalStore.notas, body.notas);
        if (Array.isArray(body.operadores)) globalStore.operadores = safeMergeArrays(globalStore.operadores, body.operadores);
        if (Array.isArray(body.vendedores)) globalStore.vendedores = safeMergeArrays(globalStore.vendedores, body.vendedores);
        if (Array.isArray(body.proveedores)) globalStore.proveedores = safeMergeArrays(globalStore.proveedores, body.proveedores);
        if (Array.isArray(body.presupuestos)) globalStore.presupuestos = safeMergeArrays(globalStore.presupuestos, body.presupuestos);
        if (Array.isArray(body.faltantes)) globalStore.faltantes = safeMergeArrays(globalStore.faltantes, body.faltantes);
        if (Array.isArray(body.usuarios)) globalStore.usuarios = safeMergeArrays(globalStore.usuarios, body.usuarios);
        if (Array.isArray(body.sucursales)) globalStore.sucursales = safeMergeArrays(globalStore.sucursales, body.sucursales);
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
