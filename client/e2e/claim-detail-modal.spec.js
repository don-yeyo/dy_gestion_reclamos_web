import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-05, CU-06, CU-08: Gestión de Expediente en Modal de Detalle', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('CU-05: debe requerir supervisor obligatorio antes de permitir aprobar el reclamo', async ({ page }) => {
        await page.goto('/reclamos');

        // Abrir reclamo REC-2026-001 (sin supervisor asignado)
        await page.locator('tr', { hasText: 'REC-2026-001' }).click();

        await expect(page.locator('.modal-overlay')).toBeVisible();
        await expect(page.locator('.modal-header')).toContainText('REC-2026-001');

        // El botón "Aprobar" en la Card 1 debe estar deshabilitado mientras no tenga supervisor
        const btnAprobar = page.getByRole('button', { name: 'Aprobar', exact: true });
        await expect(btnAprobar).toBeVisible();
        await expect(btnAprobar).toBeDisabled();

        // Debe exhibir la advertencia de requerimiento
        await expect(page.locator('text=* Asigná supervisor en paso 3 para aprobar')).toBeVisible();

        // En la Card 3, seleccionar supervisor "Hugo Basile" y pulsar "Asignar"
        const selectSupervisor = page.locator('.wf-select-action-row select');
        await selectSupervisor.selectOption('Hugo Basile');

        const btnAsignar = page.locator('.wf-select-action-row').getByRole('button', { name: 'Asignar', exact: true });
        await btnAsignar.click();

        // Confirmar en el modal de confirmación (botón principal btn-primary)
        await page.locator('button.btn-primary', { hasText: 'Asignar' }).click();

        // El supervisor asignado ahora figura en la card y el botón Aprobar se habilita
        await expect(page.locator('.wf-branch-card', { hasText: '3. Acción de Compensación' })).toContainText('Hugo Basile');
        await expect(btnAprobar).toBeEnabled();
    });

    test('CU-06: debe exigir prioridad obligatoria al aprobar el reclamo y actualizar las cards', async ({ page }) => {
        await page.goto('/reclamos');

        // Abrir reclamo REC-2026-002 (ya cuenta con supervisor Hugo Basile)
        await page.locator('tr', { hasText: 'REC-2026-002' }).click();
        await expect(page.locator('.modal-overlay')).toBeVisible();

        // Click en "Aprobar"
        const btnAprobar = page.getByRole('button', { name: 'Aprobar', exact: true });
        await expect(btnAprobar).toBeEnabled();
        await btnAprobar.click();

        // Debe aparecer el modal interactivo de prioridad obligatoria
        await expect(page.locator('text=Aprobar Reclamo #REC-2026-002')).toBeVisible();

        // El botón de confirmar aprobación debe estar deshabilitado mientras no se elija prioridad
        const btnConfirmar = page.locator('[data-testid="btn-confirmar-aprobacion"]');
        await expect(btnConfirmar).toBeDisabled();

        // El select de prioridad debe estar visible y sin valor predeterminado
        const selectPrioridad = page.locator('[data-testid="select-prioridad"]');
        await expect(selectPrioridad).toBeVisible();
        await expect(selectPrioridad).toHaveValue('');

        // Seleccionar prioridad Alta (código 10)
        await selectPrioridad.selectOption('10');
        await expect(selectPrioridad).toHaveValue('10');
        await expect(btnConfirmar).toBeEnabled();

        // Confirmar aprobación
        await btnConfirmar.click();

        // Verificar mensaje de éxito con la prioridad asignada
        await expect(page.locator('text=Reclamo Aprobado con Prioridad Alta')).toBeVisible();

        // Las cards 2 y 3 pasan a estado Pendiente
        await expect(page.locator('.wf-branch-card', { hasText: '2. Calidad & Inocuidad' })).toContainText('Pendiente');
        await expect(page.locator('.wf-branch-card', { hasText: '3. Acción de Compensación' })).toContainText('Pendiente');

        // La card 1 debe exhibir la prioridad y SLA asignado
        await expect(page.locator('.wf-branch-card', { hasText: '1. Ingreso' })).toContainText('Prioridad: Alta');
    });

    test('CU-08: debe mostrar botones de reenvío de email en las cards 2 y 3 cuando el reclamo está aprobado', async ({ page }) => {
        await page.goto('/reclamos');

        // Abrir reclamo REC-2026-003 (Aprobado)
        await page.locator('tr', { hasText: 'REC-2026-003' }).click();
        await expect(page.locator('.modal-overlay')).toBeVisible();

        // Verificar que existen los botones sutiles de reenvío
        const cardInocuidad = page.locator('.wf-branch-card', { hasText: '2. Calidad & Inocuidad' });
        const btnReenviarInocuidad = cardInocuidad.locator('.wf-card-resend-btn');
        await expect(btnReenviarInocuidad).toBeVisible();

        const cardSupervisor = page.locator('.wf-branch-card', { hasText: '3. Acción de Compensación' });
        const btnReenviarSupervisor = cardSupervisor.locator('.wf-card-resend-btn');
        await expect(btnReenviarSupervisor).toBeVisible();

        // Click en reenvío a Inocuidad y confirmación
        await btnReenviarInocuidad.click();
        await expect(page.locator('text=Reenviar a Calidad & Inocuidad')).toBeVisible();

        const btnConfirmarReenvio = page.locator('.modal-overlay', { hasText: 'Reenviar a Calidad & Inocuidad' }).getByRole('button', { name: 'Reenviar Correo', exact: true });
        await btnConfirmarReenvio.click();

        // Notificación de éxito
        await expect(page.locator('text=Expediente reenviado a Calidad & Inocuidad con éxito.')).toBeVisible();
    });

    test('Actualización reactiva de regalo de cortesía con ítems al cambiar nivel de prioridad', async ({ page }) => {
        await page.goto('/reclamos');

        // Abrir reclamo REC-2026-002 (con supervisor listo para aprobar)
        await page.locator('tr', { hasText: 'REC-2026-002' }).click();
        await expect(page.locator('.modal-overlay')).toBeVisible();

        // Click en "Aprobar"
        const btnAprobar = page.getByRole('button', { name: 'Aprobar', exact: true });
        await expect(btnAprobar).toBeEnabled();
        await btnAprobar.click();

        const selectPrioridad = page.locator('[data-testid="select-prioridad"]');
        await expect(selectPrioridad).toBeVisible();

        // 1. Seleccionar prioridad Alta (10): debe mostrar 3 ítems
        await selectPrioridad.selectOption('10');
        await expect(page.locator('text=Prioridad Alta')).toBeVisible();
        await expect(page.locator('text=SLA: 3 días corridos')).toBeVisible();
        await expect(page.locator('text=Regalo / Ítems de Cortesía (3):')).toBeVisible();
        await expect(page.locator('text=1 reemplazo')).toBeVisible();
        await expect(page.locator('text=2 productos a elección')).toBeVisible();
        await expect(page.locator('text=2 de kg')).toBeVisible();

        // 2. Cambiar a prioridad Media (20): debe actualizarse a 2 ítems y NO mostrar "2 productos a elección"
        await selectPrioridad.selectOption('20');
        await expect(page.locator('text=Prioridad Media')).toBeVisible();
        await expect(page.locator('text=SLA: 7 días corridos')).toBeVisible();
        await expect(page.locator('text=Regalo / Ítems de Cortesía (2):')).toBeVisible();
        await expect(page.locator('text=1 de kg')).toBeVisible();
        await expect(page.locator('text=2 productos a elección')).not.toBeVisible();

        // 3. Cambiar a prioridad Baja (30): debe actualizarse a 1 ítem y NO mostrar "1 de kg"
        await selectPrioridad.selectOption('30');
        await expect(page.locator('text=Prioridad Baja')).toBeVisible();
        await expect(page.locator('text=SLA: 14 días corridos')).toBeVisible();
        await expect(page.locator('text=Regalo / Ítems de Cortesía (1):')).toBeVisible();
        await expect(page.locator('text=1 de kg')).not.toBeVisible();
    });

    test('Adaptabilidad mobile del modal de detalle y modal de aprobación por portal', async ({ page }) => {
        // Establecer viewport móvil (375x667 tipo iPhone SE)
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/reclamos');

        // Abrir reclamo REC-2026-002
        await page.locator('tr', { hasText: 'REC-2026-002' }).click();
        await expect(page.locator('.modal-overlay').first()).toBeVisible();

        // Verificar que el modal de detalle se ajusta al viewport y el contenedor de tabla existe
        const tableContainer = page.locator('.claim-products-table-container');
        await expect(tableContainer).toBeVisible();

        // Click en "Aprobar"
        const btnAprobar = page.getByRole('button', { name: 'Aprobar', exact: true });
        await expect(btnAprobar).toBeVisible();
        await btnAprobar.click();

        // El modal de aprobación se monta directamente en document.body (portal)
        const modalAprobar = page.locator('body > .modal-overlay', { hasText: 'Aprobar Reclamo #REC-2026-002' });
        await expect(modalAprobar).toBeVisible();

        // La cabecera y el pie con los botones deben estar visibles en el viewport
        const headerAprobar = modalAprobar.locator('h3:has-text("Aprobar Reclamo #REC-2026-002")');
        await expect(headerAprobar).toBeVisible();

        const btnConfirmar = modalAprobar.locator('[data-testid="btn-confirmar-aprobacion"]');
        await expect(btnConfirmar).toBeVisible();

        // Seleccionar prioridad Alta
        const selectPrioridad = modalAprobar.locator('[data-testid="select-prioridad"]');
        await selectPrioridad.selectOption('10');

        // El botón Confirmar queda habilitado y completamente accesible sin cortes
        await expect(btnConfirmar).toBeEnabled();
        await btnConfirmar.click();

        // Verificar mensaje de éxito
        await expect(page.locator('text=Reclamo Aprobado con Prioridad Alta')).toBeVisible();
    });

    test('Desaprobación de reclamo mediante submodal interactivo con portal', async ({ page }) => {
        await page.goto('/reclamos');

        // Abrir reclamo REC-2026-001 (Pendiente en recepción)
        await page.locator('tr', { hasText: 'REC-2026-001' }).click();
        await expect(page.locator('.modal-overlay').first()).toBeVisible();

        // En la Card 1 (Ingreso), pulsar botón Desaprobar
        const btnDesaprobar = page.locator('[data-testid="btn-abrir-desaprobar"]');
        await expect(btnDesaprobar).toBeVisible();
        await btnDesaprobar.click();

        // Se despliega el submodal de desaprobación montado en document.body
        const modalDesaprobar = page.locator('body > .modal-overlay', { hasText: 'Desaprobar Reclamo #REC-2026-001' });
        await expect(modalDesaprobar).toBeVisible();

        // El botón Confirmar Desaprobación debe estar deshabilitado mientras falte la observación interna
        const btnConfirmarDesaprobar = modalDesaprobar.locator('[data-testid="btn-confirmar-desaprobacion"]');
        await expect(btnConfirmarDesaprobar).toBeDisabled();

        // Seleccionar tipo de desaprobación
        const selectTipo = modalDesaprobar.locator('[data-testid="select-tipo-desaprobacion"]');
        await expect(selectTipo).toBeVisible();
        await selectTipo.selectOption('Producto con fecha de vencimiento expirada al momento de la compra');

        // Completar la observación interna
        const textareaObs = modalDesaprobar.locator('[data-testid="textarea-motivo-desaprobado"]');
        await expect(textareaObs).toBeVisible();
        await textareaObs.fill('Se constata ticket con fecha posterior a 30 días de vencimiento impreso.');

        // Ahora el botón queda habilitado
        await expect(btnConfirmarDesaprobar).toBeEnabled();
        await btnConfirmarDesaprobar.click();

        // El submodal se cierra y se muestra la notificación de éxito
        await expect(page.getByText('Reclamo desaprobado: Consumidor pasado a "Cerrado')).toBeVisible();

        // La card 1 debe exhibir el estado Desaprobado y los motivos formal e interno
        const cardIngreso = page.locator('.wf-branch-card', { hasText: '1. Ingreso' });
        await expect(cardIngreso).toContainText('Desaprobado');
        await expect(cardIngreso).toContainText('Producto con fecha de vencimiento expirada');
    });
});
