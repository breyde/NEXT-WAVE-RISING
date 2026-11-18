# Verificación gratuita del guardado semanal

## Objetivo
Añadir al flujo de inscripción semanal un control manual y transparente del compromiso de guardar la playlist. Esta propuesta no utiliza Firebase Cloud Functions, Blaze, servicios de pago ni nuevas credenciales.

## Límites conocidos
- Spotify Web API en modo de desarrollo solo permite autorizar hasta cinco usuarios de prueba. No se debe intentar eludir ese límite.
- GitHub Pages es alojamiento estático: no puede guardar secretos ni verificar por sí solo la biblioteca privada de Spotify.
- Marcar una casilla no equivale a una verificación de Spotify.
- No se deben publicar capturas, correos ni pruebas privadas en una colección Firestore de lectura pública.

## Estados que mostrará el panel de administración
1. **Declarado por el participante**: marcó la casilla; todavía no se ha revisado ninguna prueba.
2. **Pendiente de revisión**: el participante ha avisado de que ha enviado una prueba por un canal privado acordado.
3. **Revisado manualmente**: el administrador ha comprobado la prueba fuera de la web.
4. **No acreditado**: la prueba no permite confirmar el guardado.

Ninguno de estos estados debe llamarse «Verificado por Spotify». Ese nombre se reserva exclusivamente para una comprobación real realizada por la API de Spotify con autorización válida del propio usuario.

## Registro e historial
- Cada registro debe identificar la edición semanal, el participante y la fecha del cambio de estado.
- Los cambios deben conservarse en un historial independiente de la cola semanal, para que no desaparezcan cuando se rote la lista.
- El estado de una edición no debe modificar las listas mensual/anual ni ejecutar rotaciones.
- No se guardarán capturas ni enlaces públicos a pruebas privadas en Firestore. El administrador revisará la evidencia mediante un canal privado y marcará el resultado en el panel.

## Requisitos antes de tocar la web publicada
1. Revisar las reglas actuales de Firestore y confirmar que solo el administrador autenticado puede cambiar estados e historial.
2. Definir un canal privado de recepción de pruebas; no pedir a los participantes que publiquen capturas con datos personales.
3. Implementar el panel y probarlo con datos ficticios en una rama separada.
4. Comprobar que la rotación semanal conserva el historial y que las listas mensuales/anuales y la sincronización de Spotify no cambian.
5. Solo después de superar las pruebas, decidir si se integra en `main`.

## Alcance de esta rama (actualizado)
La rama contiene la especificación y cambios de código aislados para revisión. No se ha cambiado Firebase Console, no se han publicado reglas, no se han modificado listas ni GitHub Actions, y no se ha desplegado la web. No se ha activado facturación.


## Auditoría inicial del repositorio (18-11-2026)
- La rama `main` no contiene `firebase.json` ni `firestore.rules`; tampoco aparecen en el árbol de archivos versionados.
- `index.html` inicializa Firebase en el navegador y accede directamente a Firestore.
- El formulario público crea documentos en `submissions` y `contact_messages`.
- El panel de curadores usa Firebase Authentication para iniciar sesión. Esto, por sí solo, no protege las escrituras: las reglas de Firestore deben validar los permisos en el servidor.
- Las reglas activas del proyecto no se pueden deducir del código del navegador ni de que el panel oculte botones. Deben revisarse en Firebase Console antes de añadir una colección de historial o permitir cambios de estado.
- La automatización existente de GitHub Actions tiene horarios programados y pasos de sincronización Spotify. No se ha ejecutado ni modificado durante esta revisión.

## Resultado de la auditoría
**Bloqueado para implementación en Firestore hasta revisar las reglas activas.** No crear todavía colecciones, documentos ni escrituras para los estados de revisión. No modificar las colecciones existentes ni la automatización.


## Hallazgo adicional: autenticación del panel (18-11-2026)
La revisión de `index.html` en `main` confirma que:
- El panel se muestra para cualquier usuario que dispare `auth.onAuthStateChanged` con una sesión válida.
- El inicio de sesión utiliza `signInWithEmailAndPassword`, pero el código no comprueba un rol administrativo específico ni una lista autorizada de UID.
- Por tanto, las reglas actuales que usan únicamente `request.auth != null` no distinguen al curador de cualquier otra cuenta autenticada.
- La comprobación visual del panel en el navegador no constituye una barrera de seguridad. La autorización debe aplicarse en reglas Firestore mediante una identidad/rol administrativo verificable en el servidor (por ejemplo, custom claims administrados de forma segura) o una alternativa equivalente.

