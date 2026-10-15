export const mockSupervisores = [
    { id: 'sup-1', nombre: 'Hugo Basile', email: 'hugob@donyeyo.com.ar', zona: 'Zona Norte' },
    { id: 'sup-2', nombre: 'Gustavo Orgaz', email: 'gustavoeo@donyeyo.com.ar', zona: 'Zona Oeste' },
    { id: 'sup-3', nombre: 'Edgar Barberis', email: 'edgarb@donyeyo.com.ar', zona: 'Zona Sur' }
];

export const mockReclamos = [
    {
        id: 'REC-2026-001',
        nro_reclamo: 'REC-2026-001',
        fecha: '2026-10-10',
        cliente: 'Ana Laura Gómez',
        nombre_consumidor: 'Ana Laura Gómez',
        nombre: 'Ana Laura',
        apellido: 'Gómez',
        telefono: '11-5555-1234',
        email: 'ana.gomez@test.com',
        localidad: 'San Martín',
        provincia: 'Buenos Aires',
        direccion: 'Calle Falsa 123',
        supervisor: '',
        supervisor_asignado: '',
        estado_admin: 'Pendiente',
        estado_supervisor: 'Sin acciones',
        estado_inocuidad: 'Sin acciones',
        estado_consumidor: 'Pendiente',
        items: [
            {
                producto: 'Pan de Mesa Don Yeyo 500g',
                lote: 'L-2410-A',
                vencimiento: '2026-11-15',
                defecto: 'Presencia de moho',
                descripcion: 'Paquete con presencia de moho antes de la fecha de caducidad.'
            }
        ]
    },
    {
        id: 'REC-2026-002',
        nro_reclamo: 'REC-2026-002',
        fecha: '2026-10-11',
        cliente: 'Roberto Fernández',
        nombre_consumidor: 'Roberto Fernández',
        nombre: 'Roberto',
        apellido: 'Fernández',
        telefono: '11-4444-5678',
        email: 'roberto.f@test.com',
        localidad: 'Vicente López',
        provincia: 'Buenos Aires',
        direccion: 'Av. Libertador 4500',
        supervisor: 'Hugo Basile',
        supervisor_asignado: 'Hugo Basile',
        supervisor_email: 'hugob@donyeyo.com.ar',
        estado_admin: 'Pendiente',
        estado_supervisor: 'Sin acciones',
        estado_inocuidad: 'Sin acciones',
        estado_consumidor: 'Pendiente',
        items: [
            {
                producto: 'Galletitas Dulces Don Yeyo',
                lote: 'L-2410-B',
                vencimiento: '2026-12-01',
                defecto: 'Sabor rancio',
                descripcion: 'Sabor rancio al abrir el paquete sellado.'
            }
        ]
    },
    {
        id: 'REC-2026-003',
        nro_reclamo: 'REC-2026-003',
        fecha: '2026-10-12',
        cliente: 'María Clara Sosa',
        nombre_consumidor: 'María Clara Sosa',
        nombre: 'María Clara',
        apellido: 'Sosa',
        telefono: '11-3333-9012',
        email: 'maria.sosa@test.com',
        localidad: 'Tigre',
        provincia: 'Buenos Aires',
        direccion: 'Cazón 800',
        supervisor: 'Gustavo Orgaz',
        supervisor_asignado: 'Gustavo Orgaz',
        supervisor_email: 'gustavoeo@donyeyo.com.ar',
        estado_admin: 'Aprobado',
        estado_supervisor: 'Pendiente',
        estado_inocuidad: 'Pendiente',
        estado_consumidor: 'En curso',
        items: [
            {
                producto: 'Bollos de Salvado Don Yeyo',
                lote: 'L-2410-C',
                vencimiento: '2026-10-28',
                defecto: 'Textura irregular',
                descripcion: 'Textura seca e irregular.'
            }
        ]
    },
    {
        id: 'REC-2026-004',
        nro_reclamo: 'REC-2026-004',
        fecha: '2026-10-05',
        cliente: 'Lucas Benítez',
        nombre_consumidor: 'Lucas Benítez',
        nombre: 'Lucas',
        apellido: 'Benítez',
        telefono: '11-2222-3456',
        email: 'lucas.b@test.com',
        localidad: 'Quilmes',
        provincia: 'Buenos Aires',
        direccion: 'Mitre 200',
        supervisor: 'Edgar Barberis',
        supervisor_asignado: 'Edgar Barberis',
        supervisor_email: 'edgarb@donyeyo.com.ar',
        estado_admin: 'Finalizado',
        estado_supervisor: 'Resuelto',
        estado_inocuidad: 'Conforme',
        estado_consumidor: 'FSR',
        items: [
            {
                producto: 'Pionono Especial Don Yeyo',
                lote: 'L-2409-Z',
                vencimiento: '2026-10-20',
                defecto: 'Falta de relleno',
                descripcion: 'Falta de relleno homogéneo.'
            }
        ]
    }
];
