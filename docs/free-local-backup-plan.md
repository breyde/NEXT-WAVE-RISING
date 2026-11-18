# Respaldo local gratuito de Firestore

## Estado
Este documento prepara la siguiente fase del PR. No ejecuta operaciones en Firebase y no modifica datos de producción.

## Objetivo
Crear desde la sesión autenticada del propietario una descarga JSON local en el dispositivo, sin Cloud Functions, Cloud Storage, Blaze, tarjeta, claves de servicio ni envío del respaldo a GitHub.

## Condiciones de seguridad
- La acción solo debe aparecer y ejecutarse para el UID curador configurado.
- Requiere sesión Firebase Auth ya iniciada; nunca solicitar ni almacenar contraseñas, tokens o claves.
- Leer únicamente colecciones explícitamente enumeradas.
- No cambiar reglas de Firestore para hacer posible la exportación. Si una colección devuelve permission-denied, detener el proceso y marcar el respaldo como incompleto.
- No subir el archivo JSON a GitHub ni a ningún servidor.
- Descargar con nombre fechado y mostrar conteo por colección, errores y estado final.
- No modificar, borrar ni escribir documentos durante la exportación.
- Paginar consultas por lotes y comprobar que se han recorrido todas las páginas; no asumir que una consulta parcial es un respaldo completo.
- Avisar de que el JSON contiene datos personales y debe guardarse en un dispositivo privado.

## Colecciones que deben evaluarse
Como mínimo, comprobar por separado:
- active_list
- submissions
- monthly_list
- annual_list
- artist_countries
- voters_log
- chat_users
- chat_presence
- private_artist_contacts
- weekly_submitters
- weekly_save_reviews
- weekly_save_review_history
- contact_messages
- chat_messages
- settings
- backups
- stats

La lista es una guía basada en las colecciones identificadas en el código y las reglas propuestas; antes de llamar completo al respaldo hay que contrastarla con todas las colecciones realmente usadas por la aplicación y con las reglas activas de Firebase.

## Criterio de aceptación
El respaldo solo se etiqueta como completo si cada colección enumerada se ha leído íntegramente, se han registrado sus recuentos y no hay errores de permisos ni paginación. Si falta alguna colección, el archivo debe indicar claramente que es parcial. La prueba debe hacerse primero con la cuenta propietaria y sin modificar datos.

## Limitación importante
Una descarga desde el navegador no equivale a una exportación administrada de Firestore y no garantiza por sí sola una restauración exacta de índices, metadatos o configuración. Debe tratarse como copia de datos JSON para auditoría/recuperación manual, no como sustituto de una exportación nativa restaurable.
