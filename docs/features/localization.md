# Localización completa de la interfaz

## Estado

**Implementado.**
No requiere una migración nueva: la preferencia usa la columna existente
`profiles.locale`.

La interfaz soporta los tres idiomas disponibles: inglés (`en`), español
(`es`) y francés canadiense (`fr`). La cobertura incluye rutas autenticadas,
formularios, diálogos, estados vacíos, mensajes, atributos accesibles y
contenido que aparece después de cargar la página.

---

## Alcance

- Todas las vistas bajo `src/app` y los componentes compartidos bajo
  `src/components`.
- Textos alternativos dentro de condicionales, como `Show/Hide archived`,
  `Download CSV`, estados de carga y variantes singulares/plurales.
- Fechas y nombres de mes con el locale activo.
- Monedas, porcentajes y separadores numéricos en las vistas financieras
  principales.
- Cambio de idioma en vivo entre `en`, `es` y `fr`.
- Persistencia de la preferencia por usuario y restauración al iniciar sesión
  en otro navegador o dispositivo.
- Traducción de nodos agregados dinámicamente, incluidos formularios y
  diálogos.
- Localización de las categorías predeterminadas creadas por la aplicación,
  sin cambiar su valor almacenado.

Los datos escritos por el usuario —nombres de cuentas, comercios, etiquetas,
descripciones y categorías personalizadas— se muestran exactamente como fueron
guardados. No se modifican ni se traducen automáticamente.

---

## Implementación

- `src/lib/i18n/dictionaries.ts` contiene los textos estructurados que requieren
  interpolación, plurales o formato localizado.
- `src/lib/i18n/legacy-ui-translations.ts` contiene el catálogo completo para
  los textos heredados todavía escritos como literales en componentes.
- `ServerPageHeader`, `PageLoading` y `MetricCard` resuelven el locale en el
  servidor para que títulos, estados de carga y métricas lleguen traducidos
  desde el primer render.
- `LocalizedClientBoundary` aplica el catálogo únicamente dentro de widgets
  cliente ya montados. Esto cubre tablas, filtros, gráficos y diálogos
  dinámicos sin modificar HTML pendiente de hidratación.
- Los formularios y controles interactivos usan el contexto de idioma y el
  helper `translateUi`; no existe un traductor global que modifique todo el
  documento antes de que React lo hidrate.
- Los helpers de formato reciben el locale activo para meses, fechas, monedas y
  porcentajes.
- `setLocaleAction` guarda la selección en `profiles.locale`. La cookie
  `af_locale` es un espejo local para renderizado SSR rápido, no la fuente
  canónica de la preferencia.
- Los flujos de login por contraseña y OAuth vuelven a crear `af_locale` desde
  el perfil. `normalizeLocale` mantiene compatibilidad con valores históricos
  como `en-CA`.

---

## Guardia de cobertura

`npm run i18n:check` analiza el AST de las vistas, componentes, tooltips y
llamadas a `ui(...)`. Falla si una frase visible no tiene traducción en español
y francés o si una traducción permanece sospechosamente igual al texto inglés.
La cobertura actual es de 1.036 frases visibles por cada locale traducido.

Cuando se agregue o cambie texto visible:

```powershell
node scripts/generate-legacy-translations.mjs
npm run i18n:check
```

Las traducciones generadas deben revisarse en contexto antes de cerrar el
cambio.

---

## QA manual

1. Cambiar el idioma desde `/dashboard/settings`.
2. Revisar Transacciones, Metas y fondos, Categorías, Recurrentes, Reportes,
   Tendencias, Flujo de caja y Exportar.
3. Confirmar meses localizados (`julio de 2026` / `juillet 2026`) y formatos
   monetarios del locale.
4. Abrir un formulario o diálogo después de cargar la página.
5. Cambiar `es → fr → en → es` sin recargar manualmente.
6. Confirmar que los datos ingresados por el usuario no cambian.
7. Cerrar sesión, abrir una ventana incógnita, iniciar sesión con la misma
   cuenta y confirmar que se restaura el idioma elegido.

El cierre de esta implementación recorrió de forma autenticada 23 rutas del
dashboard en `en`, `es` y `fr`; no se detectaron textos residuales del locale
anterior ni errores de consola. También se verificó el diálogo de nueva
transacción, incluidas categorías del sistema y todas las frecuencias de
recurrencia.