**Acción requerida antes de implementar:** definir cómo se asigna y verifica el rol de curador sin confiar en valores editables por el cliente. No basta con comprobar que hay un correo o una sesión activa. No se ha cambiado el código de producción ni las reglas publicadas.

## Identidad administrativa recibida (18-11-2026)
- El propietario ha facilitado el UID de su cuenta de Firebase Authentication.
- Por privacidad y para no publicar innecesariamente ese identificador, el valor no se copia a este repositorio ni a documentación pública.
- Para este proyecto, la alternativa gratuita a custom claims/Cloud Functions que se evaluará es una comparación exacta de `request.auth.uid` con el UID autorizado directamente en las reglas de Firestore.
- La comprobación del UID en el navegador puede añadirse como mejora de interfaz, pero nunca sustituye la autorización de Firestore.
- Antes de redactar reglas completas hay que mapear todas las escrituras legítimas de la web y preservar las operaciones públicas necesarias (envíos, votos y mensajes). No se deben sustituir las reglas activas por una plantilla parcial.
- No se ha cambiado `index.html`, no se han modificado reglas en Firebase Console y no se ha publicado ni desplegado ningún cambio.

## Mapa de escrituras de la web y primer cambio aislado (18-11-2026)
### Operaciones que deben seguir siendo públicas, con validación estricta
- Envíos de propuestas: creación en `submissions`.
- Votos: actualización de contadores/votantes en `active_list` y creación en `voters_log`.
- Mensajes de contacto: creación en `contact_messages`.
- Chat: alta de usuarios en `chat_users`, alta de mensajes en `chat_messages` y presencia en `chat_presence`.
- Contador de visitas: transacción sobre `stats/visitors`.
- Registro de país tras un envío: alta/actualización limitada en `artist_countries`; requiere reglas específicas para no permitir cambios arbitrarios de campos sensibles.
### Operaciones que deben quedar reservadas al UID curador
- Configuración `settings`, cambios en listas `active_list`, `submissions` (editar/eliminar/restaurar/rotar), `monthly_list`, `annual_list`.
- Gestión de países, backups, lectura/gestión de mensajes de contacto, moderación del chat y cualquier historial futuro de revisiones semanales.
- Reinicio de votos y rotaciones; no deben estar disponibles a cualquier cuenta autenticada.
### Cambio realizado solo en esta rama
- Se añadió a `index.html` una comprobación de UID en `auth.onAuthStateChanged` para que el panel visual solo aparezca a la cuenta curadora indicada.
- Esto es únicamente un control de interfaz. El UID en JavaScript no protege Firestore: las reglas del servidor deben comprobar el mismo UID en cada operación administrativa.
- El panel queda oculto a otras cuentas autenticadas, pero no se afirma que la base de datos ya esté protegida.
### Pendiente obligatorio antes de integrar
- Redactar y revisar el conjunto completo de reglas Firestore con el UID autorizado y validaciones de campos para cada operación pública legítima.
- No aplicar reglas parciales ni reemplazar las reglas actuales hasta probar envíos, votos, chat, contacto, países, copias, rotación y restauración.
- Las reglas activas no están versionadas en el repositorio; no se ha cambiado Firebase Console.
- No se ha modificado `main`, no se ha publicado GitHub Pages, no se han ejecutado sincronizaciones ni rotaciones.

## Borrador inicial de reglas Firestore (NO APLICAR TODAVÍA)
- Se añadió `docs/firestore.rules.proposed` a esta rama como punto de partida, con comparación de UID para permisos administrativos y permisos separados para las operaciones públicas que usa actualmente la web.
- El borrador todavía no ha sido validado con Firebase Emulator Suite ni probado contra la aplicación real. No copiarlo a Firebase Console.
- Riesgos que deben resolverse antes de activarlo: `voters_log` y `chat_users` contienen datos personales y el código actual necesita consultas públicas; `chat_presence` también expone datos de presencia; `artist_countries` permite actualizaciones públicas para mantener el registro de envíos. Hay que rediseñar esos flujos para minimizar exposición y evitar falsificación.
- También hay que probar el formato exacto de todos los documentos existentes, especialmente propuestas antiguas, votos, presencia y estadísticas, antes de cerrar permisos.
- Este archivo es un borrador técnico, no una configuración activa. Ninguna regla se ha publicado.


