# Sprint — Ingreso de transacciones Premium

> **Estado: propuesta lista para ejecución; medición controlada pendiente.**
> Las grabaciones se revisaron localmente mediante muestreo visual cada 4 s.
> Los archivos
> de origen están en `C:\Users\Andres\Documents\Recordings`:
> `Screen_Recording_20261014_174309_AndroMoney.mp4` y
> `Screen_Recording_20261014_203114_Brave.mp4`.

## Objetivo

Hacer que registrar un gasto o ingreso frecuente en Rumbo se sienta inmediato,
claro y confiable en teléfono y escritorio. Reducir el tiempo y las
interacciones repetidas en el recorrido observado, conservar visibles las
decisiones financieras importantes y mantener una apariencia cuidada, sobria y
coherente con la identidad de Rumbo.

El trabajo abarca **UI, UX, rendimiento percibido y rendimiento medido**. No
añadirá complejidad financiera al ledger para resolver un problema de
interacción.

## Evidencia y lectura del estado actual

### Grabaciones disponibles

| Archivo | Entorno observado | Duración | Revisión |
|---|---|---:|---|
| `Screen_Recording_20261014_174309_AndroMoney.mp4` | AndroMoney en Android | 3:18 | Revisado; fotogramas cada 4 s |
| `Screen_Recording_20261014_203114_Brave.mp4` | Rumbo PWA en Brave sobre Android | 6:46 | Revisado; fotogramas cada 4 s |

La revisión identifica campos y pantallas, pero no un cronometraje exacto por
movimiento: ambos videos alternan entre Rumbo y AndroMoney para consultar el
registro de origen. La duración completa sí es comparable como **tiempo de
sesión grabada**: AndroMoney dura cerca de la mitad (198 s frente a 406 s),
con un conjunto parecido de gastos históricos. Eso señala una diferencia que
merece investigación, pero no permite atribuir una relación de velocidad 2× a
cada app: el clip de Rumbo también contiene alternancia entre apps, captura de
metadatos adicionales y espera de carga.

### Hallazgos observados en pantalla

Los timestamps aproximan el fotograma más cercano del muestreo (±2 s); los
eventos rápidos entre capturas pueden no aparecer.

| Pantalla / paso | AndroMoney | Rumbo | Oportunidad en Rumbo |
|---|---|---|---|
| Abrir alta | Desde la cuenta/lista, el alta aparece alrededor de 0:08. | Desde Dashboard, el FAB abre una vista «Loading form…» visible cerca de 0:04; el campo de monto está disponible alrededor de 0:12. Vuelve a verse la pantalla de carga durante otra secuencia. | Es el primer cuello visible. Medir la latencia y presentar el próximo borrador con los datos del mismo hogar que ya están en memoria. |
| Monto | Monto y botón de calculadora en el encabezado; la calculadora integrada ocupa gran parte de la pantalla mientras se escribe. | Campo grande, teclado numérico del sistema y calculadora opcional dentro del formulario. | La jerarquía del monto en Rumbo ya es sólida. Conservarla y evitar bloquear su uso cuando las listas de referencia están en caché. |
| Categoría | Selector de dos columnas con categorías y subcategorías. | Hoja de pantalla completa con búsqueda, chips frecuentes y navegación padre→hija. La primera selección visita Entertainment y busca Salidas (~0:24–0:48); en otra se navega Transporte→Subway. | Hacer más visible la selección reciente/frecuente existente y permitir llegar a una subcategoría frecuente sin recorrer el árbol. Mantener búsqueda y jerarquía para el resto. |
| Fecha | Calendario para una fecha pasada; también muestra hora. | Chips Today/Yesterday/2 days ago más calendario. Para una fecha seis días anterior se abre el calendario (~0:20) y se escoge Oct 8 (~0:52). | Los chips resuelven fechas recientes. Hacer más rápido volver a una fecha de la misma semana y mantener calendario para fechas arbitrarias; no añadir otra fila persistente sin comprobar espacio. |
| Contexto repetido | Cuenta y payee se repiten en altas siguientes; Project cambia. | El aviso «Filled in from your last entry here» indica que cuenta, payee y tags se proponen desde la última entrada de la categoría, con Undo. | Conservar BR-046: es claro, editable y aporta valor confirmado por esta sesión. No añadir un algoritmo de sugerencia distinto. |
| Descripción y detalles | Project, Payee y Note se muestran en una lista de detalles; Add Next y Save tienen rótulo. | Description y Notes están separados; Description ofrece chips anteriores y permite escribir un valor nuevo. Tags abre otra hoja de selección múltiple con una lista larga; se observa búsqueda y scroll. | Mantener el texto libre y las sugerencias por toque. Mejorar acceso a tags recientes y revisar si los detalles de baja frecuencia pueden plegarse sin ocultar preferencias del usuario. |
| Guardar / siguiente | «ADD NEXT» y «SAVE» aparecen como acciones separadas con texto. | «Create transaction» es la acción principal y la acompaña un botón `+` pequeño; al enviar aparece «Creating transaction / Saving…». La pantalla «Loading form…» reaparece durante la secuencia. | Hacer visible y accesible el rótulo «Add next» en móvil y reabrir el siguiente borrador desde los datos de referencia ya cargados. |
| Confirmación final | La lista de cuenta refleja movimientos guardados. | Transactions muestra los movimientos recientes y se alcanzan a ver varias notificaciones «Transaction created.» apiladas. | Reproducirlo en QA; cada escritura debe producir una sola notificación. El video no demuestra si hubo dos envíos o un toast duplicado. |

### Comparación de velocidad y facilidad

- **Velocidad bruta de las sesiones:** AndroMoney 3:18; Rumbo 6:46, cerca de
  2,05× la duración total. Ambas sesiones capturan grupos similares de gastos
  históricos y alternan con la aplicación fuente.
- **Velocidad de la interacción dentro de cada app:** no está aislada. Rumbo
  tiene una espera inicial visible, pero también incluye selección de fecha,
  categoría, descripción y varios tags. Ambos videos contienen cambios de
  aplicación; no se debe contar todo ese tiempo como latencia propia de Rumbo.
