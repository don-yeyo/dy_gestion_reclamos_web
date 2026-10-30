import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('Reglas de Cortesía por Nivel de Prioridad', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('El administrador puede abrir el modal de Reglas de Cortesía, ver las prioridades y editar las reglas de cortesía', async ({ page }) => {
        await page.goto('/');

        // Abrir Drawer de navegación
        const menuButton = page.locator('button[aria-label="Abrir menú"]');
        if (await menuButton.isVisible()) {
            await menuButton.click();
        } else {
            await page.locator('header button').first().click();
        }

        // Clic en "Reglas de Cortesía"
        const btnReglas = page.locator('button:has-text("Reglas de Cortesía")');
        await expect(btnReglas).toBeVisible();
        await btnReglas.click();

        // Verificar que el modal de Reglas de Cortesía se abre
        await expect(page.locator('h3:has-text("Reglas de Cortesía por Nivel de Prioridad")')).toBeVisible();

        // Verificar que se listan las 3 prioridades canónicas
        await expect(page.locator('text=Alta (Código 10)')).toBeVisible();
        await expect(page.locator('text=Media (Código 20)')).toBeVisible();
        await expect(page.locator('text=Baja (Código 30)')).toBeVisible();

        // Verificar que los inputs de SLA son editables
        const inputSlaAlta = page.locator('[data-testid="input-sla-10"]');
        await expect(inputSlaAlta).toBeVisible();
        await expect(inputSlaAlta).toHaveValue('3');

        // Modificar SLA de Alta de 3 a 5 días
        await inputSlaAlta.fill('5');
        await expect(inputSlaAlta).toHaveValue('5');

        // Verificar inputs de reglas de cortesía existentes
        const inputsReglas = page.locator('input[placeholder*="Texto descriptivo de cortesía"]');
        await expect(inputsReglas.first()).toBeVisible();

        // Agregar una nueva regla a la prioridad Alta
        const btnAgregarRegla = page.locator('button:has-text("Agregar regla")').first();
        await btnAgregarRegla.click();

        // Llenar la nueva regla agregada en la tarjeta de Alta (índice 3 tras las 3 existentes)
        const nuevoInputRegla = page.locator('input[placeholder*="Texto descriptivo de cortesía"]').nth(3);
        await nuevoInputRegla.fill('2 reemplazos especiales');

        // Guardar cambios
        const btnGuardar = page.locator('button:has-text("Guardar Cambios")');
        await expect(btnGuardar).toBeVisible();
        await btnGuardar.click();

        // Verificar mensaje de éxito
        await expect(page.locator('text=¡Reglas de cortesía y SLA actualizados correctamente')).toBeVisible();

        // Cerrar modal
        await page.locator('button:has-text("Cancelar")').click();
        await expect(page.locator('h3:has-text("Reglas de Cortesía por Nivel de Prioridad")')).not.toBeVisible();
    });
});
