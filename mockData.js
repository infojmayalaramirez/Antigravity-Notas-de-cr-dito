// mockData.js
// Datos iniciales de producción para Casa Ayala del Noroeste S.A. de C.V.
// Se incluye únicamente el Administrador Universal inicial para inicio de operaciones.

const INITIAL_SUCURSALES = [
  { id: "S01", nombre: "Tijuana Matriz", direccion: "Av. España #1168, Col. Moderna", activaFinanciera: true },
  { id: "S02", nombre: "Mexicali Centro", direccion: "Blvd. Benito Juárez #450, Col. Jardines", activaFinanciera: true },
  { id: "S03", nombre: "Ensenada Puerto", direccion: "Av. Ruiz #120, Col. Centro", activaFinanciera: false }
];

const INITIAL_USUARIOS = [
  { id: "U01", nombre: "Administrador Universal", email: "admin@casaayala.com", rol: "Administrador", sucursalId: "S01", nip: "4819", intentosFallidos: 0, bloqueado: false, adminTipo: "Ambos" }
];

const INITIAL_CLIENTES = [];
const INITIAL_OPERADORES = [];
const INITIAL_VENDEDORES = [];
const INITIAL_PRESUPUESTOS = [];
const INITIAL_PROVEEDORES = [];
const INITIAL_NOTAS = [];

// Hacer disponibles los datos en el scope global
window.INITIAL_SUCURSALES = INITIAL_SUCURSALES;
window.INITIAL_USUARIOS = INITIAL_USUARIOS;
window.INITIAL_CLIENTES = INITIAL_CLIENTES;
window.INITIAL_OPERADORES = INITIAL_OPERADORES;
window.INITIAL_VENDEDORES = INITIAL_VENDEDORES;
window.INITIAL_PRESUPUESTOS = INITIAL_PRESUPUESTOS;
window.INITIAL_PROVEEDORES = INITIAL_PROVEEDORES;
window.INITIAL_NOTAS = INITIAL_NOTAS;