- **Facilidad para una captura sencilla:** AndroMoney presenta monto, categoría
  y «Add Next» directamente. Rumbo presenta un monto claro, buen buscador de
  categorías y sugerencias repetidas explicadas/deshacibles; el botón `+` de
  Add Next es menos explícito que el texto de AndroMoney.
- **Captura detallada:** ambas requieren completar campos. Rumbo muestra
  repetición, descripción, notas, estado y tags; el clip evidencia fricción al
  desplazarse por tags y seleccionar una fecha fuera de los tres días rápidos.
  AndroMoney utiliza Project y Note, por lo que su cantidad de campos no es
  semánticamente equivalente.
- **Lectura del sprint:** AndroMoney parece más directo para crear una fila y
  pasar a otra. Rumbo conserva mejor el contexto y tiene buenas salvaguardas de
  sugerencia, pero debe eliminar la espera visible y explicar mejor la acción
  de alta consecutiva.

Para afirmar una mejora cuantitativa, repetir la misma lista de movimientos en
ambas apps en una sesión controlada, sin alternar entre ellas durante el
cronómetro. Medir una entrada sencilla y otra con categoría hija, fecha
histórica y tags; reportar tiempo activo, toques, correcciones y p50/p75. Los
videos actuales sirven como evidencia natural de fricciones, no como benchmark
limpio de latencia.

### Capacidades de Rumbo que ya existen

- El FAB global abre un diálogo de alta; sus datos se cargan a demanda.
- En móvil, `TransactionForm` usa una lista compacta de filas que se expanden;
  el monto usa un control principal y la fila de acciones se oculta mientras
  está abierto el teclado.
- La preferencia `quickEntry` ya permite ordenar Cuenta/Categoría,
  autoavanzar entre campos y activar/desactivar el recuerdo por categoría.
- Cuando se activa, el último alta de una categoría puede sugerir cuenta,
  comercio y etiquetas. La sugerencia queda editable y anuncia qué completó,
  con acción para deshacer; nunca recuerda ni copia el monto.
- `Save & Add Next` ya existe para ingresos/gastos y mantiene fecha, tipo,
  cuenta, estado, categoría, comercio y etiquetas compatibles.
- Los datos del formulario rápido se consultan en paralelo; la memoria por
  categoría solo se consulta si el usuario la activó. El diálogo mantiene una
  caché del hogar actual y la refresca en segundo plano al volver a abrirse.

Estos puntos son una base a medir y pulir. El sprint no recreará controles o
preferencias que ya estén disponibles.

## Alcance del sprint

### Incluye

- Medición controlada posterior: los clips originales se anotaron, pero
  intercalan dos aplicaciones y no permiten asignar el tiempo total a una sola.
- Diagnóstico de diferencias en el camino desde abrir «Agregar» hasta guardar,
  incluida la captura de transacciones consecutivas.
- Mejoras priorizadas y pequeñas al formulario, los selectores, la respuesta
  al guardar y el acceso rápido, guiadas por fricciones demostradas.
- Instrumentación local de la experiencia del diálogo y de la acción de
  guardado, sin registrar importes, descripciones, nombres de cuentas,
  comercios, etiquetas ni otros datos financieros personales.
- Pruebas unitarias de cualquier lógica pura que cambie y QA visual/interactivo
  en teléfono y escritorio.

### No incluye

- Cambios en esquema, migraciones, RPCs, RLS, moneda, signos o reglas del
  ledger, salvo que la evidencia revele un defecto financiero reproducible; en
  ese caso se abre un alcance de corrección aparte.
- Captura por voz, OCR, cámara, NFC, pagos, sincronización bancaria o IA.
- Rediseño de Transactions, dashboards o navegación ajeno al recorrido de
  captura.
- Nuevas preferencias que dupliquen la configuración de campos o `quickEntry`.
- Precargar silenciosamente importes o categorías. La velocidad no debe crear
  transacciones incorrectas.

## Medición antes de diseñar

Crear una tabla por alta observada en cada video, con estas columnas:

| Campo | Definición |
|---|---|
| Transacción / clase | Gasto o ingreso; simple/repetida, cuenta conocida/nueva, moneda base/otra |
| Inicio | Primer gesto dirigido a crear la transacción (abrir FAB o tocar Add) |
| Fin | Confirmación visual del guardado correcto o pantalla limpia de la siguiente alta |
| Tiempo activo | Tiempo total menos pausas externas claras de más de 2 s; anotar pausas excluidas |
| Toques | Toques/clics dirigidos a completar o confirmar; separar navegación que no sea necesaria |
| Teclas | Campos escritos, navegación por teclado y correcciones |
| Cambios de contexto | Pantallas, hojas, diálogos o pickers que se abren y cierran |
| Errores/retrabajo | Valor borrado, selector reabierto, validación, espera, alta incorrecta o cancelada |
| Estado inicial | Qué valores estaban ya seleccionados y si la sesión estaba caliente |

Entregar dos vistas: **un movimiento simple emparejado** y **una secuencia de
varios movimientos**. Reportar mediana y rango; no mezclar navegación, edición,
alta de cuenta/categoría ni pausas. Si los ejemplos no son equivalentes,
explicar la diferencia en vez de forzar una comparación.

El análisis debe responder, con timestamp del video:

1. ¿En qué momento aparece el primer campo editable en cada app?
2. ¿Qué campos hay que escribir siempre y cuáles se seleccionan de una lista?
3. ¿Qué selecciones se repiten entre altas y cuáles se limpian?
4. ¿Cuándo aparece una espera perceptible y cuánto dura aproximadamente?
5. ¿Qué elemento obliga a salir del flujo o desplaza/tapa el control siguiente?
6. ¿Qué decisiones se comprenden de inmediato y cuáles requieren inspeccionar
   o corregir la vista?
7. ¿Qué dos o tres cambios explican la mayor parte del tiempo o de los toques?

No se debe copiar una interacción de AndroMoney automáticamente: hay que
conservar las protecciones de Rumbo y sus requisitos de accesibilidad.

## Backlog propuesto

### T0 — Matriz de evidencia y mapa del flujo

**Prioridad:** P0 · **Tipo:** investigación de producto / medición · **BD:** no

1. Usar la tabla de hallazgos de este documento como inventario de las pantallas
   ya observadas; añadir timestamps finos solo donde un cambio los necesite
   para reproducirse.
