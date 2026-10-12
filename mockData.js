// mockData.js
// Datos maestros de respaldo y producción para Casa Ayala del Noroeste S.A. de C.V.
// Sincronizados directamente con la base de datos central Microsoft SQL Server.

const INITIAL_SUCURSALES = [
  { id: "S01", id_sucursal: "S01", nombre: "Tijuana Matriz", direccion: "Av. España #1168, Col. Moderna", activaFinanciera: true },
  { id: "S02", id_sucursal: "S02", nombre: "Mexicali Centro", direccion: "Blvd. Benito Juárez #450, Col. Jardines", activaFinanciera: true },
  { id: "S03", id_sucursal: "S03", nombre: "Ensenada Puerto", direccion: "Av. Ruiz #120, Col. Centro", activaFinanciera: false }
];

const INITIAL_USUARIOS = [
  { id: "U01", id_usuario: "U01", nombre: "Administrador Universal", email: "cansagdl@gmail.com", rol: "Administrador", sucursalId: "S01", id_sucursal: "S01", nip: "4819", intentosFallidos: 0, bloqueado: false, adminTipo: "Ambos", telefono: "3339567196", direccion: "" },
  { id: "U02", id_usuario: "U02", nombre: "Consuelo Carrillo", email: "consuelo.carrillo2022@gmail.com", rol: "Contabilidad", sucursalId: "S01", id_sucursal: "S01", nip: "1145", intentosFallidos: 0, bloqueado: false, adminTipo: "Ninguno", telefono: "3313613035", direccion: "" },
  { id: "U04", id_usuario: "U04", nombre: "Laura Sanchez", email: "laurasanchezvazquez07@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "2020", intentosFallidos: 0, bloqueado: false, adminTipo: "Ninguno", telefono: "6641234567", direccion: "" },
  { id: "U48921", id_usuario: "U48921", nombre: "Araceli Escobar", email: "lafer7522@gmail.com", rol: "Vendedor", sucursalId: "S01", id_sucursal: "S01", nip: "4823", intentosFallidos: 0, bloqueado: false, adminTipo: "Ninguno", telefono: "6647654321", direccion: "" }
];

const INITIAL_CLIENTES = [
  { id: "2543", codigo: "2543", codigoInterno: "2543", nombre: "Rosalina Varela Rivera", tieneDerechoDescuento: true, eliminado: false },
  { id: "2471", codigo: "2471", codigoInterno: "2471", nombre: "Alejandro Ortiz", tieneDerechoDescuento: true, eliminado: false },
  { id: "001", codigo: "001", codigoInterno: "001", nombre: "Pepe Ayala", tieneDerechoDescuento: true, eliminado: false },
  { id: "2465", codigo: "2465", codigoInterno: "2465", nombre: "Plasticos el Carrousel", tieneDerechoDescuento: true, eliminado: false },
  { id: "2500", codigo: "2500", codigoInterno: "2500", nombre: "Pedro Perez González", tieneDerechoDescuento: true, eliminado: false },
  { id: "C01", codigo: "C01", codigoInterno: "2468", nombre: "Comercializadora El Florido S.A. de C.V.", tieneDerechoDescuento: true, eliminado: false },
  { id: "C02", codigo: "C02", codigoInterno: "2478", nombre: "Abarrotes y Carnes San José", tieneDerechoDescuento: true, eliminado: false },
  { id: "C03", codigo: "C03", codigoInterno: "2498", nombre: "Supermercados del Norte", tieneDerechoDescuento: true, eliminado: false },
  { id: "C04", codigo: "C04", codigoInterno: "2508", nombre: "Distribuidora Mayorista Ayala", tieneDerechoDescuento: true, eliminado: false },
  { id: "C05", codigo: "C05", codigoInterno: "2518", nombre: "Abarrotes El Zorro de Tijuana", tieneDerechoDescuento: true, eliminado: false },
  { id: "C06", codigo: "C06", codigoInterno: "2528", nombre: "Tiendas Bara Bara", tieneDerechoDescuento: true, eliminado: false },
  { id: "C07", codigo: "C07", codigoInterno: "2538", nombre: "Super Carnicerías La Esperanza", tieneDerechoDescuento: true, eliminado: false },
  { id: "C08", codigo: "C08", codigoInterno: "2548", nombre: "Mini Super El Porvenir", tieneDerechoDescuento: true, eliminado: false },
  { id: "C09", codigo: "C09", codigoInterno: "2558", nombre: "Abarrotes La Guadalupana", tieneDerechoDescuento: true, eliminado: false },
  { id: "C10", codigo: "C10", codigoInterno: "2568", nombre: "Comercializadora de Abarrotes del Río", tieneDerechoDescuento: true, eliminado: false },
  { id: "C11", codigo: "C11", codigoInterno: "2578", nombre: "Bodega del Carmen Abarrotes", tieneDerechoDescuento: true, eliminado: false },
  { id: "C12", codigo: "C12", codigoInterno: "2588", nombre: "Supermercado San Francisco", tieneDerechoDescuento: true, eliminado: false },
  { id: "C13", codigo: "C13", codigoInterno: "2598", nombre: "Abarrotera Central de Abastos", tieneDerechoDescuento: true, eliminado: false },
  { id: "C14", codigo: "C14", codigoInterno: "2608", nombre: "Comercial de Dulces y Abarrotes Ayala", tieneDerechoDescuento: true, eliminado: false },
  { id: "C15", codigo: "C15", codigoInterno: "2662", nombre: "Valentín López", tieneDerechoDescuento: true, eliminado: false },
  { id: "C16", codigo: "C16", codigoInterno: "2497", nombre: "Ismael Salcido Gutiérrez", tieneDerechoDescuento: true, eliminado: false },
  { id: "C17", codigo: "C17", codigoInterno: "9038", nombre: "María Lizeth Magaña Rodríguez", tieneDerechoDescuento: true, eliminado: false },
  { id: "C18", codigo: "C18", codigoInterno: "2470", nombre: "Martha Esthela Garcia González", tieneDerechoDescuento: true, eliminado: false },
  { id: "C20", codigo: "C20", codigoInterno: "2536", nombre: "Joaquin Lizaola Iñiguez", tieneDerechoDescuento: true, eliminado: false },
  { id: "C21", codigo: "C21", codigoInterno: "6871", nombre: "Victor Ramón Villa Llamas", tieneDerechoDescuento: true, eliminado: false },
  { id: "C22", codigo: "C22", codigoInterno: "2728", nombre: "Leonor Medina Carbajal", tieneDerechoDescuento: true, eliminado: false },
  { id: "C23", codigo: "C23", codigoInterno: "9124", nombre: "Humberto Salas Ortiz", tieneDerechoDescuento: true, eliminado: false },
  { id: "C24", codigo: "C24", codigoInterno: "2572", nombre: "María del Rosario Gutierrez Ponce", tieneDerechoDescuento: true, eliminado: false },
  { id: "C25", codigo: "C25", codigoInterno: "151179", nombre: "Manuela Díaz Díaz", tieneDerechoDescuento: true, eliminado: false },
  { id: "C26", codigo: "C26", codigoInterno: "15172", nombre: "Virginia Vázquez Ruvalcaba", tieneDerechoDescuento: true, eliminado: false },
  { id: "C27", codigo: "C27", codigoInterno: "2503", nombre: "David Alejandro Álvarez Castro", tieneDerechoDescuento: true, eliminado: false },
  { id: "C86174136", codigo: "C86174136", codigoInterno: "2000", nombre: "Pepe Ayala", tieneDerechoDescuento: true, eliminado: false },
  { id: "C87451051", codigo: "C87451051", codigoInterno: "001", nombre: "Benjamin ayala", tieneDerechoDescuento: true, eliminado: false }
];

const INITIAL_OPERADORES = [
  { id: "O01", nombre: "Don Chava", puesto: "Operador", eliminado: false }
];

const INITIAL_VENDEDORES = [
  { id: "V09987219", nombre: "Araceli Escobar", sucursalId: "S02", userId: "U48921", eliminado: false },
  { id: "V09993383", nombre: "Laura Sánchez", sucursalId: "S02", userId: "U04", eliminado: false }
];

const INITIAL_PROVEEDORES = [
  { id: "P01", nombre: "Distribuidora de la Rosa", desc1: 3, desc2: 2, desc3: 0, clientesCajon: [], fechaInicio: "2026-09-14", fechaFin: "2026-09-16", tipoPromo: "clientes_exclusivos", eliminado: false }
];

const INITIAL_PRESUPUESTOS = [];

const INITIAL_NOTAS = [
  {
    id: "N2",
    folio: "0002",
    tipo: "Fisico",
    tipo_nota: "Física",
    clienteId: "C01",
    operadorId: "OP01",
    vendedorId: "U01",
    sucursalId: "S01",
    total: 500,
    montoTotal: 500,
    subtotal: 500,
    fechaEmision: "2026-10-08",
    fechaAplicacion: "2026-10-10",
    estado_autorizacion: "Autorizada",
    estado_operacion: "Cancelada",
    estado: "Cancelada",
    serie: "A",
    firmas: { elaboro: null, almacen: null, autorizo: null, cliente: null },
    productos: []
  },
  {
    id: "N1001",
    folio: "1001",
    tipo: "Fisico",
    tipo_nota: "Física",
    clienteId: "",
    vendedorId: "U01",
    sucursalId: "S01",
    operadorId: "",
    total: 250,
    montoTotal: 250,
    subtotal: 250,
    fechaEmision: "2026-10-10",
    fechaAplicacion: "2026-10-10",
    estado_autorizacion: "Autorizada",
    estado_operacion: "Cancelada",
    estado: "Cancelada",
    serie: "A",
    firmas: { elaboro: null, almacen: null, autorizo: null, cliente: null },
    productos: []
  },
  {
    id: "N1002",
    folio: "1002",
    serie: "B",
    tipo: "Fisico",
    tipo_nota: "Física",
    sucursalId: "S02",
    clienteId: "2543",
    vendedorId: "V09987219",
    operadorId: "O01",
    factura: "9999",
    facturas: ["9999"],
    fechaEmision: "2026-10-08",
    fechaAplicacion: "2026-10-08",
    claveInterna: "c1-999",
    documentoFiscal: "",
    causaMarcar: "A",
    observaciones: "",
    productos: [
      { codigo: "P001", cantidad: 1, pv: "1", bodega: "", descripcion: "Caja de Detergente Líquido 10L", causa: "Diferencia", unitario: 250, hasIva: true, hasIeps: false }
    ],
    subtotal: 250,
    iva: 40,
    ieps: 0,
    total: 290,
    montoTotal: 290,
    firmas: { elaboro: "U01", almacen: null, autorizo: null, cliente: null },
    estado_autorizacion: "Autorizada",
    estado_operacion: "Cancelada",
    estado: "Cancelada"
  }
];

// Hacer disponibles los datos en el scope global
window.INITIAL_SUCURSALES = INITIAL_SUCURSALES;
window.INITIAL_USUARIOS = INITIAL_USUARIOS;
window.INITIAL_CLIENTES = INITIAL_CLIENTES;
window.INITIAL_OPERADORES = INITIAL_OPERADORES;
window.INITIAL_VENDEDORES = INITIAL_VENDEDORES;
window.INITIAL_PRESUPUESTOS = INITIAL_PRESUPUESTOS;
window.INITIAL_PROVEEDORES = INITIAL_PROVEEDORES;
window.INITIAL_NOTAS = INITIAL_NOTAS;
