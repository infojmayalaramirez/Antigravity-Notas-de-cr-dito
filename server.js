const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const path = require('path');

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
app.listen(PORT, async () => {
    console.log(`Servidor Node.js corriendo en http://localhost:${PORT}`);
    await ensureDatabaseSchema();
});