2. Dibujar los pasos actuales de Rumbo: FAB → carga/diálogo → tipo → monto →
   cuenta/categoría → fecha/comercio/detalles → guardar → confirmación o
   siguiente alta.
3. Marcar cada demora según la capa: apertura/render, interacción, consulta de
   datos, acción de servidor, navegación/rehidratación o pausa humana.
4. Separar los problemas observados en clip de las hipótesis que requieren una
   ejecución controlada; descartar las que no tengan evidencia.

**Aceptación:** el cierre distingue sesión grabada, espera visible y tiempo
activo. Las fricciones tienen timestamp aproximado, síntoma, paso y confianza;
la comparación de velocidad queda marcada como no controlada hasta repetir la
misma lista en cada app.

### T1 — Entrada enfocada y jerarquía visual

**Prioridad:** P1 · **Tipo:** UI/UX · **Foco:**
`src/app/dashboard/transactions/transaction-form.tsx`,
`src/components/transaction-dialog-provider.tsx`

Una vez visto el video, corregir solo los puntos que entorpezcan la captura:

- Mantener el monto como acción visual principal; etiqueta, moneda y formato
  deben ser inequívocos para cuenta de moneda local y extranjera.
- Hacer evidente el estado activo de tipo ingreso/gasto/transferencia y los
  campos obligatorios; mantener juntos controles que expresan una misma
  decisión.
- Reducir cambios de contexto y desplazamientos causados por la secuencia de
  campos. Conservar el comportamiento de teclado y la fila de acciones que no
  tapa el contenido.
- Hacer que cualquier sugerencia recuerde qué valor eligió el sistema, por qué
  y cómo corregirlo; un valor sugerido nunca debe verse como un dato confirmado
  si el usuario no lo revisó.
- Definir estados vacíos, carga, error, guardado y éxito con jerarquía estable;
  evitar parpadeos, reflow evitable, copy técnico y adornos sin función.
- En la apertura fría, reemplazar el «Loading form…» aislado por una estructura
  de formulario reconocible (monto, fecha, categoría/cuenta y acción como
  skeleton). Si es seguro antes de cargar las listas, permitir escribir el
  monto; no mostrar cuenta/categoría de otro hogar ni permitir enviar un
  formulario sin sus requisitos.
- Usar tipografía, contraste, espaciado, bordes y color del sistema existente.
  Evitar brillos, degradados decorativos, sombras pesadas, iconos sin etiqueta
  y una densidad de controles que parezca maqueta automática.

**Aceptación:** el video de QA muestra el primer campo utilizable sin pantalla
vacía engañosa; el monto, tipo, cuenta, categoría y acción primaria se
identifican en una pasada; la misma vista se entiende sin color solamente y sin
conocer gestos ocultos.

### T2 — Secuencia de teclado y selectores

**Prioridad:** P1 · **Tipo:** UX / accesibilidad · **Foco:** `quickEntry`,
`SelectorSheet`, `PayeePicker`, `AmountInput`

- Validar con teclado físico y teclado virtual que Enter/Next lleva al primer
  campo realmente vacío y que el foco no salta detrás de una hoja cerrada.
- Cuando una selección rellene varios campos, saltar solo los que quedaron
  confirmados por una preferencia explícita; detener el autoavance ante el
  primer campo vacío o cualquier ambigüedad.
- Mantener búsqueda en selectores largos, texto legible y recuento de
  coincidencias/estado vacío; asegurar que cerrar o volver atrás no borre el
  monto ni elecciones hechas.
- En el selector de categorías, priorizar de forma clara la categoría
  frecuente ya mostrada en los chips y permitir escogerla sin entrar primero
  a su padre. En tags, poner al alcance recientes/seleccionados y conservar la
  búsqueda para listas largas; la grabación muestra scroll extenso en esa
  hoja.
- Para fechas fuera de Today/Yesterday/2 days ago, hacer clara la ruta al
  calendario. Medir si un acceso compacto a días de la semana anterior reduce
  taps sin ocupar espacio permanente.
- Añadir foco visible, orden de tabulación lógico, labels programáticos,
  anuncios accesibles del error/resultado y objetivos táctiles de al menos
  44×44 CSS px cuando el layout lo permita.
- Respetar `prefers-reduced-motion`; la animación no debe retrasar la
  interacción ni ser necesaria para comprender estado.

**Aceptación:** una alta simple puede completarse con teclado; todos los
controles de formulario se usan con lector de pantalla; no hay foco perdido,
doble avance ni pérdida de borrador al cerrar/reabrir el selector.

### T3 — Guardar una secuencia con confianza

**Prioridad:** P1 · **Tipo:** UX / rendimiento percibido · **Foco:** acción de
creación y `Save & Add Next`

- Mantener bloqueo del doble envío y feedback de guardado en la acción primaria.
- En móvil, sustituir el `+` sin texto visible de la acción secundaria por un
  nombre comprensible como «Add next» (con icono como apoyo). La confirmación
  de una escritura debe aparecer una sola vez.
- Al guardar y añadir siguiente, conservar solo el contexto que el usuario
  confirmó y que el contrato actual define: fecha actualizada, tipo, cuenta,
  estado, categoría, comercio y etiquetas. Limpiar siempre monto,
  descripción/notas y cualquier dato específico de la compra anterior.
- Confirmar con una señal breve, no intrusiva y accesible que la transacción se
  guardó; si falla, preservar el borrador y mostrar un error accionable sin
  duplicar la escritura.
- Mantener la ruta/origen, filtros y hogar correctos después de guardar. No
  convertir un fallo de servidor en un formulario vacío.
- Si aparece «Loading form…» entre altas, medir el motivo. Reusar los datos de
  referencia del mismo hogar para presentar el siguiente borrador de inmediato
  y refrescar las listas en segundo plano; nunca reutilizar listas de otro
  hogar ni ocultar que una lista nueva sigue cargando.
- En transferencias y edición, conservar las reglas vigentes: no ofrecer
  “añadir siguiente” donde no es válido ni modificar el tipo de una transacción
  existente.

**Aceptación:** doble toque produce una sola transacción y una sola
notificación de éxito; un error permite reintentar con los datos intactos; el
siguiente formulario muestra contexto retenido de forma visible y campos de
operación vacíos; cancelación no guarda.

