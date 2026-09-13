const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const path = require('path');
const os = require('os');
const fs = require('fs');

const STORE_PATH = path.join(__dirname, 'catalog_store.json');

function loadStoreFromFile() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            const content = fs.readFileSync(STORE_PATH, 'utf8');
            const data = JSON.parse(content);
            return {
                clientes: Array.isArray(data.clientes) ? data.clientes : [],
                operadores: Array.isArray(data.operadores) ? data.operadores : [],
                vendedores: Array.isArray(data.vendedores) ? data.vendedores : [],
                proveedores: Array.isArray(data.proveedores) ? data.proveedores : [],
                presupuestos: Array.isArray(data.presupuestos) ? data.presupuestos : []
            };
        }
    } catch (err) {
        console.warn('[Server Store] Error al leer catalog_store.json:', err.message);
    }
    return { clientes: [], operadores: [], vendedores: [], proveedores: [], presupuestos: [] };
}

function saveStoreToFile(storeData) {
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(storeData, null, 2), 'utf8');
    } catch (err) {
        console.warn('[Server Store] Error al guardar catalog_store.json:', err.message);
    }
}

let catalogStore = loadStoreFromFile();

function mergeArray(target, source) {
    const map = new Map();
    (target || []).forEach(item => { if (item && item.id) map.set(item.id, item); });
    (source || []).forEach(item => { if (item && item.id) map.set(item.id, item); });
    return Array.from(map.values());
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de parsing y CORS
app.use(cors());
app.use(express.json());

// Configuración de conexión a SQL Server Express
const dbConfig = {
    user: 'sa',
    password: 'sql2022',
    server: 'localhost',
    database: 'CasaAyalaDB',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

// Rutina de mantenimiento de esquema para remover Foreign Keys rígidas y sembrar datos requeridos
async function ensureDatabaseSchema() {
    try {
        const pool = await sql.connect(dbConfig);
        
        // 1. Deshabilitar / remover Foreign Keys restrictivas para permitir gestión dinámica total
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

        // 2. Sembrar usuarios iniciales si no existen
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario = 'U01')
            BEGIN
                INSERT INTO dbo.Usuarios (id_usuario, nombre, email, rol, id_sucursal, nip, bloqueado, admin_tipo)
                VALUES ('U01', 'Administrador Universal', 'cansagdl@gmail.com', 'Administrador', 'S01', '4819', 0, 'Ambos');
            END
            IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario = 'U02')
            BEGIN
                INSERT INTO dbo.Usuarios (id_usuario, nombre, email, rol, id_sucursal, nip, bloqueado, admin_tipo)
                VALUES ('U02', 'Consuelo Carrillo', 'consuelo.carrillo2022@gmail.com', 'Contabilidad', 'S01', '2526', 0, 'Ninguno');
            END
        `);

        // 3. Sembrar sucursal S01 inicial si no existe
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Sucursales WHERE id_sucursal = 'S01')
            BEGIN
                INSERT INTO dbo.Sucursales (id_sucursal, nombre, direccion, activa_financiera)
                VALUES ('S01', 'SDO6-GDL', 'Guadalajara Centro', 1);
            END
        `);

        // 4. Crear tablas de catálogos si no existen
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Clientes')
            BEGIN
                CREATE TABLE dbo.Clientes (
                    id_cliente VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    codigo_interno VARCHAR(50) NULL,
                    tiene_derecho_descuento BIT DEFAULT 0,
                    eliminado BIT DEFAULT 0
                );
            END
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Operadores')
            BEGIN
                CREATE TABLE dbo.Operadores (
                    id_operador VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    puesto VARCHAR(255) NULL,
                    eliminado BIT DEFAULT 0
                );
            END
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Vendedores')
            BEGIN
                CREATE TABLE dbo.Vendedores (
                    id_vendedor VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    id_sucursal VARCHAR(50) NULL,
                    id_usuario VARCHAR(50) NULL,
                    eliminado BIT DEFAULT 0
                );
            END
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Proveedores')
            BEGIN
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
            END
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Presupuestos')
            BEGIN
                CREATE TABLE dbo.Presupuestos (
                    id_presupuesto VARCHAR(50) PRIMARY KEY,
                    id_sucursal VARCHAR(50) NOT NULL,
                    mes_anio VARCHAR(50) NOT NULL,
                    monto DECIMAL(18,2) DEFAULT 0
                );
            END
        `);

        console.log('[SQL Server] Esquema y restricciones configuradas dinámicamente.');
    } catch (err) {
        console.error('[SQL Server] Error ajustando esquema:', err.message);
    }
}

// --- ENDPOINTS DE LA API REST (/api/...) ---

// GET /api/status - Verificar estado del servidor y conexión SQL
app.get('/api/status', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT GETDATE() AS ServerTime');
        res.json({
            status: 'ok',
            message: 'Conexión a SQL Server establecida con éxito.',
            serverTime: result.recordset[0].ServerTime
        });
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Error al conectar a la base de datos SQL Server.',
            errorDetail: error.message
        });
    }
});

// --- 1. ENDPOINTS USUARIOS ---
// GET /api/usuarios - Consulta de usuarios (garantizando u.id = u.id_usuario)
app.get('/api/usuarios', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT id_usuario AS id, id_usuario, nombre, email, rol, id_sucursal AS sucursalId, nip, bloqueado, admin_tipo AS adminTipo, telefono, direccion 
            FROM dbo.Usuarios
        `);
        const usuarios = result.recordset.map(u => {
            u.id = u.id_usuario;
            if (!u.email || String(u.email).trim() === '') u.email = u.id_usuario || u.nombre;
            u.telefono = u.telefono ? String(u.telefono).trim() : '';
            u.direccion = u.direccion ? String(u.direccion).trim() : '';
            return u;
        });
        res.json(usuarios);
    } catch (error) {
        console.error('Error en GET /api/usuarios:', error.message);
        res.status(500).json({ success: false, error: 'Error al consultar dbo.Usuarios', errorDetail: error.message });
    }
});

