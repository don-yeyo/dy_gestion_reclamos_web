import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-10: Encuesta Interactiva de Seguimiento al Consumidor (/encuesta-consumidor)', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe mostrar error si se accede sin token', async ({ page }) => {
        await page.goto('/encuesta-consumidor');
        await expect(page.locator('text=No se proporcionó un enlace de seguimiento válido.')).toBeVisible();
    });

    test('al abrir con botón Resuelto solicita puntuación con emojis y comentario opcional', async ({ page }) => {
        await page.goto('/encuesta-consumidor?token=token_consumidor_resuelto_123');

        await expect(page.locator('text=Seguimiento de tu Reclamo #REC-2026-003')).toBeVisible();
        await expect(page.getByTestId('seccion-resuelto')).toBeVisible();

        // Verificar placeholder del comentario
        const textarea = page.getByPlaceholder('Escribe aquí cualquier comentario adicional que quieras hacernos llegar.');
        await expect(textarea).toBeVisible();

        // Seleccionar emoji "Satisfecho" (valor 4)
        await page.getByTestId('star-btn-4').click();
        await expect(page.locator('text=Satisfecho')).toBeVisible();

        // Ingresar comentario adicional
        await textarea.fill('Muy buena atención del supervisor comercial.');

        // Enviar calificación
        await page.getByTestId('encuesta-submit-btn').click();

        await expect(page.getByTestId('encuesta-success')).toBeVisible();
        await expect(page.locator('text=¡Muchas gracias por tu respuesta!')).toBeVisible();
    });

    test('al abrir con botón No Resuelto solicita tipo de problema y comentarios', async ({ page }) => {
        await page.goto('/encuesta-consumidor?token=token_consumidor_no_resuelto_123');

        await expect(page.locator('text=Seguimiento de tu Reclamo #REC-2026-003')).toBeVisible();
        await expect(page.getByTestId('seccion-no-resuelto')).toBeVisible();

        // Seleccionar "No estoy satisfecho con lo recibido"
        await page.getByTestId('problema-opt-No estoy satisfecho con lo recibido').click();

        // Ingresar comentario
        const textarea = page.getByPlaceholder('Escribe aquí cualquier comentario adicional que quieras hacernos llegar.');
        await textarea.fill('Los productos entregados estaban próximos a vencer.');

        // Enviar reporte
        await page.getByTestId('encuesta-submit-btn').click();

        await expect(page.getByTestId('encuesta-success')).toBeVisible();
        await expect(page.locator('text=¡Muchas gracias por tu respuesta!')).toBeVisible();
    });

    test('debe mostrar pantalla informativa de acción previa si el consumidor ya respondió', async ({ page }) => {
        await page.goto('/encuesta-consumidor?token=token_consumidor_duplicado_123');

        await expect(page.getByTestId('encuesta-ya-registrada')).toBeVisible();
        await expect(page.locator('text=Tu respuesta ya fue recibida')).toBeVisible();
        await expect(page.locator('text=Resuelto conforme')).toBeVisible();
        await expect(page.locator('text=Atención excelente')).toBeVisible();
        // El formulario de envío no debe estar disponible
        await expect(page.getByTestId('encuesta-submit-btn')).not.toBeVisible();
    });
});