### T4 — Presupuesto de rendimiento del flujo

**Prioridad:** P1 · **Tipo:** performance · **Foco:** `TransactionDialogProvider`,
`getQuickAddFormData`, Server Action y render del formulario

Antes de optimizar, instrumentar eventos temporales con etiquetas generales:

- `quick_add_open` → primer formulario interactivo.
- apertura desde caché y apertura fría, separadas.
- `transaction_submit` → respuesta visible guardada/siguiente lista.
- duración de `getQuickAddFormData` y del Server Action en el servidor,
  usando el colector existente si la medición de servidor lo admite; marcar
  solo nombres de fase y milisegundos, sin payload ni identidad del hogar.
- En el camino `Save & Add Next`, verificar la rama que vuelve a poner
  `loading=true` antes de pedir de nuevo `getQuickAddFormData()`: cuando el
  hogar del caché coincide, montar el próximo borrador con esos datos de
  inmediato y hacer el refresco en segundo plano, sin perder creaciones
  recientes ni cruzar hogares.

Luego cambiar la causa medida, en este orden: evitar trabajo duplicado,
quitar serialización evitable, reducir render/código en la ruta crítica y por
último afinar consultas. Las listas de cuentas/categorías/payees/tags ya corren
en paralelo y su costo fue ruido en las mediciones previas de Transactions;
no separarlas ni añadir caché global como optimización por intuición. La
memoria de categoría tiene un límite de 400 transacciones y solo se carga si la
preferencia está habilitada.

**Presupuesto de producto:** tomar tres mediciones por estado y dispositivo en
el mismo build de producción antes/después. Objetivo inicial: p75 de diálogo
interactivo ≤ 700 ms en caliente y ≤ 1.5 s en frío en el dispositivo de QA;
respuesta p75 de alta guardada ≤ 1.2 s desde el submit, con confirmación visual
inmediata del estado pendiente. Si el baseline no puede satisfacer estos
límites por conexión/entorno, registrar los valores y acordar un objetivo
relativo verificable antes del cambio. No retrasar feedback visual mientras se
espera la respuesta.

**Aceptación:** se informa p50/p75 y entorno; los eventos no contienen datos
financieros ni identificadores de usuario/hogar; la optimización reduce una
medición real sin degradar frescura entre hogares ni las selecciones creadas
durante la sesión.

### T5 — QA de fidelidad financiera y responsive

**Prioridad:** P0 · **Tipo:** QA · **BD:** sin migración prevista

Probar ingresos, gastos, transferencias, edición, multimoneda, categorías
padre/hijas, payee libre, cuenta/categoría recién creadas, Save & Add Next,
autocompletado por categoría activado/desactivado, red lenta, error de red,
reintento, doble submit, teléfono pequeño, teléfono estándar y escritorio.

Verificar que fecha “hoy” usa `todayIsoDateLocal()` del cliente y la zona
`rumbo-tz` del servidor (`getRequestToday()`); el usuario puede corregirla. Las
reglas de autorización por hogar y RLS siguen siendo la fuente de seguridad.

**Aceptación:** cada caso conserva montos, signos, divisas, cuenta y categoría
correctos; un hogar nunca recibe listas o sugerencias del hogar anterior; los
breakpoints no cortan el botón principal ni exigen scroll para encontrarlo; el
zoom del navegador sigue funcionando.

## No regresiones / principios de producto

1. **Rapidez sin sorpresa:** ninguna selección financiera se infiere en
   silencio. Sugerencia editable, origen claro y acción para deshacer.
2. **Monto sin memoria:** no reutilizar el monto de la transacción anterior ni
   mantenerlo después de “Add Next”.
3. **Correcto antes que rápido:** validar monto > 0, tipo, cuenta, categoría,
   estado y FX en servidor; nunca rebajar validación para ahorrar un toque.
4. **Privacidad:** instrumentación de rendimiento sin descripción, monto,
   categoría, payee, cuenta, etiquetas, UUID ni `householdId`.
5. **Accesibilidad:** no depender solo de color, hover, arrastrar o animación;
   foco visible y zoom permanecen disponibles.
6. **Hogar y ledger:** respetar RLS, acciones de servidor, `revalidatePath` y
   contratos existentes. Sin uso de service-role en cliente o servidor de app.

## Definition of Done

- [ ] Evidencia de ambas grabaciones segmentada y comparada por operación
      comparable, con timestamps y tabla de tiempos/toques.
- [ ] Los cambios de UI/UX corresponden a hallazgos reproducibles; no hay
      “rediseño premium” sin antes/después y razón de interacción.
- [ ] Presupuestos de rendimiento medidos antes y después en el mismo
      dispositivo/build; se explican diferencias frente a meta.
- [ ] Unit tests para nueva lógica pura y suite existente; lint, TypeScript y
      build pasan según el gate del repo.
- [ ] QA manual de T5 en teléfono y escritorio con resultados guardados en el
      cierre del sprint.
- [ ] Sin migración ni escritura externa prevista. Si durante el trabajo se
      vuelve necesaria una migración o publicación a Supabase/Power BI/Vercel,
      se prepara el artefacto y se solicita aparte cuando corresponda.
- [ ] Actualizar `docs/pending-work.md`, `AGENTS.md` y `docs/SPRINT-LOG.md` al
      cerrar el sprint, según `rumbo-state-sync`.

## Prompt de ejecución para Rumbo

> Implementa el sprint en `docs/alpha/sprint-transaction-entry-premium.md`.
> Empieza por la matriz de evidencia de los videos AndroMoney y Rumbo del
> 2026-10-14 incluida en este documento. Las sesiones alternan de app y no son
> una prueba de latencia controlada; mide la misma lista de transacciones en
> ambas apps antes de afirmar un porcentaje de velocidad. Inspecciona el código
> vigente antes de proponer UI. Rumbo ya
> tiene FAB global, formulario móvil de una pantalla, preferencias de orden y
> autoavance, sugerencias editables por categoría y `Save & Add Next`: evalúa
> cada una antes de añadir una capacidad equivalente. Prioriza las fricciones
> con evidencia y limita los cambios a la ruta de alta. Mide apertura fría,
> apertura caliente y guardado antes/después; usa datos agregados de tiempo sin
> registrar valores financieros o UUIDs. Respeta RLS, validación de servidor,
> `revalidatePath`, la zona horaria del usuario, montos como texto decimal,
> contratos de moneda y accesibilidad. No cambies esquema ni RPCs sin defecto
> financiero demostrado y alcance aprobado. No inventes un resultado de
> velocidad a partir de la duración total de dos grabaciones desiguales.
> Reutiliza los componentes y traducciones existentes; el resultado visual debe
> sentirse parte de Rumbo, compacto, tipográficamente claro y sin ornamento
> genérico. Cierra con matriz de cambios, pruebas, mediciones antes/después,
> QA pendiente de dispositivo real y gates de publicación pendientes.

