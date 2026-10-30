import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-11: Reglas de Seguimientos de Workflow (Grilla, Disparos, Repeticiones e Intervalo N)', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe acceder a la sección Reglas de Seguimientos y renderizar la grilla con sus columnas y métricas', async ({ page }) => {
        await page.goto('/seguimientos');

        // Verificar encabezado principal
        await expect(page.locator('h1')).toContainText('Reglas de Seguimientos');
        await expect(page.locator('.claims-page-title-group p')).toContainText('Configuración de disparos automáticos');

        // Verificar chips de roles
        await expect(page.locator('.claims-summary-chips')).toContainText('Todos los Roles');
        await expect(page.locator('.claims-summary-chips')).toContainText('Supervisor');
        await expect(page.locator('.claims-summary-chips')).toContainText('Inocuidad');

        // Verificar columnas de la grilla
        const thead = page.locator('.data-table thead');
        await expect(thead).toContainText('Rol');
        await expect(thead).toContainText('Estado Condición');
        await expect(thead).toContainText('Prioridad');
        await expect(thead).toContainText('Disparo Inicial');
        await expect(thead).toContainText('Repeticiones');
        await expect(thead).toContainText('Intervalo N');
        await expect(thead).toContainText('Emails de Elevación');
        await expect(thead).toContainText('Activa');
        await expect(thead).toContainText('Acciones');

        // Verificar cálculo de N en fila existente
        // Para Supervisor / Alta (SLA 3d, Disparo 1d, 3 repeticiones): N = (3 - 1)/3 = 0.67 días (16 hs)
        await expect(page.locator('.data-table tbody')).toContainText('N = 0.67 días');
        await expect(page.locator('.data-table tbody')).toContainText('gerencia@donyeyo.com.ar');
    });

    test('debe abrir el modal de creación, simular el cálculo de N en vivo y guardar una nueva regla', async ({ page }) => {
        await page.goto('/seguimientos');

        // Clic en "Nueva Regla"
        const btnNuevaRegla = page.getByRole('button', { name: 'Nueva Regla' });
        await expect(btnNuevaRegla).toBeVisible();
        await btnNuevaRegla.click();

        // Verificar modal visible
        await expect(page.locator('.modal-content')).toBeVisible();
        await expect(page.locator('.modal-header')).toContainText('Nueva Regla de Seguimiento');

        // Seleccionar rol Inocuidad
        await page.locator('.modal-body').getByText('Inocuidad', { exact: true }).click();

        // Configurar Disparo = 1 día y Repeticiones = 4:
        // Fórmula: (SLA 3d - Disparo 1d) / 4 repeticiones = 0.5 días (12 hs)
        const inputDisparo = page.locator('input[type="number"]').nth(0);
        await inputDisparo.fill('1');
        const inputRepeticiones = page.locator('input[type="number"]').nth(1);
        await inputRepeticiones.fill('4');

        // Verificar cálculo reactivo de N en vivo en el simulador
        await expect(page.locator('.modal-body')).toContainText('N = 0.5 días (12 hs)');

        // Ingresar emails de elevación
        const textareaEmails = page.locator('textarea');
        await textareaEmails.fill('escalamiento@donyeyo.com.ar, direccion@donyeyo.com.ar');

        // Guardar
        const btnGuardar = page.locator('[data-testid="btn-guardar-regla"]');
        await btnGuardar.click();

        // Modal debe cerrarse y mostrar notificación
        await expect(page.locator('.modal-content')).not.toBeVisible();
        await expect(page.locator('text=Nueva regla de seguimiento creada exitosamente.')).toBeVisible();
    });

    test('debe permitir alternar el switch de activa/inactiva directamente desde la grilla', async ({ page }) => {
        await page.goto('/seguimientos');

        // Fila 1 tiene switch activo
        const switchBtn = page.locator('.data-table tbody tr').first().locator('td:nth-child(8) button');
        await expect(switchBtn).toBeVisible();

        await switchBtn.click();
        await expect(page.locator('text=desactivada')).toBeVisible();
    });

    test('debe bloquear y advertir si se intenta crear una regla duplicada para el mismo rol, estado y prioridad', async ({ page }) => {
        await page.goto('/seguimientos');

        // Clic en "Nueva Regla" (por defecto abre con Supervisor, Pendiente, Alta 10)
        // La regla 1 ya existente en el mock es Supervisor, Pendiente, Alta 10
        await page.getByRole('button', { name: 'Nueva Regla' }).click();
        await expect(page.locator('.modal-content')).toBeVisible();

        // Clic en Guardar directamente
        await page.locator('[data-testid="btn-guardar-regla"]').click();

        // El modal no se cierra y exhibe el error de duplicado
        await expect(page.locator('.modal-body')).toContainText('No se permiten reglas duplicadas');
        await expect(page.locator('.modal-content')).toBeVisible();
    });

    test('debe permitir editar el estado y la prioridad de una regla existente', async ({ page }) => {
        await page.goto('/seguimientos');

        // Clic en el botón editar de la primera regla (Supervisor, Pendiente, Alta 10)
        const btnEditar = page.locator('.data-table tbody tr').first().locator('button[title*="Editar"]');
        await expect(btnEditar).toBeVisible();
        await btnEditar.click();

        await expect(page.locator('.modal-content')).toBeVisible();
        await expect(page.locator('.modal-header')).toContainText('Editar Regla de Seguimiento');

        // Cambiar estado a "Resuelto" (para supervisor)
        const selectEstado = page.locator('.modal-body select').first();
        await expect(selectEstado).toBeEnabled();
        await selectEstado.selectOption('Resuelto');

        // Cambiar prioridad a "Media" (código 20)
        const selectPrioridad = page.locator('.modal-body select').nth(1);
        await expect(selectPrioridad).toBeEnabled();
        await selectPrioridad.selectOption('20');

        // Guardar cambios
        await page.locator('[data-testid="btn-guardar-regla"]').click();

        await expect(page.locator('.modal-content')).not.toBeVisible();
        await expect(page.locator('text=Regla de seguimiento actualizada correctamente.')).toBeVisible();
    });
});