// POST /api/usuarios - Registrar o actualizar usuario dinámicamente en SQL Server
app.post('/api/usuarios', async (req, res) => {
    try {
        const { id, id_usuario, nombre, email, rol, sucursalId, id_sucursal, nip, adminTipo, telefono, direccion } = req.body;
        
        const userEmail = String(email || '').trim();
        const userNombre = String(nombre || 'Usuario').trim();
        const userRol = String(rol || 'Vendedor').trim();
        const userSucursal = String(sucursalId || id_sucursal || 'S01').trim().slice(0, 10);
        const userNip = String(nip || '1234').trim().slice(0, 10);
        const userAdminTipo = String(adminTipo || (userRol === 'Administrador' ? 'Ambos' : 'Ninguno')).trim().slice(0, 50);
        const userTelefono = String(telefono || '').trim().slice(0, 50);
        const userDireccion = String(direccion || '').trim().slice(0, 255);

        const pool = await sql.connect(dbConfig);

        // Auto-crear la sucursal en dbo.Sucursales si no existe para evitar faltantes
        if (userSucursal) {
            const checkSuc = await pool.request()
                .input('id_sucursal', sql.VarChar, userSucursal)
                .query('SELECT 1 FROM dbo.Sucursales WHERE id_sucursal = @id_sucursal');

            if (!checkSuc.recordset || checkSuc.recordset.length === 0) {
                await pool.request()
                    .input('id_sucursal', sql.VarChar, userSucursal)
                    .input('nombre', sql.VarChar, userSucursal)
                    .input('direccion', sql.VarChar, 'Asignada desde Web')
                    .input('activa_financiera', sql.Bit, 1)
                    .query(`
                        INSERT INTO dbo.Sucursales (id_sucursal, nombre, direccion, activa_financiera)
                        VALUES (@id_sucursal, @nombre, @direccion, @activa_financiera)
                    `);
            }
        }

        let passedId = String(id || id_usuario || '').trim();

        // Buscar si existe el usuario por id_usuario o por email
        let existingUser = null;
        if (passedId && passedId.length <= 10) {
            const checkById = await pool.request()
                .input('id_usuario', sql.VarChar, passedId)
                .query('SELECT * FROM dbo.Usuarios WHERE id_usuario = @id_usuario');
            if (checkById.recordset && checkById.recordset.length > 0) {
                existingUser = checkById.recordset[0];
            }
        }

        if (!existingUser && userEmail) {
            const checkByEmail = await pool.request()
                .input('email', sql.VarChar, userEmail)
                .query('SELECT * FROM dbo.Usuarios WHERE LOWER(email) = LOWER(@email)');
            if (checkByEmail.recordset && checkByEmail.recordset.length > 0) {
                existingUser = checkByEmail.recordset[0];
            }
        }

        if (existingUser) {
            // ACTUALIZAR USUARIO EXISTENTE
            const targetId = existingUser.id_usuario;
            if (!userTelefono && existingUser.telefono) {
                userTelefono = String(existingUser.telefono).trim();
            }
            if (!userDireccion && existingUser.direccion) {
                userDireccion = String(existingUser.direccion).trim();
            }
            await pool.request()
                .input('id_usuario', sql.VarChar, targetId)
                .input('nombre', sql.VarChar, userNombre)
                .input('email', sql.VarChar, userEmail || existingUser.email)
                .input('rol', sql.VarChar, userRol)
                .input('id_sucursal', sql.VarChar, userSucursal)
                .input('nip', sql.VarChar, userNip)
                .input('admin_tipo', sql.VarChar, userAdminTipo)
                .input('telefono', sql.VarChar, userTelefono)
                .input('direccion', sql.VarChar, userDireccion)
                .query(`
                    UPDATE dbo.Usuarios 
                    SET nombre = @nombre, 
                        email = @email, 
                        rol = @rol, 
                        id_sucursal = @id_sucursal, 
                        nip = @nip, 
                        admin_tipo = @admin_tipo,
                        telefono = @telefono,
                        direccion = @direccion
                    WHERE id_usuario = @id_usuario
                `);
            console.log(`[SQL Server] Usuario '${targetId}' (${userNombre}) actualizado con éxito.`);
            return res.status(200).json({ success: true, message: 'Usuario actualizado en SQL Server.' });
        } else {
            // REGISTRAR NUEVO USUARIO
            let newId = (passedId && passedId.length <= 10) ? passedId : '';
            if (!newId) {
                const countRes = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.Usuarios');
                const total = (countRes.recordset[0].total || 0) + 1;
                newId = 'U' + String(total).padStart(2, '0');
            }

            await pool.request()
                .input('id_usuario', sql.VarChar, newId)
                .input('nombre', sql.VarChar, userNombre)
                .input('email', sql.VarChar, userEmail || newId)
                .input('rol', sql.VarChar, userRol)
                .input('id_sucursal', sql.VarChar, userSucursal)
                .input('nip', sql.VarChar, userNip)
                .input('bloqueado', sql.Bit, 0)
                .input('admin_tipo', sql.VarChar, userAdminTipo)
                .input('telefono', sql.VarChar, userTelefono)
                .input('direccion', sql.VarChar, userDireccion)
                .query(`
                    INSERT INTO dbo.Usuarios (id_usuario, nombre, email, rol, id_sucursal, nip, bloqueado, admin_tipo, telefono, direccion)
                    VALUES (@id_usuario, @nombre, @email, @rol, @id_sucursal, @nip, @bloqueado, @admin_tipo, @telefono, @direccion)
                `);
            console.log(`[SQL Server] Nuevo usuario '${newId}' (${userNombre}) registrado con éxito.`);
            return res.status(200).json({ success: true, message: 'Usuario registrado en SQL Server.' });
        }
    } catch (error) {
        console.error('[POST /api/usuarios] Error al guardar en SQL Server:', error.message);
        return res.status(500).json({ success: false, error: 'Error al guardar usuario en SQL Server', errorDetail: error.message });
    }
});