## Pendientes para cerrar implementación

- El tiempo activo exacto por alta; los videos alternan entre aplicaciones y
  no marcan el instante preciso de cada toque.
- La lista común de operaciones para ejecutar la comparación cronometrada,
  pues Project/Note de AndroMoney y Description/Tags/Notes de Rumbo no tienen
  correspondencia directa.
- El p50/p75 de apertura fría y caliente y de guardado en un build de
  producción; el clip no controla red, sesión, espera humana ni rehidratación.
- Ajustar objetivos de latencia si el dispositivo/red de QA no permite cumplir
  los umbrales iniciales; registrar baseline y razón antes de optimizar.

---

## Implementación — 2026-10-22 (rama `ccr-95b39f19-3w7kyn`)

> **Estado: código listo, T4 medido en dispositivo (cumplido); QA de T5 pendiente.**
> Todo lo de abajo se razonó desde el código y los hallazgos ya anotados de
> las grabaciones; los videos no están en el repositorio, así que no se
> agregaron timestamps nuevos. Sin migración, sin RPC, sin cambio de RLS.

### T0 — Mapa del flujo, con la capa de cada demora

Leído del código vigente, de tocar «+» a ver el resultado:

| Paso | Qué pasa | Capa | Antes | Ahora |
|---|---|---|---|---|
| 1. Tocar «+» (primera vez, o pestaña recargada) | `openDialog` → `getQuickAddFormData()` (Server Action) | Consulta de datos | `auth.getUser` → `profiles` → `auth.getUser` → `profiles` → 6 listas en paralelo → memoria por categoría: **5–6 viajes en serie** | `getRequestProfile` (caché por request) → 6 listas + memoria en un solo lote: **3 viajes en serie** |
| 2. Espera de esa primera apertura | El diálogo a pantalla completa | Apertura/render | Una línea gris «Loading form…» en una pantalla vacía | Esqueleto con la forma del formulario (tipo, monto, fechas, filas, acción) y `role="status"` |
| 3. Aperturas siguientes | Datos en memoria (MQ-009) + refresco en segundo plano | — | Inmediatas (sin cambio) | Igual |
| 4. Categoría | `SelectorSheet` con chips «Frequently used» | Interacción | Top 4 por **cantidad** de usos en el dispositivo, sin recencia | Top 6 por **frecuencia + recencia** (vida media 21 días); las subcategorías entran como chip, así que una hija frecuente es un toque |
| 5. Tags | `TagMultiSelect` | Interacción | Lista alfabética completa; en el video hubo scroll largo | Chips «Frequently used» arriba (mismo ranking, hasta 6, sin los ya elegidos) |
| 6. Guardar y siguiente | Server Action → `redirect` con `created=1&next_*` | Acción de servidor + navegación | Tras el redirect, **dos `router.replace()` más** (toast y provider) para limpiar los flags: dos renders completos de la página en el servidor mientras se escribe la siguiente | En Transactions los flags se limpian con `history.replaceState` (`replaceUrlInPlace`): cero viajes extra. Accounts, Debts y el asistente leen `created=1` en el servidor (sus avisos «… created»), así que ahí sigue la navegación |
| 7. Botón de alta consecutiva | Split button | Interacción | `+` sin texto en móvil | «+ Add next» / «+ Agregar otra» / «+ Une autre» con texto (cabe a 320 px junto a «Create transaction», medido) |
| 8. Confirmación | `TransactionToasts` | Feedback | Un toast de 5 s por guardado; en una racha se apilaban 3 sobre la fila de acciones | Un solo toast por mensaje, con contador (`×3`), que reinicia sus 5 s; los que tienen Undo nunca se unen |

**Defecto previo corregido de paso (revisión `ledger-guard`):** tras un
«Copy» (BR-034) o un «share» (BR-028), «Save & Add Next» volvía a sembrar el
monto, la descripción y las notas de la entrada original en el siguiente
borrador. Ahora el efecto de add-next limpia esos prefills; el siguiente
borrador solo conserva lo que llevan los parámetros `next_*`.

**Segundo defecto previo (visto al medir desde Accounts, 2026-10-22):** el
guardado aterrizaba con `created=1`, el mismo flag que Accounts, Payees,
Goals, Tags, Categories, Debts y otras pantallas usan para *sus* altas. Como
el «+» es global, guardar una transacción desde Accounts mostraba «Cuenta
creada.», y la confirmación real solo existía en Transactions. Ahora el
guardado usa su propio flag (`txn_created`, con un valor único por guardado),
el provider muestra «Transacción creada.» en cualquier pantalla y Transactions
dejó de mostrarlo por su cuenta. Con eso la limpieza del flag es un
`replaceState` en todas partes salvo en el asistente, que conserva su aviso.

**Aceptado sin cambio:** los contadores de uso (`af_category_usage`,
`af_tag_usage`) son por dispositivo, no por hogar. No muestran nada ajeno —
solo se ordenan las categorías y tags del hogar activo—, pero dos hogares en
el mismo teléfono comparten el tope de 200 entradas.

**Hipótesis que el código descartó:** el toast duplicado. Hay exactamente
un `toast()` por redirect (`hasRun` lo protege). Lo que el video mostró eran
toasts de guardados consecutivos apilados, no dos por guardado.

**Hipótesis que siguen abiertas (necesitan la medición en el teléfono):**
- La espera de varios segundos en la primera apertura de la grabación es
  mucho más que 5–6 viajes de ~50 ms. Lo más probable es un arranque en frío
  de la función de Vercel o una pestaña descartada por Android al cambiar a
  AndroMoney (vuelve sin datos en memoria). La medición `open.cold` lo dirá.
