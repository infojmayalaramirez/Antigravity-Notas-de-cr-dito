// routes_notas.js
// Notas de crédito + folios + endpoint unificado de catálogos.
// FUENTE ÚNICA DE VERDAD: SQL Server. Todo cambio de estado (cancelar, firmar, aprobar,
// rechazar) se ejecuta AQUÍ, bajo candado y validando el rol del usuario, de modo que
// cualquier otro módulo/dispositivo vea exactamente lo mismo en el siguiente sondeo.

module.exports = function registrarRutasNotas(app, ctx) {
    const {
        getPool, sql, withLock, rowToNota, SQL_SELECT_NOTAS, folioBase, serieDeFolio,
        firmasRequeridas, firmasPorDefecto, RANGO_AUTH
    } = ctx;

    const pad4 = n => String(n).padStart(4, '0');
    const soloDigitos = v => parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);

    async function cargarNota(pool, idNum) {
        const r = await pool.request().input('id', sql.Int, idNum).query(SQL_SELECT_NOTAS + ' WHERE id_nota=@id');
        return r.recordset[0] || null;
    }

    async function guardarEstado(pool, idNum, n, extra) {
        // n = objeto nota (rowToNota) ya modificado; extra = campos adicionales a mezclar en datos_json
        const json = { ...n, ...(extra || {}) };
        json.estado = json.estado_operacion === 'Cancelada' ? 'Cancelada' : json.estado_autorizacion;
        await pool.request()
            .input('id', sql.Int, idNum)
            .input('estAut', sql.VarChar, json.estado_autorizacion)
            .input('estOp', sql.VarChar, json.estado_operacion)
            .input('imp', sql.Bit, json.impresa ? 1 : 0)
            .input('json', sql.VarChar(sql.MAX), JSON.stringify(json))
            .query(`UPDATE dbo.Notas SET estado_autorizacion=@estAut, estado_operacion=@estOp,
                           impresa=@imp, datos_json=@json WHERE id_nota=@id`);
        return json;
    }

    // ------------------------------------------------------------------
    // GET /api/notas
    // ------------------------------------------------------------------
    app.get('/api/notas', async (req, res) => {
        try {
            const pool = await getPool();
            const r = await pool.request().query(SQL_SELECT_NOTAS + ' ORDER BY fecha_emision DESC, id_nota DESC');
            res.json(r.recordset.map(rowToNota));
        } catch (error) {
            console.error('[GET /api/notas]', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // ------------------------------------------------------------------
    // POST /api/notas  — alta de nota nueva / actualización de borrador
    // (los cambios de estado de notas ya emitidas van por /accion)
    // ------------------------------------------------------------------
    app.post('/api/notas', async (req, res) => {
        try {
            const nota = { ...req.body };
            const esNueva = nota.esNueva === true;
            delete nota.esNueva;

            const out = await withLock(async () => {
                const pool = await getPool();

                // Idempotencia: si el cliente reintenta una nota que ya se guardó, devolver la existente
                if (esNueva && nota.uid) {
                    const dup = await pool.request()
                        .input('pat', sql.VarChar, '%"uid":"' + String(nota.uid).replace(/[%_\[\]"]/g, '') + '"%')
                        .query(SQL_SELECT_NOTAS + ' WHERE datos_json LIKE @pat');
                    if (dup.recordset.length) return { nota: rowToNota(dup.recordset[0]), repetida: true };
                }

                let idNum = soloDigitos(nota.folio || nota.id);
                let existente = null;
                if (!esNueva && Number.isFinite(idNum)) existente = await cargarNota(pool, idNum);

                if (esNueva || !Number.isFinite(idNum)) {
                    // El servidor SIEMPRE decide el folio de una nota nueva (evita colisiones entre equipos
                    // y respeta los rangos reservados por lotes impresos).
                    idNum = (await folioBase(pool)) + 1;
                    existente = null;
                }
                nota.folio = pad4(idNum);
                nota.id = 'N' + nota.folio;
                nota.serie = serieDeFolio(idNum);

                const tipoTxt = String(nota.tipo || nota.tipo_nota || 'Fisico').toLowerCase();
                const esFin = tipoTxt.includes('finan');
                nota.tipo = esFin ? 'Financiero' : 'Fisico';

                const sucursal = String(nota.sucursalId || 'S01').trim().slice(0, 10);
                const sucRow = await pool.request().input('s', sql.VarChar, sucursal)
                    .query('SELECT activa_financiera FROM dbo.Sucursales WHERE id_sucursal=@s');
                if (!sucRow.recordset.length) {
                    const e = new Error(`La sucursal '${sucursal}' no existe.`); e.status = 400; throw e;
                }
                const esBorrador = String(nota.estado_autorizacion || '') === 'Borrador';
                if (esFin && !esBorrador && !sucRow.recordset[0].activa_financiera) {
                    const e = new Error('La sucursal seleccionada no tiene habilitado el módulo financiero.'); e.status = 403; throw e;
                }

                let estAut = String(nota.estado_autorizacion || 'Autorizada').trim().slice(0, 50);
                let estOp  = String(nota.estado_operacion || 'Activa').trim().slice(0, 50);
                let firmas = { ...firmasPorDefecto(), ...(nota.firmas || {}) };

                if (existente) {
                    const ex = rowToNota(existente);
                    if (ex.estado_autorizacion !== 'Borrador') {
                        // Nota ya emitida: protegemos contra clientes desactualizados.
                        // - Cancelada es definitiva. - Las firmas solo se suman. - El estado solo avanza.
                        estOp = (ex.estado_operacion === 'Cancelada' || estOp === 'Cancelada') ? 'Cancelada' : 'Activa';
                        for (const k of Object.keys(firmas)) firmas[k] = ex.firmas[k] || firmas[k] || null;
                        const rIn = RANGO_AUTH[estAut] != null ? RANGO_AUTH[estAut] : 3;
                        const rEx = RANGO_AUTH[ex.estado_autorizacion] != null ? RANGO_AUTH[ex.estado_autorizacion] : 3;
                        if (rIn < rEx || ex.estado_autorizacion === 'Rechazada') estAut = ex.estado_autorizacion;
                    }
                }
                nota.estado_autorizacion = estAut;
                nota.estado_operacion = estOp;
                nota.firmas = firmas;
                nota.estado = estOp === 'Cancelada' ? 'Cancelada' : estAut;
                if (!nota.fechaEmision) nota.fechaEmision = new Date().toISOString().substring(0, 10);

                const total = parseFloat(nota.total || nota.montoTotal || nota.importeDescuento || nota.subtotal || 0) || 0;
                const clienteId  = String(nota.clienteId  || '').trim().slice(0, 50);
                const operadorId = String(nota.operadorId || '').trim().slice(0, 50);
                let vendedorId   = String(nota.vendedorId || 'U01').trim().slice(0, 50);

                // Nombres reales (no IDs) en columnas legibles de SQL + heredar vendedor asignado al cliente
                let cliNombre = clienteId, opeNombre = operadorId;
                if (clienteId) {
                    const c = await pool.request().input('c', sql.VarChar, clienteId)
                        .query('SELECT nombre, ISNULL(id_vendedor, \'\') AS id_vendedor FROM dbo.Clientes WHERE id_cliente=@c');
                    if (c.recordset.length) {
                        cliNombre = c.recordset[0].nombre;
                        const cliVend = String(c.recordset[0].id_vendedor || '').trim();
                        if (cliVend && cliVend !== 'PUBLICO') {
                            vendedorId = cliVend;
                            nota.vendedorId = cliVend;
                        } else if (cliVend === 'PUBLICO' && (!nota.vendedorId || nota.vendedorId === 'U01')) {
                            vendedorId = 'PUBLICO';
                            nota.vendedorId = 'PUBLICO';
                        }
                    }
                }
                if (operadorId) {
                    const o = await pool.request().input('o', sql.VarChar, operadorId)
                        .query('SELECT nombre FROM dbo.Operadores WHERE id_operador=@o');
                    if (o.recordset.length) opeNombre = o.recordset[0].nombre;
                }

                const datosJson = JSON.stringify(nota);

                await pool.request()
                    .input('id',      sql.Int, idNum)
                    .input('tipo',    sql.VarChar, esFin ? 'Financiera' : 'Física')
                    .input('total',   sql.Decimal(18, 2), total)
                    .input('cliId',   sql.VarChar, clienteId)
                    .input('opeId',   sql.VarChar, operadorId)
                    .input('cliNom',  sql.VarChar, String(cliNombre).slice(0, 200))
                    .input('opeNom',  sql.VarChar, String(opeNombre).slice(0, 200))
                    .input('creador', sql.VarChar, vendedorId)
                    .input('suc',     sql.VarChar, sucursal)
                    .input('estAut',  sql.VarChar, estAut)
                    .input('estOp',   sql.VarChar, estOp)
                    .input('fecha',   sql.VarChar, String(nota.fechaEmision).substring(0, 10))
                    .input('json',    sql.VarChar(sql.MAX), datosJson)
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.Notas WHERE id_nota=@id)
                            UPDATE dbo.Notas
                            SET tipo_nota=@tipo, monto_total=@total, id_cliente=@cliId, id_operador=@opeId,
                                cliente_nombre=@cliNom, operador_nombre=@opeNom,
                                id_usuario_creador=@creador, id_sucursal=@suc,
                                estado_autorizacion=@estAut, estado_operacion=@estOp, datos_json=@json
                            WHERE id_nota=@id
                        ELSE
                        BEGIN
                            SET IDENTITY_INSERT dbo.Notas ON;
                            INSERT INTO dbo.Notas
                                (id_nota, folio_consecutivo, tipo_nota, impresa, monto_total,
                                 id_cliente, id_operador, cliente_nombre, operador_nombre,
                                 id_usuario_creador, id_sucursal, fecha_emision,
                                 estado_autorizacion, estado_operacion, datos_json)
                            VALUES (@id, @id, @tipo, 0, @total, @cliId, @opeId, @cliNom, @opeNom,
                                    @creador, @suc, ISNULL(TRY_CAST(@fecha AS DATE), GETDATE()),
                                    @estAut, @estOp, @json);
                            SET IDENTITY_INSERT dbo.Notas OFF;
                        END
                    `);

                const fila = await cargarNota(pool, idNum);
                console.log(`[POST /api/notas] Nota #${idNum} (${nota.tipo}) guardada. Total: $${total} Estado: ${estAut}/${estOp}`);
                return { nota: rowToNota(fila) };
            });

            res.json({ success: true, id: out.nota.id_nota, folio: out.nota.folio, nota: out.nota, repetida: !!out.repetida });
        } catch (error) {
            console.error('[POST /api/notas]', error.message);
            res.status(error.status || 500).json({ error: error.message });
        }
    });

    // ------------------------------------------------------------------
    // POST /api/notas/:id/accion  — cambios de estado atómicos con validación de rol
    //   accion: cancelar | firmar | aprobar | rechazar | imprimir
    // ------------------------------------------------------------------
    app.post('/api/notas/:id/accion', async (req, res) => {
        try {
            const { accion, userId, key, motivo } = req.body || {};
            const idNum = soloDigitos(req.params.id);
            if (!Number.isFinite(idNum)) return res.status(400).json({ error: 'Folio inválido.' });

            const resultado = await withLock(async () => {
                const pool = await getPool();

                const uR = await pool.request().input('u', sql.VarChar, String(userId || ''))
                    .query('SELECT id_usuario, nombre, rol, id_sucursal, bloqueado FROM dbo.Usuarios WHERE id_usuario=@u');
                const user = uR.recordset[0];
                if (!user) { const e = new Error('Usuario no reconocido. Vuelve a iniciar sesión.'); e.status = 401; throw e; }
                if (user.bloqueado) { const e = new Error('Tu cuenta está bloqueada.'); e.status = 403; throw e; }

                const fila = await cargarNota(pool, idNum);
                if (!fila) { const e = new Error('La nota ya no existe.'); e.status = 404; throw e; }
                const n = rowToNota(fila);

                const esAdmin = user.rol === 'Administrador';
                const mismaSuc = String(user.id_sucursal) === String(n.sucursalId);
                const esGerenteSuc = user.rol === 'Gerente' && mismaSuc;
                const cancelada = n.estado_operacion === 'Cancelada';
                const fallar = (msg, status) => { const e = new Error(msg); e.status = status || 403; throw e; };

                if (accion === 'imprimir') {
                    n.impresa = true;
                    return await guardarEstado(pool, idNum, n);
                }

                if (accion === 'cancelar') {
                    if (!esAdmin && !esGerenteSuc) fallar('Solo el Administrador o el Gerente de la sucursal de la nota pueden cancelarla.');
                    if (cancelada) return n; // idempotente
                    n.estado_operacion = 'Cancelada';
                    return await guardarEstado(pool, idNum, n, { canceladaPor: user.id_usuario, canceladaEn: new Date().toISOString() });
                }

                if (cancelada) fallar('La nota está CANCELADA; ya no admite cambios.', 409);

                if (accion === 'aprobar' || accion === 'rechazar') {
                    if (!esAdmin && !esGerenteSuc) fallar('Solo el Administrador o el Gerente de la sucursal pueden autorizar o rechazar solicitudes.');
                    if (n.estado_autorizacion !== 'Pendiente') fallar('Esta nota no está pendiente de autorización.', 409);
                    if (accion === 'aprobar') {
                        n.estado_autorizacion = 'Autorizada';
                        n.firmas = { ...n.firmas, autorizo: user.id_usuario };
                        return await guardarEstado(pool, idNum, n, { aprobadaPor: user.id_usuario, aprobadaEn: new Date().toISOString() });
                    }
                    n.estado_autorizacion = 'Rechazada';
                    return await guardarEstado(pool, idNum, n, {
                        rechazadaPor: user.id_usuario, rechazadaEn: new Date().toISOString(),
                        motivoRechazo: String(motivo || '').slice(0, 500)
                    });
                }

                if (accion === 'firmar') {
                    const requeridas = firmasRequeridas(n.tipo);
                    if (!requeridas.includes(key)) fallar('Esa firma no aplica a este tipo de nota.', 400);
                    if (['Borrador', 'Pendiente', 'Rechazada'].includes(n.estado_autorizacion)) {
                        fallar(`No se puede firmar una nota en estado "${n.estado_autorizacion}".`, 409);
                    }
                    if (n.firmas[key]) fallar('Esa firma ya fue registrada por otro usuario.', 409);

                    let permitido = false;
                    if (key === 'autorizo') permitido = esAdmin || esGerenteSuc;
                    else if (key === 'almacen') permitido = esAdmin || (user.rol === 'Almacen' && (mismaSuc || !n.sucursalId));
                    else if (key === 'contabilidad') permitido = esAdmin || user.rol === 'Contabilidad';
                    else if (key === 'elaboro') {
                        permitido = esAdmin || user.rol === 'Gerente' || user.rol === 'Contabilidad';
                        if (!permitido && user.rol === 'Vendedor') {
                            const v = await pool.request().input('v', sql.VarChar, String(n.vendedorId))
                                .query(`SELECT id_usuario, nombre FROM dbo.Vendedores WHERE id_vendedor=@v`);
                            permitido = String(n.vendedorId) === String(user.id_usuario) ||
                                        (v.recordset.length && (
                                            String(v.recordset[0].id_usuario) === String(user.id_usuario) ||
                                            String(v.recordset[0].nombre || '').trim().toLowerCase() === String(user.nombre || '').trim().toLowerCase()
                                        ));
                        }
                    }
                    if (!permitido) fallar('Tu rol/sucursal no corresponde a esta firma.');

                    n.firmas = { ...n.firmas, [key]: user.id_usuario };
                    if (requeridas.every(k => n.firmas[k])) n.estado_autorizacion = 'Firmada';
                    return await guardarEstado(pool, idNum, n);
                }

                fallar('Acción desconocida: ' + accion, 400);
            });

            res.json({ success: true, nota: resultado.id_nota ? resultado : rowToNota(await cargarNota(await getPool(), idNum)) });
        } catch (error) {
            console.error('[POST /api/notas/:id/accion]', error.message);
            res.status(error.status || 500).json({ error: error.message });
        }
    });

    app.delete('/api/notas/:id', async (req, res) => {
        try {
            const pool = await getPool();
            await pool.request().input('id', sql.Int, soloDigitos(req.params.id))
                .query('DELETE FROM dbo.Notas WHERE id_nota=@id');
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ------------------------------------------------------------------
    // FOLIOS GLOBALES (lotes impresos visibles para todos los equipos)
    // ------------------------------------------------------------------
    app.get('/api/folios/siguiente', async (req, res) => {
        try {
            const pool = await getPool();
            res.json({ siguiente: (await folioBase(pool)) + 1 });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/folios/reservar', async (req, res) => {
        try {
            const cantidad = parseInt(req.body && req.body.cantidad, 10);
            if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > 5000) {
                return res.status(400).json({ error: 'Cantidad inválida.' });
            }
            const out = await withLock(async () => {
                const pool = await getPool();
                const base = await folioBase(pool);
                const inicio = base + 1, fin = base + cantidad;
                await pool.request().input('f', sql.Int, fin)
                    .query('UPDATE dbo.FolioControl SET ultimo_folio=@f WHERE id=1');
                return { inicio, fin };
            });
            console.log(`[Folios] Reservado lote ${out.inicio}-${out.fin}`);
            res.json({ success: true, ok: true, inicio: out.inicio, fin: out.fin, desdeFolio: out.inicio, hastaFolio: out.fin });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ------------------------------------------------------------------
    // ENDPOINT UNIFICADO — el frontend lo consulta cada pocos segundos
    // ------------------------------------------------------------------
    app.get('/api/catalogos/all', async (req, res) => {
        try {
            const pool = await getPool();
            const [cliR, opeR, venR, provR, presR, usuR, sucR, notasR, falR, folR] = await Promise.all([
                pool.request().query(`SELECT id_cliente AS id, nombre, ISNULL(codigo_interno,'') AS codigoInterno, tiene_derecho_descuento AS tieneDerechoDescuento, ISNULL(NULLIF(id_vendedor,''),'PUBLICO') AS vendedorId FROM dbo.Clientes WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
                pool.request().query(`SELECT id_operador AS id, nombre, ISNULL(puesto,'') AS puesto FROM dbo.Operadores WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
                pool.request().query(`SELECT id_vendedor AS id, nombre, ISNULL(id_sucursal,'S01') AS sucursalId, ISNULL(id_usuario,'') AS userId FROM dbo.Vendedores WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
                pool.request().query(`SELECT id_proveedor AS id, nombre, ISNULL(desc1,0) AS desc1, ISNULL(desc2,0) AS desc2, ISNULL(desc3,0) AS desc3, ISNULL(clientes_cajon_json,'[]') AS clientesCajonJson, ISNULL(fecha_inicio,'') AS fechaInicio, ISNULL(fecha_fin,'') AS fechaFin, ISNULL(tipo_promo,'clientes_exclusivos') AS tipoPromo FROM dbo.Proveedores WHERE ISNULL(eliminado,0)=0 ORDER BY nombre`),
                pool.request().query(`SELECT id_presupuesto AS id, ISNULL(vendedor_id,'') AS vendedorId, ISNULL(mes,'') AS mes, ISNULL(limite,0) AS limite, ISNULL(consumido,0) AS consumido, ISNULL(fecha_limite,'') AS fechaLimite, ISNULL(bloquear_exceso,0) AS bloquearExceso FROM dbo.Presupuestos`),
                pool.request().query(`SELECT id_usuario AS id, id_usuario, nombre, email, rol, id_sucursal AS sucursalId, id_sucursal, nip, bloqueado, admin_tipo AS adminTipo, ISNULL(telefono,'') AS telefono, ISNULL(direccion,'') AS direccion FROM dbo.Usuarios ORDER BY nombre`),
                pool.request().query(`SELECT id_sucursal AS id, id_sucursal, nombre, ISNULL(direccion,'') AS direccion, activa_financiera AS activaFinanciera FROM dbo.Sucursales ORDER BY id_sucursal`),
                pool.request().query(SQL_SELECT_NOTAS + ' ORDER BY fecha_emision DESC, id_nota DESC'),
                pool.request().query(`SELECT id, ISNULL(codigo_interno,'') AS codigoInterno, ISNULL(descripcion,'') AS descripcion, ISNULL(motivo,'') AS motivo, ISNULL(id_usuario,'') AS idUsuario, ISNULL(id_sucursal,'S01') AS sucursalId, CONVERT(VARCHAR(23),fecha_registro,126) AS fechaRegistro, ISNULL(datos_json,'{}') AS datosJson FROM dbo.FaltantesPicking WHERE ISNULL(resuelto,0)=0 ORDER BY fecha_registro DESC`),
                pool.request().query(`SELECT ISNULL(MAX(ultimo_folio),0) AS u FROM dbo.FolioControl`)
            ]);

            const proveedores = provR.recordset.map(p => ({
                id: p.id, nombre: p.nombre,
                desc1: parseFloat(p.desc1 || 0), desc2: parseFloat(p.desc2 || 0), desc3: parseFloat(p.desc3 || 0),
                clientesCajon: (() => { try { return JSON.parse(p.clientesCajonJson || '[]'); } catch (e) { return []; } })(),
                fechaInicio: p.fechaInicio, fechaFin: p.fechaFin, tipoPromo: p.tipoPromo
            }));

            const faltantes = falR.recordset.map(r => {
                let extra = {};
                try { extra = JSON.parse(r.datosJson || '{}'); } catch (e) {}
                return { ...extra, id: r.id, codigoInterno: r.codigoInterno || extra.codigoInterno, descripcion: r.descripcion || extra.descripcion,
                         motivo: r.motivo, idUsuario: r.idUsuario, sucursalId: r.sucursalId || extra.sucursalId,
                         fechaRegistro: extra.fechaRegistro || r.fechaRegistro };
            });

            res.json({
                clientes: cliR.recordset,
                operadores: opeR.recordset,
                vendedores: venR.recordset,
                proveedores,
                presupuestos: presR.recordset,
                usuarios: usuR.recordset.map(u => ({ ...u, id: u.id_usuario, bloqueado: !!u.bloqueado })),
                sucursales: sucR.recordset,
                notas: notasR.recordset.map(rowToNota),
                faltantes,
                ultimoFolioReservado: folR.recordset[0].u,
                serverTime: new Date().toISOString()
            });
        } catch (err) {
            console.error('[GET /api/catalogos/all]', err.message);
            res.status(500).json({ error: err.message });
        }
    });
};