// DELETE /api/usuarios/:id - Eliminación manual explícita de usuario
app.delete('/api/usuarios/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id_usuario', sql.VarChar, userId)
            .query('DELETE FROM dbo.Usuarios WHERE id_usuario = @id_usuario OR email = @id_usuario');
        console.log(`[SQL Server] Usuario '${userId}' eliminado manualmente por el administrador.`);
        return res.status(200).json({ success: true, message: 'Usuario eliminado.' });
    } catch (error) {
        console.error('Error en DELETE /api/usuarios:', error.message);
        return res.status(500).json({ success: false, error: 'Error al eliminar usuario en SQL Server', errorDetail: error.message });
    }
});

// --- 2. ENDPOINTS SUCURSALES ---
// GET /api/sucursales - Consulta de sucursales
app.get('/api/sucursales', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT id_sucursal AS id, id_sucursal, nombre, direccion, activa_financiera AS activaFinanciera 
            FROM dbo.Sucursales
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error('Error en GET /api/sucursales:', error.message);
        res.status(500).json({ success: false, error: 'Error al consultar dbo.Sucursales', errorDetail: error.message });
    }
});

// POST /api/sucursales - Guardar o actualizar sucursal en SQL Server
app.post('/api/sucursales', async (req, res) => {
    try {
        const { id, nombre, direccion, activaFinanciera } = req.body;
        const sucId = String(id || ('S' + Date.now())).trim().slice(0, 10);
        const sucNombre = String(nombre || sucId).trim().slice(0, 100);
        const sucDireccion = String(direccion || '').trim().slice(0, 255);
        const sucActiva = activaFinanciera ? 1 : 0;

        const pool = await sql.connect(dbConfig);
        const check = await pool.request()
            .input('id_sucursal', sql.VarChar, sucId)
            .input('nombre', sql.VarChar, sucNombre)
            .query('SELECT * FROM dbo.Sucursales WHERE id_sucursal = @id_sucursal OR nombre = @nombre');

        if (check.recordset && check.recordset.length > 0) {
            const existingId = check.recordset[0].id_sucursal;
            await pool.request()
                .input('id_sucursal', sql.VarChar, existingId)
                .input('nombre', sql.VarChar, sucNombre)
                .input('direccion', sql.VarChar, sucDireccion)
                .input('activa_financiera', sql.Bit, sucActiva)
                .query(`
                    UPDATE dbo.Sucursales 
                    SET nombre = @nombre, direccion = @direccion, activa_financiera = @activa_financiera
                    WHERE id_sucursal = @id_sucursal
                `);
            console.log(`[SQL Server] Sucursal '${existingId}' actualizada.`);
        } else {
            await pool.request()
                .input('id_sucursal', sql.VarChar, sucId)
                .input('nombre', sql.VarChar, sucNombre)
                .input('direccion', sql.VarChar, sucDireccion)
                .input('activa_financiera', sql.Bit, sucActiva)
                .query(`
                    INSERT INTO dbo.Sucursales (id_sucursal, nombre, direccion, activa_financiera)
                    VALUES (@id_sucursal, @nombre, @direccion, @activa_financiera)
                `);
            console.log(`[SQL Server] Sucursal '${sucId}' insertada.`);
        }

        return res.status(200).json({ success: true, message: 'Sucursal guardada en SQL Server.' });
    } catch (error) {
        console.error('Error en POST /api/sucursales:', error.message);
        return res.status(500).json({ success: false, error: 'Error al guardar sucursal', errorDetail: error.message });
    }
});