- El guardado incluye renderizar en el servidor la página de destino entera
  (Dashboard o Transactions) dentro de la respuesta del Server Action. Si
  `save.next` sigue por encima de la meta, el siguiente paso es que «Add next»
  responda sin redirect y refresque la lista en segundo plano. Es un cambio de
  contrato de la acción, así que no se hizo sin medir.

**No se hizo, a propósito:**
- Precargar los datos del formulario al montar el dashboard: el Server Action
  pasaría por la cola del router y podría retrasar la primera navegación
  (el tipo de clic perdido que fue B-7).
- Escribir el monto antes de que lleguen las listas: la moneda sale de la
  cuenta, y la cuenta es justo lo que no cargó.
- Un acceso extra a fechas de la semana anterior: el doc pide medirlo antes
  de ocupar espacio, y los chips Today/Yesterday/2 days ago + calendario ya
  cubren el caso; queda para después de la medición.

### T4 — Cómo medir en el teléfono

1. Abrir cualquier pantalla del dashboard con `?entry_timing=on` (por ejemplo
   `/dashboard?entry_timing=on`). Aparece una franja «Entry timing» arriba.
2. Hacer la lista de altas acordada (3 aperturas en frío recargando la
   pestaña, 3 en caliente, 3 «Add next», 3 «Create»).
3. «Copy results» copia p50/p75 por evento; pegarlos en la tabla de abajo.
4. `?entry_timing=off` la apaga.

Cada muestra guarda solo evento, variante, milisegundos y hora — nada de la
transacción, ni UUID, ni hogar — en `sessionStorage` de esa pestaña.

| Evento | Qué mide | Meta p75 | Antes (main) | Después (esta rama) |
|---|---|---|---|---|
| `open.cold` | «+» → formulario pintado, sin datos en memoria | ≤ 1,5 s | — | 615–869 ms ✅ |
| `open.warm` | «+» → formulario pintado, con datos en memoria | ≤ 0,7 s | — | 44–49 ms ✅ |
| `save.next` | «Add next» → siguiente borrador listo | ≤ 1,2 s | 1,23–1,66 s (redirect) | 1,01 s p50 · 1,24 s p75 — en el límite |
| `save.close` | «Create» → resultado en pantalla | ≤ 1,2 s | 1,26–1,60 s (redirect) | 0,66–0,99 s p50 · 0,90–1,16 s p75 ✅ |

Primeras mediciones en el teléfono del usuario, 2026-10-22, cuenta real, desde
Dashboard y desde Accounts (las dos primeras rondas perdieron los `save` por
un error de la propia medición, ya corregido).

Segunda ronda (2026-10-22, guardado en línea, cuenta real, Dashboard y
Accounts): guardar bajó 20–40 %. Lo que queda (~0,7–1 s) es el propio
guardado: teléfono → Vercel → 4–5 consultas en serie a Supabase → vuelta. Se
podría recortar ~100 ms juntando consultas; con 1–2 muestras por caso no se
persigue ahora. **T4 se da por cumplido.**

**Guardado en línea (decidido con esos números, aprobado por el usuario).**
El guardado ya no redirige: el diálogo llama a `saveManualTransaction` /
`saveTransferTransaction`, que hacen exactamente las mismas validaciones,
escrituras e invalidaciones que antes y devuelven el resultado. El aviso y el
siguiente borrador aparecen al llegar la respuesta; la pantalla de atrás se
refresca con el `revalidatePath` de la misma respuesta, en segundo plano.
Experimento en navegador antes de hacerlo (página que tarda 1,5 s en
renderizarse): la acción en línea devolvió su resultado en **53–85 ms** y la
página se refrescó ~1,5 s después; la misma acción con redirect tardó
**~1,6 s**. De paso: un error de validación ya no te saca a Transactions con
`?error=`; se muestra dentro del formulario con el borrador intacto, y desde
el Dashboard te quedas en el Dashboard. Las acciones con redirect siguen para
el asistente y los formularios de página.

El «antes» solo se puede tomar con un build que ya tenga la medición, así que
la comparación honesta es: medir esta rama en preview, y comparar contra la
misma rama con los cambios de rendimiento revertidos si hace falta aislar
cuánto aportó cada uno.

### Tercera ronda en dispositivo (2026-10-22) — hallazgos y arreglos

Reportados por el usuario en Brave/Android con su cuenta real, y reproducidos
antes de tocar código con una réplica local: la app real contra un Supabase
falso (auth + PostgREST + RPC con latencia simulada) y Playwright en viewport
de teléfono. Los números de abajo son de esa réplica.

| Síntoma | Causa | Arreglo | Verificado |
|---|---|---|---|
| Después de abrir Tags, un espacio abajo en ese y los demás selectores, con los botones del formulario asomando | Los selectores se posicionan contra el diálogo (su `translate` lo hace bloque contenedor de `fixed`), y el diálogo era el que hacía scroll: el selector quedaba corrido hacia arriba lo mismo que se había bajado el formulario (88 px reproducidos) | El scroll pasa a un contenedor interior; el diálogo no hace scroll en móvil | Con el formulario bajado 100 px, el selector cubre 0→640 de 640 |
| «Agregar otra» → «falta el monto» → el formulario se cerró | Un toque extra sobre el borrador nuevo (monto vacío) dispara la validación nativa, que enfoca el monto y abre el teclado. En Brave el diálogo subía de más (su cálculo contaba la barra inferior que el teclado esconde) y dejaba una franja de fondo entre el formulario y el teclado: el siguiente toque caía ahí y cerraba el diálogo | (1) En móvil, tocar fuera ya no cierra (`disablePointerDismissal`); X, Escape y Atrás sí. (2) El diálogo sube con la medición de `ViewportPin` (`.entry-sheet`), la de los otros formularios, que ya excluía iOS | Teclado simulado con 60 px de desfase tipo Brave: borde del diálogo = tope del teclado, sin franja |
| La racha no daba señal de guardado | El aviso «Transacción creada» queda detrás de la hoja a pantalla completa | «✓ Transacción creada ×N» dentro del diálogo, junto a la X (`role="status"`); el aviso global sale al cerrar | ×2 tras dos «Agregar otra» |
| `save.next` p75 de 2 s | Tras cada «Agregar otra» se recargaban las listas del formulario; las Server Actions van de a una, así que la recarga se ponía delante del siguiente guardado (+~200 ms) | Recargar solo si el guardado trajo algo nuevo (`nextDraftNeedsFreshLists`) | Guardados seguidos 862/1083/1075 ms → 811/830/811 ms; 0 recargas en una racha |
| Atrás no hacía nada la primera vez tras cerrar una racha | El refresco de la página (la revalidación del guardado) reescribe el estado de la entrada de historial y borra la marca del diálogo; al cerrar, la entrada no se reclamaba | `useBackDismiss` reconoce su entrada sin marca en la misma URL | Tras racha + X, un Atrás sale de la pantalla |
| El borrador siguiente abría a media altura | El contenedor de scroll sobrevive al formulario remontado | Volver arriba al preparar el borrador siguiente | 156 px → 0, monto visible |
| «Flick» al saltar a Descripción | Varias cosas en ~300 ms: cierra el selector, se expande la fila, sube el teclado, el diálogo se elevaba de más y había un scroll extra | Sin la sobre-elevación queda un ajuste suave (~60 ms) y un scroll suave | Solo en simulación; **confirmar en el teléfono** |

