// mockData.js
// Datos iniciales de producción para Casa Ayala del Noroeste S.A. de C.V.
// Se incluye únicamente el Administrador Universal inicial para inicio de operaciones.

const INITIAL_SUCURSALES = [
  { id: "S01", nombre: "Tijuana Matriz", direccion: "Av. España #1168, Col. Moderna", activaFinanciera: true },
  { id: "S02", nombre: "Mexicali Centro", direccion: "Blvd. Benito Juárez #450, Col. Jardines", activaFinanciera: true },
  { id: "S03", nombre: "Ensenada Puerto", direccion: "Av. Ruiz #120, Col. Centro", activaFinanciera: false }
];

const INITIAL_USUARIOS = [
  { id: "U01", id_usuario: "U01", nombre: "Administrador Universal", email: "admin@casaayala.com", rol: "Administrador", sucursalId: "S01", id_sucursal: "S01", nip: "4819", intentosFallidos: 0, bloqueado: false, adminTipo: "Ambos" },
  { id: "U02", id_usuario: "U02", nombre: "Consuelo Carrillo", email: "consuelo.carrillo2022@gmail.com", rol: "Administrador", sucursalId: "S01", id_sucursal: "S01", nip: "2526", intentosFallidos: 0, bloqueado: false, adminTipo: "Ambos" }
];

const INITIAL_CLIENTES = [
  { id: "C01", nombre: "Rosalina Varela Rivera", codigoInterno: "2543", tieneDerechoDescuento: true, eliminado: false },
  { id: "C02", nombre: "Alejandro Ortiz", codigoInterno: "47", tieneDerechoDescuento: true, eliminado: false },
  { id: "C03", nombre: "Pasicos el Carrizo", codigoInterno: "65", tieneDerechoDescuento: true, eliminado: false },
  { id: "C04", nombre: "Perez González", codigoInterno: "500", tieneDerechoDescuento: true, eliminado: false },
  { id: "C05", nombre: "Laura Cristina Rodríguez", codigoInterno: "1079", tieneDerechoDescuento: true, eliminado: false },
  { id: "C06", nombre: "Oscar", codigoInterno: "899", tieneDerechoDescuento: true, eliminado: false },
  { id: "C07", nombre: "Armando Montoya", codigoInterno: "92", tieneDerechoDescuento: true, eliminado: false },
  { id: "C08", nombre: "Salvador", codigoInterno: "78", tieneDerechoDescuento: true, eliminado: false },
  { id: "C09", nombre: "Mariana Luelmo", codigoInterno: "1444", tieneDerechoDescuento: true, eliminado: false },
  { id: "C10", nombre: "Octavio Cortés Flor", codigoInterno: "252", tieneDerechoDescuento: true, eliminado: false },
  { id: "C11", nombre: "Festeja", codigoInterno: "96", tieneDerechoDescuento: true, eliminado: false },
  { id: "C12", nombre: "Saúl Abud Lara", codigoInterno: "1464", tieneDerechoDescuento: true, eliminado: false },
  { id: "C13", nombre: "Soichi Mejia Fukunag", codigoInterno: "268", tieneDerechoDescuento: true, eliminado: false },
  { id: "C14", nombre: "Verónica Estrada Martín", codigoInterno: "893", tieneDerechoDescuento: true, eliminado: false },
  { id: "C15", nombre: "Valentín López", codigoInterno: "266", tieneDerechoDescuento: true, eliminado: false },
  { id: "C16", nombre: "Ismael Salcido Gutiérrez", codigoInterno: "49", tieneDerechoDescuento: true, eliminado: false },
  { id: "C17", nombre: "María Lizeth Magaña", codigoInterno: "903", tieneDerechoDescuento: true, eliminado: false },
  { id: "C18", nombre: "Chela Garcia", codigoInterno: "47", tieneDerechoDescuento: true, eliminado: false },
  { id: "C19", nombre: "Joaquin", codigoInterno: "53", tieneDerechoDescuento: true, eliminado: false },
  { id: "C20", nombre: "Victor Ramón Villa Llamas", codigoInterno: "68", tieneDerechoDescuento: true, eliminado: false },
  { id: "C21", nombre: "Leonor Medrano Carbajal", codigoInterno: "72", tieneDerechoDescuento: true, eliminado: false },
  { id: "C22", nombre: "Humberto", codigoInterno: "912", tieneDerechoDescuento: true, eliminado: false },
  { id: "C23", nombre: "Ponce", codigoInterno: "257", tieneDerechoDescuento: true, eliminado: false },
  { id: "C24", nombre: "Manuel Díaz", codigoInterno: "15117", tieneDerechoDescuento: true, eliminado: false },
  { id: "C25", nombre: "Virginia Vázquez Ruvalcaba", codigoInterno: "151", tieneDerechoDescuento: true, eliminado: false },
  { id: "C26", nombre: "David Álvarez Castro", codigoInterno: "25", tieneDerechoDescuento: true, eliminado: false }
];
const INITIAL_OPERADORES = [
  { id: "O01", nombre: "Don Chava", puesto: "Operador", eliminado: false }
];
const INITIAL_VENDEDORES = [];
const INITIAL_PRESUPUESTOS = [];
const INITIAL_PROVEEDORES = [
  { id: "P01", nombre: "Distribuidora de la Rosa", desc1: 3, desc2: 2, desc3: 0, clientesCajon: ["C01"], fechaInicio: "2026-08-20", fechaFin: "2026-08-25", tipoPromo: "clientes_exclusivos", eliminado: false }
];
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