// DELETE /api/sucursales/:id - Eliminar sucursal en SQL Server
app.delete('/api/sucursales/:id', async (req, res) => {
    const sucId = req.params.id;
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id_sucursal', sql.VarChar, sucId)
            .query('DELETE FROM dbo.Sucursales WHERE id_sucursal = @id_sucursal');
        console.log(`[SQL Server] Sucursal '${sucId}' eliminada manualmente.`);
        return res.status(200).json({ success: true, message: 'Sucursal eliminada.' });
    } catch (error) {
        console.error('Error en DELETE /api/sucursales:', error.message);
        return res.status(500).json({ success: false, error: 'Error al eliminar sucursal', errorDetail: error.message });
    }
});

// --- 2.5 ENDPOINTS DE TODOS LOS CATÁLOGOS CON PERSISTENCIA ---

// GET /api/catalogos/all - Consulta unificada de todos los catálogos
app.get('/api/catalogos/all', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const [cliRes, opeRes, venRes, provRes, presRes] = await Promise.all([
            pool.request().query('SELECT * FROM dbo.Clientes'),
            pool.request().query('SELECT * FROM dbo.Operadores'),
            pool.request().query('SELECT * FROM dbo.Vendedores'),
            pool.request().query('SELECT * FROM dbo.Proveedores'),
            pool.request().query('SELECT * FROM dbo.Presupuestos')
        ]);

        const dbStore = {
            clientes: cliRes.recordset.map(c => ({ id: c.id_cliente, nombre: c.nombre, codigoInterno: c.codigo_interno || '', tieneDerechoDescuento: !!c.tiene_derecho_descuento, eliminado: !!c.eliminado })),
            operadores: opeRes.recordset.map(o => ({ id: o.id_operador, nombre: o.nombre, puesto: o.puesto || '', eliminado: !!o.eliminado })),
            vendedores: venRes.recordset.map(v => ({ id: v.id_vendedor, nombre: v.nombre, sucursalId: v.id_sucursal || 'S01', userId: v.id_usuario || null, eliminado: !!v.eliminado })),
            proveedores: provRes.recordset.map(p => ({
                id: p.id_proveedor,
                nombre: p.nombre,
                desc1: parseFloat(p.desc1 || 0),
                desc2: parseFloat(p.desc2 || 0),
                desc3: parseFloat(p.desc3 || 0),
                clientesCajon: p.clientes_cajon_json ? JSON.parse(p.clientes_cajon_json) : [],
                fechaInicio: p.fecha_inicio || '',
                fechaFin: p.fecha_fin || '',
                tipoPromo: p.tipo_promo || 'clientes_exclusivos',
                eliminado: !!p.eliminado
            })),
            presupuestos: presRes.recordset.map(pr => ({ id: pr.id_presupuesto, sucursalId: pr.id_sucursal, mesAnio: pr.mes_anio, monto: parseFloat(pr.monto || 0) }))
        };

        catalogStore.clientes = mergeArray(catalogStore.clientes, dbStore.clientes);
        catalogStore.operadores = mergeArray(catalogStore.operadores, dbStore.operadores);
        catalogStore.vendedores = mergeArray(catalogStore.vendedores, dbStore.vendedores);
        catalogStore.proveedores = mergeArray(catalogStore.proveedores, dbStore.proveedores);
        catalogStore.presupuestos = mergeArray(catalogStore.presupuestos, dbStore.presupuestos);
        saveStoreToFile(catalogStore);

        return res.json(catalogStore);
    } catch (err) {
        console.warn('[SQL Server] Error al consultar catálogos (usando respaldo en servidor):', err.message);
        return res.json(catalogStore);
    }
});

