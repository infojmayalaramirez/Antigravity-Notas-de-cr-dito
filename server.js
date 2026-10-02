const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================================
// CONEXIÓN SQL SERVER
// =====================================================================
const dbConfig = {
    user: 'sa',
    password: 'sql2022',
    server: 'localhost',
    database: 'CasaAyalaDB',
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let _pool = null;
async function getPool() {
    if (_pool && _pool.connected) return _pool;
    _pool = await sql.connect(dbConfig);
    return _pool;
}

// =====================================================================
// MIDDLEWARE
// =====================================================================
app.use(cors());
app.use(express.json());

// Cache-Control: no-cache en TODOS los GET — el navegador siempre pide datos frescos de SQL Server
app.use((req, res, next) => {
    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// =====================================================================
// SETUP DE ESQUEMA SQL SERVER
// =====================================================================
async function ensureDatabaseSchema() {
    try {
        const pool = await getPool();

        // 1. Eliminar foreign keys restrictivas
        await pool.request().query(`
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Usuarios_Sucursales')
                ALTER TABLE dbo.Usuarios DROP CONSTRAINT FK_Usuarios_Sucursales;
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Notas_Usuarios')
                ALTER TABLE dbo.Notas DROP CONSTRAINT FK_Notas_Usuarios;
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Notas_Sucursales')
                ALTER TABLE dbo.Notas DROP CONSTRAINT FK_Notas_Sucursales;

            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Usuarios') AND name = 'telefono')
                ALTER TABLE dbo.Usuarios ADD telefono VARCHAR(50) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Usuarios') AND name = 'direccion')
                ALTER TABLE dbo.Usuarios ADD direccion VARCHAR(255) NULL;

            DELETE FROM dbo.Usuarios WHERE email = 'sofia@casaayala.com' OR id_usuario = 'U05';
        `);

        // 2. Sembrar usuarios base
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario = 'U01')
                INSERT INTO dbo.Usuarios (id_usuario, nombre, email, rol, id_sucursal, nip, bloqueado, admin_tipo)
                VALUES ('U01', 'Administrador Universal', 'cansagdl@gmail.com', 'Administrador', 'S01', '4819', 0, 'Ambos');
            IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario = 'U02')
                INSERT INTO dbo.Usuarios (id_usuario, nombre, email, rol, id_sucursal, nip, bloqueado, admin_tipo)
                VALUES ('U02', 'Consuelo Carrillo', 'consuelo.carrillo2022@gmail.com', 'Contabilidad', 'S01', '1145', 0, 'Ninguno');
            IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario = 'U04')
                INSERT INTO dbo.Usuarios (id_usuario, nombre, email, rol, id_sucursal, nip, bloqueado, admin_tipo)
                VALUES ('U04', 'Laura Sanchez', 'laurasanchezvazquez07@gmail.com', 'Vendedor', 'S01', '2020', 0, 'Ninguno');
            IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario = 'U48921')
                INSERT INTO dbo.Usuarios (id_usuario, nombre, email, rol, id_sucursal, nip, bloqueado, admin_tipo)
                VALUES ('U48921', 'Araceli Escobar', 'lafer7522@gmail.com', 'Vendedor', 'S01', '4823', 0, 'Ninguno');
        `);

        // 3. Sembrar sucursales maestras
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Sucursales WHERE id_sucursal = 'S01')
                INSERT INTO dbo.Sucursales (id_sucursal, nombre, direccion, activa_financiera)
                VALUES ('S01', 'Tijuana Matriz', 'Av. España #1168, Col. Moderna', 1);
            ELSE
                UPDATE dbo.Sucursales SET nombre='Tijuana Matriz', direccion='Av. España #1168, Col. Moderna', activa_financiera=1
                WHERE id_sucursal='S01';

            IF NOT EXISTS (SELECT 1 FROM dbo.Sucursales WHERE id_sucursal = 'S02')
                INSERT INTO dbo.Sucursales (id_sucursal, nombre, direccion, activa_financiera)
                VALUES ('S02', 'Mexicali Centro', 'Blvd. Benito Juárez #450, Col. Jardines', 1);
            ELSE
                UPDATE dbo.Sucursales SET nombre='Mexicali Centro', direccion='Blvd. Benito Juárez #450, Col. Jardines', activa_financiera=1
                WHERE id_sucursal='S02';

            IF NOT EXISTS (SELECT 1 FROM dbo.Sucursales WHERE id_sucursal = 'S03')
                INSERT INTO dbo.Sucursales (id_sucursal, nombre, direccion, activa_financiera)
                VALUES ('S03', 'Ensenada Puerto', 'Av. Ruiz #120, Col. Centro', 0);
            ELSE
                UPDATE dbo.Sucursales SET nombre='Ensenada Puerto', direccion='Av. Ruiz #120, Col. Centro', activa_financiera=0
                WHERE id_sucursal='S03';
        `);

        // 4. Crear tablas de catálogos
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='Clientes')
                CREATE TABLE dbo.Clientes (
                    id_cliente VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    codigo_interno VARCHAR(50) NULL,
                    tiene_derecho_descuento BIT DEFAULT 0,
                    eliminado BIT DEFAULT 0
                );
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='Operadores')
                CREATE TABLE dbo.Operadores (
                    id_operador VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    puesto VARCHAR(255) NULL,
                    eliminado BIT DEFAULT 0
                );
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='Vendedores')
                CREATE TABLE dbo.Vendedores (
                    id_vendedor VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    id_sucursal VARCHAR(50) NULL,
                    id_usuario VARCHAR(50) NULL,
                    eliminado BIT DEFAULT 0
                );
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='Proveedores')
                CREATE TABLE dbo.Proveedores (
                    id_proveedor VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    desc1 DECIMAL(18,2) DEFAULT 0,
                    desc2 DECIMAL(18,2) DEFAULT 0,
                    desc3 DECIMAL(18,2) DEFAULT 0,
                    clientes_cajon_json VARCHAR(MAX) NULL,
                    fecha_inicio VARCHAR(50) NULL,
                    fecha_fin VARCHAR(50) NULL,
                    tipo_promo VARCHAR(50) NULL,
                    eliminado BIT DEFAULT 0
                );
        `);

        // 5. Tabla Presupuestos con esquema completo (nueva versión)
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='Presupuestos')
                CREATE TABLE dbo.Presupuestos (
                    id_presupuesto VARCHAR(100) PRIMARY KEY,
                    vendedor_id VARCHAR(50) NULL,
                    mes VARCHAR(20) NULL,
                    limite DECIMAL(18,2) DEFAULT 0,
                    consumido DECIMAL(18,2) DEFAULT 0,
                    fecha_limite VARCHAR(50) NULL,
                    bloquear_exceso BIT DEFAULT 0
                );
        `);
        // Añadir columnas faltantes si la tabla ya existía con esquema viejo
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Presupuestos') AND name='vendedor_id')
                ALTER TABLE dbo.Presupuestos ADD vendedor_id VARCHAR(50) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Presupuestos') AND name='mes')
                ALTER TABLE dbo.Presupuestos ADD mes VARCHAR(20) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Presupuestos') AND name='limite')
                ALTER TABLE dbo.Presupuestos ADD limite DECIMAL(18,2) DEFAULT 0;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Presupuestos') AND name='consumido')
                ALTER TABLE dbo.Presupuestos ADD consumido DECIMAL(18,2) DEFAULT 0;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Presupuestos') AND name='fecha_limite')
                ALTER TABLE dbo.Presupuestos ADD fecha_limite VARCHAR(50) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Presupuestos') AND name='bloquear_exceso')
                ALTER TABLE dbo.Presupuestos ADD bloquear_exceso BIT DEFAULT 0;
        `);

        // 6. Tabla FaltantesPicking en SQL Server (antes era array en memoria — se reiniciaba al cerrar el servidor)
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='FaltantesPicking')
                CREATE TABLE dbo.FaltantesPicking (
                    id VARCHAR(100) PRIMARY KEY,
                    codigo_interno VARCHAR(100) NULL,
                    descripcion VARCHAR(500) NULL,
                    motivo VARCHAR(255) NULL,
                    id_usuario VARCHAR(50) NULL,
                    id_sucursal VARCHAR(50) NULL,
                    fecha_registro DATETIME DEFAULT GETDATE(),
                    resuelto BIT DEFAULT 0,
                    datos_json VARCHAR(MAX) NULL
                );
        `);

        // 7. Añadir columnas extra a dbo.Notas si la tabla ya existía con esquema viejo
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='partidas')
                ALTER TABLE dbo.Notas ADD partidas VARCHAR(MAX) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='productos')
                ALTER TABLE dbo.Notas ADD productos VARCHAR(MAX) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='estado_autorizacion')
                ALTER TABLE dbo.Notas ADD estado_autorizacion VARCHAR(50) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='estado_operacion')
                ALTER TABLE dbo.Notas ADD estado_operacion VARCHAR(50) NULL;
        `);

        console.log('[SQL Server] ✅ Esquema verificado y listo.');
    } catch (err) {
        console.error('[SQL Server] ❌ Error ajustando esquema:', err.message);
    }
}

// =====================================================================
// ENDPOINTS API — FUENTE ÚNICA DE VERDAD: SQL SERVER
// =====================================================================

// GET /api/status
app.get('/api/status', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT GETDATE() AS ServerTime');
        res.json({ status: 'ok', serverTime: result.recordset[0].ServerTime });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// =====================================================================
// 1. USUARIOS
// =====================================================================
app.get('/api/usuarios', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT id_usuario AS id, id_usuario, nombre, email, rol,
                   id_sucursal AS sucursalId, nip, bloqueado,
                   admin_tipo AS adminTipo,
                   ISNULL(telefono,'') AS telefono,
                   ISNULL(direccion,'') AS direccion
            FROM dbo.Usuarios
            ORDER BY nombre
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error('[GET /api/usuarios]', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const { id, id_usuario, nombre, email, rol, sucursalId, id_sucursal, nip, adminTipo, telefono, direccion } = req.body;
        const uId       = String(id || id_usuario || '').trim();
        const uNombre   = String(nombre || 'Usuario').trim();
        const uEmail    = String(email || uId).trim();
        const uRol      = String(rol || 'Vendedor').trim();
        const uSucursal = String(sucursalId || id_sucursal || 'S01').trim().slice(0,10);
        const uNip      = String(nip || '1234').trim().slice(0,10);
        const uAdmin    = String(adminTipo || (uRol === 'Administrador' ? 'Ambos' : 'Ninguno')).trim().slice(0,50);
        const uTel      = String(telefono || '').trim().slice(0,50);
        const uDir      = String(direccion || '').trim().slice(0,255);

        const pool = await getPool();

        // Auto-crear sucursal si no existe
        if (uSucursal) {
            const chk = await pool.request().input('sid', sql.VarChar, uSucursal)
                .query('SELECT 1 FROM dbo.Sucursales WHERE id_sucursal=@sid');
            if (!chk.recordset.length) {
                await pool.request()
                    .input('sid', sql.VarChar, uSucursal)
                    .input('nom', sql.VarChar, uSucursal)
                    .query(`INSERT INTO dbo.Sucursales (id_sucursal,nombre,direccion,activa_financiera)
                            VALUES (@sid,@nom,'Asignada desde Web',1)`);
            }
        }

        let finalId = uId;
        if (!finalId) {
            const cnt = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.Usuarios');
            finalId = 'U' + String((cnt.recordset[0].total || 0) + 1).padStart(2,'0');
        }

        await pool.request()
            .input('id',       sql.VarChar, finalId)
            .input('nombre',   sql.VarChar, uNombre)
            .input('email',    sql.VarChar, uEmail)
            .input('rol',      sql.VarChar, uRol)
            .input('sucursal', sql.VarChar, uSucursal)
            .input('nip',      sql.VarChar, uNip)
            .input('admin',    sql.VarChar, uAdmin)
            .input('tel',      sql.VarChar, uTel)
            .input('dir',      sql.VarChar, uDir)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario=@id)
                    UPDATE dbo.Usuarios
                    SET nombre=@nombre, email=@email, rol=@rol, id_sucursal=@sucursal,
                        nip=@nip, admin_tipo=@admin, telefono=@tel, direccion=@dir
                    WHERE id_usuario=@id
                ELSE
                    INSERT INTO dbo.Usuarios (id_usuario,nombre,email,rol,id_sucursal,nip,bloqueado,admin_tipo,telefono,direccion)
                    VALUES (@id,@nombre,@email,@rol,@sucursal,@nip,0,@admin,@tel,@dir)
            `);

        console.log(`[POST /api/usuarios] Usuario '${finalId}' (${uNombre}) guardado.`);
        res.json({ success: true, id: finalId });
    } catch (error) {
        console.error('[POST /api/usuarios]', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query('DELETE FROM dbo.Usuarios WHERE id_usuario=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================================
// 2. SUCURSALES
// =====================================================================
app.get('/api/sucursales', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT id_sucursal AS id, id_sucursal, nombre,
                   ISNULL(direccion,'') AS direccion,
                   activa_financiera AS activaFinanciera
            FROM dbo.Sucursales
            ORDER BY id_sucursal
        `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sucursales', async (req, res) => {
    try {
        const { id, nombre, direccion, activaFinanciera } = req.body;
        const sId  = String(id || ('S' + Date.now())).trim().slice(0,10);
        const sNom = String(nombre || sId).trim().slice(0,100);
        const sDir = String(direccion || '').trim().slice(0,255);
        const sAct = activaFinanciera ? 1 : 0;

        const pool = await getPool();
        await pool.request()
            .input('id',  sql.VarChar, sId)
            .input('nom', sql.VarChar, sNom)
            .input('dir', sql.VarChar, sDir)
            .input('act', sql.Bit, sAct)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Sucursales WHERE id_sucursal=@id)
                    UPDATE dbo.Sucursales SET nombre=@nom, direccion=@dir, activa_financiera=@act WHERE id_sucursal=@id
                ELSE
                    INSERT INTO dbo.Sucursales (id_sucursal,nombre,direccion,activa_financiera) VALUES (@id,@nom,@dir,@act)
            `);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sucursales/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query('DELETE FROM dbo.Sucursales WHERE id_sucursal=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================================
// 3. CATÁLOGOS — CLIENTES, OPERADORES, VENDEDORES, PROVEEDORES, PRESUPUESTOS
//    Fuente única: SQL Server. Sin archivo catalog_store.json.
// =====================================================================

// --- CLIENTES ---
app.get('/api/clientes', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            `SELECT id_cliente AS id, nombre,
                    ISNULL(codigo_interno,'') AS codigoInterno,
                    tiene_derecho_descuento AS tieneDerechoDescuento
             FROM dbo.Clientes WHERE ISNULL(eliminado,0)=0
             ORDER BY nombre`
        );
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/clientes', async (req, res) => {
    try {
        const { id, nombre, codigoInterno, tieneDerechoDescuento } = req.body;
        const cId   = String(id || '').trim().slice(0,50);
        const cNom  = String(nombre || '').trim().slice(0,255);
        const cCod  = String(codigoInterno || cId).trim().slice(0,50);
        const cDesc = tieneDerechoDescuento ? 1 : 0;

        if (!cId || !cNom) return res.status(400).json({ error: 'id y nombre son requeridos' });

        const pool = await getPool();
        await pool.request()
            .input('id',   sql.VarChar, cId)
            .input('nom',  sql.VarChar, cNom)
            .input('cod',  sql.VarChar, cCod)
            .input('desc', sql.Bit, cDesc)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Clientes WHERE id_cliente=@id)
                    UPDATE dbo.Clientes SET nombre=@nom, codigo_interno=@cod, tiene_derecho_descuento=@desc WHERE id_cliente=@id
                ELSE
                    INSERT INTO dbo.Clientes (id_cliente,nombre,codigo_interno,tiene_derecho_descuento,eliminado)
                    VALUES (@id,@nom,@cod,@desc,0)
            `);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/clientes/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query('UPDATE dbo.Clientes SET eliminado=1 WHERE id_cliente=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- OPERADORES ---
app.get('/api/operadores', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            `SELECT id_operador AS id, nombre, ISNULL(puesto,'') AS puesto
             FROM dbo.Operadores WHERE ISNULL(eliminado,0)=0
             ORDER BY nombre`
        );
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/operadores', async (req, res) => {
    try {
        const { id, nombre, puesto } = req.body;
        const oId    = String(id || '').trim().slice(0,50);
        const oNom   = String(nombre || '').trim().slice(0,255);
        const oPuest = String(puesto || '').trim().slice(0,255);

        if (!oId || !oNom) return res.status(400).json({ error: 'id y nombre son requeridos' });

        const pool = await getPool();
        await pool.request()
            .input('id',    sql.VarChar, oId)
            .input('nom',   sql.VarChar, oNom)
            .input('puest', sql.VarChar, oPuest)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Operadores WHERE id_operador=@id)
                    UPDATE dbo.Operadores SET nombre=@nom, puesto=@puest WHERE id_operador=@id
                ELSE
                    INSERT INTO dbo.Operadores (id_operador,nombre,puesto,eliminado) VALUES (@id,@nom,@puest,0)
            `);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/operadores/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query('UPDATE dbo.Operadores SET eliminado=1 WHERE id_operador=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- VENDEDORES ---
app.get('/api/vendedores', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            `SELECT id_vendedor AS id, nombre,
                    ISNULL(id_sucursal,'S01') AS sucursalId,
                    ISNULL(id_usuario,'') AS userId
             FROM dbo.Vendedores WHERE ISNULL(eliminado,0)=0
             ORDER BY nombre`
        );
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vendedores', async (req, res) => {
    try {
        const { id, nombre, sucursalId, userId, id_sucursal, id_usuario } = req.body;
        const vId  = String(id || '').trim().slice(0,50);
        const vNom = String(nombre || '').trim().slice(0,255);
        const vSuc = String(sucursalId || id_sucursal || 'S01').trim().slice(0,10);
        const vUsr = String(userId || id_usuario || '').trim().slice(0,10);

        if (!vId || !vNom) return res.status(400).json({ error: 'id y nombre son requeridos' });

        const pool = await getPool();
        await pool.request()
            .input('id',  sql.VarChar, vId)
            .input('nom', sql.VarChar, vNom)
            .input('suc', sql.VarChar, vSuc)
            .input('usr', sql.VarChar, vUsr)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Vendedores WHERE id_vendedor=@id)
                    UPDATE dbo.Vendedores SET nombre=@nom, id_sucursal=@suc, id_usuario=@usr WHERE id_vendedor=@id
                ELSE
                    INSERT INTO dbo.Vendedores (id_vendedor,nombre,id_sucursal,id_usuario,eliminado) VALUES (@id,@nom,@suc,@usr,0)
            `);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/vendedores/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query('UPDATE dbo.Vendedores SET eliminado=1 WHERE id_vendedor=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PROVEEDORES ---
app.get('/api/proveedores', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            `SELECT id_proveedor AS id, nombre,
                    ISNULL(desc1,0) AS desc1, ISNULL(desc2,0) AS desc2, ISNULL(desc3,0) AS desc3,
                    ISNULL(clientes_cajon_json,'[]') AS clientesCajonJson,
                    ISNULL(fecha_inicio,'') AS fechaInicio,
                    ISNULL(fecha_fin,'') AS fechaFin,
                    ISNULL(tipo_promo,'clientes_exclusivos') AS tipoPromo
             FROM dbo.Proveedores WHERE ISNULL(eliminado,0)=0
             ORDER BY nombre`
        );
        const rows = result.recordset.map(p => ({
            id: p.id,
            nombre: p.nombre,
            desc1: parseFloat(p.desc1 || 0),
            desc2: parseFloat(p.desc2 || 0),
            desc3: parseFloat(p.desc3 || 0),
            clientesCajon: (() => { try { return JSON.parse(p.clientesCajonJson || '[]'); } catch(e){ return []; } })(),
            fechaInicio: p.fechaInicio,
            fechaFin: p.fechaFin,
            tipoPromo: p.tipoPromo
        }));
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/proveedores', async (req, res) => {
    try {
        const { id, nombre, desc1, desc2, desc3, clientesCajon, fechaInicio, fechaFin, tipoPromo } = req.body;
        const pId  = String(id || '').trim().slice(0,50);
        const pNom = String(nombre || '').trim().slice(0,255);
        const pD1  = parseFloat(desc1 || 0);
        const pD2  = parseFloat(desc2 || 0);
        const pD3  = parseFloat(desc3 || 0);
        const pCajon = JSON.stringify(Array.isArray(clientesCajon) ? clientesCajon : []);
        const pFI  = String(fechaInicio || '').trim().slice(0,50);
        const pFF  = String(fechaFin || '').trim().slice(0,50);
        const pTip = String(tipoPromo || 'clientes_exclusivos').trim().slice(0,50);

        if (!pId || !pNom) return res.status(400).json({ error: 'id y nombre son requeridos' });

        const pool = await getPool();
        await pool.request()
            .input('id',    sql.VarChar, pId)
            .input('nom',   sql.VarChar, pNom)
            .input('d1',    sql.Decimal(18,2), pD1)
            .input('d2',    sql.Decimal(18,2), pD2)
            .input('d3',    sql.Decimal(18,2), pD3)
            .input('cajon', sql.VarChar, pCajon)
            .input('fi',    sql.VarChar, pFI)
            .input('ff',    sql.VarChar, pFF)
            .input('tip',   sql.VarChar, pTip)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Proveedores WHERE id_proveedor=@id)
                    UPDATE dbo.Proveedores SET nombre=@nom,desc1=@d1,desc2=@d2,desc3=@d3,
                        clientes_cajon_json=@cajon,fecha_inicio=@fi,fecha_fin=@ff,tipo_promo=@tip
                    WHERE id_proveedor=@id
                ELSE
                    INSERT INTO dbo.Proveedores (id_proveedor,nombre,desc1,desc2,desc3,clientes_cajon_json,fecha_inicio,fecha_fin,tipo_promo,eliminado)
                    VALUES (@id,@nom,@d1,@d2,@d3,@cajon,@fi,@ff,@tip,0)
            `);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/proveedores/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query('UPDATE dbo.Proveedores SET eliminado=1 WHERE id_proveedor=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PRESUPUESTOS ---
app.get('/api/presupuestos', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            `SELECT id_presupuesto AS id,
                    ISNULL(vendedor_id,'') AS vendedorId,
                    ISNULL(mes,'') AS mes,
                    ISNULL(limite,0) AS limite,
                    ISNULL(consumido,0) AS consumido,
                    ISNULL(fecha_limite,'') AS fechaLimite,
                    ISNULL(bloquear_exceso,0) AS bloquearExceso
             FROM dbo.Presupuestos
             ORDER BY mes DESC`
        );
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/presupuestos', async (req, res) => {
    try {
        const { id, vendedorId, mes, limite, consumido, fechaLimite, bloquearExceso } = req.body;
        // Generar ID si no viene
        const pId  = String(id || `${vendedorId || 'V'}_${mes || new Date().toISOString().slice(0,7)}`).trim().slice(0,100);
        const pVid = String(vendedorId || '').trim().slice(0,50);
        const pMes = String(mes || '').trim().slice(0,20);
        const pLim = parseFloat(limite || 0);
        const pCon = parseFloat(consumido || 0);
        const pFL  = String(fechaLimite || '').trim().slice(0,50);
        const pBE  = bloquearExceso ? 1 : 0;

        const pool = await getPool();
        await pool.request()
            .input('id',  sql.VarChar, pId)
            .input('vid', sql.VarChar, pVid)
            .input('mes', sql.VarChar, pMes)
            .input('lim', sql.Decimal(18,2), pLim)
            .input('con', sql.Decimal(18,2), pCon)
            .input('fl',  sql.VarChar, pFL)
            .input('be',  sql.Bit, pBE)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Presupuestos WHERE id_presupuesto=@id)
                    UPDATE dbo.Presupuestos
                    SET vendedor_id=@vid, mes=@mes, limite=@lim, consumido=@con,
                        fecha_limite=@fl, bloquear_exceso=@be
                    WHERE id_presupuesto=@id
                ELSE
                    INSERT INTO dbo.Presupuestos (id_presupuesto,vendedor_id,mes,limite,consumido,fecha_limite,bloquear_exceso)
                    VALUES (@id,@vid,@mes,@lim,@con,@fl,@be)
            `);
        res.json({ success: true, id: pId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================================
// 4. NOTAS DE CRÉDITO — SELECT global sin filtros de usuario
// =====================================================================
app.get('/api/notas', async (req, res) => {
    try {
        const pool = await getPool();
        // SELECT global: TODOS los movimientos, sin filtro de usuario/sucursal
        const result = await pool.request().query(
            `SELECT id_nota, folio_consecutivo AS folio,
                    ISNULL(tipo_nota,'Fisico') AS tipo,
                    ISNULL(cliente_nombre,'') AS clienteNombre,
                    ISNULL(operador_nombre,'') AS operadorNombre,
                    ISNULL(monto_total,0) AS montoTotal,
                    ISNULL(id_usuario_creador,'') AS vendedorId,
                    ISNULL(id_sucursal,'S01') AS sucursalId,
                    CONVERT(VARCHAR(10), fecha_emision, 23) AS fechaEmision,
                    ISNULL(impresa,0) AS impresa,
                    ISNULL(partidas,'[]') AS partidas,
                    ISNULL(productos,'[]') AS productos,
                    ISNULL(estado_autorizacion,'Autorizada') AS estado_autorizacion,
                    ISNULL(estado_operacion,'Activa') AS estado_operacion
             FROM dbo.Notas
             ORDER BY fecha_emision DESC`
        );
        const notas = result.recordset.map(n => {
            n.id = n.id_nota;
            n.total = parseFloat(n.montoTotal || 0);
            n.montoTotal = n.total;
            if (typeof n.partidas === 'string') { try { n.partidas = JSON.parse(n.partidas); } catch(e){ n.partidas=[]; } }
            if (typeof n.productos === 'string') { try { n.productos = JSON.parse(n.productos); } catch(e){ n.productos=[]; } }
            return n;
        });
        res.json(notas);
    } catch (error) {
        console.error('[GET /api/notas]', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/notas', async (req, res) => {
    try {
        const nota = req.body;

        // Fix: extraer folio numerico - strip prefijo "N" si existe (e.g. "N1001" -> 1001)
        const folioRaw  = String(nota.folio || nota.id || '').replace(/\D/g, '');
        const notaId    = parseInt(folioRaw || String(Date.now()).slice(-6), 10);

        const notaTipo  = String(nota.tipo || nota.tipo_nota || 'Fisico').trim().slice(0, 50);
        const total     = parseFloat(nota.total || nota.montoTotal || nota.subtotal || 0);
        // Fix: usar clienteId y operadorId del frontend (no clienteNombre/operadorNombre)
        const clienteId  = String(nota.clienteId  || '').trim().slice(0, 50);
        const operadorId = String(nota.operadorId  || '').trim().slice(0, 50);
        const vendedorId = String(nota.vendedorId  || 'U01').trim().slice(0, 10);
        const sucursal   = String(nota.sucursalId  || 'S01').trim().slice(0, 10);
        const estadoAut  = String(nota.estado_autorizacion || 'Autorizada').trim().slice(0, 50);
        const estadoOp   = String(nota.estado_operacion    || 'Activa').trim().slice(0, 50);
        const fechaEmis  = nota.fechaEmision ? nota.fechaEmision.substring(0, 10) : null;

        // Fix: guardar nota COMPLETA como JSON para no perder ningun campo
        // (serie, facturas, firmas, causaMarcar, observaciones, claveInterna, etc.)
        const notaSinFoto = { ...nota };
        delete notaSinFoto.incidenciaFoto; // base64 demasiado grande para BD
        const datosJson = JSON.stringify(notaSinFoto);

        const pool = await getPool();

        // Asegurar columnas nuevas si no existen
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='datos_json')
                ALTER TABLE dbo.Notas ADD datos_json VARCHAR(MAX) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='id_cliente')
                ALTER TABLE dbo.Notas ADD id_cliente VARCHAR(50) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='id_operador')
                ALTER TABLE dbo.Notas ADD id_operador VARCHAR(50) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='estado_autorizacion')
                ALTER TABLE dbo.Notas ADD estado_autorizacion VARCHAR(50) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Notas') AND name='estado_operacion')
                ALTER TABLE dbo.Notas ADD estado_operacion VARCHAR(50) NULL;
        `).catch(() => {});

        await pool.request()
            .input('id',       sql.Int,           notaId)
            .input('folio',    sql.Int,           notaId)
            .input('tipo',     sql.VarChar,       notaTipo)
            .input('total',    sql.Decimal(18,2),  total)
            .input('cliId',    sql.VarChar,       clienteId)
            .input('opeId',    sql.VarChar,       operadorId)
            .input('creador',  sql.VarChar,       vendedorId)
            .input('suc',      sql.VarChar,       sucursal)
            .input('estAut',   sql.VarChar,       estadoAut)
            .input('estOp',    sql.VarChar,       estadoOp)
            .input('fecha',    sql.VarChar,       fechaEmis)
            .input('json',     sql.VarChar,       datosJson)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.Notas WHERE id_nota=@id)
                    UPDATE dbo.Notas
                    SET tipo_nota=@tipo, monto_total=@total,
                        id_cliente=@cliId, id_operador=@opeId,
                        cliente_nombre=@cliId, operador_nombre=@opeId,
                        id_usuario_creador=@creador, id_sucursal=@suc,
                        estado_autorizacion=@estAut, estado_operacion=@estOp,
                        datos_json=@json
                    WHERE id_nota=@id
                ELSE
                    INSERT INTO dbo.Notas
                    (id_nota, folio_consecutivo, tipo_nota, impresa, monto_total,
                     id_cliente, id_operador, cliente_nombre, operador_nombre,
                     id_usuario_creador, id_sucursal,
                     fecha_emision, estado_autorizacion, estado_operacion, datos_json)
                    VALUES (@id, @folio, @tipo, 0, @total,
                            @cliId, @opeId, @cliId, @opeId, @creador, @suc,
                            ISNULL(TRY_CAST(@fecha AS DATE), GETDATE()),
                            @estAut, @estOp, @json)
            `);

        console.log('[POST /api/notas] Nota #' + notaId + ' (' + notaTipo + ') guardada. Total: $' + total);
        res.json({ success: true, id: notaId });
    } catch (error) {
        console.error('[POST /api/notas]', error.message);
        res.status(500).json({ error: error.message });
    }
})
app.delete('/api/notas/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, parseInt(req.params.id, 10))
            .query('DELETE FROM dbo.Notas WHERE id_nota=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================================
// 5. ENDPOINT UNIFICADO — todos los catálogos en una petición
//    El frontend lo llama cada 5 segundos. Fuente: solo SQL Server.
// =====================================================================
app.get('/api/catalogos/all', async (req, res) => {
    try {
        const pool = await getPool();
        const [cliR, opeR, venR, provR, presR, usuR, sucR, notasR] = await Promise.all([
            pool.request().query(`SELECT id_cliente AS id, nombre, ISNULL(codigo_interno,'') AS codigoInterno, tiene_derecho_descuento AS tieneDerechoDescuento FROM dbo.Clientes WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
            pool.request().query(`SELECT id_operador AS id, nombre, ISNULL(puesto,'') AS puesto FROM dbo.Operadores WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
            pool.request().query(`SELECT id_vendedor AS id, nombre, ISNULL(id_sucursal,'S01') AS sucursalId, ISNULL(id_usuario,'') AS userId FROM dbo.Vendedores WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
            pool.request().query(`SELECT id_proveedor AS id, nombre, ISNULL(desc1,0) AS desc1, ISNULL(desc2,0) AS desc2, ISNULL(desc3,0) AS desc3, ISNULL(clientes_cajon_json,'[]') AS clientesCajonJson, ISNULL(fecha_inicio,'') AS fechaInicio, ISNULL(fecha_fin,'') AS fechaFin, ISNULL(tipo_promo,'clientes_exclusivos') AS tipoPromo FROM dbo.Proveedores WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
            pool.request().query(`SELECT id_presupuesto AS id, ISNULL(vendedor_id,'') AS vendedorId, ISNULL(mes,'') AS mes, ISNULL(limite,0) AS limite, ISNULL(consumido,0) AS consumido, ISNULL(fecha_limite,'') AS fechaLimite, ISNULL(bloquear_exceso,0) AS bloquearExceso FROM dbo.Presupuestos`),
            pool.request().query(`SELECT id_usuario AS id, id_usuario, nombre, email, rol, id_sucursal AS sucursalId, id_sucursal, nip, bloqueado, admin_tipo AS adminTipo, ISNULL(telefono,'') AS telefono, ISNULL(direccion,'') AS direccion FROM dbo.Usuarios ORDER BY nombre`),
            pool.request().query(`SELECT id_sucursal AS id, id_sucursal, nombre, ISNULL(direccion,'') AS direccion, activa_financiera AS activaFinanciera FROM dbo.Sucursales ORDER BY id_sucursal`),
            pool.request().query(`SELECT id_nota AS id_nota, folio_consecutivo AS folio, ISNULL(tipo_nota,'Fisico') AS tipo, ISNULL(cliente_nombre,'') AS clienteNombre, ISNULL(operador_nombre,'') AS operadorNombre, ISNULL(monto_total,0) AS montoTotal, ISNULL(id_usuario_creador,'') AS vendedorId, ISNULL(id_sucursal,'S01') AS sucursalId, CONVERT(VARCHAR(10),fecha_emision,23) AS fechaEmision, ISNULL(estado_autorizacion,'Autorizada') AS estado_autorizacion, ISNULL(estado_operacion,'Activa') AS estado_operacion, ISNULL(partidas,'[]') AS partidas, ISNULL(datos_json,'') AS datos_json FROM dbo.Notas ORDER BY fecha_emision DESC`)
        ]);

        const proveedores = provR.recordset.map(p => ({
            id: p.id, nombre: p.nombre,
            desc1: parseFloat(p.desc1||0), desc2: parseFloat(p.desc2||0), desc3: parseFloat(p.desc3||0),
            clientesCajon: (() => { try { return JSON.parse(p.clientesCajonJson||'[]'); } catch(e){ return []; } })(),
            fechaInicio: p.fechaInicio, fechaFin: p.fechaFin, tipoPromo: p.tipoPromo
        }));

        const notas = notasR.recordset.map(n => {
            // Si hay datos_json completo, usarlo como base (preserva todos los campos)
            if (n.datos_json) {
                try {
                    const full = JSON.parse(n.datos_json);
                    // Asegurar id y folio correctos
                    full.id    = full.id    || ('N' + n.id_nota);
                    full.folio = full.folio || n.id_nota;
                    full.total = parseFloat(full.total || n.montoTotal || 0);
                    full.montoTotal = full.total;
                    // Asegurar estado de la BD (puede haber sido actualizado externamente)
                    full.estado_autorizacion = n.estado_autorizacion || full.estado_autorizacion;
                    full.estado_operacion    = n.estado_operacion    || full.estado_operacion;
                    return full;
                } catch(e) {}
            }
            // Fallback: construir objeto basico desde columnas SQL
            n.id = 'N' + n.id_nota;
            n.total = parseFloat(n.montoTotal || 0);
            n.montoTotal = n.total;
            if (typeof n.partidas === 'string') { try { n.partidas = JSON.parse(n.partidas); } catch(e) { n.partidas = []; } }
            return n;
        })

        const usuarios = usuR.recordset.map(u => ({ ...u, id: u.id_usuario, id: u.id_usuario }));

        res.json({
            clientes:    cliR.recordset,
            operadores:  opeR.recordset,
            vendedores:  venR.recordset,
            proveedores,
            presupuestos: presR.recordset,
            usuarios,
            sucursales:  sucR.recordset,
            notas
        });
    } catch (err) {
        console.error('[GET /api/catalogos/all]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// 6. FALTANTES PICKING — ahora persistido en SQL Server
// =====================================================================
app.get('/api/faltantes-picking', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            `SELECT id, ISNULL(codigo_interno,'') AS codigoInterno,
                    ISNULL(descripcion,'') AS descripcion,
                    ISNULL(motivo,'') AS motivo,
                    ISNULL(id_usuario,'') AS idUsuario,
                    ISNULL(id_sucursal,'S01') AS sucursalId,
                    CONVERT(VARCHAR(23),fecha_registro,126) AS fechaRegistro,
                    ISNULL(resuelto,0) AS resuelto,
                    ISNULL(datos_json,'{}') AS datosJson
             FROM dbo.FaltantesPicking
             WHERE ISNULL(resuelto,0)=0
             ORDER BY fecha_registro DESC`
        );
        const rows = result.recordset.map(r => {
            let extra = {};
            try { extra = JSON.parse(r.datosJson || '{}'); } catch(e) {}
            return { ...extra, id: r.id, codigoInterno: r.codigoInterno, descripcion: r.descripcion,
                     motivo: r.motivo, idUsuario: r.idUsuario, sucursalId: r.sucursalId,
                     fechaRegistro: r.fechaRegistro };
        });
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/faltantes-picking', async (req, res) => {
    try {
        const item = req.body;
        if (!item || !item.id) return res.status(400).json({ error: 'id es requerido' });

        const fId   = String(item.id).trim().slice(0,100);
        const fCod  = String(item.codigoInterno || item.codigo || '').trim().slice(0,100);
        const fDesc = String(item.descripcion || '').trim().slice(0,500);
        const fMot  = String(item.motivo || '').trim().slice(0,255);
        const fUsr  = String(item.idUsuario || item.id_usuario || '').trim().slice(0,50);
        const fSuc  = String(item.sucursalId || item.id_sucursal || 'S01').trim().slice(0,10);
        const fJson = JSON.stringify(item);

        const pool = await getPool();
        await pool.request()
            .input('id',   sql.VarChar, fId)
            .input('cod',  sql.VarChar, fCod)
            .input('desc', sql.VarChar, fDesc)
            .input('mot',  sql.VarChar, fMot)
            .input('usr',  sql.VarChar, fUsr)
            .input('suc',  sql.VarChar, fSuc)
            .input('json', sql.VarChar, fJson)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.FaltantesPicking WHERE id=@id)
                    UPDATE dbo.FaltantesPicking SET codigo_interno=@cod, descripcion=@desc,
                        motivo=@mot, datos_json=@json WHERE id=@id
                ELSE
                    INSERT INTO dbo.FaltantesPicking (id,codigo_interno,descripcion,motivo,id_usuario,id_sucursal,fecha_registro,resuelto,datos_json)
                    VALUES (@id,@cod,@desc,@mot,@usr,@suc,GETDATE(),0,@json)
            `);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/faltantes-picking/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query('UPDATE dbo.FaltantesPicking SET resuelto=1 WHERE id=@id');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================================
// 7. LOGIN — autenticación contra SQL Server
// =====================================================================
app.post('/api/login', async (req, res) => {
    const loginInput = String(req.body.email || req.body.usuario || req.body.id_usuario || '').trim();
    const cleanNip   = String(req.body.nip || '').trim();

    if (!loginInput || !cleanNip) {
        return res.status(401).json({ success: false, message: 'Faltan datos de acceso.' });
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('login', sql.VarChar, loginInput)
            .input('nip',   sql.VarChar, cleanNip)
            .query(`
                SELECT u.id_usuario AS id, u.id_usuario, u.nombre, u.email, u.rol,
                       u.id_sucursal AS sucursalId, u.nip, u.bloqueado,
                       u.admin_tipo AS adminTipo,
                       s.nombre AS sucursalNombre,
                       s.direccion AS sucursalDireccion
                FROM dbo.Usuarios u
                LEFT JOIN dbo.Sucursales s ON u.id_sucursal = s.id_sucursal
                WHERE (LOWER(LTRIM(RTRIM(u.email)))      = LOWER(@login)
                    OR LOWER(LTRIM(RTRIM(u.id_usuario))) = LOWER(@login)
                    OR LOWER(LTRIM(RTRIM(u.nombre)))     = LOWER(@login))
                  AND LTRIM(RTRIM(u.nip)) = @nip
            `);

        if (!result.recordset.length) {
            return res.status(401).json({ success: false, message: 'Usuario o NIP incorrecto.' });
        }

        const user = result.recordset[0];
        if (user.bloqueado) {
            return res.status(403).json({ success: false, message: 'Cuenta bloqueada. Contacte al Administrador.' });
        }

        console.log(`[LOGIN] ✅ ${user.nombre} (${user.rol})`);
        return res.json({ success: true, user });
    } catch (error) {
        console.error('[POST /api/login]', error.message);
        return res.status(500).json({ success: false, message: 'Error en servidor', error: error.message });
    }
});

// =====================================================================
// MIGRACIÓN: localStorage -> SQL Server (ejecutar UNA VEZ desde localhost)
// =====================================================================
app.get('/migrar', (req, res) => res.sendFile(path.join(__dirname, 'migrar.html')));

app.post('/api/migrar-localstorage', async (req, res) => {
    const { clientes = [], operadores = [], vendedores = [], proveedores = [], usuarios = [], notas = [] } = req.body;
    const pool = await getPool();
    let counts = { clientes: 0, operadores: 0, vendedores: 0, proveedores: 0, usuarios: 0, notas: 0 };

    // Clientes
    for (const c of clientes.filter(c => c && c.id)) {
        try {
            const id     = String(c.id).slice(0, 50);
            const nombre = String(c.nombre || '').slice(0, 255);
            const codigo = String(c.codigoInterno || c.codigo || c.id).slice(0, 50);
            const desc   = (c.tieneDerechoDescuento || c.derechoDescuento) ? 1 : 0;
            if (c.eliminado) { await pool.request().input('id', sql.VarChar, id).query('UPDATE dbo.Clientes SET eliminado=1 WHERE id_cliente=@id'); continue; }
            await pool.request()
                .input('id', sql.VarChar, id).input('nombre', sql.VarChar, nombre)
                .input('codigo', sql.VarChar, codigo).input('desc', sql.Bit, desc)
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Clientes WHERE id_cliente=@id)
                    INSERT INTO dbo.Clientes (id_cliente,nombre,codigo_interno,tiene_derecho_descuento,eliminado) VALUES (@id,@nombre,@codigo,@desc,0)
                    ELSE UPDATE dbo.Clientes SET nombre=@nombre,codigo_interno=@codigo,tiene_derecho_descuento=@desc WHERE id_cliente=@id`);
            counts.clientes++;
        } catch(e) { console.warn('[migrar] cliente', c.id, e.message); }
    }

    // Operadores
    for (const o of operadores.filter(o => o && o.id && !o.eliminado)) {
        try {
            await pool.request()
                .input('id', sql.VarChar, String(o.id).slice(0,50))
                .input('nombre', sql.VarChar, String(o.nombre||'').slice(0,255))
                .input('puesto', sql.VarChar, String(o.puesto||'').slice(0,255))
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Operadores WHERE id_operador=@id)
                    INSERT INTO dbo.Operadores (id_operador,nombre,puesto,eliminado) VALUES (@id,@nombre,@puesto,0)
                    ELSE UPDATE dbo.Operadores SET nombre=@nombre,puesto=@puesto WHERE id_operador=@id`);
            counts.operadores++;
        } catch(e) { console.warn('[migrar] operador', o.id, e.message); }
    }

    // Vendedores
    for (const v of vendedores.filter(v => v && v.id && !v.eliminado)) {
        try {
            await pool.request()
                .input('id', sql.VarChar, String(v.id).slice(0,50))
                .input('nombre', sql.VarChar, String(v.nombre||'').slice(0,255))
                .input('suc', sql.VarChar, String(v.sucursalId||v.id_sucursal||'S01').slice(0,10))
                .input('usr', sql.VarChar, String(v.userId||v.id_usuario||'').slice(0,10))
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Vendedores WHERE id_vendedor=@id)
                    INSERT INTO dbo.Vendedores (id_vendedor,nombre,id_sucursal,id_usuario,eliminado) VALUES (@id,@nombre,@suc,@usr,0)
                    ELSE UPDATE dbo.Vendedores SET nombre=@nombre WHERE id_vendedor=@id`);
            counts.vendedores++;
        } catch(e) { console.warn('[migrar] vendedor', v.id, e.message); }
    }

    // Proveedores
    for (const p of proveedores.filter(p => p && p.id && !p.eliminado)) {
        try {
            const cj = Array.isArray(p.clientesCajon) ? JSON.stringify(p.clientesCajon) : '[]';
            await pool.request()
                .input('id', sql.VarChar, String(p.id).slice(0,50))
                .input('nombre', sql.VarChar, String(p.nombre||'').slice(0,255))
                .input('d1', sql.Float, p.desc1||0).input('d2', sql.Float, p.desc2||0).input('d3', sql.Float, p.desc3||0)
                .input('cj', sql.VarChar, cj.slice(0,2000))
                .input('tp', sql.VarChar, String(p.tipoPromo||'').slice(0,50))
                .input('fi', sql.VarChar, String(p.fechaInicio||'').slice(0,20))
                .input('ff', sql.VarChar, String(p.fechaFin||'').slice(0,20))
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Proveedores WHERE id_proveedor=@id)
                    INSERT INTO dbo.Proveedores (id_proveedor,nombre,desc1,desc2,desc3,clientes_cajon_json,tipo_promo,fecha_inicio,fecha_fin,eliminado)
                    VALUES (@id,@nombre,@d1,@d2,@d3,@cj,@tp,@fi,@ff,0)
                    ELSE UPDATE dbo.Proveedores SET nombre=@nombre,desc1=@d1,desc2=@d2,desc3=@d3,clientes_cajon_json=@cj WHERE id_proveedor=@id`);
            counts.proveedores++;
        } catch(e) { console.warn('[migrar] proveedor', p.id, e.message); }
    }

    // Usuarios
    for (const u of usuarios.filter(u => u && (u.id||u.id_usuario))) {
        try {
            const uid = String(u.id||u.id_usuario).slice(0,10);
            await pool.request()
                .input('id', sql.VarChar, uid)
                .input('nombre', sql.VarChar, String(u.nombre||'').slice(0,255))
                .input('rol', sql.VarChar, String(u.rol||'Vendedor').slice(0,50))
                .input('nip', sql.VarChar, String(u.nip||u.pin||'').slice(0,20))
                .input('suc', sql.VarChar, String(u.sucursalId||u.id_sucursal||'S01').slice(0,10))
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario=@id)
                    INSERT INTO dbo.Usuarios (id_usuario,nombre,rol,nip,id_sucursal) VALUES (@id,@nombre,@rol,@nip,@suc)
                    ELSE UPDATE dbo.Usuarios SET nombre=@nombre,rol=@rol,nip=@nip WHERE id_usuario=@id`);
            counts.usuarios++;
        } catch(e) { console.warn('[migrar] usuario', u.id, e.message); }
    }

    console.log('[MIGRACIÓN] Completada:', counts);
    res.json({ success: true, ...counts });
});

// =====================================================================
// ARCHIVOS ESTÁTICOS Y ARRANQUE
// =====================================================================
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 Servidor Casa Ayala en http://localhost:${PORT}`);
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`   -> http://${iface.address}:${PORT}`);
            }
        }
    }
    console.log('\n[SQL Server] Verificando esquema...');
    await ensureDatabaseSchema();
});