Se descartaron con la réplica: el doble toque (una sola escritura), Enter
enviando el formulario (Enter avanza al siguiente campo) y una redirección de
la página de atrás durante el refresco.

### Cuarta ronda en dispositivo (2026-10-22)

| Síntoma | Causa | Arreglo | Verificado en la réplica |
|---|---|---|---|
| La franja sobre el teclado seguía igual | La hipótesis de la ronda anterior (Brave desfasa `innerHeight`) era falsa: con la medición de `ViewportPin` la franja no cambió, así que Brave reporta un área visible ~50px más baja de lo que muestra, y ningún cálculo encuentra el borde real | Detrás de la hoja de alta, en el teléfono, el fondo es del color de la hoja (`[data-slot=dialog-overlay]:has(~ .entry-sheet)`): la franja queda del mismo color que el formulario | Fondo `--popover`, sin `backdrop-filter` |
| Formulario lleno sin descripción → Gasto a Ingreso → elegir categoría → salto con teclado a Descripción | El cambio de tipo vacía la categoría; la cadena trataba la nueva elección como avance y saltaba la cuenta y el payee (llenos) hasta Descripción. Su propio comentario decía que corregir un campo no debía arrastrar | Corregir (el campo tenía valor, o el usuario ya lo había elegido en este formulario) solo lleva a un campo **obligatorio** vacío; avanzar sigue igual | Antes: foco en Descripción. Después: sin salto. Primer llenado y Enter en el monto siguen llegando a Descripción; cambiar la categoría en un borrador de «Add next» tampoco salta |
| Al saltar a Descripción desaparecía la X y el campo quedaba pegado arriba | `scrollIntoView({ block: 'start' })` también hace scroll del contenedor del diálogo (aunque tenga `overflow: hidden`): la fila de la X subía 119px fuera de la pantalla | Se hace scroll solo del contenedor del formulario, calculado a mano | X a 24px del borde (antes −119px); Descripción visible sobre el teclado |
| No se vio el ×3 | El texto verde sin fondo pasaba desapercibido (y con el arrastre anterior la fila salía de la pantalla) | Píldora verde con un destello en cada guardado | «✓ Transacción creada. ×3» visible a 18px del borde |

Mediciones de la ronda (LTE, n pequeño): `open.cold` 1.798 ms (red móvil + arranque en frío; sobre la meta, en WiFi 615–869 ms), `open.warm` 109–165 ms, `save.next` 762 ms p50 · 958 ms p75 ✅, `save.close` 688 ms ✅.

### Quinta ronda en dispositivo (2026-10-22) — dejar de medir el teclado

Con el teclado abierto, el formulario quedaba reducido a una tira de unos 150 px entre la X y el teclado, con un hueco vacío debajo. Al saltar a Descripción seguía el «flick».

| Síntoma | Causa | Arreglo | Verificado en la réplica |
|---|---|---|---|
| Formulario encogido, hueco entre la hoja y el teclado | Brave reporta el área visible unos 100 px más corta de lo que muestra: es la altura de su barra inferior, que esconde al abrir el teclado. Las rondas 3 y 4 tomaban esa medida como verdadera y subían y encogían la hoja de más | La hoja ya no se sube: queda a pantalla completa y el teclado tapa su parte de abajo. Se quitó `.entry-sheet` del CSS, se borró `useSoftKeyboardInset` y ya nada lee el tamaño del teclado | La hoja queda en 0→780 con el teclado abierto, y su alto no cambia en ningún momento (`sheetResized: false`) con un teclado simulado que Brave reporta 100 px más alto |
| «Flick» al saltar a Descripción | Al abrir el teclado pasaban tres cosas a la vez: la hoja cambiaba de alto, la fila de botones se desmontaba y el campo se volvía a desplazar | `usePlaceFieldsAboveKeyboard`: al recibir foco, el campo sube a la parte de arriba del formulario en un solo movimiento de 160 ms, antes de que llegue el teclado. Los botones ya no se desmontan. Cerca del final, un espaciador vacío bajo el formulario da el recorrido que falta | Descripción queda a 92 px y Notas a 133 px (bajo la X, que sigue a 16 px), con un solo movimiento. «Amount received» de una transferencia pasa de 344 a 76 px. El monto, que ya está arriba, no se mueve |

**Sexta ronda (2026-10-23).** Descripción mejoró, pero al tocar Notas con el teclado abierto toda la pantalla se fue hacia arriba: desaparecieron la X y el campo. La causa es que, justo después del foco, el navegador desplaza el campo a lo que cree visible. El movimiento animado aún no había empezado, así que encontró Notas bajo el teclado y desplazó la pantalla entera. Arreglo:
- Con el teclado ya abierto, el campo se coloca al instante, dentro del mismo evento de foco.
- El espacio extra sobrevive 500 ms al toque intermedio sobre el botón de la fila.
- La hoja usa `overflow: clip`, así que ya no es un contenedor que el navegador pueda desplazar.