// POST /api/catalogos/sync-all - Sincronización masiva de todos los catálogos desde dispositivos
app.post('/api/catalogos/sync-all', async (req, res) => {
    try {
        const payload = req.body || {};
        if (payload.clientes) catalogStore.clientes = mergeArray(catalogStore.clientes, payload.clientes);
        if (payload.operadores) catalogStore.operadores = mergeArray(catalogStore.operadores, payload.operadores);
        if (payload.vendedores) catalogStore.vendedores = mergeArray(catalogStore.vendedores, payload.vendedores);
        if (payload.proveedores) catalogStore.proveedores = mergeArray(catalogStore.proveedores, payload.proveedores);
        if (payload.presupuestos) catalogStore.presupuestos = mergeArray(catalogStore.presupuestos, payload.presupuestos);

        saveStoreToFile(catalogStore);

        // Intentar reflejar en SQL Server
        try {
            const pool = await sql.connect(dbConfig);
            for (const c of catalogStore.clientes) {
                await pool.request()
                    .input('id', sql.VarChar, c.id)
                    .input('nombre', sql.VarChar, c.nombre)
                    .input('codigo', sql.VarChar, c.codigoInterno || '')
                    .input('descto', sql.Bit, c.tieneDerechoDescuento ? 1 : 0)
                    .input('eliminado', sql.Bit, c.eliminado ? 1 : 0)
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.Clientes WHERE id_cliente = @id)
                            UPDATE dbo.Clientes SET nombre=@nombre, codigo_interno=@codigo, tiene_derecho_descuento=@descto, eliminado=@eliminado WHERE id_cliente=@id
                        ELSE
                            INSERT INTO dbo.Clientes (id_cliente, nombre, codigo_interno, tiene_derecho_descuento, eliminado) VALUES (@id, @nombre, @codigo, @descto, @eliminado)
                    `);
            }
            for (const o of catalogStore.operadores) {
                await pool.request()
                    .input('id', sql.VarChar, o.id)
                    .input('nombre', sql.VarChar, o.nombre)
                    .input('puesto', sql.VarChar, o.puesto || '')
                    .input('eliminado', sql.Bit, o.eliminado ? 1 : 0)
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.Operadores WHERE id_operador = @id)
                            UPDATE dbo.Operadores SET nombre=@nombre, puesto=@puesto, eliminado=@eliminado WHERE id_operador=@id
                        ELSE
                            INSERT INTO dbo.Operadores (id_operador, nombre, puesto, eliminado) VALUES (@id, @nombre, @puesto, @eliminado)
                    `);
            }
            for (const v of catalogStore.vendedores) {
                await pool.request()
                    .input('id', sql.VarChar, v.id)
                    .input('nombre', sql.VarChar, v.nombre)
                    .input('sucursal', sql.VarChar, v.sucursalId || 'S01')
                    .input('usuario', sql.VarChar, v.userId || null)
                    .input('eliminado', sql.Bit, v.eliminado ? 1 : 0)
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.Vendedores WHERE id_vendedor = @id)
                            UPDATE dbo.Vendedores SET nombre=@nombre, id_sucursal=@sucursal, id_usuario=@usuario, eliminado=@eliminado WHERE id_vendedor=@id
                        ELSE
                            INSERT INTO dbo.Vendedores (id_vendedor, nombre, id_sucursal, id_usuario, eliminado) VALUES (@id, @nombre, @sucursal, @usuario, @eliminado)
                    `);
            }
            for (const p of catalogStore.proveedores) {
                await pool.request()
                    .input('id', sql.VarChar, p.id)
                    .input('nombre', sql.VarChar, p.nombre)
                    .input('desc1', sql.Decimal(18,2), p.desc1 || 0)
                    .input('desc2', sql.Decimal(18,2), p.desc2 || 0)
                    .input('desc3', sql.Decimal(18,2), p.desc3 || 0)
                    .input('cajon', sql.VarChar, JSON.stringify(p.clientesCajon || []))
                    .input('inicio', sql.VarChar, p.fechaInicio || '')
                    .input('fin', sql.VarChar, p.fechaFin || '')
                    .input('promo', sql.VarChar, p.tipoPromo || 'clientes_exclusivos')
                    .input('eliminado', sql.Bit, p.eliminado ? 1 : 0)
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.Proveedores WHERE id_proveedor = @id)
                            UPDATE dbo.Proveedores SET nombre=@nombre, desc1=@desc1, desc2=@desc2, desc3=@desc3, clientes_cajon_json=@cajon, fecha_inicio=@inicio, fecha_fin=@fin, tipo_promo=@promo, eliminado=@eliminado WHERE id_proveedor=@id
                        ELSE
                            INSERT INTO dbo.Proveedores (id_proveedor, nombre, desc1, desc2, desc3, clientes_cajon_json, fecha_inicio, fecha_fin, tipo_promo, eliminado) VALUES (@id, @nombre, @desc1, @desc2, @desc3, @cajon, @inicio, @fin, @promo, @eliminado)
                    `);
            }
        } catch (sqlErr) {
            console.warn('[SQL Server] No se pudo guardar sync en SQL:', sqlErr.message);
        }

        return res.json({ success: true, store: catalogStore });
    } catch (error) {
        console.error('Error en POST /api/catalogos/sync-all:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoints individuales de Clientes
app.get('/api/clientes', (req, res) => res.json(catalogStore.clientes));
app.post('/api/clientes', (req, res) => {
    const item = req.body;
    if (item && item.id) {
        const idx = catalogStore.clientes.findIndex(c => c.id === item.id);
        if (idx !== -1) catalogStore.clientes[idx] = item;
        else catalogStore.clientes.push(item);
        saveStoreToFile(catalogStore);
    }
    return res.json({ success: true, item });
});
app.post('/api/clientes/sync', (req, res) => {
    if (Array.isArray(req.body)) {
        catalogStore.clientes = mergeArray(catalogStore.clientes, req.body);
        saveStoreToFile(catalogStore);
    }
    return res.json({ success: true, count: catalogStore.clientes.length });
});
app.delete('/api/clientes/:id', (req, res) => {
    const id = req.params.id;
    const item = catalogStore.clientes.find(c => c.id === id);
    if (item) item.eliminado = true;
    saveStoreToFile(catalogStore);
    return res.json({ success: true });
});

// Endpoints individuales de Operadores
app.get('/api/operadores', (req, res) => res.json(catalogStore.operadores));
app.post('/api/operadores', (req, res) => {
    const item = req.body;
    if (item && item.id) {
        const idx = catalogStore.operadores.findIndex(o => o.id === item.id);
        if (idx !== -1) catalogStore.operadores[idx] = item;
        else catalogStore.operadores.push(item);
        saveStoreToFile(catalogStore);
    }
    return res.json({ success: true, item });
});
app.delete('/api/operadores/:id', (req, res) => {
    const item = catalogStore.operadores.find(o => o.id === req.params.id);
    if (item) item.eliminado = true;
    saveStoreToFile(catalogStore);
    return res.json({ success: true });
});

// Endpoints individuales de Vendedores
app.get('/api/vendedores', (req, res) => res.json(catalogStore.vendedores));
app.post('/api/vendedores', (req, res) => {
    const item = req.body;
    if (item && item.id) {
        const idx = catalogStore.vendedores.findIndex(v => v.id === item.id);
        if (idx !== -1) catalogStore.vendedores[idx] = item;
        else catalogStore.vendedores.push(item);
        saveStoreToFile(catalogStore);
    }
    return res.json({ success: true, item });
});
app.delete('/api/vendedores/:id', (req, res) => {
    const item = catalogStore.vendedores.find(v => v.id === req.params.id);
    if (item) item.eliminado = true;
    saveStoreToFile(catalogStore);
    return res.json({ success: true });
});

// Endpoints individuales de Proveedores
app.get('/api/proveedores', (req, res) => res.json(catalogStore.proveedores));
app.post('/api/proveedores', (req, res) => {
    const item = req.body;
    if (item && item.id) {
        const idx = catalogStore.proveedores.findIndex(p => p.id === item.id);
        if (idx !== -1) catalogStore.proveedores[idx] = item;
        else catalogStore.proveedores.push(item);
        saveStoreToFile(catalogStore);
    }
    return res.json({ success: true, item });
});
app.delete('/api/proveedores/:id', (req, res) => {
    const item = catalogStore.proveedores.find(p => p.id === req.params.id);
    if (item) item.eliminado = true;
    saveStoreToFile(catalogStore);
    return res.json({ success: true });
});

// Endpoints individuales de Presupuestos
app.get('/api/presupuestos', (req, res) => res.json(catalogStore.presupuestos));
app.post('/api/presupuestos', (req, res) => {
    const item = req.body;
    if (item && item.id) {
        const idx = catalogStore.presupuestos.findIndex(p => p.id === item.id);
        if (idx !== -1) catalogStore.presupuestos[idx] = item;
        else catalogStore.presupuestos.push(item);
        saveStoreToFile(catalogStore);
    }
    return res.json({ success: true, item });
});

// --- 3. ENDPOINTS NOTAS DE CRÉDITO ---
// GET /api/notas - Consulta de notas de crédito desde dbo.Notas
app.get('/api/notas', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM dbo.Notas');
        const notas = result.recordset.map(nota => {
            nota.id = nota.id_nota || nota.id || nota.folio;
            nota.folio = nota.folio_consecutivo || nota.folio || nota.id_nota || nota.id;
            nota.tipo = nota.tipo_nota || nota.tipo || 'Fisico';
            nota.montoTotal = parseFloat(nota.monto_total || nota.montoTotal || nota.total || 0);
            nota.total = nota.montoTotal;
            nota.clienteNombre = nota.cliente_nombre || nota.clienteNombre || nota.cliente || '';
            nota.operadorNombre = nota.operador_nombre || nota.operadorNombre || nota.operador || '';
            nota.vendedorId = nota.id_usuario_creador || nota.vendedorId || nota.creador || '';
            nota.sucursalId = nota.id_sucursal || nota.sucursalId || 'S01';
            nota.fechaEmision = nota.fecha_emision ? new Date(nota.fecha_emision).toISOString().split('T')[0] : (nota.fechaEmision || new Date().toISOString().split('T')[0]);

            if (nota.partidas && typeof nota.partidas === 'string') {
                try { nota.partidas = JSON.parse(nota.partidas); } catch (e) { }
            }
            if (nota.productos && typeof nota.productos === 'string') {
                try { nota.productos = JSON.parse(nota.productos); } catch (e) { }
            }
            return nota;
        });
        res.json(notas);
    } catch (error) {
        console.error('Error en GET /api/notas:', error.message);
        res.status(500).json({ success: false, error: 'Error al consultar dbo.Notas', errorDetail: error.message });
    }
});

