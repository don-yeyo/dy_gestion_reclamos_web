import { mockSupervisores, mockReclamos } from './mockData.js';

export async function setupMockApi(page, customReclamos = null) {
    let reclamos = customReclamos ? [...customReclamos] : JSON.parse(JSON.stringify(mockReclamos));

    // Mock autenticación
    await page.route('**/api/auth/validate', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                token: 'mock-jwt-token-testing',
                user: {
                    email: 'gabrielt@donyeyo.com.ar',
                    name: 'Gabriel Tonelli (Testing)',
                    role: 'admin'
                }
            })
        });
    });

    await page.route('**/api/auth/me', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                user: {
                    email: 'gabrielt@donyeyo.com.ar',
                    name: 'Gabriel Tonelli (Testing)',
                    role: 'admin'
                }
            })
        });
    });

    // Mock supervisores
    await page.route('**/api/supervisores', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                supervisores: mockSupervisores
            })
        });
    });

    // Mock listado de reclamos
    await page.route('**/api/reclamos', async route => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    total: reclamos.length,
                    data: reclamos,
                    reclamos: reclamos
                })
            });
        } else {
            await route.continue();
        }
    });

    // Mock acciones sobre reclamos individuales y sub-rutas anidadas
    await page.route('**/api/reclamos/**', async route => {
        const url = route.request().url();
        const method = route.request().method();

        // Asignar supervisor
        if (url.includes('/supervisor') && method === 'PATCH') {
            const body = route.request().postDataJSON();
            const id = url.split('/api/reclamos/')[1].split('/supervisor')[0];
            const r = reclamos.find(x => x.id === id || x.nro_reclamo === id);
            if (r) {
                r.supervisor = body.supervisor;
                r.supervisor_asignado = body.supervisor;
                r.supervisor_email = body.email;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Supervisor asignado exitosamente' })
            });
            return;
        }

        // Actualizar estado admin (Aprobar / Desaprobar)
        if (url.includes('/estado-admin') && method === 'PATCH') {
            const body = route.request().postDataJSON();
            const id = url.split('/api/reclamos/')[1].split('/estado-admin')[0];
            const r = reclamos.find(x => x.id === id || x.nro_reclamo === id);
            if (r) {
                r.estado_admin = body.estado;
                if (body.estado === 'En curso' || body.estado === 'Aprobado') {
                    r.estado_supervisor = 'Pendiente';
                    r.estado_inocuidad = 'Pendiente';
                    r.estado_consumidor = 'En curso';
                    if (body.prioridad) {
                        r.prioridad = Number(body.prioridad);
                        r.prioridad_nombre = r.prioridad === 10 ? 'Alta' : r.prioridad === 20 ? 'Media' : 'Baja';
                        r.sla_dias = r.prioridad === 10 ? 3 : r.prioridad === 20 ? 7 : 14;
                    }
                }
                if (body.estado === 'Desaprobado') {
                    r.admin_motivo_desaprobado = body.motivo_desaprobado || 'Motivo de prueba';
                }
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Estado administrativo actualizado' })
            });
            return;
        }

        // Actualizar estado supervisor
        if (url.includes('/estado-supervisor') && method === 'PATCH') {
            const body = route.request().postDataJSON();
            const id = url.split('/api/reclamos/')[1].split('/estado-supervisor')[0];
            const r = reclamos.find(x => x.id === id || x.nro_reclamo === id);
            if (r) {
                r.estado_supervisor = body.estado;
                if (body.estado === 'Resuelto') {
                    r.estado_consumidor = 'Resuelto sin confirmar';
                }
                if (body.estado === 'Imposibilidad') {
                    r.estado_consumidor = 'Cerrado';
                    r.estado_inocuidad = 'Sin acciones';
                }
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: `Estado del supervisor actualizado a "${body.estado}".` })
            });
            return;
        }

        // Reenviar email a inocuidad
        if (url.includes('/reenviar-inocuidad') && method === 'POST') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Expediente reenviado a Calidad & Inocuidad con éxito.' })
            });
            return;
        }

        // Reenviar email a supervisor
        if (url.includes('/reenviar-supervisor') && method === 'POST') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Instrucciones reenviadas al supervisor comercial con éxito.' })
            });
            return;
        }

        // GET de reclamo individual
        if (method === 'GET') {
            const id = url.split('/api/reclamos/')[1].split('?')[0];
            const r = reclamos.find(x => x.id === id || x.nro_reclamo === id);
            if (r) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, data: r, reclamo: r })
                });
                return;
            }
        }

        await route.continue();
    });

    // Mock Portal Público de Imposibilidad
    await page.route('**/api/public/actions/verify*', async route => {
        const payloadData = {
            reclamoId: 'REC-2026-003',
            id_reclamo: 'REC-2026-003',
            nro_reclamo: 'REC-2026-003',
            id: 'REC-2026-003',
            consumidor: 'María Clara Sosa',
            cliente: 'María Clara Sosa',
            producto: 'Bollos de Salvado Don Yeyo',
            localidad: 'Tigre',
            direccion: 'Cazón 800',
            supervisor: 'Gustavo Orgaz'
        };
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                payload: payloadData,
                data: payloadData
            })
        });
    });

    await page.route('**/api/public/actions/supervisor-imposibilidad', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                message: 'Imposibilidad de compensación registrada exitosamente.'
            })
        });
    });

    // Mock Reglas de Cortesía
    let mockCortesiaConfig = {
        cortesia_estandar: '1 reemplazo + 1 de kg',
        cortesia_especial: '1 reemplazo + 2 productos a elección + 2 de kg.',
        defectos_estandar: [
            'Defectos del producto',
            'Vida util',
            'Menor cantidad de unidades',
            'Defecto en el envase'
        ],
        sensible_mayusculas: false
    };

    await page.route('**/api/cortesia/config', async route => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: mockCortesiaConfig
                })
            });
        } else if (route.request().method() === 'PUT') {
            const body = route.request().postDataJSON();
            mockCortesiaConfig = { ...mockCortesiaConfig, ...body };
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    message: 'Configuración de producto cortesía actualizada correctamente.',
                    data: mockCortesiaConfig
                })
            });
        } else {
            await route.continue();
        }
    });

    // Mock de prioridades
    let mockPrioridades = [
        {
            codigo: 10,
            nombre: 'Alta',
            descripcion: 'Casos críticos y graves que implican reconocer el error rápidamente',
            sla: 3,
            reglas_cortesia: [{ codigo: 'codigo1', descripcion: ' 1 reemplazo + 2 productos a elección + 2 de kg' }]
        },
        {
            codigo: 20,
            nombre: 'Media',
            descripcion: 'Casos leves que no representan un daño importante para el consumidor',
            sla: 7,
            reglas_cortesia: [{ codigo: 'codigo2', descripcion: ' 1 reemplazo' }]
        },
        {
            codigo: 30,
            nombre: 'Baja',
            descripcion: 'Casos donde es notorio que el problema se debió a cuestiones agenas a la empresa',
            sla: 14,
            reglas_cortesia: [{ codigo: 'codigo3', descripcion: ' 1 reemplazo + 1 de kg' }]
        }
    ];

    await page.route('**/api/prioridades**', async route => {
        const url = route.request().url();
        const method = route.request().method();

        if (url.includes('/reglas') && method === 'PUT') {
            const body = route.request().postDataJSON();
            const codigo = parseInt(url.split('/api/prioridades/')[1].split('/reglas')[0], 10);
            const p = mockPrioridades.find(x => x.codigo === codigo);
            if (p) {
                p.reglas_cortesia = body.reglas_cortesia || body.reglas || p.reglas_cortesia;
                if (body.sla) {
                    p.sla = Number(body.sla);
                }
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Reglas de cortesía y SLA actualizados exitosamente.' })
            });
            return;
        }

        if (method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, prioridades: mockPrioridades })
            });
            return;
        }

        await route.continue();
    });

    await page.route('**/api/cortesia/simular', async route => {
        const body = route.request().postDataJSON();
        const defecto = (body?.defecto || '').trim().toLowerCase();
        const match = mockCortesiaConfig.defectos_estandar.some(d => d.toLowerCase() === defecto);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                defecto: body?.defecto,
                producto_cortesia: match ? mockCortesiaConfig.cortesia_estandar : mockCortesiaConfig.cortesia_especial,
                tipo_regla: match ? 'estandar' : 'especial'
            })
        });
    });

    // Mock de estados de workflow
    const mockEstados = [
        { id: 1, actor: 'admin', codigo: 'Pendiente', nombre: 'Pendiente', descripcion: 'Pendiente de aprobación', color: '#f59e0b', orden: 1 },
        { id: 2, actor: 'admin', codigo: 'En curso', nombre: 'En curso', descripcion: 'Aprobado y en curso', color: '#3b82f6', orden: 2 },
        { id: 3, actor: 'supervisor', codigo: 'Pendiente', nombre: 'Pendiente', descripcion: 'Supervisor notificado', color: '#f59e0b', orden: 1 },
        { id: 4, actor: 'supervisor', codigo: 'Resuelto', nombre: 'Resuelto', descripcion: 'Compensación entregada', color: '#10b981', orden: 2 },
        { id: 5, actor: 'inocuidad', codigo: 'Pendiente', nombre: 'Pendiente', descripcion: 'Peritaje técnico en curso', color: '#f59e0b', orden: 1 },
        { id: 6, actor: 'consumidor', codigo: 'En curso', nombre: 'En curso', descripcion: 'Coordinación con consumidor', color: '#3b82f6', orden: 1 },
        { id: 7, actor: 'consumidor', codigo: 'Resuelto sin confirmar', nombre: 'Resuelto sin confirmar', descripcion: 'Supervisor declaró resolución; pendiente de confirmación', color: '#06b6d4', orden: 4 }
    ];

    await page.route('**/api/estados**', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, estados: mockEstados })
        });
    });

    // Mock de reglas de seguimiento
    let mockSeguimientos = [
        {
            id: 1,
            rol: 'supervisor',
            estado_codigo: 'Pendiente',
            estado_nombre: 'Pendiente',
            estado_descripcion: 'Supervisor notificado',
            estado_color: '#f59e0b',
            prioridad_codigo: 10,
            prioridad_nombre: 'Alta',
            prioridad_color: '#ef4444',
            sla_dias: 3,
            disparo_dias: 1,
            repeticiones: 3,
            intervalo_n_dias: 0.67,
            intervalo_n_horas: 16,
            emails_elevacion: 'gerencia@donyeyo.com.ar',
            activo: true
        },
        {
            id: 2,
            rol: 'inocuidad',
            estado_codigo: 'Pendiente',
            estado_nombre: 'Pendiente',
            estado_descripcion: 'Peritaje técnico en curso',
            estado_color: '#f59e0b',
            prioridad_codigo: 20,
            prioridad_nombre: 'Media',
            prioridad_color: '#f59e0b',
            sla_dias: 7,
            disparo_dias: 2,
            repeticiones: 2,
            intervalo_n_dias: 2.5,
            intervalo_n_horas: 60,
            emails_elevacion: 'calidad@donyeyo.com.ar',
            activo: true
        }
    ];

    await page.route('**/api/seguimientos**', async route => {
        const method = route.request().method();
        const url = route.request().url();

        if (url.includes('/toggle') && method === 'PATCH') {
            const id = parseInt(url.split('/api/seguimientos/')[1].split('/toggle')[0], 10);
            const regla = mockSeguimientos.find(s => s.id === id);
            if (regla) {
                regla.activo = !regla.activo;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, seguimiento: regla })
                });
                return;
            }
        }

        if (method === 'DELETE') {
            const id = parseInt(url.split('/api/seguimientos/')[1].split('?')[0], 10);
            mockSeguimientos = mockSeguimientos.filter(s => s.id !== id);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Regla eliminada' })
            });
            return;
        }

        if (method === 'POST') {
            const body = route.request().postDataJSON();
            const nuevoId = mockSeguimientos.length + 1;
            const nueva = {
                id: nuevoId,
                rol: body.rol,
                estado_codigo: body.estado_codigo,
                estado_nombre: body.estado_codigo,
                prioridad_codigo: Number(body.prioridad_codigo),
                prioridad_nombre: body.prioridad_codigo === 10 ? 'Alta' : body.prioridad_codigo === 20 ? 'Media' : 'Baja',
                prioridad_color: '#ef4444',
                sla_dias: 3,
                disparo_dias: Number(body.disparo_dias),
                repeticiones: Number(body.repeticiones),
                intervalo_n_dias: Number((Math.max(0, 3 - Number(body.disparo_dias)) / Number(body.repeticiones)).toFixed(2)),
                intervalo_n_horas: Math.round(Math.max(0, 3 - Number(body.disparo_dias)) * 24 / Number(body.repeticiones)),
                emails_elevacion: body.emails_elevacion || '',
                activo: Boolean(body.activo)
            };
            mockSeguimientos.push(nueva);
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, seguimiento: nueva })
            });
            return;
        }

        if (method === 'PUT') {
            const id = parseInt(url.split('/api/seguimientos/')[1].split('?')[0], 10);
            const body = route.request().postDataJSON();
            const regla = mockSeguimientos.find(s => s.id === id);
            if (regla) {
                regla.rol = body.rol || regla.rol;
                regla.estado_codigo = body.estado_codigo || regla.estado_codigo;
                regla.estado_nombre = body.estado_codigo || regla.estado_nombre;
                regla.prioridad_codigo = body.prioridad_codigo !== undefined ? Number(body.prioridad_codigo) : regla.prioridad_codigo;
                regla.prioridad_nombre = regla.prioridad_codigo === 10 ? 'Alta' : (regla.prioridad_codigo === 20 ? 'Media' : 'Baja');
                regla.disparo_dias = body.disparo_dias !== undefined ? Number(body.disparo_dias) : regla.disparo_dias;
                regla.repeticiones = body.repeticiones !== undefined ? Number(body.repeticiones) : regla.repeticiones;
                const rem = Math.max(0, (regla.sla_dias || 3) - regla.disparo_dias);
                regla.intervalo_n_dias = Number((rem / regla.repeticiones).toFixed(2));
                regla.intervalo_n_horas = Math.round(rem * 24 / regla.repeticiones);
                regla.emails_elevacion = body.emails_elevacion !== undefined ? body.emails_elevacion : regla.emails_elevacion;
                regla.activo = body.activo !== undefined ? Boolean(body.activo) : regla.activo;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, seguimiento: regla })
            });
            return;
        }

        if (method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, seguimientos: mockSeguimientos })
            });
            return;
        }

        await route.continue();
    });

    // Mock de logs del sistema
    const mockLogs = [
        {
            id: 1,
            categoria_log: 'email',
            reclamo_id: 'REC-2026-002',
            destinatario_tipo: 'supervisor',
            destinatario_email: 'hugob@donyeyo.com.ar',
            tipo_disparo: 'automatico',
            asunto: '[Acción Requerida] Reclamo #REC-2026-002 - Roberto Fernández (Vicente López)',
            motivo: 'Aprobación de reclamo: Asignación e instrucciones de reposición con regla de cortesía al supervisor',
            mensaje_resumen: 'Estimado Hugo Basile: Se ha puesto en curso un reclamo en tu zona de cobertura. Por favor entregar 1 reemplazo.',
            cuerpo_html: '<p>Estimado Hugo Basile: Se ha puesto en curso un reclamo en tu zona de cobertura.</p>',
            actor: 'sistema',
            actor_email: null,
            reintento_nro: 1,
            estado_envio: 'enviado',
            error_mensaje: null,
            created_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
            id: 2,
            categoria_log: 'email',
            reclamo_id: 'REC-2026-003',
            destinatario_tipo: 'inocuidad',
            destinatario_email: 'inocuidad@donyeyo.com.ar',
            tipo_disparo: 'manual',
            asunto: '[Calidad / Inocuidad] Nuevo Reclamo Aprobado #REC-2026-003 - María Clara Sosa',
            motivo: 'Reenvío manual de expediente técnico por administrador (gabrielt@donyeyo.com.ar)',
            mensaje_resumen: 'Estimado equipo de Calidad e Inocuidad: El reclamo #REC-2026-003 ha sido aprobado. Se adjunta copia del expediente técnico.',
            cuerpo_html: '<p>Estimado equipo de Calidad e Inocuidad: El reclamo #REC-2026-003 ha sido aprobado.</p>',
            actor: 'administrador',
            actor_email: 'gabrielt@donyeyo.com.ar',
            reintento_nro: 1,
            estado_envio: 'enviado',
            error_mensaje: null,
            created_at: new Date(Date.now() - 7200000).toISOString()
        },
        {
            id: 3,
            categoria_log: 'configuracion',
            modulo: 'reglas_seguimiento',
            accion: 'creacion',
            descripcion: 'Creación de regla de seguimiento para Rol: "supervisor", Estado: "Pendiente", Prioridad: "Alta"',
            actor: 'admin',
            actor_email: 'gabrielt@donyeyo.com.ar',
            valores_anteriores: null,
            valores_nuevos: { rol: 'supervisor', estado_codigo: 'Pendiente', disparo_dias: 1, repeticiones: 3 },
            created_at: new Date(Date.now() - 10800000).toISOString()
        }
    ];

    await page.route('**/api/logs/stats', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                stats: {
                    total_emails: 2,
                    automaticos: 1,
                    manuales: 1,
                    fallidos: 0,
                    hoy_emails: 2,
                    total_modificaciones: 1,
                    hoy_modificaciones: 1
                }
            })
        });
    });

    await page.route('**/api/logs*', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                logs: mockLogs,
                total: mockLogs.length,
                emailCount: 2,
                configCount: 1,
                page: 1,
                limit: 50,
                totalPages: 1
            })
        });
    });
}
