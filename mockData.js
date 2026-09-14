// mockData.js
// Datos iniciales de producción para Casa Ayala del Noroeste S.A. de C.V.
// Se incluye únicamente el Administrador Universal inicial para inicio de operaciones.

const INITIAL_SUCURSALES = [
  { id: "S01", nombre: "Tijuana Matriz", direccion: "Av. España #1168, Col. Moderna", activaFinanciera: true },
  { id: "S02", nombre: "Mexicali Centro", direccion: "Blvd. Benito Juárez #450, Col. Jardines", activaFinanciera: true },
  { id: "S03", nombre: "Ensenada Puerto", direccion: "Av. Ruiz #120, Col. Centro", activaFinanciera: false }
];

const INITIAL_USUARIOS = [
  { id: "U01", id_usuario: "U01", nombre: "Administrador Universal", email: "cansagdl@gmail.com", rol: "Administrador", sucursalId: "S01", id_sucursal: "S01", nip: "4819", intentosFallidos: 0, bloqueado: false, adminTipo: "Ambos", telefono: "3339567196" },
  { id: "U02", id_usuario: "U02", nombre: "Consuelo Carrillo", email: "consuelo.carrillo2022@gmail.com", rol: "Contabilidad", sucursalId: "S01", id_sucursal: "S01", nip: "1145", intentosFallidos: 0, bloqueado: false, adminTipo: "Ninguno", telefono: "3313613035" },
  { id: "U04", id_usuario: "U04", nombre: "Laura Sanchez", email: "laurasanchezvazquez07@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "2020", intentosFallidos: 0, bloqueado: false, adminTipo: "Ninguno", telefono: "6641234567" },
  { id: "U48921", id_usuario: "U48921", nombre: "Araceli Escobar", email: "lafer7522@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "4823", intentosFallidos: 0, bloqueado: false, adminTipo: "Ninguno", telefono: "6647654321" }
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