Réplica, con un simulador que hace el desplazamiento del navegador tras el foco: monto (teclado arriba) → Notas pasó de «el navegador intervino» a «no hizo falta». Notas queda en 112 px, bajo la X, que sigue en 16 px.

**Séptima ronda (2026-10-23): buenas prácticas del teclado.** Notas quedó bien. Pero al pasar a la tasa de cambio con el teclado abierto, toda la pantalla volvió a desplazarse (sin X). De vuelta en Notas y Descripción, el campo quedaba arriba sin su título.

Las herramientas estándar de Chrome Android para el teclado son dos:
- **`interactive-widget`** en la meta etiqueta `viewport`: con `resizes-content` el teclado encoge el layout. Afecta a toda la app y depende de la misma medición que Brave reporta mal.
- **VirtualKeyboard API:** con `navigator.virtualKeyboard.overlaysContent = true`, el teclado queda encima del contenido. El navegador ya no encoge ni desplaza la pantalla para perseguir el campo, y la app decide dónde va.

Se usa la segunda, solo mientras la hoja de alta está abierta en el teléfono; al cerrarla se restaura el valor anterior. Donde la API no existe, todo sigue como antes.

Otros cambios:
- **Se mueve la fila, no solo el recuadro.** El ancla es `[data-entry-row]` (las filas del formulario), si no un `<label for>` visible justo encima, si no el campo mismo. Así «Notes», «Description» o «Exchange rate» se ven sobre el campo.
- **El espacio extra bajo el formulario se mide de nuevo tras crecer.** Con un formulario largo (una cuenta en COP, con la tasa de cambio), el formulario se encoge como hijo flex y el espaciador no aportaba toda su altura. Descripción se quedaba a media pantalla.

Réplica con tu secuencia (cuenta COP; Descripción → Notas → tasa → Notas → tasa → Descripción) y un simulador del desplazamiento del navegador tras el foco y al abrir el teclado:
- En cada paso la X sigue a 16 px y el título de la fila queda a 68–69 px.
- El campo queda sobre el teclado, y el navegador nunca tuvo que intervenir.
- `overlaysContent` vale `true` con la hoja abierta y `false` al cerrarla.

**«+» directo al formulario (2026-10-24, pedido del usuario).** El «+» de la barra inferior del teléfono abría antes un menú con cinco opciones: gasto, ingreso, transferencia, pago de deuda e importar CSV. Eso costaba un toque en cada alta. Ahora abre el formulario directamente, en Gasto, igual que el botón de escritorio. El tipo se cambia con el selector del propio formulario. Pago de deuda e Importar CSV siguen en «Más» (Deudas e Importar CSV). Se quitaron las seis traducciones del menú, que quedaron sin uso.

### T5 — QA pendiente en dispositivo (lo llena el usuario)

| # | Caso | Qué confirmar | Resultado |
|---|---|---|---|
| 1 | Gasto simple, categoría hija frecuente | Un toque en el chip la elige; monto, signo y cuenta correctos en Transactions | |
| 2 | Ingreso | Signo correcto; la categoría de gasto no aparece como chip | |
| 3 | 3× «Add next» seguidos | Cada uno guarda una sola vez; un solo toast con `×2`, `×3`; el siguiente borrador conserva fecha, cuenta, categoría, payee y tags, y llega con monto, descripción y notas vacíos | |
| 4 | Doble toque en «Add next» | Una sola transacción | |
| 5 | Transferencia y edición | Sin «Add next»; nada distinto a antes | |
| 5b | «Copy» de una transacción y luego «Add next» | El segundo borrador llega **sin** el monto, la descripción ni las notas copiados | |
| 6 | Cuenta en otra moneda | Prefijo de moneda y vista previa FX como antes | |
| 7 | Tags | Chips frecuentes arriba; tocar uno lo agrega y desaparece del grupo; la búsqueda los oculta | |
| 8 | Primera apertura con red lenta | Esqueleto, nunca una pantalla vacía; luego el formulario sin salto | |
| 9 | Cambiar de hogar con el diálogo abierto | Ninguna lista ni chip del hogar anterior | |
| 10 | Back con el diálogo abierto tras «Add next» | Cierra el diálogo, no sale de la pantalla | |
| 11 | 320 px, 375 px, escritorio | «Create transaction» y «Add next» completos; zoom sigue funcionando | |
| 11b | Guardar desde Accounts, Payees o el Dashboard | Sale «Transacción creada.» una vez; nunca «Cuenta creada.» u otro aviso ajeno | |
| 11c | Error de validación (p. ej. monto 0 forzado, o frecuencia siendo miembro sin permiso) | El mensaje sale dentro del formulario y el borrador queda intacto; no te saca de la pantalla | |
| 11d | Guardar desde Budgets o Reports | La pantalla de atrás se actualiza sola tras el aviso | |
| 11e | Bajar hasta Tags, abrirlo, cerrarlo y abrir Cuenta | Los dos selectores cubren la pantalla entera; no asoman los botones del formulario | |
| 11f | Con el teclado abierto en el monto o la descripción | El formulario ocupa toda la pantalla y el teclado tapa solo su parte de abajo, sin hueco ni franja. El campo que escribes queda justo bajo la X | |
| 11g | Racha de 3 «Agregar otra» y luego X, y luego Atrás | Arriba se ve «✓ Transacción creada ×3»; un solo Atrás sale de la pantalla | |
| 11h | Formulario lleno sin descripción → Ingreso → elegir categoría | No salta a Descripción ni abre el teclado | |
| 11i | Saltar a Descripción por la cadena (monto → categoría → cuenta → payee); tocar Notas, la tasa de cambio (cuenta en otra moneda) o «Amount received» de una transferencia, e ir y volver entre ellos con el teclado abierto | Un solo movimiento suave hacia arriba antes del teclado, sin «flick». Cada campo queda con su título justo bajo la X; la X nunca sale de la pantalla | |
| 11j | Tocar «+» en la barra inferior del teléfono | Abre el formulario directo en Gasto, sin menú intermedio; Deudas e Importar CSV siguen en «Más» | |
| 12 | Undo tras anular una transacción | El toast de Undo sigue siendo uno por anulación y funciona | |
