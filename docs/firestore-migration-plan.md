# Plan seguro de migración de privacidad de Firestore

**Estado: preparado, no ejecutado.** No se han cambiado las reglas ni los datos de Firebase activo.

## Alcance

- Solo la lista semanal y los datos privados relacionados.
- Las listas mensual y anual no se modifican.
- Sin servicios de pago, Blaze, Cloud Functions ni almacenamiento externo de pago.
- No se realizan cambios de Spotify ni rotaciones.

## Qué protege cada fase

Las reglas transitorias bloquean temporalmente la lectura pública de `submissions` y `active_list`, además de `voters_log`, `chat_users` y `chat_presence`. Es necesario porque Firestore no permite ocultar campos concretos en una lectura: mientras los documentos antiguos contengan correos o arrays de votantes, permitir la lectura pública de esas listas seguiría exponiendo esos datos.

**Efecto temporal:** durante la migración, los visitantes no podrán leer las listas semanal y activa. El panel del curador sí podrá hacerlo. Las listas mensual y anual seguirán siendo públicas.

## Secuencia obligatoria

1. **Ensayo aislado:** probar frontend, reglas finales y reglas transitorias en Firestore Emulator y, antes de tocar producción, en un proyecto Firebase de pruebas separado con datos ficticios. No usar datos personales reales en el ensayo.
2. **Backup:** el backup actual del panel guarda las listas activa/semanal/mensual/anual y países, y recupera los correos asociados a temas en su copia. **No es todavía una copia completa de todas las colecciones privadas**: no incluye una copia independiente de `voters_log`, `chat_users`, `chat_presence` ni `weekly_submitters`. Por tanto, no se puede usar como único respaldo de toda la migración. Antes de producción hay que añadir y probar una copia recuperable de esas colecciones, o disponer de una exportación segura que no active facturación. No continuar mientras no exista y se haya probado esa copia.
3. **Pausa de escrituras:** desactivar temporalmente envíos y votaciones desde la configuración de la edición.
4. **Publicar el frontend nuevo:** debe escribir los correos solo en `private_artist_contacts`, usar `weekly_submitters` y crear las declaraciones en `weekly_save_reviews`. No debe escribir correos ni arrays de votantes en documentos públicos.
5. **Ventana privada:** aplicar las reglas transitorias. La lectura pública de las listas semanal y activa queda bloqueada mientras se limpian los documentos antiguos.
6. **Migrar contactos y votos:** ejecutar las herramientas de migración del panel solo después de comprobar el backup. Ejecutar también la limpieza de presencia antigua. No borrar canciones ni contadores de votos.
7. **Verificación de datos:** comprobar que los correos necesarios están en las colecciones privadas; que `submissions` y `active_list` ya no contienen campos `email` ni arrays `voters`; y que `chat_presence` no conserva IP. Comparar recuentos antes/después y revisar muestras.
8. **Reglas finales:** aplicar las reglas finales únicamente cuando la limpieza esté completa. Probar lectura pública de listas sin PII, privacidad de colecciones sensibles, nuevos envíos, votaciones, duplicados, historial de revisión, backups y restauración.
9. **Reapertura:** reactivar envíos y votaciones solo después de que todas las pruebas pasen.

## Criterios de parada y recuperación

- Si falla el backup, una migración, la verificación de recuentos o una prueba de permisos, detener el proceso y mantener los envíos/votos desactivados.
- No aplicar las reglas finales sobre documentos que aún contengan PII pública.
- No llamar «backup completo» al backup actual: su cobertura es parcial. No borrar backups ni registros de origen hasta verificar el resultado y la restauración.
- No improvisar cambios desde Firebase Console: usar los archivos versionados y revisar el proyecto/entorno antes de aplicar reglas.
- Las declaraciones de guardado son declaraciones del participante; solo una comprobación externa manual permite marcar «Revisado manualmente».

## Validación automatizada actual

La suite de GitHub Actions prueba las reglas finales con Firestore Emulator y compila/prueba las reglas transitorias en un proyecto de emulador separado. Estas pruebas no sustituyen el ensayo en un proyecto Firebase independiente ni autorizan por sí solas una migración real.