## Corrección de privacidad del chat (18-11-2026)
Cambios realizados solo en `free-weekly-save-review`:
- La entrada al chat ya no consulta públicamente `chat_users` por IP. El participante conserva su nick localmente en el dispositivo y cada entrada crea un nuevo registro.
- `chat_users` queda con lectura reservada al UID curador en el borrador de reglas. La creación pública se conserva para que el chat pueda registrar nuevas entradas y el panel pueda moderarlas.
- `chat_presence` deja de escribir IP. La presencia pública solo incluye nick y última actividad.
- El borrador de reglas limita los campos permitidos en ambos flujos.

## Bloqueos de privacidad todavía pendientes
- `voters_log` sigue siendo consultado públicamente por el sistema de votación y contiene email e IP.
- Los documentos de `active_list` incluyen el array `voters` con correos, y la colección se lee públicamente para mostrar la lista y votar.
- No se debe activar el borrador de reglas mientras esos datos sigan expuestos. Hay que rediseñar el control de voto duplicado y separar los datos privados de votantes de los datos públicos de canciones.
- El cambio del chat aún no se ha probado en Firebase real ni con Emulator Suite. La moderación por IP seguirá funcionando en el panel porque el registro `chat_users` conserva la IP, pero ahora solo el curador puede leerlo según el borrador.
- Al activar en el futuro las reglas revisadas, los documentos antiguos de `chat_presence` que todavía tengan el campo `ip` deben eliminarse o sobrescribirse antes de exponer de nuevo esa colección. El código nuevo sobrescribe el documento de presencia sin `merge`, por lo que elimina campos antiguos en la siguiente actualización de esa sesión.


## Rediseño de votaciones y privacidad (rama de pruebas)
Cambios preparados en `index.html` y `docs/firestore.rules.proposed`:
- El navegador deja de consultar la colección completa de votantes para comprobar duplicados.
- Cada registro nuevo usa el correo normalizado como ID del documento de `voters_log`. Las reglas propuestas permiten crear ese documento una sola vez, exigen que el ID coincida con el correo y reservan su lectura al curador. Un segundo intento de escritura queda denegado por la regla de actualización.
- El guardado de los tres votos y del registro del votante se realiza en un único batch, para que no queden votos parciales.
- La lista pública solo necesita el contador de votos; los correos se consultan desde el panel del curador.
- El contador público de participantes se calcula como total de votos dividido entre tres, ya que el formulario exige seleccionar tres temas.
- Se ha añadido una herramienta de migración para trasladar registros antiguos al ID nuevo y retirar los arrays `voters` de `active_list`. No ejecutar hasta tener copia de seguridad y una secuencia de migración probada.

## Limitaciones y bloqueos antes de aplicar reglas
- El sistema no verifica que el participante controle el correo introducido. Una persona podría usar otro correo; por tanto, el ID único reduce duplicados accidentales, pero no prueba identidad ni impide fraude deliberado.
- Se deja de usar la deduplicación por IP. Es preferible no recopilar ni consultar IP para intentar identificar votantes; además, una IP compartida puede representar a varias personas.
- **Todavía hay otros correos personales en documentos públicos:** `active_list.email` y `submissions.email`. Las reglas actuales propuestas dejan lectura pública de esas colecciones, por lo que los correos seguirían expuestos aunque se oculten los registros de votantes.
- Antes de aplicar reglas nuevas hay que mover los correos de contacto de canciones a una colección privada (solo curador), actualizar altas, edición, backups, rotación y migración, y eliminar los campos de correo de los documentos públicos.
- No aplicar todavía `firestore.rules.proposed`. No se ha probado con Firebase Emulator Suite ni contra una copia de datos.


## Orden obligatorio para una futura migración
1. No activar ni desplegar esta rama todavía.
2. Preparar y comprobar un backup recuperable.
3. En una ventana de mantenimiento, desactivar temporalmente las votaciones.
4. Desplegar el código revisado en una fase controlada y ejecutar la migración como curador mientras las reglas antiguas todavía permiten leer los registros necesarios.
5. Comprobar que los documentos de `active_list` ya no contienen el campo `voters` y que cada votante histórico tiene un documento con ID igual a su correo en `voters_log`.
6. Aplicar las reglas nuevas solo cuando se hayan resuelto también los correos de artistas expuestos en `active_list` y `submissions`.
7. Probar alta, voto repetido, reinicio y rotación con cuentas de prueba; después reabrir las votaciones.

Este orden es una propuesta de mantenimiento, no una autorización para ejecutarlo. No se ha desplegado ni migrado ningún dato real.
