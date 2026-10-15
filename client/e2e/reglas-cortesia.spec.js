import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('Reglas de Compensación & Cortesía (Fórmula Google Sheet)', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('El administrador puede abrir el modal de Reglas de Cortesía desde el Drawer, ver la fórmula explicada y simular', async ({ page }) => {
        await page.goto('/');

        // Abrir Drawer de navegación
        const menuButton = page.locator('button[aria-label="Abrir menú"]');
        if (await menuButton.isVisible()) {
            await menuButton.click();
        } else {
            // Si el header tiene otro selector
            await page.locator('header button').first().click();
        }

        // Clic en "Reglas de Cortesía"
        const btnReglas = page.locator('button:has-text("Reglas de Cortesía")');
        await expect(btnReglas).toBeVisible();
        await btnReglas.click();

        // Verificar que el modal de Reglas de Cortesía se abre
        await expect(page.locator('h3:has-text("Reglas de Compensación & Cortesía")')).toBeVisible();

        // Verificar que se ve la fórmula de Google Sheets
        await expect(page.locator('text=BUSCARV(P;$AJ$15:$AJ$19;1;0)')).toBeVisible();

        // Verificar inputs de compensación estándar y especial
        const inputEstandar = page.locator('input[value="1 reemplazo + 1 de kg"]');
        await expect(inputEstandar).toBeVisible();

        // Probar el simulador con un defecto estándar
        const inputSimulador = page.locator('input[placeholder*="Probar cualquier defecto"]');
        await inputSimulador.fill('Vida util');

        // Debe indicar COMPENSACIÓN ESTÁNDAR
        await expect(page.getByText('🟢 COMPENSACIÓN ESTÁNDAR')).toBeVisible();
        await expect(page.locator('text=1 reemplazo + 1 de kg').first()).toBeVisible();

        // Probar el simulador con un defecto grave / especial
        await inputSimulador.fill('Presencia de cuerpo extraño');

        // Debe indicar COMPENSACIÓN ESPECIAL / CRÍTICA
        await expect(page.getByText('🔴 COMPENSACIÓN ESPECIAL / CRÍTICA')).toBeVisible();
        await expect(page.locator('text=1 reemplazo + 2 productos a elección + 2 de kg.').first()).toBeVisible();

        // Cerrar modal
        await page.locator('button:has-text("Cancelar")').click();
        await expect(page.locator('h3:has-text("Reglas de Compensación & Cortesía")')).not.toBeVisible();
    });
});