// POST /api/notas - Guardar o actualizar estado de Nota de Crédito en SQL Server
app.post('/api/notas', async (req, res) => {
    try {
        const { id, folio, tipo, clienteNombre, operadorNombre, montoTotal, sucursalId, idUsuarioCreador } = req.body;
        
        const notaId = parseInt(id || folio || Date.now().toString().slice(-6), 10);
        const notaTipo = String(tipo || 'Físico').trim().slice(0, 50);
        const total = parseFloat(montoTotal || req.body.total || req.body.subtotal || 0);
        const cliente = String(clienteNombre || req.body.cliente || '').trim().slice(0, 200);
        const operador = String(operadorNombre || req.body.operador || '').trim().slice(0, 200);
        const creador = String(idUsuarioCreador || req.body.creador || 'U01').trim().slice(0, 10);
        const sucursal = String(sucursalId || 'S01').trim().slice(0, 10);

        const pool = await sql.connect(dbConfig);
        const check = await pool.request()
            .input('id_nota', sql.Int, notaId)
            .query('SELECT * FROM dbo.Notas WHERE id_nota = @id_nota');

        if (check.recordset && check.recordset.length > 0) {
            await pool.request()
                .input('id_nota', sql.Int, notaId)
                .input('tipo_nota', sql.VarChar, notaTipo)
                .input('monto_total', sql.Decimal(18, 2), total)
                .input('cliente_nombre', sql.VarChar, cliente)
                .input('operador_nombre', sql.VarChar, operador)
                .input('id_usuario_creador', sql.VarChar, creador)
                .input('id_sucursal', sql.VarChar, sucursal)
                .query(`
                    UPDATE dbo.Notas 
                    SET tipo_nota = @tipo_nota, 
                        monto_total = @monto_total, 
                        cliente_nombre = @cliente_nombre, 
                        operador_nombre = @operador_nombre,
                        id_usuario_creador = @id_usuario_creador,
                        id_sucursal = @id_sucursal
                    WHERE id_nota = @id_nota
                `);
            console.log(`[SQL Server] Nota de crédito #${notaId} actualizada.`);
        } else {
            await pool.request()
                .input('id_nota', sql.Int, notaId)
                .input('folio_consecutivo', sql.Int, notaId)
                .input('tipo_nota', sql.VarChar, notaTipo)
                .input('impresa', sql.Bit, 0)
                .input('monto_total', sql.Decimal(18, 2), total)
                .input('cliente_nombre', sql.VarChar, cliente)
                .input('operador_nombre', sql.VarChar, operador)
                .input('id_usuario_creador', sql.VarChar, creador)
                .input('id_sucursal', sql.VarChar, sucursal)
                .input('fecha_emision', sql.DateTime, new Date())
                .query(`
                    INSERT INTO dbo.Notas (id_nota, folio_consecutivo, tipo_nota, impresa, monto_total, cliente_nombre, operador_nombre, id_usuario_creador, id_sucursal, fecha_emision)
                    VALUES (@id_nota, @folio_consecutivo, @tipo_nota, @impresa, @monto_total, @cliente_nombre, @operador_nombre, @id_usuario_creador, @id_sucursal, @fecha_emision)
                `);
            console.log(`[SQL Server] Nota de crédito #${notaId} creada.`);
        }

        return res.status(200).json({ success: true, message: 'Nota de crédito guardada en SQL Server.' });
    } catch (error) {
        console.error('Error en POST /api/notas:', error.message);
        return res.status(500).json({ success: false, error: 'Error al guardar nota de crédito', errorDetail: error.message });
    }
});

