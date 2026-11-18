# Verificación gratuita del guardado semanal y auditoría de privacidad

## Objetivo y límites de Spotify
- Mantener una revisión gratuita y transparente del compromiso de guardar la playlist semanal.
- No usar Firebase Cloud Functions, Blaze, servicios de pago ni nuevos secretos.
- Spotify Web API en modo de desarrollo limita las cuentas de prueba; no se debe intentar eludir ese límite.
- GitHub Pages no puede verificar por sí solo la biblioteca privada de Spotify.
- Una casilla o revisión manual nunca debe etiquetarse como «Verificado por Spotify».
- Estados permitidos: «Declarado por el participante», «Pendiente de revisión», «Revisado manualmente» y «No acreditado».
- La evidencia debe recibirse por un canal privado acordado. No publicar capturas, correos ni enlaces privados en Firestore.

## Alcance y seguridad
- Todo el trabajo está en la rama \`free-weekly-save-review\`.
- El panel del navegador comprueba el UID curador para mostrar la interfaz; la autorización real debe estar en las reglas de Firestore.
- El borrador final de reglas compara el UID autenticado con el curador autorizado.
- No se ha modificado Firebase Console, no se han desplegado reglas, no se ha publicado GitHub Pages, no se ha tocado \`main\`, no se han sincronizado playlists y no se ha ejecutado ninguna rotación.
- No se ha activado facturación ni se ha añadido ningún servicio de pago.

## Cambios preparados en \`index.html\`
### Panel y chat
- El panel visual se muestra únicamente a la cuenta curadora prevista.
- La entrada al chat ya no consulta \`chat_users\` públicamente por IP.
- La presencia pública se sobrescribe sin \`merge\` y solo contiene nick y última actividad; esto elimina los campos antiguos de IP cuando esa sesión vuelva a actualizarse.
- Los registros de \`chat_users\` siguen conservando IP para la moderación existente, pero el borrador final reserva su lectura al curador.

### Votaciones
- El navegador deja de descargar todos los registros de votantes para buscar duplicados.
- Cada registro nuevo usa el correo normalizado como ID de \`voters_log\`; la regla final solo permite crear ese documento una vez y reserva su lectura al curador.
- Los tres votos y el registro del participante se escriben en un único batch.
- La lista pública conserva solo los contadores; el panel del curador recupera los correos desde \`voters_log\`.
- Hay una herramienta de migración para consolidar los registros antiguos y retirar los arrays \`voters\` de \`active_list\`.

### Contactos de artistas
- Los nuevos documentos públicos de \`submissions\` y \`active_list\` ya no llevan el campo \`email\`.
- Los contactos pasan a \`private_artist_contacts/{trackId}\`, con lectura reservada al curador.
- \`weekly_submitters/{email}\` usa el correo normalizado como ID y solo permite creación pública. Un segundo intento de crear el mismo documento queda rechazado por las reglas.
- El panel administrativo une las canciones públicas con los contactos privados por ID de documento.
- Se han actualizado las altas manuales, edición y borrado de temas, exportación, backups, restauración, sincronización de países y rotación semanal para conservar el contacto privado.
- El registro de países ya no necesita leer públicamente un documento que contiene correo: crea el registro sin lectura y, si ya existe, incrementa el contador mediante una actualización limitada por reglas.
- Se ha añadido una herramienta manual para migrar los correos históricos de \`active_list\` y \`submissions\` a la colección privada y eliminar el campo de las listas públicas.
- La migración no se ejecuta automáticamente. Requiere backup y reglas transitorias habilitadas primero.

## Archivos de reglas
- \`docs/firestore.rules.transition.proposed\`: reglas transitorias de compatibilidad para habilitar las dos nuevas colecciones y permitir que el frontend antiguo siga funcionando durante la ventana de migración. Mantienen temporalmente algunas lecturas públicas heredadas, por lo que deben utilizarse solo durante una ventana corta y controlada.
- \`docs/firestore.rules.proposed\`: reglas finales propuestas. Restringen al curador la lectura de contactos, votantes, usuarios de chat, países, mensajes de contacto y backups; y eliminan el correo de los documentos públicos de canciones.
- `firestore.rules` y `firebase.json` se han añadido para ejecutar pruebas aisladas del emulador; no apuntan a un proyecto Firebase real.
- Se ha añadido un conjunto de pruebas automatizadas y un workflow de GitHub Actions. La primera ejecución del emulador terminó con 10 pruebas aprobadas y 0 fallidas. Después se endureció la validación del ID de revisión y se corrigió la vinculación con el envío del mismo batch; la repetición de pruebas de esos últimos cambios está en curso.
- Los archivos siguen siendo borradores. Las reglas finales sí han pasado las pruebas automatizadas; las transitorias y una copia real de datos aún requieren validación. No copiarlos a Firebase Console todavía.

## Orden de despliegue obligatorio
1. Crear y comprobar un backup completo recuperable con las reglas y el código actuales.
2. Preparar una ventana de mantenimiento y pausar temporalmente tanto los envíos semanales como las votaciones para evitar altas mientras se migran los registros.
3. Revisar y validar las reglas transitorias en un proyecto/copia de pruebas.
4. Aplicar las reglas transitorias solo durante la ventana controlada.
5. Desplegar el frontend de esta rama mediante una integración revisada; comprobar que envíos, chat, votos y panel siguen funcionando.
6. Ejecutar desde el panel, como curador, la migración de contactos y después la migración de votantes.
7. Verificar que \`active_list\` y \`submissions\` ya no contienen \`email\` ni arrays \`voters\`; verificar que los contactos están en \`private_artist_contacts\`, que la cola actual está reflejada en \`weekly_submitters\`, y que el historial de votos está en \`voters_log\`.
8. Aplicar las reglas finales solo después de esa verificación.
9. Probar con cuentas de prueba: nuevo envío, segundo envío con el mismo correo, edición/borrado, declaración de guardado, cambio de estado e historial, voto completo, voto repetido, reinicio, backup, restauración y rotación. Reabrir las votaciones solo tras superar las pruebas.

## Limitaciones que siguen vigentes
- El sistema no verifica que una persona controle el correo que escribe. La unicidad del documento evita duplicados accidentales, pero no acredita identidad ni impide que alguien use el correo de otra persona.
- Sin un backend confiable (por ejemplo, Cloud Functions, que requeriría Blaze), el contador público de votos sigue siendo susceptible a manipulación directa: las reglas pueden limitar cada actualización a +1, pero no pueden demostrar que cada incremento corresponde a una persona real sin una identidad autenticada y un proceso de servidor.
- La colección \`artist_countries\` conserva correos, pero las reglas finales reservan su lectura al curador. \`backups\` también pueden contener copias históricas de correos y quedan reservados al curador.
- Los registros de \`chat_users\` conservan IP para la moderación; su lectura queda restringida al curador. La presencia pública no conserva IP.
- Las pruebas automatizadas están preparadas, pero todavía no hay resultado de ejecución. Los cambios tampoco se han probado con una copia real. Las reglas transitorias y finales deben revisarse antes de cualquier publicación.
- El panel privado de revisión semanal ya registra la declaración inicial, permite pasar a pendiente, revisado manualmente o no acreditado y conserva el historial de cambios. No almacena capturas ni enlaces de pruebas. El curador debe revisar la evidencia recibida por un canal privado acordado fuera de la web; ese canal aún debe definirse.

## Estado
Trabajo preparado en una rama aislada, pendiente de pruebas técnicas y aprobación explícita antes de integrar o desplegar. La rama de producción, Firebase activo, las playlists y la sincronización programada permanecen intactos.
