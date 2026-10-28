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
});