// DELETE /api/notas/:id - Eliminar nota de crédito en SQL Server
app.delete('/api/notas/:id', async (req, res) => {
    const notaId = parseInt(req.params.id, 10);
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id_nota', sql.Int, notaId)
            .query('DELETE FROM dbo.Notas WHERE id_nota = @id_nota');
        console.log(`[SQL Server] Nota #${notaId} eliminada manualmente.`);
        return res.status(200).json({ success: true, message: 'Nota de crédito eliminada.' });
    } catch (error) {
        console.error('Error en DELETE /api/notas:', error.message);
        return res.status(500).json({ success: false, error: 'Error al eliminar nota de crédito', errorDetail: error.message });
    }
});

// --- 4. ENDPOINT LOGIN ---
// POST /api/login - Autenticación flexible e insensible a mayúsculas/espacios en SQL Server
app.post('/api/login', async (req, res) => {
    const loginInput = String(req.body.email || req.body.usuario || req.body.id_usuario || req.body.usuarioId || '').trim();
    const cleanNip = String(req.body.nip || '').trim();

    console.log(`[POST /api/login] Intento de login -> Usuario/Email: '${loginInput}' | NIP: '${cleanNip}'`);

    if (!loginInput || !cleanNip) {
        console.log('[POST /api/login] Rechazado: loginInput o nip vacíos.');
        return res.status(401).json({ success: false, message: 'Credenciales incorrectas: Faltan datos de acceso.' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        
        request.input('loginInput', sql.VarChar, loginInput);
        request.input('nip', sql.VarChar, cleanNip);

        const query = `
            SELECT u.id_usuario AS id,
                   u.id_usuario,
                   u.nombre,
                   u.email,
                   u.rol,
                   u.id_sucursal AS sucursalId,
                   u.nip,
                   u.bloqueado,
                   u.admin_tipo AS adminTipo,
                   s.nombre AS sucursalNombre,
                   s.direccion AS sucursalDireccion
            FROM dbo.Usuarios u
            LEFT JOIN dbo.Sucursales s ON u.id_sucursal = s.id_sucursal
            WHERE (LOWER(LTRIM(RTRIM(u.email))) = LOWER(@loginInput) 
                OR LOWER(LTRIM(RTRIM(u.id_usuario))) = LOWER(@loginInput) 
                OR LOWER(LTRIM(RTRIM(u.nombre))) = LOWER(@loginInput))
              AND LTRIM(RTRIM(u.nip)) = @nip
        `;

        const result = await request.query(query);

        if (result.recordset && result.recordset.length > 0) {
            const user = result.recordset[0];

            if (user.bloqueado) {
                console.log(`[POST /api/login] Rechazado: Cuenta bloqueada (${user.nombre}).`);
                return res.status(403).json({ success: false, message: 'Esta cuenta se encuentra bloqueada. Contacte al Administrador Universal.' });
            }

            console.log(`[POST /api/login] EXITO: Usuario autenticado -> ${user.nombre} (${user.rol})`);

            if (!user.id && user.id_usuario) user.id = user.id_usuario;
            if (!user.sucursalId && user.id_sucursal) user.sucursalId = user.id_sucursal;

            return res.status(200).json({ success: true, user: user });
        }
    } catch (error) {
        console.error('[POST /api/login] Error al consultar SQL Server:', error.message);
        return res.status(500).json({ success: false, message: 'Error en el servidor al verificar credenciales', errorDetail: error.message });
    }
});

// --- 6. ENDPOINTS FALTANTES PICKING ---
let serverFaltantesPicking = [];

app.get('/api/faltantes-picking', (req, res) => {
    res.json(serverFaltantesPicking);
});

app.post('/api/faltantes-picking', (req, res) => {
    try {
        const item = req.body;
        if (!item || !item.id) {
            return res.status(400).json({ error: 'Datos de faltante en picking inválidos' });
        }
        const existingIdx = serverFaltantesPicking.findIndex(f => f.id === item.id);
        if (existingIdx !== -1) {
            serverFaltantesPicking[existingIdx] = item;
        } else {
            serverFaltantesPicking.unshift(item);
        }
        res.json({ success: true, item });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/faltantes-picking/:id', (req, res) => {
    try {
        const { id } = req.params;
        serverFaltantesPicking = serverFaltantesPicking.filter(f => f.id !== id);
        res.json({ success: true, message: 'Faltante eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware estático y rutas SPA (deben ir AL FINAL de la API)
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Levantar el servidor y ejecutar mantenimiento de esquema
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Servidor Node.js corriendo localmente en: http://localhost:${PORT}`);
    const interfaces = os.networkInterfaces();
    console.log('--- ACCESO DESDE OTROS DISPOSITIVOS Y COMPUTADORAS EN LA RED ---');
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(` -> http://${iface.address}:${PORT}`);
            }
        }
    }
    await ensureDatabaseSchema();
});